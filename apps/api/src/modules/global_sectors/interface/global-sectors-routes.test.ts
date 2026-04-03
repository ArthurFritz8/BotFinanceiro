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

void it("GET /v1/global-sectors/snapshot retorna cotacao setorial para simbolo valido", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/v7/finance/quote") && requestUrl.includes("XLK")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "USD",
                  longName: "Technology Select Sector SPDR Fund",
                  marketState: "REGULAR",
                  regularMarketChangePercent: 0.88,
                  regularMarketPrice: 211.4,
                  symbol: "XLK",
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
    url: "/v1/global-sectors/snapshot?symbol=xlk",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      market: string;
      sectorTag: string;
      symbol: string;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.symbol, "XLK");
  assert.equal(body.data.market, "global_sectors");
  assert.equal(body.data.sectorTag, "technology");
});

void it("GET /v1/global-sectors/snapshot/batch retorna sucesso parcial", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/v7/finance/quote") && requestUrl.includes("XLF") && requestUrl.includes("XLE")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "USD",
                  longName: "Financial Select Sector SPDR Fund",
                  regularMarketPrice: 43.2,
                  symbol: "XLF",
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
    url: "/v1/global-sectors/snapshot/batch?symbols=XLF,XLE",
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
  assert.equal(body.data.snapshots.find((item) => item.symbol === "XLF")?.status, "ok");
  assert.equal(body.data.snapshots.find((item) => item.symbol === "XLE")?.status, "error");
});

void it("GET /v1/global-sectors/market-overview retorna preset com limite", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/v7/finance/quote") && requestUrl.includes("XLK") && requestUrl.includes("XLF")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "USD",
                  regularMarketChangePercent: 0.55,
                  regularMarketPrice: 210.6,
                  symbol: "XLK",
                },
                {
                  currency: "USD",
                  regularMarketChangePercent: -0.12,
                  regularMarketPrice: 43.1,
                  symbol: "XLF",
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
    url: "/v1/global-sectors/market-overview?preset=us_sectors&limit=2",
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
  assert.match(body.data.tableMarkdown, /XLK/);
});

void it("GET /v1/global-sectors/snapshot retorna 400 para simbolo invalido", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/global-sectors/snapshot?symbol=*",
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