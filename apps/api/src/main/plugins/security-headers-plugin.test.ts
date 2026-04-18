import assert from "node:assert/strict";
import { it } from "node:test";

import Fastify from "fastify";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";

const { registerSecurityHeaders } = await import("./security-headers-plugin.js");

interface BuildOptions {
  readonly enabled?: boolean;
  readonly hstsMaxAgeSeconds?: number;
}

function buildTestApp(options: BuildOptions = {}) {
  const app = Fastify({ logger: false });
  registerSecurityHeaders(app, {
    enabled: options.enabled ?? true,
    hstsMaxAgeSeconds: options.hstsMaxAgeSeconds ?? 31_536_000,
  });

  app.get("/v1/ping", () => ({ ok: true }));
  app.get("/boom", () => {
    throw new Error("boom");
  });

  return app;
}

void it("security headers: aplica todos os cabecalhos restritivos em respostas 200", async () => {
  const app = buildTestApp();
  try {
    const response = await app.inject({ method: "GET", url: "/v1/ping" });

    assert.equal(response.statusCode, 200);
    assert.equal(
      response.headers["content-security-policy"],
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["x-frame-options"], "DENY");
    assert.equal(response.headers["referrer-policy"], "no-referrer");
    assert.equal(response.headers["cross-origin-opener-policy"], "same-origin");
    assert.equal(response.headers["cross-origin-resource-policy"], "same-site");
    assert.equal(response.headers["x-permitted-cross-domain-policies"], "none");
    assert.ok(typeof response.headers["permissions-policy"] === "string");
    assert.ok(String(response.headers["permissions-policy"]).includes("camera=()"));
  } finally {
    await app.close();
  }
});

void it("security headers: aplica cabecalhos tambem em respostas de erro 5xx", async () => {
  const app = buildTestApp();
  try {
    const response = await app.inject({ method: "GET", url: "/boom" });

    assert.equal(response.statusCode, 500);
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["x-frame-options"], "DENY");
    assert.ok(typeof response.headers["content-security-policy"] === "string");
  } finally {
    await app.close();
  }
});

void it("security headers: HSTS so eh emitido sob HTTPS (via x-forwarded-proto)", async () => {
  const app = buildTestApp({ hstsMaxAgeSeconds: 31_536_000 });
  try {
    const httpResponse = await app.inject({ method: "GET", url: "/v1/ping" });
    assert.equal(httpResponse.headers["strict-transport-security"], undefined);

    const httpsResponse = await app.inject({
      headers: { "x-forwarded-proto": "https" },
      method: "GET",
      url: "/v1/ping",
    });
    assert.equal(
      httpsResponse.headers["strict-transport-security"],
      "max-age=31536000; includeSubDomains; preload",
    );
  } finally {
    await app.close();
  }
});

void it("security headers: HSTS desligado quando max-age=0 mesmo sob HTTPS", async () => {
  const app = buildTestApp({ hstsMaxAgeSeconds: 0 });
  try {
    const response = await app.inject({
      headers: { "x-forwarded-proto": "https" },
      method: "GET",
      url: "/v1/ping",
    });
    assert.equal(response.headers["strict-transport-security"], undefined);
  } finally {
    await app.close();
  }
});

void it("security headers: no-op quando desabilitado via env flag", async () => {
  const app = buildTestApp({ enabled: false });
  try {
    const response = await app.inject({ method: "GET", url: "/v1/ping" });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-security-policy"], undefined);
    assert.equal(response.headers["x-frame-options"], undefined);
    assert.equal(response.headers["strict-transport-security"], undefined);
  } finally {
    await app.close();
  }
});
