import assert from "node:assert/strict";
import { after, beforeEach, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";

const { buildApp } = await import("../../../main/app.js");
const { memoryCache } = await import("../../../shared/cache/memory-cache.js");
const { cryptoLiveChartMetricsStore } = await import("../../../shared/observability/crypto-live-chart-metrics-store.js");
const { resetCryptoChartLiveBrokerResilienceState } = await import("../application/crypto-chart-service.js");

const app = buildApp();
await app.ready();

const originalFetch = globalThis.fetch;
type LiveChartBroker = "binance" | "bybit" | "coinbase" | "kraken" | "okx";

void beforeEach(() => {
  globalThis.fetch = originalFetch;
  memoryCache.clear();
  cryptoLiveChartMetricsStore.reset();
  resetCryptoChartLiveBrokerResilienceState();
});

void after(async () => {
  globalThis.fetch = originalFetch;
  await app.close();
});

void it("GET /v1/crypto/spot-price usa fallback CoinCap quando CoinGecko falha", async () => {
  let coinGeckoCalls = 0;
  let coinCapCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.coingecko.com/api/v3/simple/price")) {
      coinGeckoCalls += 1;

      return Promise.resolve(
        new Response(JSON.stringify({ status: "not_found" }), {
          headers: {
            "content-type": "application/json",
          },
          status: 404,
        }),
      );
    }

    if (requestUrl.includes("api.coincap.io/v2/assets/bitcoin")) {
      coinCapCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              id: "bitcoin",
              name: "Bitcoin",
              priceUsd: "64150.12",
              symbol: "BTC",
            },
            timestamp: Date.now(),
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
    url: "/v1/crypto/spot-price?assetId=bitcoin&currency=usd",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(coinGeckoCalls, 1);
  assert.equal(coinCapCalls, 1);

  const body = response.json<{
    data: {
      assetId: string;
      cache: {
        stale: boolean;
        state: string;
      };
      currency: string;
      price: number;
      provider: "coincap" | "coingecko";
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.assetId, "bitcoin");
  assert.equal(body.data.currency, "usd");
  assert.equal(body.data.provider, "coincap");
  assert.equal(body.data.cache.state, "miss");
  assert.equal(body.data.cache.stale, false);
  assert.equal(body.data.price, 64150.12);
});

void it("GET /v1/crypto/spot-price resolve alias pi-network via CoinCap", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.coingecko.com/api/v3/simple/price")) {
      return Promise.resolve(
        new Response(JSON.stringify({ status: "not_found" }), {
          headers: {
            "content-type": "application/json",
          },
          status: 404,
        }),
      );
    }

    if (requestUrl.includes("api.coincap.io/v2/assets/pi")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              id: "pi",
              name: "Pi",
              priceUsd: "0.756",
              symbol: "PI",
            },
            timestamp: Date.now(),
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
    url: "/v1/crypto/spot-price?assetId=pi-network&currency=usd",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      assetId: string;
      currency: string;
      provider: "coincap" | "coingecko";
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.assetId, "pi-network");
  assert.equal(body.data.currency, "usd");
  assert.equal(body.data.provider, "coincap");
});

