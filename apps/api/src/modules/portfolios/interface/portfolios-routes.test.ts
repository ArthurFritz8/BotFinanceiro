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

void it("GET /v1/portfolios/snapshot retorna diagnostico para preset valido", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (
      requestUrl.includes("/v7/finance/quote") &&
      requestUrl.includes("SPY") &&
      requestUrl.includes("QQQ") &&
      requestUrl.includes("AGG") &&
      requestUrl.includes("GLD") &&
      requestUrl.includes("BTC-USD")
    ) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                {
                  currency: "USD",
                  regularMarketChangePercent: 0.41,
                  regularMarketPrice: 522.3,
                  symbol: "SPY",
                },
                {
                  currency: "USD",
                  regularMarketChangePercent: 0.66,
                  regularMarketPrice: 443.7,
                  symbol: "QQQ",
                },
                {
                  currency: "USD",
                  regularMarketChangePercent: -0.08,
                  regularMarketPrice: 97.2,
                  symbol: "AGG",
                },
                {
                  currency: "USD",
                  regularMarketChangePercent: 0.21,
                  regularMarketPrice: 216.1,
                  symbol: "GLD",
                },
                {
                  currency: "USD",
                  regularMarketChangePercent: 1.95,
                  regularMarketPrice: 72250,
                  symbol: "BTC-USD",
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
    url: "/v1/portfolios/snapshot?preset=balanced",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      preset: string;
      regime: string;
      riskScore: number;
      successCount: number;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.preset, "balanced");
  assert.equal(body.data.successCount, 5);
  assert.equal(typeof body.data.riskScore, "number");
  assert.equal(typeof body.data.regime, "string");
});

void it("GET /v1/portfolios/snapshot aceita posicoes customizadas e retorna sucesso parcial", async () => {
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
                  regularMarketChangePercent: 0.31,
                  regularMarketPrice: 521.2,
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
    url: "/v1/portfolios/snapshot?positions=SPY:60,QQQ:40",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      failureCount: number;
      preset: string;
      successCount: number;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.preset, "custom");
  assert.equal(body.data.successCount, 1);
  assert.equal(body.data.failureCount, 1);
});

void it("GET /v1/portfolios/market-overview retorna overview por presets", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (
      requestUrl.includes("/v7/finance/quote") &&
      requestUrl.includes("SHY") &&
      requestUrl.includes("AGG") &&
      requestUrl.includes("SPY") &&
      requestUrl.includes("GLD")
    ) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                { currency: "USD", regularMarketChangePercent: 0.02, regularMarketPrice: 82.1, symbol: "SHY" },
                { currency: "USD", regularMarketChangePercent: -0.08, regularMarketPrice: 97.2, symbol: "AGG" },
                { currency: "USD", regularMarketChangePercent: 0.34, regularMarketPrice: 522.4, symbol: "SPY" },
                { currency: "USD", regularMarketChangePercent: 0.19, regularMarketPrice: 215.8, symbol: "GLD" },
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

    if (
      requestUrl.includes("/v7/finance/quote") &&
      requestUrl.includes("QQQ") &&
      requestUrl.includes("XLK") &&
      requestUrl.includes("SMH") &&
      requestUrl.includes("BTC-USD") &&
      requestUrl.includes("ETH-USD")
    ) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              result: [
                { currency: "USD", regularMarketChangePercent: 0.71, regularMarketPrice: 444.2, symbol: "QQQ" },
                { currency: "USD", regularMarketChangePercent: 0.93, regularMarketPrice: 210.1, symbol: "XLK" },
                { currency: "USD", regularMarketChangePercent: 1.15, regularMarketPrice: 243.4, symbol: "SMH" },
                { currency: "USD", regularMarketChangePercent: 2.13, regularMarketPrice: 72400, symbol: "BTC-USD" },
                { currency: "USD", regularMarketChangePercent: 1.84, regularMarketPrice: 3620, symbol: "ETH-USD" },
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
    url: "/v1/portfolios/market-overview?presets=conservative,growth&limit=2",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      presets: string[];
      snapshots: Array<{
        preset: string;
        status: "ok" | "error";
      }>;
      tableMarkdown: string;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.presets.length, 2);
  assert.equal(body.data.snapshots.length, 2);
  assert.match(body.data.tableMarkdown, /conservative/);
  assert.match(body.data.tableMarkdown, /growth/);
});

void it("GET /v1/portfolios/snapshot retorna 400 para posicoes invalidas", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/portfolios/snapshot?positions=SPY,QQQ:30",
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