import assert from "node:assert/strict";
import { afterEach, beforeEach, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";

const { env } = await import("../../shared/config/env.js");
const { DexScreenerSearchAdapter } = await import("./dexscreener-search-adapter.js");

type MutableEnv = {
  ONCHAIN_BIRDSEYE_API_BASE_URL: string;
  ONCHAIN_BIRDSEYE_API_KEY: string;
  ONCHAIN_BIRDSEYE_TIMEOUT_MS: number;
  WEB_SEARCH_DEXSCREENER_API_BASE_URL: string;
  WEB_SEARCH_TIMEOUT_MS: number;
};

const mutableEnv = env as unknown as MutableEnv;
const originalFetch = globalThis.fetch;
const originalEnv: MutableEnv = {
  ONCHAIN_BIRDSEYE_API_BASE_URL: mutableEnv.ONCHAIN_BIRDSEYE_API_BASE_URL,
  ONCHAIN_BIRDSEYE_API_KEY: mutableEnv.ONCHAIN_BIRDSEYE_API_KEY,
  ONCHAIN_BIRDSEYE_TIMEOUT_MS: mutableEnv.ONCHAIN_BIRDSEYE_TIMEOUT_MS,
  WEB_SEARCH_DEXSCREENER_API_BASE_URL: mutableEnv.WEB_SEARCH_DEXSCREENER_API_BASE_URL,
  WEB_SEARCH_TIMEOUT_MS: mutableEnv.WEB_SEARCH_TIMEOUT_MS,
};

function readHeader(init: RequestInit | undefined, headerName: string): string {
  const headers = init?.headers;

  if (!headers) {
    return "";
  }

  if (headers instanceof Headers) {
    return headers.get(headerName) ?? "";
  }

  if (Array.isArray(headers)) {
    const match = headers.find(([key]) => key.toLowerCase() === headerName.toLowerCase());
    return match ? String(match[1]) : "";
  }

  const headerEntries = Object.entries(headers as Record<string, unknown>);
  const match = headerEntries.find(([key]) => key.toLowerCase() === headerName.toLowerCase());
  return match ? String(match[1] ?? "") : "";
}

void beforeEach(() => {
  mutableEnv.WEB_SEARCH_DEXSCREENER_API_BASE_URL = "https://api.dexscreener.com";
  mutableEnv.WEB_SEARCH_TIMEOUT_MS = 7_000;
  mutableEnv.ONCHAIN_BIRDSEYE_API_BASE_URL = "https://public-api.birdeye.so/defi";
  mutableEnv.ONCHAIN_BIRDSEYE_API_KEY = "";
  mutableEnv.ONCHAIN_BIRDSEYE_TIMEOUT_MS = 7_000;
  globalThis.fetch = originalFetch;
});

void afterEach(() => {
  globalThis.fetch = originalFetch;
  mutableEnv.WEB_SEARCH_DEXSCREENER_API_BASE_URL = originalEnv.WEB_SEARCH_DEXSCREENER_API_BASE_URL;
  mutableEnv.WEB_SEARCH_TIMEOUT_MS = originalEnv.WEB_SEARCH_TIMEOUT_MS;
  mutableEnv.ONCHAIN_BIRDSEYE_API_BASE_URL = originalEnv.ONCHAIN_BIRDSEYE_API_BASE_URL;
  mutableEnv.ONCHAIN_BIRDSEYE_API_KEY = originalEnv.ONCHAIN_BIRDSEYE_API_KEY;
  mutableEnv.ONCHAIN_BIRDSEYE_TIMEOUT_MS = originalEnv.ONCHAIN_BIRDSEYE_TIMEOUT_MS;
});

void it("Dex adapter infere contrato pelas venues e retorna holderDistribution estruturado do bundle Dex", async () => {
  const adapter = new DexScreenerSearchAdapter();
  const contractAddress = "0x1111111111111111111111111111111111111111";
  let searchCalls = 0;
  let pairCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("https://api.dexscreener.com/latest/dex/search/")) {
      searchCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            pairs: [
              {
                baseToken: {
                  address: contractAddress,
                  name: "Base Meme Four",
                  symbol: "BMFOUR",
                },
                chainId: "base",
                dexId: "uniswap",
                liquidity: {
                  usd: 125000,
                },
                pairAddress: "0xpair001",
                quoteToken: {
                  symbol: "WETH",
                },
                url: "https://dexscreener.com/base/0xpair001",
                volume: {
                  h24: 98000,
                },
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

    if (requestUrl.startsWith("https://api.dexscreener.com/latest/dex/pairs/base/0xpair001")) {
      pairCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            pair: {
              bundleSignals: {
                activity: {
                  totalHolders: 1234,
                },
                topHolders: [
                  {
                    address: "0xholder001",
                    balance: 120000,
                    isLiquidityPool: false,
                    supplyPercent: 2.5,
                  },
                ],
              },
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

    return Promise.reject(new Error(`Unexpected URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await adapter.searchTokenListings({
    maxResults: 4,
    query: "BMFOUR",
  });

  assert.equal(searchCalls, 1);
  assert.equal(pairCalls, 1);
  assert.equal(response.found, true);
  assert.equal(response.resolvedContractAddress, contractAddress);
  assert.equal(response.holderDistribution.status, "ok");
  assert.equal(response.holderDistribution.source, "dexscreener_bundle");
  assert.equal(response.holderDistribution.totalHolders, 1234);
  assert.equal(response.holderDistribution.holders.length, 1);
  assert.equal(response.holderDistribution.holders[0]?.address, "0xholder001");
  assert.equal(response.holderDistribution.holders[0]?.percentage, 2.5);
});

void it("Dex adapter usa chain das venues no fallback BirdEye em vez de assumir Base", async () => {
  const adapter = new DexScreenerSearchAdapter();
  const contractAddress = "0x2222222222222222222222222222222222222222";
  mutableEnv.ONCHAIN_BIRDSEYE_API_KEY = "birdseye-test-key-123456789";

  let capturedBirdEyeChainHeader = "";

  globalThis.fetch = ((input, init) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("https://api.dexscreener.com/latest/dex/search/")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            pairs: [
              {
                baseToken: {
                  address: contractAddress,
                  name: "Eth Meme",
                  symbol: "EMEME",
                },
                chainId: "ethereum",
                dexId: "uniswap",
                liquidity: {
                  usd: 84000,
                },
                pairAddress: "0xethpair001",
                quoteToken: {
                  symbol: "WETH",
                },
                url: "https://dexscreener.com/ethereum/0xethpair001",
                volume: {
                  h24: 55000,
                },
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

    if (requestUrl.startsWith("https://api.dexscreener.com/latest/dex/pairs/ethereum/0xethpair001")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            pair: {
              bundleSignals: {},
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

    if (requestUrl.startsWith("https://public-api.birdeye.so/defi/v3/token/holder")) {
      capturedBirdEyeChainHeader = readHeader(init, "x-chain");

      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              holders: [
                {
                  address: "0xholderbird001",
                  amount: 20000,
                  percentage: 1.2,
                },
              ],
              totalHolders: 987,
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

    return Promise.reject(new Error(`Unexpected URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await adapter.searchTokenListings({
    query: "EMEME",
  });

  assert.equal(capturedBirdEyeChainHeader, "ethereum");
  assert.equal(response.holderDistribution.status, "ok");
  assert.equal(response.holderDistribution.source, "birdseye");
  assert.equal(response.holderDistribution.holders.length, 1);
});

void it("Dex adapter aceita contractAddress sem query e executa busca por contrato", async () => {
  const adapter = new DexScreenerSearchAdapter();
  const contractAddress = "0x3333333333333333333333333333333333333333";
  mutableEnv.ONCHAIN_BIRDSEYE_API_KEY = "";

  let capturedSearchQuery = "";

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("https://api.dexscreener.com/latest/dex/search/")) {
      const parsedUrl = new URL(requestUrl);
      capturedSearchQuery = parsedUrl.searchParams.get("q") ?? "";

      return Promise.resolve(
        new Response(
          JSON.stringify({
            pairs: [],
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

    return Promise.reject(new Error(`Unexpected URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await adapter.searchTokenListings({
    contractAddress,
    maxResults: 3,
  });

  assert.equal(capturedSearchQuery, contractAddress);
  assert.equal(response.query, contractAddress);
  assert.equal(response.resolvedContractAddress, contractAddress);
  assert.equal(response.holderDistribution.status, "unavailable");
  assert.equal(response.holderDistribution.error?.code, "ONCHAIN_BIRDSEYE_NOT_CONFIGURED");
});
