import assert from "node:assert/strict";
import { after, beforeEach, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";

const { buildApp } = await import("../../../main/app.js");
const { memoryCache } = await import("../../../shared/cache/memory-cache.js");

const app = buildApp();
await app.ready();

const originalFetch = globalThis.fetch;

void beforeEach(() => {
  globalThis.fetch = originalFetch;
  memoryCache.clear();
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
