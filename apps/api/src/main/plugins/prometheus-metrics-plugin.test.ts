import assert from "node:assert/strict";
import { it } from "node:test";

import Fastify from "fastify";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";

const { registerPrometheusMetrics } = await import("./prometheus-metrics-plugin.js");

interface BuildOptions {
  readonly enabled?: boolean;
}

function buildTestApp(options: BuildOptions = {}) {
  const app = Fastify({ logger: false });
  registerPrometheusMetrics(app, {
    enabled: options.enabled ?? true,
  });

  app.get("/v1/ping", () => ({ ok: true }));
  app.get("/v1/crypto/:id", (request) => ({ id: (request.params as { id: string }).id }));

  return app;
}

void it("prometheus metrics: incrementa http_requests_total apos cada requisicao", async () => {
  const app = buildTestApp();
  try {
    await app.inject({ method: "GET", url: "/v1/ping" });
    await app.inject({ method: "GET", url: "/v1/ping" });
    await app.inject({ method: "GET", url: "/v1/crypto/bitcoin" });

    const metrics = await app.inject({
      method: "GET",
      url: "/internal/metrics",
      headers: { "x-internal-token": "test_internal_token_12345" },
    });

    assert.equal(metrics.statusCode, 200);
    assert.match(metrics.headers["content-type"] ?? "", /text\/plain.*version=0\.0\.4/);
    assert.match(
      metrics.payload,
      /http_requests_total\{method="GET",route="\/v1\/ping",status="200"\} 2/,
    );
    assert.match(
      metrics.payload,
      /http_requests_total\{method="GET",route="\/v1\/crypto\/:id",status="200"\} 1/,
    );
  } finally {
    await app.close();
  }
});

void it("prometheus metrics: emite histograma http_request_duration_seconds com buckets cumulativos", async () => {
  const app = buildTestApp();
  try {
    await app.inject({ method: "GET", url: "/v1/ping" });

    const metrics = await app.inject({
      method: "GET",
      url: "/internal/metrics",
      headers: { "x-internal-token": "test_internal_token_12345" },
    });

    assert.equal(metrics.statusCode, 200);
    assert.match(metrics.payload, /http_request_duration_seconds_bucket\{.*le="0\.005".*\} \d+/);
    assert.match(metrics.payload, /http_request_duration_seconds_bucket\{.*le="\+Inf".*\} \d+/);
    assert.match(metrics.payload, /http_request_duration_seconds_sum\{.*\} [\d.e+-]+/);
    assert.match(metrics.payload, /http_request_duration_seconds_count\{.*\} \d+/);
  } finally {
    await app.close();
  }
});

void it("prometheus metrics: rota /internal/metrics nao eh contada para evitar feedback loop", async () => {
  const app = buildTestApp();
  try {
    await app.inject({ method: "GET", url: "/v1/ping" });
    await app.inject({
      method: "GET",
      url: "/internal/metrics",
      headers: { "x-internal-token": "test_internal_token_12345" },
    });
    await app.inject({
      method: "GET",
      url: "/internal/metrics",
      headers: { "x-internal-token": "test_internal_token_12345" },
    });

    const metrics = await app.inject({
      method: "GET",
      url: "/internal/metrics",
      headers: { "x-internal-token": "test_internal_token_12345" },
    });

    assert.equal(metrics.statusCode, 200);
    assert.doesNotMatch(metrics.payload, /route="\/internal\/metrics"/);
  } finally {
    await app.close();
  }
});

void it("prometheus metrics: /internal/metrics exige token (ADR-007/008)", async () => {
  const app = buildTestApp();
  try {
    const response = await app.inject({ method: "GET", url: "/internal/metrics" });
    assert.ok(response.statusCode === 401 || response.statusCode === 403);
  } finally {
    await app.close();
  }
});

void it("prometheus metrics: expoe metricas de processo (uptime, heap, rss)", async () => {
  const app = buildTestApp();
  try {
    const metrics = await app.inject({
      method: "GET",
      url: "/internal/metrics",
      headers: { "x-internal-token": "test_internal_token_12345" },
    });

    assert.equal(metrics.statusCode, 200);
    assert.match(metrics.payload, /process_uptime_seconds [\d.e+-]+/);
    assert.match(metrics.payload, /nodejs_heap_used_bytes \d+/);
    assert.match(metrics.payload, /nodejs_heap_total_bytes \d+/);
    assert.match(metrics.payload, /nodejs_rss_bytes \d+/);
  } finally {
    await app.close();
  }
});

void it("prometheus metrics: enabled=false nao registra hook nem rota", async () => {
  const app = buildTestApp({ enabled: false });
  try {
    await app.inject({ method: "GET", url: "/v1/ping" });
    const response = await app.inject({
      method: "GET",
      url: "/internal/metrics",
      headers: { "x-internal-token": "test_internal_token_12345" },
    });
    assert.equal(response.statusCode, 404);
  } finally {
    await app.close();
  }
});
