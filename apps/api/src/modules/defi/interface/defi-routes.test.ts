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

void it("GET /v1/defi/spot-rate retorna cotacao para ativo valido", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.coincap.io/v2/assets/aave")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              changePercent24Hr: "2.43",
              id: "aave",
              marketCapUsd: "1800000000",
              name: "Aave",
              priceUsd: "102.45",
              rank: "49",
              symbol: "AAVE",
              volumeUsd24Hr: "210000000",
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
    url: "/v1/defi/spot-rate?assetId=aave",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      assetId: string;
      priceUsd: number;
      provider: string;
      sector: string;
      symbol: string;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.assetId, "aave");
  assert.equal(body.data.symbol, "AAVE");
  assert.equal(body.data.provider, "coincap");
  assert.equal(body.data.sector, "defi");
  assert.equal(body.data.priceUsd, 102.45);
});

void it("GET /v1/defi/spot-rate/batch retorna sucesso parcial", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.coincap.io/v2/assets/aave")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              id: "aave",
              name: "Aave",
              priceUsd: "101.1",
              symbol: "AAVE",
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

    if (requestUrl.includes("api.coincap.io/v2/assets/inexistente")) {
      return Promise.resolve(
        new Response("not found", {
          status: 404,
        }),
      );
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "GET",
    url: "/v1/defi/spot-rate/batch?assetIds=aave,inexistente",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      failureCount: number;
      quotes: Array<{
        assetId: string;
        status: "ok" | "error";
      }>;
      successCount: number;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.successCount, 1);
  assert.equal(body.data.failureCount, 1);
  assert.equal(body.data.quotes.find((item) => item.assetId === "aave")?.status, "ok");
  assert.equal(body.data.quotes.find((item) => item.assetId === "inexistente")?.status, "error");
});

void it("GET /v1/defi/market-overview retorna preset com limite", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.coincap.io/v2/assets?limit=25")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                changePercent24Hr: "1.2",
                id: "ethereum",
                marketCapUsd: "420000000000",
                name: "Ethereum",
                priceUsd: "3220",
                rank: "2",
                symbol: "ETH",
                volumeUsd24Hr: "15000000000",
              },
              {
                changePercent24Hr: "2.4",
                id: "chainlink",
                marketCapUsd: "9000000000",
                name: "Chainlink",
                priceUsd: "19.8",
                rank: "15",
                symbol: "LINK",
                volumeUsd24Hr: "690000000",
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

    if (requestUrl.includes("api.coincap.io/v2/assets/uniswap")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              id: "uniswap",
              name: "Uniswap",
              priceUsd: "9.22",
              symbol: "UNI",
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
    url: "/v1/defi/market-overview?preset=blue_chips&limit=3",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      assetIds: string[];
      quotes: Array<{
        assetId: string;
      }>;
      tableMarkdown: string;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.assetIds.length, 3);
  assert.equal(body.data.quotes.length, 3);
  assert.match(body.data.tableMarkdown, /ethereum/);
});

void it("GET /v1/defi/spot-rate retorna 400 para assetId invalido", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/defi/spot-rate?assetId=*",
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
