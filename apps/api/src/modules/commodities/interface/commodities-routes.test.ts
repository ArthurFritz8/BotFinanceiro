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

void it("GET /v1/commodities/snapshot retorna cotacao para simbolo valido", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/v7/finance/quote") && requestUrl.includes("GC%3DF")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "USD",
                  longName: "Gold",
                  marketState: "REGULAR",
                  regularMarketChangePercent: 0.44,
                  regularMarketPrice: 2298.6,
                  symbol: "GC=F",
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
    url: "/v1/commodities/snapshot?symbol=GC%3DF",
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
  assert.equal(body.data.symbol, "GC=F");
  assert.equal(body.data.market, "commodities");
  assert.equal(body.data.price, 2298.6);
});

void it("GET /v1/commodities/snapshot/batch retorna sucesso parcial", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/v7/finance/quote") && requestUrl.includes("GC%3DF%2CCL%3DF")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "USD",
                  longName: "Gold",
                  regularMarketPrice: 2302.4,
                  symbol: "GC=F",
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
    url: "/v1/commodities/snapshot/batch?symbols=GC%3DF,CL%3DF",
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
  assert.equal(body.data.snapshots.find((item) => item.symbol === "GC=F")?.status, "ok");
  assert.equal(body.data.snapshots.find((item) => item.symbol === "CL=F")?.status, "error");
});

void it("GET /v1/commodities/market-overview retorna preset com limite", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/v7/finance/quote") && requestUrl.includes("GC%3DF") && requestUrl.includes("SI%3DF")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "USD",
                  regularMarketChangePercent: 0.31,
                  regularMarketPrice: 2301,
                  symbol: "GC=F",
                },
                {
                  currency: "USD",
                  regularMarketChangePercent: -0.22,
                  regularMarketPrice: 26.4,
                  symbol: "SI=F",
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
    url: "/v1/commodities/market-overview?preset=metals&limit=2",
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
  assert.match(body.data.tableMarkdown, /GC=F/);
});

void it("GET /v1/commodities/snapshot retorna 400 para simbolo invalido", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/commodities/snapshot?symbol=*",
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
