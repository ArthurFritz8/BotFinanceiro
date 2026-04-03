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

void it("GET /v1/macro-rates/snapshot retorna leitura para simbolo valido", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/v7/finance/quote") && requestUrl.includes("%5ETNX")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "USD",
                  longName: "Treasury Yield 10 Years",
                  marketState: "REGULAR",
                  regularMarketChangePercent: 0.7,
                  regularMarketPrice: 4.12,
                  symbol: "^TNX",
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
    url: "/v1/macro-rates/snapshot?symbol=%5ETNX",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      market: string;
      symbol: string;
      yieldPercent: number | null;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.symbol, "^TNX");
  assert.equal(body.data.market, "macro_rates");
  assert.equal(body.data.yieldPercent, 4.12);
});

void it("GET /v1/macro-rates/snapshot/batch retorna sucesso parcial", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/v7/finance/quote") && requestUrl.includes("%5ETNX") && requestUrl.includes("%5EFVX")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "USD",
                  longName: "Treasury Yield 10 Years",
                  regularMarketPrice: 4.05,
                  symbol: "^TNX",
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
    url: "/v1/macro-rates/snapshot/batch?symbols=%5ETNX,%5EFVX",
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
  assert.equal(body.data.snapshots.find((item) => item.symbol === "^TNX")?.status, "ok");
  assert.equal(body.data.snapshots.find((item) => item.symbol === "^FVX")?.status, "error");
});

void it("GET /v1/macro-rates/market-overview retorna preset com limite", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/v7/finance/quote") && requestUrl.includes("%5EIRX") && requestUrl.includes("%5EFVX") && requestUrl.includes("%5ETNX")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "USD",
                  regularMarketChangePercent: 0.1,
                  regularMarketPrice: 5.2,
                  symbol: "^IRX",
                },
                {
                  currency: "USD",
                  regularMarketChangePercent: 0.2,
                  regularMarketPrice: 3.88,
                  symbol: "^FVX",
                },
                {
                  currency: "USD",
                  regularMarketChangePercent: 0.3,
                  regularMarketPrice: 4.18,
                  symbol: "^TNX",
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
    url: "/v1/macro-rates/market-overview?preset=usd_rates&limit=3",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      curveSlope10y5y: number | null;
      requestedSymbols: string[];
      snapshots: Array<{
        symbol: string;
      }>;
      tableMarkdown: string;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.requestedSymbols.length, 3);
  assert.equal(body.data.snapshots.length, 3);
  assert.equal(body.data.curveSlope10y5y, 0.2999999999999998);
  assert.match(body.data.tableMarkdown, /\^TNX/);
});

void it("GET /v1/macro-rates/snapshot retorna 400 para simbolo invalido", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/macro-rates/snapshot?symbol=*",
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