void it("GET /v1/crypto/chart retorna pontos e insights tecnicos", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.coingecko.com/api/v3/coins/bitcoin/market_chart")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            prices: [
              [1712000000000, 64200],
              [1712003600000, 64550],
              [1712007200000, 64810],
              [1712010800000, 65120],
              [1712014400000, 64990],
              [1712018000000, 65300],
            ],
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
    url: "/v1/crypto/chart?assetId=bitcoin&currency=usd&range=7d",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      assetId: string;
      cache: {
        stale: boolean;
        state: string;
      };
      currency: string;
      insights: {
        confidenceScore: number;
        changePercent: number;
        currentPrice: number;
        marketSession: {
          liquidityHeat: "high" | "low" | "medium";
          session: "asia" | "london" | "new_york" | "off_session" | "overlap";
          utcHour: number;
          utcWindow: string;
        };
        marketStructure: {
          bias: "bearish" | "bullish" | "neutral";
          bosSignal: "bearish" | "bullish" | "none";
          chochSignal: "bearish" | "bullish" | "none";
          lastSwingHigh: number;
          lastSwingLow: number;
          swingRangePercent: number;
        };
        tradeAction: "buy" | "sell" | "wait";
        smcConfluence: {
          components: {
            marketStructure: number;
            sessionLiquidity: number;
            volatilityRegime: number;
          };
          score: number;
          tier: "high" | "low" | "medium";
        };
        trend: "bearish" | "bullish" | "sideways";
        volatilityPercent: number;
      };
      live: null;
      mode: "delayed";
      points: Array<{
        close: number;
        high: number;
        low: number;
        open: number;
        timestamp: string;
        volume: number | null;
      }>;
      provider: "coingecko";
      range: "24h" | "7d" | "30d" | "90d" | "1y";
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.assetId, "bitcoin");
  assert.equal(body.data.currency, "usd");
  assert.equal(body.data.range, "7d");
  assert.equal(body.data.provider, "coingecko");
  assert.equal(body.data.mode, "delayed");
  assert.equal(body.data.live, null);
  assert.equal(body.data.cache.state, "refreshed");
  assert.equal(body.data.cache.stale, false);
  assert.equal(body.data.points.length, 6);
  assert.equal(typeof body.data.points[0]?.timestamp, "string");
  assert.equal(body.data.points[0]?.close, 64200);
  assert.equal(body.data.insights.currentPrice, 65300);
  assert.equal(typeof body.data.insights.tradeAction, "string");
  assert.equal(typeof body.data.insights.confidenceScore, "number");
  assert.equal(typeof body.data.insights.changePercent, "number");
  assert.equal(typeof body.data.insights.volatilityPercent, "number");
  assert.equal(typeof body.data.insights.marketSession.session, "string");
  assert.equal(typeof body.data.insights.marketSession.utcHour, "number");
  assert.equal(typeof body.data.insights.marketSession.utcWindow, "string");
  assert.equal(typeof body.data.insights.marketStructure.bias, "string");
  assert.equal(typeof body.data.insights.marketStructure.bosSignal, "string");
  assert.equal(typeof body.data.insights.marketStructure.chochSignal, "string");
  assert.equal(typeof body.data.insights.marketStructure.lastSwingHigh, "number");
  assert.equal(typeof body.data.insights.marketStructure.lastSwingLow, "number");
  assert.equal(typeof body.data.insights.smcConfluence.score, "number");
  assert.equal(typeof body.data.insights.smcConfluence.tier, "string");
  assert.equal(typeof body.data.insights.smcConfluence.components.marketStructure, "number");
  assert.equal(typeof body.data.insights.smcConfluence.components.sessionLiquidity, "number");
  assert.equal(typeof body.data.insights.smcConfluence.components.volatilityRegime, "number");
  assert.ok(body.data.insights.smcConfluence.score >= 5 && body.data.insights.smcConfluence.score <= 95);
  assert.ok(
    body.data.insights.smcConfluence.components.marketStructure >= 4 &&
      body.data.insights.smcConfluence.components.marketStructure <= 45,
  );
  assert.ok(
    body.data.insights.smcConfluence.components.sessionLiquidity >= 6 &&
      body.data.insights.smcConfluence.components.sessionLiquidity <= 30,
  );
  assert.ok(
    body.data.insights.smcConfluence.components.volatilityRegime >= 3 &&
      body.data.insights.smcConfluence.components.volatilityRegime <= 25,
  );
});

void it("GET /v1/crypto/chart usa fallback Binance quando CoinGecko falha", async () => {
  let coinGeckoCalls = 0;
  let binanceKlineCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.coingecko.com/api/v3/coins/bitcoin/market_chart")) {
      coinGeckoCalls += 1;

      return Promise.resolve(
        new Response(JSON.stringify({ status: "rate_limited" }), {
          headers: {
            "content-type": "application/json",
          },
          status: 429,
        }),
      );
    }

    if (requestUrl.includes("api.binance.com/api/v3/klines") && requestUrl.includes("symbol=BTCUSDT")) {
      binanceKlineCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify([
            [1712000000000, "64100", "64230", "64020", "64180", "1200"],
            [1712003600000, "64180", "64450", "64120", "64390", "1600"],
            [1712007200000, "64390", "64620", "64300", "64580", "1840"],
            [1712010800000, "64580", "64820", "64520", "64720", "1720"],
            [1712014400000, "64720", "64990", "64680", "64920", "2100"],
          ]),
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
    url: "/v1/crypto/chart?assetId=bitcoin&currency=usd&range=24h",
  });

  assert.equal(response.statusCode, 200);
  assert.ok(coinGeckoCalls >= 1);
  assert.equal(binanceKlineCalls, 1);

  const body = response.json<{
    data: {
      mode: "delayed";
      provider: "binance" | "coingecko";
      points: Array<{
        close: number;
      }>;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.mode, "delayed");
  assert.equal(body.data.provider, "binance");
  assert.equal(body.data.points.length, 5);
  assert.equal(body.data.points[4]?.close, 64920);
});

