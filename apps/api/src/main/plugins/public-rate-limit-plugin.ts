import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { logger } from "../../shared/logger/logger.js";

interface PublicRateLimitOptions {
  readonly enabled: boolean;
  readonly maxRequests: number;
  readonly windowMs: number;
}

interface BucketEntry {
  count: number;
  resetAtMs: number;
}

const INTERNAL_ROUTE_PREFIXES = ["/internal/", "/v1/internal/"] as const;
const GC_INTERVAL_MS = 5 * 60 * 1000;

function isInternalRoute(url: string): boolean {
  return INTERNAL_ROUTE_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function resolveClientIp(request: FastifyRequest): string {
  const ip = request.ip;
  return typeof ip === "string" && ip.length > 0 ? ip : "unknown";
}

/**
 * Rate-limit in-memory por IP com janela fixa (reset por bucket).
 *
 * - Aplica a TODAS as rotas exceto `/internal/*` (ja protegido por token/whitelist
 *   de IP em ADR-007/008) e requisicoes `OPTIONS` (pre-flight CORS).
 * - Headers padrao: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
 *   e `Retry-After` em caso de 429.
 * - Buckets expirados sao coletados periodicamente (GC_INTERVAL_MS) via timer
 *   unref-ed para nao bloquear o shutdown.
 * - Failure-open: se `enabled=false` via env, o hook nao eh registrado.
 *
 * Escopo: single-node. Para multi-node use Redis-backed rate-limit (fora do MVP).
 */
export function registerPublicRateLimit(app: FastifyInstance, options: PublicRateLimitOptions): void {
  if (!options.enabled) {
    logger.info({ enabled: false }, "public_rate_limit_disabled");
    return;
  }

  const buckets = new Map<string, BucketEntry>();

  app.addHook("onRequest", (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    if (request.method === "OPTIONS" || isInternalRoute(request.url)) {
      done();
      return;
    }

    const ip = resolveClientIp(request);
    const now = Date.now();
    let entry = buckets.get(ip);

    if (!entry || entry.resetAtMs <= now) {
      entry = { count: 0, resetAtMs: now + options.windowMs };
      buckets.set(ip, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, options.maxRequests - entry.count);
    void reply.header("X-RateLimit-Limit", String(options.maxRequests));
    void reply.header("X-RateLimit-Remaining", String(remaining));
    void reply.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAtMs / 1000)));

    if (entry.count > options.maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAtMs - now) / 1000));
      void reply.header("Retry-After", String(retryAfterSec));
      logger.warn(
        { count: entry.count, ip, retryAfterSec, route: request.url },
        "public_rate_limit_exceeded",
      );
      void reply.code(429).send({
        error: "too_many_requests",
        message: `Rate limit exceeded. Try again in ${retryAfterSec}s.`,
        retryAfterSec,
      });
      return;
    }

    done();
  });

  const gcTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of buckets) {
      if (entry.resetAtMs <= now) {
        buckets.delete(ip);
      }
    }
  }, GC_INTERVAL_MS);
  gcTimer.unref?.();

  app.addHook("onClose", (_instance, done) => {
    clearInterval(gcTimer);
    buckets.clear();
    done();
  });

  logger.info(
    {
      enabled: true,
      maxRequests: options.maxRequests,
      windowMs: options.windowMs,
    },
    "public_rate_limit_enabled",
  );
}
