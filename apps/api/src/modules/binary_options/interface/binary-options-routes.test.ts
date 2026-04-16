import assert from "node:assert/strict";
import { after, beforeEach, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";

const { buildApp } = await import("../../../main/app.js");

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

void beforeEach(() => {
  globalThis.fetch = originalFetch;
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
