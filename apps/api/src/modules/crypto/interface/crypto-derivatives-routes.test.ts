// ADR-119 — Tests para rotas institucionais (derivatives, CVD, orderbook depth).

import assert from "node:assert/strict";
import { after, beforeEach, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";
process.env.BINANCE_API_BASE_URL ??= "https://api.binance.com";
process.env.BINANCE_FUTURES_API_BASE_URL ??= "https://fapi.binance.com";

const { buildApp } = await import("../../../main/app.js");

const app = buildApp();
await app.ready();

const originalFetch = globalThis.fetch;

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

void beforeEach(() => {
  globalThis.fetch = originalFetch;
});

void after(async () => {
  globalThis.fetch = originalFetch;
  await app.close();
});

void it("GET /v1/crypto/derivatives expoe funding/OI/mark com interpretacao de pressao", async () => {
  globalThis.fetch = ((input) => {
    const url = String(input);
    if (url.includes("/fapi/v1/ticker/24hr")) {
      return Promise.resolve(jsonResponse({
        symbol: "BTCUSDT",
        lastPrice: "64210.55",
        priceChangePercent: "1.42",
        highPrice: "64850.0",
        lowPrice: "63100.0",
        openPrice: "63800.0",
        quoteVolume: "1500000000",
        volume: "23000",
      }));
    }
    if (url.includes("/fapi/v1/premiumIndex")) {
      // 0.0006 = 6 bps -> "extreme_long"
      return Promise.resolve(jsonResponse({
        symbol: "BTCUSDT",
        lastFundingRate: "0.0006",
        markPrice: "64215.5",
        indexPrice: "64210.0",
        nextFundingTime: Date.now() + 3_600_000,
      }));
    }
    if (url.includes("/fapi/v1/openInterest")) {
      return Promise.resolve(jsonResponse({
        symbol: "BTCUSDT",
        openInterest: "85000.5",
        time: Date.now(),
      }));
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  }) as typeof fetch;

  const response = await app.inject({ method: "GET", url: "/v1/crypto/derivatives?assetId=bitcoin" });
  assert.equal(response.statusCode, 200);
  const body = response.json<{
    data: {
      symbol: string;
      contract: { derivatives: { lastFundingRate: number; openInterest: number; markPrice: number } };
      fundingPressure: { rateBps: number; interpretation: string };
      cache: { state: string };
    };
  }>();
  assert.equal(body.data.symbol, "BTCUSDT");
  assert.equal(body.data.contract.derivatives.lastFundingRate, 0.0006);
  assert.equal(body.data.contract.derivatives.openInterest, 85000.5);
  assert.equal(body.data.contract.derivatives.markPrice, 64215.5);
  assert.equal(body.data.fundingPressure.rateBps, 6);
  assert.equal(body.data.fundingPressure.interpretation, "extreme_long");
  assert.equal(body.data.cache.state, "miss");
});

void it("GET /v1/crypto/cvd calcula buy/sell volume e cvd a partir de aggTrades", async () => {
  // 6 trades: 4 com isBuyerMaker=false (buys agressivos) qty 1 cada, 2 com true (sells agressivos) qty 0.5 cada.
  // buyVolume=4, sellVolume=1, cvd=3, buyRatio=0.8
  const trades = [
    { a: 1, p: "100", q: "1", T: 1700000000000, m: false },
    { a: 2, p: "100", q: "1", T: 1700000001000, m: false },
    { a: 3, p: "100", q: "0.5", T: 1700000002000, m: true },
    { a: 4, p: "100", q: "1", T: 1700000003000, m: false },
    { a: 5, p: "100", q: "0.5", T: 1700000004000, m: true },
    { a: 6, p: "100", q: "1", T: 1700000005000, m: false },
  ];
  globalThis.fetch = ((input) => {
    const url = String(input);
    if (url.includes("/fapi/v1/aggTrades")) {
      return Promise.resolve(jsonResponse(trades));
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  }) as typeof fetch;

  const response = await app.inject({ method: "GET", url: "/v1/crypto/cvd?assetId=bitcoin&limit=100" });
  assert.equal(response.statusCode, 200);
  const body = response.json<{
    data: {
      cvd: number;
      buyVolume: number;
      sellVolume: number;
      buyRatio: number;
      windowTrades: number;
    };
  }>();
  assert.equal(body.data.windowTrades, 6);
  assert.equal(body.data.buyVolume, 4);
  assert.equal(body.data.sellVolume, 1);
  assert.equal(body.data.cvd, 3);
  assert.ok(Math.abs(body.data.buyRatio - 0.8) < 1e-6);
});

void it("GET /v1/crypto/orderbook-depth retorna bids/asks normalizados, totals e spread", async () => {
  globalThis.fetch = ((input) => {
    const url = String(input);
    if (url.includes("/fapi/v1/depth")) {
      return Promise.resolve(jsonResponse({
        lastUpdateId: 12345,
        bids: [["100.0", "2"], ["99.5", "1"]],
        asks: [["100.5", "1"], ["101.0", "3"]],
      }));
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  }) as typeof fetch;

  const response = await app.inject({ method: "GET", url: "/v1/crypto/orderbook-depth?assetId=bitcoin&levels=20" });
  assert.equal(response.statusCode, 200);
  const body = response.json<{
    data: {
      bids: Array<{ price: number; quantity: number }>;
      asks: Array<{ price: number; quantity: number }>;
      totals: { bidLiquidity: number; askLiquidity: number; imbalance: number };
      spread: { bestBid: number; bestAsk: number; absolute: number; relativeBps: number };
      lastUpdateId: number;
    };
  }>();
  assert.equal(body.data.lastUpdateId, 12345);
  assert.equal(body.data.bids.length, 2);
  assert.equal(body.data.asks.length, 2);
  // bidLiquidity = 100*2 + 99.5*1 = 299.5; askLiquidity = 100.5*1 + 101*3 = 403.5
  assert.equal(body.data.totals.bidLiquidity, 299.5);
  assert.equal(body.data.totals.askLiquidity, 403.5);
  // imbalance = (299.5 - 403.5) / 703 = -0.1479
  assert.ok(body.data.totals.imbalance < 0);
  assert.equal(body.data.spread.bestBid, 100);
  assert.equal(body.data.spread.bestAsk, 100.5);
  assert.equal(body.data.spread.absolute, 0.5);
});

void it("GET /v1/crypto/orderbook-depth rejeita levels invalidos", async () => {
  const response = await app.inject({ method: "GET", url: "/v1/crypto/orderbook-depth?assetId=bitcoin&levels=37" });
  assert.equal(response.statusCode, 400);
});

// ADR-125: sparkline funding history.
void it("GET /v1/crypto/funding-history retorna pontos 24h + summary + Cache-Control 60s", async () => {
  const nowMs = Date.now();
  const eightHourMs = 8 * 3600 * 1000;
  // 4 entries cobrindo ~32h: ultima dentro de 24h.
  const fundingPayload = [
    { symbol: "BTCUSDT", fundingTime: nowMs - 3 * eightHourMs, fundingRate: "0.0001", markPrice: "60000" },
    { symbol: "BTCUSDT", fundingTime: nowMs - 2 * eightHourMs, fundingRate: "0.00015", markPrice: "60100" },
    { symbol: "BTCUSDT", fundingTime: nowMs - eightHourMs, fundingRate: "0.0002", markPrice: "60200" },
    { symbol: "BTCUSDT", fundingTime: nowMs - 60_000, fundingRate: "0.00025", markPrice: "60300" },
  ];

  let fetchCount = 0;
  globalThis.fetch = ((input) => {
    const url = String(input);
    if (url.includes("/fapi/v1/fundingRate")) {
      fetchCount += 1;
      return Promise.resolve(jsonResponse(fundingPayload));
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  }) as typeof fetch;

  const response = await app.inject({ method: "GET", url: "/v1/crypto/funding-history?assetId=bitcoin&hours=24" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "public, max-age=60, stale-while-revalidate=120");
  const body = response.json<{
    data: {
      symbol: string;
      hours: number;
      points: Array<{ fundingRateBps: number; fundingTime: string }>;
      summary: { count: number; trend: string; latestRateBps: number; avgRateBps: number };
      cache: { state: string };
    };
  }>();
  assert.equal(body.data.symbol, "BTCUSDT");
  assert.equal(body.data.hours, 24);
  // Cutoff -24h descarta apenas a entrada de -32h. Restam 3 pontos.
  assert.equal(body.data.points.length, 3);
  // 0.00025 = 2.5 bps (latest)
  assert.equal(body.data.summary.latestRateBps, 2.5);
  assert.equal(body.data.summary.count, 3);
  // trend: 1.5 -> 2.0 -> 2.5 = up
  assert.equal(body.data.summary.trend, "up");
  assert.equal(body.data.cache.state, "miss");

  // Segunda request mesmo asset/hours: cache hit, sem novo fetch.
  const response2 = await app.inject({ method: "GET", url: "/v1/crypto/funding-history?assetId=bitcoin&hours=24" });
  assert.equal(response2.statusCode, 200);
  const body2 = response2.json<{ data: { cache: { state: string } } }>();
  assert.equal(body2.data.cache.state, "hit");
  assert.equal(fetchCount, 1);
});
