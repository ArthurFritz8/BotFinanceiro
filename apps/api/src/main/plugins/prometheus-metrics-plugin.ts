import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { assertInternalRouteAuth } from "../../shared/http/internal-route-auth.js";
import { logger } from "../../shared/logger/logger.js";

interface PrometheusMetricsOptions {
  readonly enabled: boolean;
  /**
   * Coletores adicionais chamados a cada scrape de `/internal/metrics`.
   * Cada coletor retorna um fragmento de texto Prometheus ja formatado
   * (com `# HELP` / `# TYPE` quando aplicavel). Sao concatenados apos as
   * metricas built-in. Falhas individuais sao logadas e ignoradas para
   * nao derrubar o scrape inteiro (failure-open observabilidade).
   */
  readonly collectors?: ReadonlyArray<() => string>;
}

interface CounterEntry {
  value: number;
}

interface HistogramEntry {
  count: number;
  sum: number;
  bucketCounts: number[];
}

const METRICS_ROUTE = "/internal/metrics";

/**
 * Buckets em segundos otimizados para uma API HTTP de baixa-media latencia
 * (medianas tipicas 5-50ms; rabos ate alguns segundos por upstream lento).
 */
const HTTP_DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
] as const;

const PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function formatLabels(labels: Record<string, string>): string {
  const parts = Object.keys(labels)
    .sort()
    .map((key) => `${key}="${escapeLabelValue(labels[key] ?? "")}"`);
  return parts.length === 0 ? "" : `{${parts.join(",")}}`;
}

function resolveRouteTemplate(request: FastifyRequest): string {
  const candidate = request.routeOptions?.url;

  if (typeof candidate === "string" && candidate.length > 0) {
    return candidate;
  }

  return "unmatched";
}

class PrometheusRegistry {
  private readonly counters = new Map<string, CounterEntry>();
  private readonly histograms = new Map<string, HistogramEntry>();

  public incrementCounter(name: string, labels: Record<string, string>): void {
    const key = `${name}${formatLabels(labels)}`;
    const entry = this.counters.get(key);

    if (entry) {
      entry.value += 1;
      return;
    }

    this.counters.set(key, { value: 1 });
  }

  public observeHistogram(name: string, labels: Record<string, string>, valueSeconds: number): void {
    const key = `${name}${formatLabels(labels)}`;
    let entry = this.histograms.get(key);

    if (!entry) {
      entry = {
        count: 0,
        sum: 0,
        bucketCounts: new Array<number>(HTTP_DURATION_BUCKETS_SECONDS.length).fill(0),
      };
      this.histograms.set(key, entry);
    }

    entry.count += 1;
    entry.sum += valueSeconds;

    for (let index = 0; index < HTTP_DURATION_BUCKETS_SECONDS.length; index += 1) {
      const bucketUpperBound = HTTP_DURATION_BUCKETS_SECONDS[index];
      if (bucketUpperBound !== undefined && valueSeconds <= bucketUpperBound) {
        entry.bucketCounts[index] = (entry.bucketCounts[index] ?? 0) + 1;
      }
    }
  }

