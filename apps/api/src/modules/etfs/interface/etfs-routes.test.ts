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

void it("GET /v1/etfs/snapshot retorna cotacao para simbolo valido", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/v7/finance/quote") && requestUrl.includes("SPY")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "USD",
                  longName: "SPDR S&P 500 ETF Trust",
                  marketState: "REGULAR",
                  regularMarketChangePercent: 0.53,
                  regularMarketPrice: 523.4,
                  symbol: "SPY",
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
    url: "/v1/etfs/snapshot?symbol=spy",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      market: string;
      price: number;
      symbol: string;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.symbol, "SPY");
  assert.equal(body.data.market, "etfs");
  assert.equal(body.data.price, 523.4);
});

void it("GET /v1/etfs/snapshot/batch retorna sucesso parcial", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/v7/finance/quote") && requestUrl.includes("SPY") && requestUrl.includes("QQQ")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "USD",
                  longName: "SPDR S&P 500 ETF Trust",
                  regularMarketPrice: 524.2,
                  symbol: "SPY",
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
    url: "/v1/etfs/snapshot/batch?symbols=SPY,QQQ",
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
  assert.equal(body.data.snapshots.find((item) => item.symbol === "SPY")?.status, "ok");
  assert.equal(body.data.snapshots.find((item) => item.symbol === "QQQ")?.status, "error");
});

void it("GET /v1/etfs/market-overview retorna preset com limite", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/v7/finance/quote") && requestUrl.includes("SPY") && requestUrl.includes("VTI")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "USD",
                  regularMarketChangePercent: 0.21,
                  regularMarketPrice: 523.1,
                  symbol: "SPY",
                },
                {
                  currency: "USD",
                  regularMarketChangePercent: 0.18,
                  regularMarketPrice: 276.8,
                  symbol: "VTI",
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
    url: "/v1/etfs/market-overview?preset=broad_market&limit=2",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      requestedSymbols: string[];
      snapshots: Array<{
        symbol: string;
      }>;
      tableMarkdown: string;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.requestedSymbols.length, 2);
  assert.equal(body.data.snapshots.length, 2);
  assert.match(body.data.tableMarkdown, /SPY/);
});

void it("GET /v1/etfs/snapshot retorna 400 para simbolo invalido", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/etfs/snapshot?symbol=*",
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