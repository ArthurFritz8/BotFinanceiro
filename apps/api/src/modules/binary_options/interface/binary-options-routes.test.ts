import assert from "node:assert/strict";
import { after, beforeEach, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";

const { buildApp } = await import("../../../main/app.js");
const {
  binaryOptionsGhostAuditStore,
} = await import("../../../shared/observability/binary-options-ghost-audit-store.js");

const app = buildApp();
await app.ready();

const originalFetch = globalThis.fetch;

function buildAggTradesFixture(count: number): Array<{
  M: boolean;
  T: number;
  a: number;
  f: number;
  l: number;
  m: boolean;
  p: string;
  q: string;
}> {
  const nowMs = Date.now();

  return Array.from({ length: count }, (_, index) => {
    const tradeTimestamp = nowMs - (count - index) * 1000;
    const wave = Math.sin(index / 7) * 22;
    const drift = index * 0.45;
    const price = 64100 + wave + drift;

    return {
      M: true,
      T: tradeTimestamp,
      a: index + 1,
      f: index + 1,
      l: index + 1,
      m: index % 2 === 0,
      p: price.toFixed(4),
      q: (0.08 + (index % 5) * 0.01).toFixed(5),
    };
  });
}

void beforeEach(async () => {
  globalThis.fetch = originalFetch;
  await binaryOptionsGhostAuditStore.clear();
});

void after(async () => {
  globalThis.fetch = originalFetch;
  await app.close();
});

void it("GET /v1/binary-options/strategy-chart suporta resolucao em segundos", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.binance.com/api/v3/aggTrades") && requestUrl.includes("symbol=BTCUSDT")) {
      return Promise.resolve(
        new Response(JSON.stringify(buildAggTradesFixture(240)), {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        }),
      );
    }

    if (requestUrl.includes("api.binance.com/api/v3/ticker/24hr") && requestUrl.includes("symbol=BTCUSDT")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            lastPrice: "64210.55",
            priceChangePercent: "1.42",
            symbol: "BTCUSDT",
            volume: "152430.55",
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "GET",
    url: "/v1/binary-options/strategy-chart?assetId=bitcoin&mode=delayed&range=24h&resolution=1S",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      insights: {
        bollingerTouch: "inside" | "lower" | "upper";
        candlePattern: string;
        candlePatternSignal: "bearish" | "bullish" | "neutral";
        confidenceScore: number;
        momentumVelocityPercentPerSecond: number;
        rejectionSignal: "bearish" | "bullish" | "none";
      };
      live: null | {
        source: "binance";
      };
      mode: "delayed" | "live";
      points: Array<{
        close: number;
        timestamp: string;
      }>;
      provider: "binance";
      resolution: string;
      strategy: "binary_options";
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.strategy, "binary_options");
  assert.equal(body.data.provider, "binance");
  assert.equal(body.data.mode, "delayed");
  assert.equal(body.data.resolution, "1S");
  assert.equal(body.data.live, null);
  assert.equal(typeof body.data.insights.momentumVelocityPercentPerSecond, "number");
  assert.equal(typeof body.data.insights.confidenceScore, "number");
  assert.ok(["inside", "lower", "upper"].includes(body.data.insights.bollingerTouch));
  assert.ok(["none", "bullish", "bearish"].includes(body.data.insights.rejectionSignal));
  assert.equal(typeof body.data.insights.candlePattern, "string");
  assert.ok(["bullish", "bearish", "neutral"].includes(body.data.insights.candlePatternSignal));
  assert.ok(body.data.points.length >= 60);
  assert.equal(typeof body.data.points[0]?.timestamp, "string");
  assert.equal(typeof body.data.points[0]?.close, "number");
});