void it("GET /v1/crypto/strategy-chart usa pipeline delayed por padrao", async () => {
  let coinGeckoCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.coingecko.com/api/v3/coins/bitcoin/market_chart")) {
      coinGeckoCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            prices: [
              [1712000000000, 64210],
              [1712003600000, 64480],
              [1712007200000, 64620],
              [1712010800000, 64755],
              [1712014400000, 64905],
            ],
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
    url: "/v1/crypto/strategy-chart?assetId=bitcoin&currency=usd&range=24h",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(coinGeckoCalls, 1);

  const body = response.json<{
    data: {
      mode: "delayed";
      points: Array<{
        close: number;
      }>;
      provider: "binance" | "coingecko";
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.mode, "delayed");
  assert.equal(body.data.provider, "coingecko");
  assert.equal(body.data.points.length, 5);
});

void it("GET /v1/crypto/strategy-chart usa pipeline live quando mode=live", async () => {
  let klineCalls = 0;
  let tickerCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.binance.com/api/v3/klines") && requestUrl.includes("symbol=BTCUSDT")) {
      klineCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify([
            [1712000000000, "65000", "65140", "64920", "65080", "1100"],
            [1712000300000, "65080", "65190", "65010", "65120", "980"],
            [1712000600000, "65120", "65230", "65080", "65190", "1030"],
            [1712000900000, "65190", "65310", "65150", "65240", "1190"],
            [1712001200000, "65240", "65380", "65200", "65310", "1240"],
          ]),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("api.binance.com/api/v3/ticker/24hr") && requestUrl.includes("symbol=BTCUSDT")) {
      tickerCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            lastPrice: "65312.45",
            priceChangePercent: "1.73",
            symbol: "BTCUSDT",
            volume: "65234.11",
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
    url: "/v1/crypto/strategy-chart?assetId=bitcoin&range=24h&mode=live&exchange=binance",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(klineCalls, 1);
  assert.equal(tickerCalls, 1);

  const body = response.json<{
    data: {
      live: {
        source: LiveChartBroker;
        symbol: string;
      } | null;
      mode: "live";
      provider: LiveChartBroker;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.mode, "live");
  assert.equal(body.data.provider, "binance");
  assert.equal(body.data.live?.source, "binance");
  assert.equal(body.data.live?.symbol, "BTCUSDT");
});

void it("GET /v1/crypto/live-chart aplica failover para Bybit quando Binance falha", async () => {
  let binanceKlineCalls = 0;
  let binanceTickerCalls = 0;
  let bybitKlineCalls = 0;
  let bybitTickerCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.binance.com/api/v3/klines") && requestUrl.includes("symbol=BTCUSDT")) {
      binanceKlineCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            code: -1003,
            msg: "Too many requests",
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 503,
          },
        ),
      );
    }

    if (requestUrl.includes("api.binance.com/api/v3/ticker/24hr") && requestUrl.includes("symbol=BTCUSDT")) {
      binanceTickerCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            code: -1003,
            msg: "Too many requests",
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 503,
          },
        ),
      );
    }

    if (requestUrl.includes("api.bybit.com/v5/market/kline") && requestUrl.includes("symbol=BTCUSDT")) {
      bybitKlineCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            result: {
              list: [
                ["1712001200000", "65240", "65380", "65200", "65310", "1240"],
                ["1712000900000", "65190", "65310", "65150", "65240", "1190"],
                ["1712000600000", "65120", "65230", "65080", "65190", "1030"],
                ["1712000300000", "65080", "65190", "65010", "65120", "980"],
                ["1712000000000", "65000", "65140", "64920", "65080", "1100"],
              ],
            },
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

    if (requestUrl.includes("api.bybit.com/v5/market/tickers") && requestUrl.includes("symbol=BTCUSDT")) {
      bybitTickerCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            result: {
              list: [
                {
                  lastPrice: "65312.45",
                  price24hPcnt: "0.0173",
                  turnover24h: "65234.11",
                },
              ],
            },
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
    url: "/v1/crypto/live-chart?assetId=bitcoin&range=24h&exchange=binance",
  });

  assert.equal(response.statusCode, 200);
  assert.ok(binanceKlineCalls >= 1);
  assert.ok(binanceTickerCalls >= 1);
  assert.equal(bybitKlineCalls, 1);
  assert.equal(bybitTickerCalls, 1);

  const body = response.json<{
    data: {
      live: {
        source: LiveChartBroker;
        symbol: string;
      } | null;
      mode: "live";
      provider: LiveChartBroker;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.mode, "live");
  assert.equal(body.data.provider, "bybit");
  assert.equal(body.data.live?.source, "bybit");
  assert.equal(body.data.live?.symbol, "BTCUSDT");
});