  public render(): string {
    const lines: string[] = [];

    if (this.counters.size > 0) {
      lines.push("# HELP http_requests_total Total HTTP requests handled by the API.");
      lines.push("# TYPE http_requests_total counter");
      for (const [key, entry] of this.counters) {
        lines.push(`${key} ${entry.value}`);
      }
    }

    if (this.histograms.size > 0) {
      lines.push("# HELP http_request_duration_seconds HTTP request latency in seconds.");
      lines.push("# TYPE http_request_duration_seconds histogram");

      for (const [key, entry] of this.histograms) {
        const baseLabelMatch = /^http_request_duration_seconds(\{.*\})?$/.exec(key);
        const labelsBlock = baseLabelMatch?.[1] ?? "";
        const innerLabels = labelsBlock.length > 0 ? labelsBlock.slice(1, -1) : "";

        for (let index = 0; index < HTTP_DURATION_BUCKETS_SECONDS.length; index += 1) {
          const bucketUpperBound = HTTP_DURATION_BUCKETS_SECONDS[index];
          const cumulativeCount = entry.bucketCounts[index] ?? 0;
          const leLabel = `le="${bucketUpperBound}"`;
          const allLabels = innerLabels.length > 0 ? `${innerLabels},${leLabel}` : leLabel;
          lines.push(`http_request_duration_seconds_bucket{${allLabels}} ${cumulativeCount}`);
        }

        const plusInfLabel = `le="+Inf"`;
        const plusInfLabels = innerLabels.length > 0 ? `${innerLabels},${plusInfLabel}` : plusInfLabel;
        lines.push(`http_request_duration_seconds_bucket{${plusInfLabels}} ${entry.count}`);
        lines.push(`http_request_duration_seconds_sum${labelsBlock} ${entry.sum}`);
        lines.push(`http_request_duration_seconds_count${labelsBlock} ${entry.count}`);
      }
    }

    const memory = process.memoryUsage();
    lines.push("# HELP process_uptime_seconds Process uptime in seconds.");
    lines.push("# TYPE process_uptime_seconds gauge");
    lines.push(`process_uptime_seconds ${process.uptime()}`);
    lines.push("# HELP nodejs_heap_used_bytes Node.js heap memory used in bytes.");
    lines.push("# TYPE nodejs_heap_used_bytes gauge");
    lines.push(`nodejs_heap_used_bytes ${memory.heapUsed}`);
    lines.push("# HELP nodejs_heap_total_bytes Node.js heap memory total allocated in bytes.");
    lines.push("# TYPE nodejs_heap_total_bytes gauge");
    lines.push(`nodejs_heap_total_bytes ${memory.heapTotal}`);
    lines.push("# HELP nodejs_rss_bytes Node.js resident set size in bytes.");
    lines.push("# TYPE nodejs_rss_bytes gauge");
    lines.push(`nodejs_rss_bytes ${memory.rss}`);

    return `${lines.join("\n")}\n`;
  }
}

/**
 * Metricas Prometheus minimalistas in-process (zero deps externas).
 *
 * - Coleta `http_requests_total{method,route,status}` e
 *   `http_request_duration_seconds{method,route}` via hook `onResponse`.
 * - Usa template de rota (`request.routeOptions.url`) para evitar explosao de
 *   cardinalidade por path parametrizado (ex: `/v1/crypto/:id` em vez do id real).
 * - Expoe `/internal/metrics` (text/plain; version=0.0.4) protegido por
 *   `assertInternalRouteAuth` (ADR-007/008: token + opcional whitelist IP).
 * - A propria rota de scrape `/internal/metrics` eh excluida da contagem para
 *   evitar feedback loop em scrape de alta frequencia.
 * - Failure-open: `enabled=false` desativa o hook e a rota.
 */
export function registerPrometheusMetrics(
  app: FastifyInstance,
  options: PrometheusMetricsOptions,
): void {
  if (!options.enabled) {
    logger.info({ enabled: false }, "prometheus_metrics_disabled");
    return;
  }

  const registry = new PrometheusRegistry();
  const collectors = options.collectors ?? [];

  app.addHook("onResponse", (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    const route = resolveRouteTemplate(request);

    if (route === METRICS_ROUTE) {
      done();
      return;
    }

    const labels = {
      method: request.method,
      route,
      status: String(reply.statusCode),
    };

    registry.incrementCounter("http_requests_total", labels);

    const elapsedMs = reply.elapsedTime;
    if (typeof elapsedMs === "number" && Number.isFinite(elapsedMs) && elapsedMs >= 0) {
      registry.observeHistogram(
        "http_request_duration_seconds",
        { method: request.method, route },
        elapsedMs / 1000,
      );
    }

    done();
  });

  app.get(METRICS_ROUTE, {
    preHandler: (request: FastifyRequest, _reply: FastifyReply, done: (error?: Error) => void) => {
      try {
        assertInternalRouteAuth(request);
        done();
      } catch (error) {
        done(error as Error);
      }
    },
    handler: (request: FastifyRequest, reply: FastifyReply) => {
      const fragments: string[] = [registry.render()];
      for (const collector of collectors) {
        try {
          const fragment = collector();
          if (typeof fragment === "string" && fragment.length > 0) {
            fragments.push(fragment.endsWith("\n") ? fragment : `${fragment}\n`);
          }
        } catch (error) {
          logger.warn({ err: error }, "prometheus_collector_failed");
        }
      }
      void reply.header("content-type", PROMETHEUS_CONTENT_TYPE);
      void reply.send(fragments.join(""));
    },
  });

  logger.info({ enabled: true, route: METRICS_ROUTE }, "prometheus_metrics_enabled");
}
