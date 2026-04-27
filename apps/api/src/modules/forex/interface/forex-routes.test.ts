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

void beforeEach(() => {
  globalThis.fetch = originalFetch;
});

void after(async () => {
  globalThis.fetch = originalFetch;
  await app.close();
});

void it("GET /v1/forex/spot-rate retorna cotacao para par valido", async () => {
  let yahooCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/v7/finance/quote") && requestUrl.includes("EURUSD%3DX")) {
      yahooCalls += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "USD",
                  longName: "EUR/USD",
                  marketState: "REGULAR",
                  regularMarketChange: 0.0012,
                  regularMarketChangePercent: 0.11,
                  regularMarketPreviousClose: 1.088,
                  regularMarketPrice: 1.0892,
                  regularMarketTime: 1775250000,
                  symbol: "EURUSD=X",
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
    url: "/v1/forex/spot-rate?pair=eurusd",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(yahooCalls, 1);

  const body = response.json<{
    data: {
      baseCurrency: string;
      pair: string;
      quoteCurrency: string;
      rate: number;
      yahooSymbol: string;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.pair, "EURUSD");
  assert.equal(body.data.baseCurrency, "EUR");
  assert.equal(body.data.quoteCurrency, "USD");
  assert.equal(body.data.yahooSymbol, "EURUSD=X");
  assert.equal(body.data.rate, 1.0892);
});

void it("GET /v1/forex/spot-rate/batch retorna sucesso parcial", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/v7/finance/quote") && requestUrl.includes("EURUSD%3DX%2CUSDCHF%3DX")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "USD",
                  longName: "EUR/USD",
                  regularMarketChange: 0.0009,
                  regularMarketChangePercent: 0.08,
                  regularMarketPreviousClose: 1.086,
                  regularMarketPrice: 1.0869,
                  regularMarketTime: 1775250000,
                  symbol: "EURUSD=X",
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
    url: "/v1/forex/spot-rate/batch?pairs=EURUSD,USDCHF",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      failureCount: number;
      quotes: Array<{
        pair: string;
        status: "ok" | "error";
      }>;
      successCount: number;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.successCount, 1);
  assert.equal(body.data.failureCount, 1);
  assert.equal(body.data.quotes.find((item) => item.pair === "EURUSD")?.status, "ok");
  assert.equal(body.data.quotes.find((item) => item.pair === "USDCHF")?.status, "error");
});

void it("GET /v1/forex/market-overview retorna preset com limite", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/v7/finance/quote") && requestUrl.includes("USDBRL%3DX") && requestUrl.includes("USDMXN%3DX")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "BRL",
                  longName: "USD/BRL",
                  regularMarketChangePercent: 0.22,
                  regularMarketPrice: 5.021,
                  symbol: "USDBRL=X",
                },
                {
                  currency: "MXN",
                  longName: "USD/MXN",
                  regularMarketChangePercent: -0.14,
                  regularMarketPrice: 16.812,
                  symbol: "USDMXN=X",
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
    url: "/v1/forex/market-overview?preset=latam&limit=2",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      pairs: string[];
      preset: string;
      quotes: Array<{
        pair: string;
      }>;
      tableMarkdown: string;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.preset, "latam");
  assert.equal(body.data.pairs.length, 2);
  assert.equal(body.data.quotes.length, 2);
  assert.match(body.data.tableMarkdown, /USDBRL/);
});

void it("GET /v1/forex/spot-rate retorna 400 para par invalido", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/forex/spot-rate?pair=abc",
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

void it("GET /v1/forex/strategy-chart retorna snapshot institucional com macro radar", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/forex/strategy-chart?symbol=EURUSD&range=7d&mode=delayed",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      institutional: {
        macroRadar: {
          alertLevel: "green" | "red" | "yellow";
          upcomingEvents: Array<{
            hoursToEvent: number;
            impact: "high" | "medium";
            name: string;
          }>;
        };
      };
      marketDataSource: "synthetic" | "yahoo_finance";
      marketDataSymbol: string | null;
      mode: "delayed" | "live";
      strategy: "institutional_macro";
      symbol: string;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.symbol, "EURUSD");
  assert.equal(body.data.strategy, "institutional_macro");
  assert.equal(body.data.mode, "delayed");
  assert.equal(body.data.marketDataSource, "synthetic");
  assert.equal(body.data.marketDataSymbol, null);
  assert.ok(body.data.institutional.macroRadar.upcomingEvents.length >= 1);
  assert.equal(typeof body.data.institutional.macroRadar.upcomingEvents[0]?.hoursToEvent, "number");
  assert.ok(["green", "yellow", "red"].includes(body.data.institutional.macroRadar.alertLevel));
});

void it("GET /v1/forex/institutional-macro/snapshot suporta modo live", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/forex/institutional-macro/snapshot?symbol=XAUUSD&mode=live&range=24h",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      marketDataSource: "synthetic" | "yahoo_finance";
      marketDataSymbol: string | null;
      mode: "delayed" | "live";
      strategy: "institutional_macro";
      symbol: string;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.symbol, "XAUUSD");
  assert.equal(body.data.mode, "live");
  assert.equal(body.data.marketDataSource, "synthetic");
  assert.equal(body.data.marketDataSymbol, null);
  assert.equal(body.data.strategy, "institutional_macro");
});