void it("GET /v1/crypto/live-chart aceita exchange=auto e prioriza broker mais saudavel", async () => {
  let binanceCalls = 0;
  let bybitKlineCalls = 0;
  let bybitTickerCalls = 0;

  cryptoLiveChartMetricsStore.onRefreshError({
    broker: "binance",
    latencyMs: 500,
    message: "binance degraded",
  });
  cryptoLiveChartMetricsStore.onRefreshSuccess({
    broker: "bybit",
    latencyMs: 80,
  });

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.binance.com")) {
      binanceCalls += 1;
      return Promise.reject(new Error("Binance should not be called in auto mode after health ranking"));
    }

    if (requestUrl.includes("api.bybit.com/v5/market/kline") && requestUrl.includes("symbol=BTCUSDT")) {
      bybitKlineCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            result: {
              list: [
                ["1712001200000", "65240", "65380", "65200", "65310", "1240"],
                ["1712000900000", "65190", "65310", "65150", "65240", "1190"],
                ["1712000600000", "65120", "65230", "65080", "65190", "1030"],
                ["1712000300000", "65080", "65190", "65010", "65120", "980"],
                ["1712000000000", "65000", "65140", "64920", "65080", "1100"],
              ],
            },
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

    if (requestUrl.includes("api.bybit.com/v5/market/tickers") && requestUrl.includes("symbol=BTCUSDT")) {
      bybitTickerCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            result: {
              list: [
                {
                  lastPrice: "65312.45",
                  price24hPcnt: "0.0173",
                  turnover24h: "65234.11",
                },
              ],
            },
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
    url: "/v1/crypto/live-chart?assetId=bitcoin&range=24h&exchange=auto",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(binanceCalls, 0);
  assert.equal(bybitKlineCalls, 1);
  assert.equal(bybitTickerCalls, 1);

  const body = response.json<{
    data: {
      live: {
        source: LiveChartBroker;
        symbol: string;
      } | null;
      mode: "live";
      provider: LiveChartBroker;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.mode, "live");
  assert.equal(body.data.provider, "bybit");
  assert.equal(body.data.live?.source, "bybit");
  assert.equal(body.data.live?.symbol, "BTCUSDT");
});

void it("GET /v1/crypto/live-chart retorna snapshot ao vivo com Binance", async () => {
  let klineCalls = 0;
  let tickerCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.binance.com/api/v3/klines") && requestUrl.includes("symbol=BTCUSDT")) {
      klineCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify([
            [1712000000000, "65000", "65140", "64920", "65080", "1100"],
            [1712000300000, "65080", "65190", "65010", "65120", "980"],
            [1712000600000, "65120", "65230", "65080", "65190", "1030"],
            [1712000900000, "65190", "65310", "65150", "65240", "1190"],
            [1712001200000, "65240", "65380", "65200", "65310", "1240"],
          ]),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("api.binance.com/api/v3/ticker/24hr") && requestUrl.includes("symbol=BTCUSDT")) {
      tickerCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            lastPrice: "65312.45",
            priceChangePercent: "1.73",
            symbol: "BTCUSDT",
            volume: "65234.11",
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
    url: "/v1/crypto/live-chart?assetId=bitcoin&range=24h",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(klineCalls, 1);
  assert.equal(tickerCalls, 1);

  const body = response.json<{
    data: {
      cache: {
        stale: boolean;
        state: string;
      };
      currency: string;
      live: {
        changePercent24h: number | null;
        source: LiveChartBroker;
        symbol: string;
        volume24h: number | null;
      } | null;
      mode: "live";
      provider: LiveChartBroker;
      points: Array<{
        close: number;
      }>;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.mode, "live");
  assert.equal(body.data.provider, "binance");
  assert.equal(body.data.currency, "usd");
  assert.equal(body.data.cache.state, "refreshed");
  assert.equal(body.data.cache.stale, false);
  assert.equal(body.data.points.length, 5);
  assert.equal(body.data.live?.source, "binance");
  assert.equal(body.data.live?.symbol, "BTCUSDT");
});

void it("GET /v1/crypto/live-chart retorna snapshot ao vivo com OKX quando exchange=okx", async () => {
  let candleCalls = 0;
  let tickerCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("www.okx.com/api/v5/market/candles") && requestUrl.includes("instId=BTC-USDT")) {
      candleCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              ["1712001200000", "65240", "65380", "65200", "65310", "1240"],
              ["1712000900000", "65190", "65310", "65150", "65240", "1190"],
              ["1712000600000", "65120", "65230", "65080", "65190", "1030"],
              ["1712000300000", "65080", "65190", "65010", "65120", "980"],
              ["1712000000000", "65000", "65140", "64920", "65080", "1100"],
            ],
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

    if (requestUrl.includes("www.okx.com/api/v5/market/ticker") && requestUrl.includes("instId=BTC-USDT")) {
      tickerCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                last: "65312.45",
                open24h: "64200",
                volCcy24h: "65234.11",
              },
            ],
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
    url: "/v1/crypto/live-chart?assetId=bitcoin&range=24h&exchange=okx",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(candleCalls, 1);
  assert.equal(tickerCalls, 1);

  const body = response.json<{
    data: {
      live: {
        source: LiveChartBroker;
        symbol: string;
      } | null;
      mode: "live";
      provider: LiveChartBroker;
      points: Array<{
        close: number;
      }>;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.mode, "live");
  assert.equal(body.data.provider, "okx");
  assert.equal(body.data.points.length, 5);
  assert.equal(body.data.live?.source, "okx");
  assert.equal(body.data.live?.symbol, "BTCUSDT");
});

void it("GET /v1/crypto/live-chart isola cache por exchange em trocas rapidas", async () => {
  let binanceKlineCalls = 0;
  let binanceTickerCalls = 0;
  let okxCandleCalls = 0;
  let okxTickerCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.binance.com/api/v3/klines") && requestUrl.includes("symbol=BTCUSDT")) {
      binanceKlineCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify([
            [1712000000000, "65000", "65140", "64920", "65080", "1100"],
            [1712000300000, "65080", "65190", "65010", "65120", "980"],
            [1712000600000, "65120", "65230", "65080", "65190", "1030"],
            [1712000900000, "65190", "65310", "65150", "65240", "1190"],
            [1712001200000, "65240", "65380", "65200", "65310", "1240"],
          ]),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("api.binance.com/api/v3/ticker/24hr") && requestUrl.includes("symbol=BTCUSDT")) {
      binanceTickerCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            lastPrice: "65312.45",
            priceChangePercent: "1.73",
            symbol: "BTCUSDT",
            volume: "65234.11",
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

    if (requestUrl.includes("www.okx.com/api/v5/market/candles") && requestUrl.includes("instId=BTC-USDT")) {
      okxCandleCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              ["1712001200000", "70240", "70380", "70200", "70310", "1240"],
              ["1712000900000", "70190", "70310", "70150", "70240", "1190"],
              ["1712000600000", "70120", "70230", "70080", "70190", "1030"],
              ["1712000300000", "70080", "70190", "70010", "70120", "980"],
              ["1712000000000", "70000", "70140", "69920", "70080", "1100"],
            ],
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

    if (requestUrl.includes("www.okx.com/api/v5/market/ticker") && requestUrl.includes("instId=BTC-USDT")) {
      okxTickerCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                last: "70312.45",
                open24h: "69200",
                volCcy24h: "75234.11",
              },
            ],
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

  const binanceResponseA = await app.inject({
    method: "GET",
    url: "/v1/crypto/live-chart?assetId=bitcoin&range=24h&exchange=binance",
  });

  const okxResponse = await app.inject({
    method: "GET",
    url: "/v1/crypto/live-chart?assetId=bitcoin&range=24h&exchange=okx",
  });

  const binanceResponseB = await app.inject({
    method: "GET",
    url: "/v1/crypto/live-chart?assetId=bitcoin&range=24h&exchange=binance",
  });

  assert.equal(binanceResponseA.statusCode, 200);
  assert.equal(okxResponse.statusCode, 200);
  assert.equal(binanceResponseB.statusCode, 200);

  const bodyA = binanceResponseA.json<{
    data: {
      cache: {
        state: string;
      };
      provider: LiveChartBroker;
    };
  }>();
  const bodyOkx = okxResponse.json<{
    data: {
      cache: {
        state: string;
      };
      provider: LiveChartBroker;
    };
  }>();
  const bodyB = binanceResponseB.json<{
    data: {
      cache: {
        state: string;
      };
      provider: LiveChartBroker;
    };
  }>();

  assert.equal(bodyA.data.provider, "binance");
  assert.equal(bodyA.data.cache.state, "refreshed");
  assert.equal(bodyOkx.data.provider, "okx");
  assert.equal(bodyOkx.data.cache.state, "refreshed");
  assert.equal(bodyB.data.provider, "binance");
  assert.equal(bodyB.data.cache.state, "fresh");

  assert.equal(binanceKlineCalls, 1);
  assert.equal(binanceTickerCalls, 1);
  assert.equal(okxCandleCalls, 1);
  assert.equal(okxTickerCalls, 1);
});

void it("GET /v1/crypto/live-chart valida exchange invalida", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/crypto/live-chart?assetId=bitcoin&range=24h&exchange=deribit",
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

void it("GET /v1/crypto/live-chart usa cache stale quando refresh live falha", async () => {
  const staleCacheKey = "crypto:chart:live:bitcoin:usd:24h:binance";

  memoryCache.set(
    staleCacheKey,
    {
      assetId: "bitcoin",
      currency: "usd",
      fetchedAt: "2026-04-02T12:00:00.000Z",
      insights: {
        atrPercent: 1.2,
        changePercent: 2.1,
        confidenceScore: 71,
        currentPrice: 65200,
        emaFast: 65120,
        emaSlow: 65010,
        highPrice: 65400,
        longMovingAverage: 64980,
        lowPrice: 64010,
        macdHistogram: 0.42,
        momentumPercent: 0.8,
        resistanceLevel: 65380,
        rsi14: 58.2,
        shortMovingAverage: 65110,
        supportLevel: 64690,
        tradeAction: "buy",
        tradeLevels: {
          entryZoneHigh: 65280,
          entryZoneLow: 65080,
          stopLoss: 64690,
          takeProfit1: 65620,
          takeProfit2: 66080,
        },
        trend: "bullish",
        volatilityPercent: 2.3,
      },
      live: {
        changePercent24h: 1.73,
        source: "binance",
        symbol: "BTCUSDT",
        volume24h: 65234.11,
      },
      mode: "live",
      points: [
        {
          close: 65010,
          high: 65120,
          low: 64960,
          open: 65000,
          timestamp: "2026-04-02T11:50:00.000Z",
          volume: 1200,
        },
        {
          close: 65200,
          high: 65320,
          low: 65110,
          open: 65120,
          timestamp: "2026-04-02T12:00:00.000Z",
          volume: 1300,
        },
      ],
      provider: "binance",
      range: "24h",
    },
    -1,
    45,
  );

  let fetchCalls = 0;

  globalThis.fetch = ((input) => {
    fetchCalls += 1;
    return Promise.reject(new Error(`Network down for ${String(input)}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "GET",
    url: "/v1/crypto/live-chart?assetId=bitcoin&range=24h",
  });

  assert.equal(response.statusCode, 200);
  assert.ok(fetchCalls >= 1);

  const body = response.json<{
    data: {
      cache: {
        stale: boolean;
        state: string;
      };
      live: {
        symbol: string;
      } | null;
      mode: "live";
      provider: "binance";
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.mode, "live");
  assert.equal(body.data.provider, "binance");
  assert.equal(body.data.cache.state, "stale");
  assert.equal(body.data.cache.stale, true);
  assert.equal(body.data.live?.symbol, "BTCUSDT");
});

void it("GET /v1/crypto/chart nao usa fallback Binance para moeda nao-USD", async () => {
  let coinGeckoCalls = 0;
  let binanceCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.coingecko.com/api/v3/coins/bitcoin/market_chart")) {
      coinGeckoCalls += 1;

      return Promise.resolve(
        new Response(JSON.stringify({ error: "asset not found" }), {
          headers: {
            "content-type": "application/json",
          },
          status: 404,
        }),
      );
    }

    if (requestUrl.includes("api.binance.com")) {
      binanceCalls += 1;
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "GET",
    url: "/v1/crypto/chart?assetId=bitcoin&currency=brl&range=24h",
  });

  assert.equal(response.statusCode, 502);
  assert.equal(coinGeckoCalls, 1);
  assert.equal(binanceCalls, 0);

  const body = response.json<{
    error: {
      code: string;
      message: string;
    };
    status: "error";
  }>();

  assert.equal(body.status, "error");
  assert.equal(body.error.code, "COINGECKO_BAD_STATUS");
  assert.equal(body.error.message, "CoinGecko returned a non-success status");
});

void it("GET /v1/crypto/spot-price/batch retorna sucesso parcial por ativo", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.coingecko.com/api/v3/simple/price") && requestUrl.includes("ids=bitcoin")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            bitcoin: {
              brl: 355001.45,
            },
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

    if (requestUrl.includes("api.coingecko.com/api/v3/simple/price") && requestUrl.includes("ids=inexistente")) {
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        }),
      );
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "GET",
    url: "/v1/crypto/spot-price/batch?assetIds=bitcoin,inexistente&currency=brl",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      currency: string;
      quotes: Array<{
        assetId: string;
        error: {
          code: string;
          message: string;
        } | null;
        quote: {
          price: number;
          provider: "coingecko" | "coincap";
        } | null;
        status: "error" | "ok";
      }>;
      summary: {
        failed: number;
        ok: number;
        successRatePercent: number;
        total: number;
      };
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.currency, "brl");
  assert.equal(body.data.summary.total, 2);
  assert.equal(body.data.summary.ok, 1);
  assert.equal(body.data.summary.failed, 1);
  assert.equal(body.data.summary.successRatePercent, 50);

  const bitcoinQuote = body.data.quotes.find((item) => item.assetId === "bitcoin");
  const missingQuote = body.data.quotes.find((item) => item.assetId === "inexistente");

  assert.equal(bitcoinQuote?.status, "ok");
  assert.equal(bitcoinQuote?.quote?.provider, "coingecko");
  assert.equal(typeof bitcoinQuote?.quote?.price, "number");

  assert.equal(missingQuote?.status, "error");
  assert.equal(missingQuote?.quote, null);
  assert.equal(missingQuote?.error?.code, "COINGECKO_PRICE_NOT_FOUND");
});

void it("GET /v1/crypto/market-overview retorna resumo agregado do mercado", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.coincap.io/v2/assets?limit=5")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                changePercent24Hr: "2.5",
                id: "bitcoin",
                marketCapUsd: "1200000000000",
                name: "Bitcoin",
                priceUsd: "66450.11",
                rank: "1",
                symbol: "BTC",
                volumeUsd24Hr: "45200000000",
              },
              {
                changePercent24Hr: "-1.2",
                id: "ethereum",
                marketCapUsd: "450000000000",
                name: "Ethereum",
                priceUsd: "3220.55",
                rank: "2",
                symbol: "ETH",
                volumeUsd24Hr: "21200000000",
              },
              {
                changePercent24Hr: "5.0",
                id: "solana",
                marketCapUsd: "72000000000",
                name: "Solana",
                priceUsd: "168.20",
                rank: "5",
                symbol: "SOL",
                volumeUsd24Hr: "5300000000",
              },
              {
                changePercent24Hr: "0",
                id: "xrp",
                marketCapUsd: "34000000000",
                name: "XRP",
                priceUsd: "0.58",
                rank: "6",
                symbol: "XRP",
                volumeUsd24Hr: "1900000000",
              },
              {
                id: "cardano",
                marketCapUsd: "24000000000",
                name: "Cardano",
                priceUsd: "0.47",
                rank: "8",
                symbol: "ADA",
                volumeUsd24Hr: "1200000000",
              },
            ],
            timestamp: Date.now(),
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
    url: "/v1/crypto/market-overview?limit=5",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      assets: Array<{
        assetId: string;
      }>;
      limit: number;
      provider: "coincap";
      summary: {
        advancers24h: number;
        assetsTracked: number;
        averageChangePercent24h: number | null;
        decliners24h: number;
        strongest24h: {
          assetId: string;
          changePercent24h: number;
          symbol: string;
        } | null;
        topMarketCapUsd: number;
        topVolumeUsd24h: number;
        unchanged24h: number;
        weakest24h: {
          assetId: string;
          changePercent24h: number;
          symbol: string;
        } | null;
      };
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.provider, "coincap");
  assert.equal(body.data.limit, 5);
  assert.equal(body.data.assets.length, 5);
  assert.equal(body.data.summary.assetsTracked, 5);
  assert.equal(body.data.summary.advancers24h, 2);
  assert.equal(body.data.summary.decliners24h, 1);
  assert.equal(body.data.summary.unchanged24h, 1);
  assert.equal(body.data.summary.averageChangePercent24h, 1.57);
  assert.equal(body.data.summary.strongest24h?.assetId, "solana");
  assert.equal(body.data.summary.weakest24h?.assetId, "ethereum");
  assert.ok(body.data.summary.topMarketCapUsd > 1_700_000_000_000);
  assert.ok(body.data.summary.topVolumeUsd24h > 70_000_000_000);
});

void it("GET /v1/crypto/market-overview valida limite maximo", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/crypto/market-overview?limit=40",
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

void it("GET /v1/crypto/news-intelligence agrega fontes RSS com sucesso parcial", async () => {
  let coindeskCalls = 0;
  let cointelegraphCalls = 0;
  let decryptCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("coindesk.com/arc/outboundfeeds/rss")) {
      coindeskCalls += 1;

      return Promise.resolve(
        new Response(
          `<?xml version="1.0"?><rss><channel>
            <item>
              <title>Bitcoin ETF sees strong inflow as BTC rallies</title>
              <link>https://www.coindesk.com/markets/bitcoin-etf-inflow</link>
              <description>Institutional flow and SEC narrative keep bitcoin in focus.</description>
              <pubDate>Fri, 04 Apr 2026 12:00:00 GMT</pubDate>
            </item>
            <item>
              <title>Ethereum staking update is live</title>
              <link>https://www.coindesk.com/tech/ethereum-staking-update</link>
              <description>Protocol roadmap progresses with lower fee pressure.</description>
              <pubDate>Fri, 04 Apr 2026 10:00:00 GMT</pubDate>
            </item>
          </channel></rss>`,
          {
            headers: {
              "content-type": "application/rss+xml",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("cointelegraph.com/rss")) {
      cointelegraphCalls += 1;

      return Promise.resolve(
        new Response(
          `<?xml version="1.0"?><rss><channel>
            <item>
              <title>BTC volatility jumps after Fed speech</title>
              <link>https://cointelegraph.com/news/btc-volatility-fed-speech</link>
              <description>Traders watch liquidation clusters and macro rates.</description>
              <pubDate>Fri, 04 Apr 2026 11:00:00 GMT</pubDate>
            </item>
          </channel></rss>`,
          {
            headers: {
              "content-type": "application/rss+xml",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("decrypt.co/feed")) {
      decryptCalls += 1;

      return Promise.resolve(
        new Response("service unavailable", {
          status: 503,
        }),
      );
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "GET",
    url: "/v1/crypto/news-intelligence?assetId=bitcoin&limit=5",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(coindeskCalls, 1);
  assert.equal(cointelegraphCalls, 1);
  assert.equal(decryptCalls, 1);

  const body = response.json<{
    data: {
      assetId: string;
      cache: {
        stale: boolean;
        state: string;
      };
      items: Array<{
        impactScore: number;
        relevanceScore: number;
        sentiment: "negative" | "neutral" | "positive";
        source: string;
        title: string;
        url: string;
      }>;
      limit: number;
      provider: "rss_multi_source";
      summary: {
        averageImpactScore: number;
        averageRelevanceScore: number;
        highImpactItems: number;
        sourcesHealthy: number;
        totalItems: number;
        totalSources: number;
      };
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.assetId, "bitcoin");
  assert.equal(body.data.provider, "rss_multi_source");
  assert.equal(body.data.limit, 5);
  assert.equal(body.data.cache.state, "refreshed");
  assert.equal(body.data.cache.stale, false);
  assert.ok(body.data.items.length >= 2);
  assert.ok(body.data.items.every((item) => item.relevanceScore >= 18));
  assert.ok(body.data.items.every((item) => item.impactScore >= 0 && item.impactScore <= 100));
  assert.equal(body.data.summary.totalSources, 3);
  assert.equal(body.data.summary.sourcesHealthy, 2);
  assert.equal(body.data.summary.totalItems, body.data.items.length);
  assert.ok(body.data.summary.averageImpactScore >= 0);
  assert.ok(body.data.summary.averageRelevanceScore >= 0);
});

void it("GET /v1/crypto/news-intelligence valida limite maximo", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/crypto/news-intelligence?limit=40",
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
