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

void it("GET /v1/options/snapshot retorna leitura de volatilidade para underlying valido", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/v7/finance/quote") && requestUrl.includes("SPY") && requestUrl.includes("%5EVIX")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "USD",
                  longName: "SPDR S&P 500 ETF Trust",
                  marketState: "REGULAR",
                  regularMarketChangePercent: 0.42,
                  regularMarketPrice: 518.2,
                  symbol: "SPY",
                },
                {
                  currency: "USD",
                  longName: "CBOE Volatility Index",
                  marketState: "REGULAR",
                  regularMarketPrice: 18.5,
                  symbol: "^VIX",
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
    url: "/v1/options/snapshot?underlying=spy&daysToExpiry=30",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      daysToExpiry: number;
      impliedVolatility: number | null;
      optionsBias: string;
      underlying: string;
      vixLevel: number | null;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.underlying, "SPY");
  assert.equal(body.data.daysToExpiry, 30);
  assert.equal(body.data.vixLevel, 18.5);
  assert.equal(body.data.impliedVolatility, 0.185);
  assert.equal(body.data.optionsBias, "neutral");
});

void it("GET /v1/options/snapshot/batch retorna sucesso parcial", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/v7/finance/quote") && requestUrl.includes("SPY%2CQQQ%2C%5EVIX")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "USD",
                  regularMarketChangePercent: 1.21,
                  regularMarketPrice: 520,
                  symbol: "SPY",
                },
                {
                  currency: "USD",
                  regularMarketPrice: 21,
                  symbol: "^VIX",
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
    url: "/v1/options/snapshot/batch?underlyings=SPY,QQQ&daysToExpiry=45",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      failureCount: number;
      snapshots: Array<{
        status: "ok" | "error";
        underlying: string;
      }>;
      successCount: number;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.successCount, 1);
  assert.equal(body.data.failureCount, 1);
  assert.equal(body.data.snapshots.find((item) => item.underlying === "SPY")?.status, "ok");
  assert.equal(body.data.snapshots.find((item) => item.underlying === "QQQ")?.status, "error");
});

void it("GET /v1/options/market-overview retorna preset com limite", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/v7/finance/quote") && requestUrl.includes("SPY") && requestUrl.includes("QQQ") && requestUrl.includes("%5EVIX")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "USD",
                  regularMarketChangePercent: 0.5,
                  regularMarketPrice: 517,
                  symbol: "SPY",
                },
                {
                  currency: "USD",
                  regularMarketChangePercent: 0.7,
                  regularMarketPrice: 442,
                  symbol: "QQQ",
                },
                {
                  currency: "USD",
                  regularMarketPrice: 17.4,
                  symbol: "^VIX",
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
    url: "/v1/options/market-overview?preset=us_indices&limit=2&daysToExpiry=30",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      requestedUnderlyings: string[];
      snapshots: Array<{
        underlying: string;
      }>;
      tableMarkdown: string;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.requestedUnderlyings.length, 2);
  assert.equal(body.data.snapshots.length, 2);
  assert.match(body.data.tableMarkdown, /SPY/);
});

void it("GET /v1/options/snapshot retorna 400 para underlying invalido", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/options/snapshot?underlying=*&daysToExpiry=30",
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
