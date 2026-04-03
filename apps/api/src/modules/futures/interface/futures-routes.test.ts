import assert from "node:assert/strict";
import { after, beforeEach, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";
process.env.BINANCE_FUTURES_API_BASE_URL ??= "https://fapi.binance.com";

const { buildApp } = await import("../../../main/app.js");

const app = buildApp();
await app.ready();

const originalFetch = globalThis.fetch;

void beforeEach(() => {
  globalThis.fetch = originalFetch;
});

void after(async () => {
  globalThis.fetch = originalFetch;
  await app.close();
});

void it("GET /v1/futures/snapshot retorna snapshot consolidado", async () => {
  let tickerCalls = 0;
  let premiumCalls = 0;
  let openInterestCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/fapi/v1/ticker/24hr") && requestUrl.includes("symbol=BTCUSDT")) {
      tickerCalls += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            highPrice: "69320.5",
            lastPrice: "68980.2",
            lowPrice: "67420.1",
            priceChangePercent: "2.19",
            quoteVolume: "2320000000",
            symbol: "BTCUSDT",
            volume: "34350.22",
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

    if (requestUrl.includes("/fapi/v1/premiumIndex") && requestUrl.includes("symbol=BTCUSDT")) {
      premiumCalls += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            indexPrice: "68960.4",
            lastFundingRate: "0.00045",
            markPrice: "68970.9",
            nextFundingTime: 1775260800000,
            symbol: "BTCUSDT",
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

    if (requestUrl.includes("/fapi/v1/openInterest") && requestUrl.includes("symbol=BTCUSDT")) {
      openInterestCalls += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            openInterest: "55482.92",
            symbol: "BTCUSDT",
            time: 1775255000000,
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
    url: "/v1/futures/snapshot?symbol=btc",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(tickerCalls, 1);
  assert.equal(premiumCalls, 1);
  assert.equal(openInterestCalls, 1);

  const body = response.json<{
    data: {
      derivatives: {
        lastFundingRate: number | null;
        openInterest: number | null;
      };
      market: {
        lastPrice: number;
      };
      symbol: string;
      venue: string;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.symbol, "BTCUSDT");
  assert.equal(body.data.venue, "binance_futures");
  assert.equal(body.data.market.lastPrice, 68980.2);
  assert.equal(body.data.derivatives.lastFundingRate, 0.00045);
  assert.equal(body.data.derivatives.openInterest, 55482.92);
});

void it("GET /v1/futures/snapshot/batch retorna sucesso parcial", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("symbol=BTCUSDT")) {
      if (requestUrl.includes("/fapi/v1/ticker/24hr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              lastPrice: "68000.0",
              symbol: "BTCUSDT",
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

      if (requestUrl.includes("/fapi/v1/premiumIndex")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              symbol: "BTCUSDT",
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

      if (requestUrl.includes("/fapi/v1/openInterest")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              symbol: "BTCUSDT",
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
    }

    if (requestUrl.includes("symbol=ETHUSDT") && requestUrl.includes("/fapi/v1/ticker/24hr")) {
      return Promise.resolve(
        new Response("service unavailable", {
          status: 503,
        }),
      );
    }

    if (requestUrl.includes("symbol=ETHUSDT")) {
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
    url: "/v1/futures/snapshot/batch?symbols=BTCUSDT,ETHUSDT",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      failureCount: number;
      snapshots: Array<{
        status: "ok" | "error";
        symbol: string;
      }>;
      successCount: number;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.successCount, 1);
  assert.equal(body.data.failureCount, 1);
  assert.equal(body.data.snapshots.find((item) => item.symbol === "BTCUSDT")?.status, "ok");
  assert.equal(body.data.snapshots.find((item) => item.symbol === "ETHUSDT")?.status, "error");
});

void it("GET /v1/futures/market-overview retorna preset com limite", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("symbol=BTCUSDT")) {
      if (requestUrl.includes("/fapi/v1/ticker/24hr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              lastPrice: "69000.0",
              priceChangePercent: "2.1",
              symbol: "BTCUSDT",
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

      if (requestUrl.includes("/fapi/v1/premiumIndex")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              symbol: "BTCUSDT",
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

      if (requestUrl.includes("/fapi/v1/openInterest")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              symbol: "BTCUSDT",
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
    }

    if (requestUrl.includes("symbol=ETHUSDT")) {
      if (requestUrl.includes("/fapi/v1/ticker/24hr")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              lastPrice: "3520.0",
              priceChangePercent: "1.2",
              symbol: "ETHUSDT",
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

      if (requestUrl.includes("/fapi/v1/premiumIndex")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              symbol: "ETHUSDT",
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

      if (requestUrl.includes("/fapi/v1/openInterest")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              symbol: "ETHUSDT",
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
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "GET",
    url: "/v1/futures/market-overview?preset=crypto_majors&limit=2",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      preset: string;
      requestedSymbols: string[];
      snapshots: Array<{
        symbol: string;
      }>;
      tableMarkdown: string;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.preset, "crypto_majors");
  assert.equal(body.data.requestedSymbols.length, 2);
  assert.equal(body.data.snapshots.length, 2);
  assert.match(body.data.tableMarkdown, /BTCUSDT/);
});

void it("GET /v1/futures/snapshot retorna 400 para simbolo invalido", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/futures/snapshot?symbol=***",
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