void it("GET /v1/binary-options/strategy-chart suporta resolucao por ticks", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.binance.com/api/v3/aggTrades") && requestUrl.includes("symbol=BTCUSDT")) {
      return Promise.resolve(
        new Response(JSON.stringify(buildAggTradesFixture(300)), {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        }),
      );
    }

    if (requestUrl.includes("api.binance.com/api/v3/ticker/24hr") && requestUrl.includes("symbol=BTCUSDT")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            lastPrice: "64300.12",
            priceChangePercent: "0.74",
            symbol: "BTCUSDT",
            volume: "130220.40",
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "GET",
    url: "/v1/binary-options/strategy-chart?assetId=bitcoin&mode=live&range=24h&resolution=10T&exchange=bybit",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      exchange: {
        fallbackActive: boolean;
        requested: string;
        resolved: "binance";
      };
      live: {
        source: "binance";
      } | null;
      points: Array<{
        close: number;
      }>;
      resolution: string;
      strategy: "binary_options";
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.strategy, "binary_options");
  assert.equal(body.data.resolution, "10T");
  assert.equal(body.data.exchange.requested, "bybit");
  assert.equal(body.data.exchange.resolved, "binance");
  assert.equal(body.data.exchange.fallbackActive, true);
  assert.ok(body.data.live !== null);
  assert.equal(body.data.live?.source, "binance");
  assert.ok(body.data.points.length > 0 && body.data.points.length <= 80);
  assert.equal(typeof body.data.points[0]?.close, "number");
});

void it("POST /v1/binary-options/ghost-audit/settlements registra liquidacao e retorna dedupe", async () => {
  const payload = {
    assetId: "bitcoin",
    callProbability: 78.5,
    direction: "call",
    entryPrice: 64050.12,
    exchangeRequested: "binance",
    exchangeResolved: "binance",
    expiryPrice: 64121.52,
    expirySeconds: 60,
    momentumStrength: 54.2,
    neutralProbability: 11.4,
    openedAt: "2026-01-10T10:00:00.000Z",
    operationalMode: "binary_options",
    outcome: "win",
    probability: 78.5,
    provider: "binance",
    putProbability: 10.1,
    range: "24h",
    resolution: "1S",
    sessionId: "sess_binary_audit_001",
    settledAt: "2026-01-10T10:01:00.000Z",
    signalId: "ghost_signal_001",
    symbol: "BTCUSDT",
    triggerHeat: "hot",
  } as const;

  const firstResponse = await app.inject({
    method: "POST",
    payload,
    url: "/v1/binary-options/ghost-audit/settlements",
  });

  assert.equal(firstResponse.statusCode, 202);

  const firstBody = firstResponse.json<{
    data: {
      accepted: boolean;
      deduplicated: boolean;
      generatedAt: string;
      mode: "file" | "postgres";
    };
    status: "success";
  }>();

  assert.equal(firstBody.status, "success");
  assert.equal(firstBody.data.accepted, true);
  assert.equal(firstBody.data.deduplicated, false);
  assert.ok(firstBody.data.generatedAt.length > 0);
  assert.ok(firstBody.data.mode === "file" || firstBody.data.mode === "postgres");

  const duplicateResponse = await app.inject({
    method: "POST",
    payload,
    url: "/v1/binary-options/ghost-audit/settlements",
  });

  assert.equal(duplicateResponse.statusCode, 202);

  const duplicateBody = duplicateResponse.json<{
    data: {
      accepted: boolean;
      deduplicated: boolean;
    };
    status: "success";
  }>();

  assert.equal(duplicateBody.status, "success");
  assert.equal(duplicateBody.data.accepted, true);
  assert.equal(duplicateBody.data.deduplicated, true);

  const historyResponse = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/v1/binary-options/ghost-audit/history?sessionId=sess_binary_audit_001&operationalMode=binary_options&limit=10&offset=0",
  });

  assert.equal(historyResponse.statusCode, 200);

  const historyBody = historyResponse.json<{
    data: {
      records: Array<{
        outcome: "loss" | "push" | "win";
        signalId: string;
      }>;
      summary: {
        losses: number;
        pushes: number;
        resolvedTrades: number;
        winRatePercent: number;
        wins: number;
      };
      totalMatched: number;
    };
    status: "success";
  }>();

  assert.equal(historyBody.status, "success");
  assert.equal(historyBody.data.totalMatched, 1);
  assert.equal(historyBody.data.records.length, 1);
  assert.equal(historyBody.data.records[0]?.signalId, "ghost_signal_001");
  assert.equal(historyBody.data.records[0]?.outcome, "win");
  assert.equal(historyBody.data.summary.wins, 1);
  assert.equal(historyBody.data.summary.losses, 0);
  assert.equal(historyBody.data.summary.pushes, 0);
  assert.equal(historyBody.data.summary.resolvedTrades, 1);
  assert.equal(historyBody.data.summary.winRatePercent, 100);
});

