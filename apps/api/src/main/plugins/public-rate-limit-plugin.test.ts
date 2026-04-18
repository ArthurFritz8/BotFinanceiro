import assert from "node:assert/strict";
import { it } from "node:test";

import Fastify from "fastify";
import { z } from "zod";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";

const { registerPublicRateLimit } = await import("./public-rate-limit-plugin.js");

const rateLimitErrorBodySchema = z.object({
  error: z.string(),
  message: z.string(),
  retryAfterSec: z.number(),
});

async function buildTestApp(options: { enabled: boolean; maxRequests: number; windowMs: number }) {
  const app = Fastify({ logger: false });
  registerPublicRateLimit(app, options);

  app.get("/v1/ping", () => ({ ok: true }));
  app.get("/internal/ping", () => ({ ok: true }));

  await app.ready();
  return app;
}

void it("public rate-limit returns 429 after exceeding window quota and sets standard headers", async () => {
  const app = await buildTestApp({ enabled: true, maxRequests: 2, windowMs: 60_000 });

  try {
    const first = await app.inject({ method: "GET", url: "/v1/ping" });
    const second = await app.inject({ method: "GET", url: "/v1/ping" });
    const third = await app.inject({ method: "GET", url: "/v1/ping" });

    assert.equal(first.statusCode, 200);
    assert.equal(first.headers["x-ratelimit-limit"], "2");
    assert.equal(first.headers["x-ratelimit-remaining"], "1");

    assert.equal(second.statusCode, 200);
    assert.equal(second.headers["x-ratelimit-remaining"], "0");

    assert.equal(third.statusCode, 429);
    assert.ok(third.headers["retry-after"]);
    const body = rateLimitErrorBodySchema.parse(JSON.parse(third.payload));
    assert.equal(body.error, "too_many_requests");
    assert.ok(body.retryAfterSec >= 1);
  } finally {
    await app.close();
  }
});

void it("public rate-limit skips /internal/* routes (already gated by token + IP whitelist)", async () => {
  const app = await buildTestApp({ enabled: true, maxRequests: 1, windowMs: 60_000 });

  try {
    const first = await app.inject({ method: "GET", url: "/internal/ping" });
    const second = await app.inject({ method: "GET", url: "/internal/ping" });
    const third = await app.inject({ method: "GET", url: "/internal/ping" });

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(third.statusCode, 200);
    assert.equal(first.headers["x-ratelimit-limit"], undefined);
  } finally {
    await app.close();
  }
});

void it("public rate-limit skips OPTIONS pre-flight requests", async () => {
  const app = await buildTestApp({ enabled: true, maxRequests: 1, windowMs: 60_000 });

  try {
    const preflight = await app.inject({ method: "OPTIONS", url: "/v1/ping" });
    const real = await app.inject({ method: "GET", url: "/v1/ping" });
    const blocked = await app.inject({ method: "GET", url: "/v1/ping" });

    assert.notEqual(preflight.statusCode, 429);
    assert.equal(real.statusCode, 200);
    assert.equal(blocked.statusCode, 429);
  } finally {
    await app.close();
  }
});

void it("public rate-limit no-op when disabled via env", async () => {
  const app = await buildTestApp({ enabled: false, maxRequests: 1, windowMs: 60_000 });

  try {
    const first = await app.inject({ method: "GET", url: "/v1/ping" });
    const second = await app.inject({ method: "GET", url: "/v1/ping" });

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(first.headers["x-ratelimit-limit"], undefined);
  } finally {
    await app.close();
  }
});
