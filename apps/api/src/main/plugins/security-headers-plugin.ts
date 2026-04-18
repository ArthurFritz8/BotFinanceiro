import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { logger } from "../../shared/logger/logger.js";

interface SecurityHeadersOptions {
  readonly enabled: boolean;
  readonly hstsMaxAgeSeconds: number;
}

/**
 * Cabecalhos restritivos para uma API JSON (sem renderizacao de HTML do servidor).
 * Cobrem OWASP A05 (Security Misconfiguration) e parte de A03 (Injection - XSS via reflection).
 *
 * Definidos via `onSend` para garantir que TODA resposta (sucesso, 4xx, 5xx, 429
 * do rate-limit) os receba. `onSend` roda apos error-handler e antes do envio bruto.
 */
const STATIC_HEADERS: ReadonlyArray<readonly [string, string]> = [
  // API nao serve HTML; CSP estrita bloqueia qualquer injecao reflectida que tente carregar recursos.
  ["Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"],
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "no-referrer"],
  ["Cross-Origin-Opener-Policy", "same-origin"],
  ["Cross-Origin-Resource-Policy", "same-site"],
  ["Permissions-Policy", "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"],
  ["X-Permitted-Cross-Domain-Policies", "none"],
];

export function registerSecurityHeaders(app: FastifyInstance, options: SecurityHeadersOptions): void {
  if (!options.enabled) {
    logger.info({ enabled: false }, "security_headers_disabled");
    return;
  }

  const hstsValue = `max-age=${options.hstsMaxAgeSeconds}; includeSubDomains; preload`;

  app.addHook("onSend", (request: FastifyRequest, reply: FastifyReply, payload, done) => {
    for (const [name, value] of STATIC_HEADERS) {
      if (!reply.hasHeader(name)) {
        void reply.header(name, value);
      }
    }

    // HSTS so faz sentido sob TLS; aceita header de proxy reverso (`x-forwarded-proto`)
    // alem do esquema direto do socket. Em multiplos valores, o primeiro vale.
    const forwardedProto = request.headers["x-forwarded-proto"];
    const forwardedScheme = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    const isHttps = request.protocol === "https"
      || (typeof forwardedScheme === "string" && forwardedScheme.split(",")[0]?.trim().toLowerCase() === "https");

    if (isHttps && options.hstsMaxAgeSeconds > 0 && !reply.hasHeader("Strict-Transport-Security")) {
      void reply.header("Strict-Transport-Security", hstsValue);
    }

    done(null, payload);
  });

  logger.info(
    {
      enabled: true,
      hstsMaxAgeSeconds: options.hstsMaxAgeSeconds,
    },
    "security_headers_enabled",
  );
}