void it("GET /v1/binary-options/ghost-audit/history filtra por operationalMode", async () => {
  const binaryPayload = {
    assetId: "bitcoin",
    direction: "call",
    entryPrice: 64000,
    expiryPrice: 64080,
    expirySeconds: 60,
    operationalMode: "binary_options",
    outcome: "win",
    probability: 79,
    sessionId: "sess_binary_mode_001",
    signalId: "ghost_binary_mode_001",
  } as const;

  const spotPayload = {
    assetId: "bitcoin",
    direction: "put",
    entryPrice: 64020,
    expiryPrice: 63920,
    expirySeconds: 60,
    operationalMode: "spot_margin",
    outcome: "win",
    probability: 74,
    sessionId: "sess_spot_mode_001",
    signalId: "ghost_spot_mode_001",
  } as const;

  const binaryPost = await app.inject({
    method: "POST",
    payload: binaryPayload,
    url: "/v1/binary-options/ghost-audit/settlements",
  });
  assert.equal(binaryPost.statusCode, 202);

  const spotPost = await app.inject({
    method: "POST",
    payload: spotPayload,
    url: "/v1/binary-options/ghost-audit/settlements",
  });
  assert.equal(spotPost.statusCode, 202);

  const historyBinaryResponse = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/v1/binary-options/ghost-audit/history?assetId=bitcoin&operationalMode=binary_options&limit=20&offset=0",
  });
  assert.equal(historyBinaryResponse.statusCode, 200);

  const historyBinaryBody = historyBinaryResponse.json<{
    data: {
      records: Array<{
        operationalMode?: "binary_options" | "spot_margin";
      }>;
      totalMatched: number;
    };
    status: "success";
  }>();

  assert.equal(historyBinaryBody.status, "success");
  assert.equal(historyBinaryBody.data.totalMatched, 1);
  assert.equal(historyBinaryBody.data.records[0]?.operationalMode, "binary_options");

  const historySpotResponse = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/v1/binary-options/ghost-audit/history?assetId=bitcoin&operationalMode=spot_margin&limit=20&offset=0",
  });
  assert.equal(historySpotResponse.statusCode, 200);

  const historySpotBody = historySpotResponse.json<{
    data: {
      records: Array<{
        operationalMode?: "binary_options" | "spot_margin";
      }>;
      totalMatched: number;
    };
    status: "success";
  }>();

  assert.equal(historySpotBody.status, "success");
  assert.equal(historySpotBody.data.totalMatched, 1);
  assert.equal(historySpotBody.data.records[0]?.operationalMode, "spot_margin");
});

void it("GET /v1/binary-options/ghost-audit/history retorna 401 sem token interno", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/binary-options/ghost-audit/history?limit=5",
  });

  assert.equal(response.statusCode, 401);

  const body = response.json<{
    error: {
      code: string;
      message: string;
    };
    status: "error";
  }>();

  assert.equal(body.status, "error");
  assert.equal(body.error.code, "INTERNAL_AUTH_MISSING_TOKEN");
});

void it("POST /v1/binary-options/ghost-audit/settlements retorna 400 para payload invalido", async () => {
  const response = await app.inject({
    method: "POST",
    payload: {
      assetId: "bitcoin",
      direction: "call",
      entryPrice: 64050,
      expiryPrice: 64100,
      expirySeconds: 1,
      outcome: "win",
      probability: 80,
      sessionId: "bad",
      signalId: "x",
    },
    url: "/v1/binary-options/ghost-audit/settlements",
  });

  assert.equal(response.statusCode, 400);

  const body = response.json<{
    error: {
      code: string;
      message: string;
    };
    status: "error";
  }>();

  assert.equal(body.status, "error");
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(body.error.message, "Invalid payload");
});

void it("GET /v1/binary-options/live-stream valida intervalo minimo", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/binary-options/live-stream?assetId=bitcoin&intervalMs=200",
  });

  assert.equal(response.statusCode, 400);

  const body = response.json<{
    error: {
      code: string;
      message: string;
    };
    status: "error";
  }>();

  assert.equal(body.status, "error");
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(body.error.message, "Invalid payload");
});
