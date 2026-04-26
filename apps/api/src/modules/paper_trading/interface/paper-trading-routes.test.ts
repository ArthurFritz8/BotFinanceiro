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
process.env.PAPER_TRADING_OPERATOR_TOKEN ??= "test_operator_token_12345";

const { JsonlTradeStore } = await import(
  "../infrastructure/jsonl-trade-store.js"
);
const { InMemoryOperatorDispatchJournal } = await import(
  "../infrastructure/in-memory-operator-dispatch-journal.js"
);
const { PaperTradingService } = await import(
  "../application/paper-trading-service.js"
);
const { PaperTradingController } = await import("./paper-trading-controller.js");
const { AutoPaperTradingBridge } = await import(
  "../application/auto-paper-trading-bridge.js"
);
const { AutoPaperTradingController } = await import(
  "./auto-paper-trading-controller.js"
);
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
  const autoBridge = new AutoPaperTradingBridge({
    paperTradingService: service,
    priceProvider: () => Promise.resolve(100),
  });
  const operatorJournal = new InMemoryOperatorDispatchJournal();
  const autoController = new AutoPaperTradingController(autoBridge, operatorJournal);
  const app = Fastify({ logger: false });
  app.setErrorHandler(httpErrorHandler);
  registerPaperTradingInternalRoutes(app, controller, autoController);
  void app.register(
    (instance, _, done) => {
      registerPaperTradingPublicRoutes(instance, controller, autoController);
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

  void it("POST /v1/paper-trading/operator/auto-signal exige token de operador", async () => {
    const { app, tmpDir } = buildTestApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/paper-trading/operator/auto-signal",
        payload: {
          asset: "bitcoin",
          confluenceScore: 88,
          entryPrice: 100,
          side: "long",
          stopPrice: 95,
          targetPrice: 112,
          tier: "high",
        },
      });
      assert.equal(response.statusCode, 401);
    } finally {
      await app.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  void it("POST /v1/paper-trading/operator/auto-signal rejeita token invalido", async () => {
    const { app, tmpDir } = buildTestApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/paper-trading/operator/auto-signal",
        headers: { "x-paper-trading-operator-token": "invalid_operator_token" },
        payload: {
          asset: "bitcoin",
          confluenceScore: 88,
          entryPrice: 100,
          side: "long",
          stopPrice: 95,
          targetPrice: 112,
          tier: "high",
        },
      });
      assert.equal(response.statusCode, 401);
    } finally {
      await app.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  void it("POST /v1/paper-trading/operator/auto-signal abre trade com token valido", async () => {
    const { app, tmpDir } = buildTestApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/paper-trading/operator/auto-signal",
        headers: { "x-paper-trading-operator-token": "test_operator_token_12345" },
        payload: {
          asset: "bitcoin",
          confluenceScore: 88,
          entryPrice: 100,
          side: "long",
          stopPrice: 95,
          targetPrice: 112,
          tier: "high",
        },
      });
      assert.equal(response.statusCode, 201);
      const body = JSON.parse(response.payload) as {
        data: { action: string; trade?: { asset: string; status: string } };
      };
      assert.equal(body.data.action, "opened");
      assert.equal(body.data.trade?.asset, "bitcoin");
      assert.equal(body.data.trade?.status, "open");
    } finally {
      await app.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  void it("GET /v1/paper-trading/operator/journal exige token de operador", async () => {
    const { app, tmpDir } = buildTestApp();
    try {
      const response = await app.inject({
        method: "GET",
        url: "/v1/paper-trading/operator/journal",
      });
      assert.equal(response.statusCode, 401);
    } finally {
      await app.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  void it("GET /v1/paper-trading/operator/journal lista disparos recentes (ADR-105)", async () => {
    const { app, tmpDir } = buildTestApp();
    try {
      await app.inject({
        method: "POST",
        url: "/v1/paper-trading/operator/auto-signal",
        headers: {
          "x-paper-trading-operator-token": "test_operator_token_12345",
        },
        payload: {
          asset: "bitcoin",
          confluenceScore: 88,
          entryPrice: 100,
          side: "long",
          stopPrice: 95,
          targetPrice: 112,
          tier: "high",
        },
      });
      await app.inject({
        method: "POST",
        url: "/v1/paper-trading/operator/auto-signal",
        headers: {
          "x-paper-trading-operator-token": "test_operator_token_12345",
        },
        payload: {
          asset: "bitcoin",
          confluenceScore: 75,
          entryPrice: 110,
          side: "long",
          stopPrice: 100,
          targetPrice: 120,
          tier: "high",
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/paper-trading/operator/journal",
        headers: {
          "x-paper-trading-operator-token": "test_operator_token_12345",
        },
      });
      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload) as {
        data: {
          enabled: boolean;
          total: number;
          opened: number;
          skipped: number;
          errors: number;
          entries: Array<{ asset: string; action: string; reason: string | null }>;
        };
      };
      assert.equal(body.data.enabled, true);
      assert.equal(body.data.total, 2);
      assert.equal(body.data.opened, 1);
      assert.equal(body.data.skipped, 1);
      assert.equal(body.data.errors, 0);
      assert.equal(body.data.entries.length, 2);
      assert.equal(body.data.entries[0]?.asset, "bitcoin");
      assert.equal(body.data.entries[0]?.action, "skipped");
      assert.equal(body.data.entries[0]?.reason, "duplicate_open_trade");
      assert.equal(body.data.entries[1]?.action, "opened");
    } finally {
      await app.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  void it("GET /v1/paper-trading/operator/journal aceita limite query (ADR-105)", async () => {
    const { app, tmpDir } = buildTestApp();
    try {
      await app.inject({
        method: "POST",
        url: "/v1/paper-trading/operator/auto-signal",
        headers: {
          "x-paper-trading-operator-token": "test_operator_token_12345",
        },
        payload: {
          asset: "bitcoin",
          confluenceScore: 88,
          entryPrice: 100,
          side: "long",
          stopPrice: 95,
          targetPrice: 112,
          tier: "high",
        },
      });
      await app.inject({
        method: "POST",
        url: "/v1/paper-trading/operator/auto-signal",
        headers: {
          "x-paper-trading-operator-token": "test_operator_token_12345",
        },
        payload: {
          asset: "bitcoin",
          confluenceScore: 75,
          entryPrice: 110,
          side: "long",
          stopPrice: 100,
          targetPrice: 120,
          tier: "high",
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/paper-trading/operator/journal?limit=1",
        headers: {
          "x-paper-trading-operator-token": "test_operator_token_12345",
        },
      });
      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload) as {
        data: { total: number; entries: Array<{ asset: string }> };
      };
      assert.equal(body.data.total, 2);
      assert.equal(body.data.entries.length, 1);
    } finally {
      await app.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  void it("GET /v1/paper-trading/operator/journal filtra por action (ADR-106)", async () => {
    const { app, tmpDir } = buildTestApp();
    try {
      await app.inject({
        method: "POST",
        url: "/v1/paper-trading/operator/auto-signal",
        headers: {
          "x-paper-trading-operator-token": "test_operator_token_12345",
        },
        payload: {
          asset: "bitcoin",
          confluenceScore: 88,
          entryPrice: 100,
          side: "long",
          stopPrice: 95,
          targetPrice: 112,
          tier: "high",
        },
      });
      await app.inject({
        method: "POST",
        url: "/v1/paper-trading/operator/auto-signal",
        headers: {
          "x-paper-trading-operator-token": "test_operator_token_12345",
        },
        payload: {
          asset: "bitcoin",
          confluenceScore: 75,
          entryPrice: 110,
          side: "long",
          stopPrice: 100,
          targetPrice: 120,
          tier: "high",
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/paper-trading/operator/journal?action=skipped",
        headers: {
          "x-paper-trading-operator-token": "test_operator_token_12345",
        },
      });
      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload) as {
        data: {
          total: number;
          opened: number;
          skipped: number;
          entries: Array<{ action: string }>;
        };
      };
      assert.equal(body.data.total, 1);
      assert.equal(body.data.skipped, 1);
      assert.equal(body.data.opened, 0);
      assert.equal(body.data.entries[0]?.action, "skipped");
    } finally {
      await app.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  void it("GET /v1/paper-trading/operator/journal rejeita from > to (ADR-106)", async () => {
    const { app, tmpDir } = buildTestApp();
    try {
      const response = await app.inject({
        method: "GET",
        url:
          "/v1/paper-trading/operator/journal" +
          "?from=2026-04-26T12:00:00.000Z&to=2026-04-26T11:00:00.000Z",
        headers: {
          "x-paper-trading-operator-token": "test_operator_token_12345",
        },
      });
      assert.equal(response.statusCode, 400);
    } finally {
      await app.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  void it("GET /v1/paper-trading/operator/journal rejeita from invalido (ADR-106)", async () => {
    const { app, tmpDir } = buildTestApp();
    try {
      const response = await app.inject({
        method: "GET",
        url: "/v1/paper-trading/operator/journal?from=not-a-date",
        headers: {
          "x-paper-trading-operator-token": "test_operator_token_12345",
        },
      });
      assert.equal(response.statusCode, 400);
    } finally {
      await app.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
