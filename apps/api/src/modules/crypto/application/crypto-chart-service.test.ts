import assert from "node:assert/strict";
import { after, beforeEach, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";

const { memoryCache } = await import("../../../shared/cache/memory-cache.js");
const { CryptoChartService, resetCryptoChartLiveBrokerResilienceState } = await import("./crypto-chart-service.js");

const originalFetch = globalThis.fetch;
const service = new CryptoChartService();

void beforeEach(() => {
  globalThis.fetch = originalFetch;
  memoryCache.clear();
  resetCryptoChartLiveBrokerResilienceState();
});

void after(() => {
  globalThis.fetch = originalFetch;
});

void it("getLiveStreamSnapshot usa stale cache para broker nao-binance quando refresh falha", async () => {
  const staleCacheKey = "crypto:chart:live:bitcoin:usd:24h:auto:okx";

  memoryCache.set(
    staleCacheKey,
    {
      assetId: "bitcoin",
      currency: "usd",
      fetchedAt: "2026-04-15T12:00:00.000Z",
      insights: {
        atrPercent: 1.12,
        changePercent: 1.94,
        confidenceScore: 69,
        currentPrice: 64120,
        emaFast: 64080,
        emaSlow: 63950,
        highPrice: 64400,
        longMovingAverage: 63890,
        lowPrice: 63320,
        macdHistogram: 0.22,
        momentumPercent: 0.61,
        resistanceLevel: 64280,
        rsi14: 55.1,
        shortMovingAverage: 64070,
        supportLevel: 63740,
        tradeAction: "buy",
        tradeLevels: {
          entryZoneHigh: 64150,
          entryZoneLow: 63980,
          stopLoss: 63720,
          takeProfit1: 64480,
          takeProfit2: 64890,
        },
        trend: "bullish",
        volatilityPercent: 2.05,
      },
      live: {
        changePercent24h: 1.46,
        source: "okx",
        symbol: "BTC-USDT",
        volume24h: 38210.44,
      },
      mode: "live",
      points: [
        {
          close: 63920,
          high: 64000,
          low: 63890,
          open: 63900,
          timestamp: "2026-04-15T11:50:00.000Z",
          volume: 980,
        },
        {
          close: 64120,
          high: 64210,
          low: 64020,
          open: 64070,
          timestamp: "2026-04-15T12:00:00.000Z",
          volume: 1020,
        },
      ],
      provider: "okx",
      range: "24h",
    },
    -1,
    45,
  );

  let fetchCalls = 0;

  globalThis.fetch = ((input) => {
    fetchCalls += 1;
    return Promise.reject(new Error(`network down for ${String(input)}`));
  }) as typeof fetch;

  const snapshot = await service.getLiveStreamSnapshot({
    assetId: "bitcoin",
    broker: "okx",
    range: "24h",
  });

  assert.ok(fetchCalls >= 1);
  assert.equal(snapshot.mode, "live");
  assert.equal(snapshot.provider, "okx");
  assert.equal(snapshot.cache.state, "stale");
  assert.equal(snapshot.cache.stale, true);
  assert.equal(snapshot.live?.source, "okx");
  assert.equal(snapshot.live?.symbol, "BTC-USDT");
});
