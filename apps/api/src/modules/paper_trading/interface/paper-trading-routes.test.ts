import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import Fastify from "fastify";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";

const { JsonlTradeStore } = await import(
  "../infrastructure/jsonl-trade-store.js"
);
const { PaperTradingService } = await import(
  "../application/paper-trading-service.js"
);
const { PaperTradingController } = await import("./paper-trading-controller.js");
const {
  registerPaperTradingInternalRoutes,
  registerPaperTradingPublicRoutes,
} = await import("./paper-trading-routes.js");
const { httpErrorHandler } = await import(
  "../../../shared/errors/http-error-handler.js"
);

function buildTestApp() {
  const tmpDir = mkdtempSync(join(tmpdir(), "paper-trading-routes-"));
  const store = new JsonlTradeStore(join(tmpDir, "trades.jsonl"));
  const service = new PaperTradingService({ store });
  const controller = new PaperTradingController(service);
  const app = Fastify({ logger: false });
  app.setErrorHandler(httpErrorHandler);
  registerPaperTradingInternalRoutes(app, controller);
  void app.register(
    (instance, _, done) => {
      registerPaperTradingPublicRoutes(instance, controller);
      done();
    },
    { prefix: "/v1" },
  );
  return { app, tmpDir };
}

void describe("PaperTradingRoutes", () => {
  void it("POST /internal/paper-trading/trades exige token (ADR-007/008)", async () => {
    const { app, tmpDir } = buildTestApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/internal/paper-trading/trades",
        payload: {
          asset: "bitcoin",
          side: "long",
          entryPrice: 100,
          stopPrice: 95,
          targetPrice: 110,
        },
      });
      assert.ok(response.statusCode === 401 || response.statusCode === 403);
    } finally {
      await app.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  void it("POST /internal/paper-trading/trades cria trade com token valido", async () => {
    const { app, tmpDir } = buildTestApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/internal/paper-trading/trades",
        headers: { "x-internal-token": "test_internal_token_12345" },
        payload: {
          asset: "bitcoin",
          side: "long",
          entryPrice: 100,
          stopPrice: 95,
          targetPrice: 110,
          confluenceScore: 4,
        },
      });
      assert.equal(response.statusCode, 201);
    } finally {
      await app.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  void it("POST /internal/paper-trading/trades rejeita payload invalido (400)", async () => {
    const { app, tmpDir } = buildTestApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/internal/paper-trading/trades",
        headers: { "x-internal-token": "test_internal_token_12345" },
        payload: {
          asset: "bitcoin",
          side: "long",
          entryPrice: 100,
          stopPrice: 105,
          targetPrice: 110,
        },
      });
      assert.equal(response.statusCode, 400);
    } finally {
      await app.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  void it("GET /v1/paper-trading/stats retorna estrutura completa", async () => {
    const { app, tmpDir } = buildTestApp();
    try {
      const response = await app.inject({
        method: "GET",
        url: "/v1/paper-trading/stats",
      });
      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload) as {
        data: { totalTrades: number; equityCurve: unknown[] };
      };
      assert.equal(body.data.totalTrades, 0);
      assert.ok(Array.isArray(body.data.equityCurve));
    } finally {
      await app.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  void it("GET /v1/paper-trading/trades lista trades publicos", async () => {
    const { app, tmpDir } = buildTestApp();
    try {
      await app.inject({
        method: "POST",
        url: "/internal/paper-trading/trades",
        headers: { "x-internal-token": "test_internal_token_12345" },
        payload: {
          asset: "bitcoin",
          side: "long",
          entryPrice: 100,
          stopPrice: 95,
          targetPrice: 110,
        },
      });
      const response = await app.inject({
        method: "GET",
        url: "/v1/paper-trading/trades",
      });
      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload) as {
        data: Array<{ asset: string; status: string }>;
      };
      assert.equal(body.data.length, 1);
      assert.equal(body.data[0]?.asset, "bitcoin");
      assert.equal(body.data[0]?.status, "open");
    } finally {
      await app.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
