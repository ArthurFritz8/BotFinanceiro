import assert from "node:assert/strict";
import { after, beforeEach, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";
process.env.AIRDROPS_IO_SOURCE_URL ??= "https://airdrops.io";
process.env.AIRDROP_ALERT_SOURCE_URL ??= "https://airdropalert.com";
process.env.DEFILLAMA_API_BASE_URL ??= "https://api.llama.fi";
process.env.AIRDROPS_DROPS_TAB_SOURCE_URL = "";
process.env.AIRDROPS_DROPS_TAB_API_KEY = "";
process.env.AIRDROPS_EARNIFI_SOURCE_URL = "";
process.env.AIRDROPS_EARNIFI_API_KEY = "";

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

void it("GET /v1/airdrops/opportunities retorna radar agregado multi-fonte", async () => {
  let airdropsIoCalls = 0;
  let airdropAlertCalls = 0;
  let defiLlamaCalls = 0;
  let coinGeckoCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("airdrops.io")) {
      airdropsIoCalls += 1;

      return Promise.resolve(
        new Response(
          `
            <html>
              <body>
                <a href="/base-quests-airdrop">Base Quests Airdrop campaign</a>
                <p>Complete testnet bridge and swaps on Base for points.</p>
              </body>
            </html>
          `,
          {
            headers: {
              "content-type": "text/html",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("airdropalert.com")) {
      airdropAlertCalls += 1;

      return Promise.resolve(
        new Response(
          `
            <html>
              <body>
                <a href="/zksync-retroactive-airdrop">zkSync Retroactive Airdrop</a>
                <p>Quest + onchain activity for potential token reward.</p>
              </body>
            </html>
          `,
          {
            headers: {
              "content-type": "text/html",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("api.llama.fi/protocols")) {
      defiLlamaCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              chain: "Base",
              gecko_id: null,
              name: "Aero Protocol",
              tvl: 145000000,
              url: "https://defillama.com/protocol/aero-protocol",
            },
          ]),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("api.coingecko.com/api/v3/search/trending")) {
      coinGeckoCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            coins: [
              {
                item: {
                  id: "base-token",
                  market_cap_rank: 120,
                  name: "Base Token",
                  symbol: "BASE",
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

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "GET",
    url: "/v1/airdrops/opportunities?limit=6&minScore=20&query=base",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(airdropsIoCalls, 1);
  assert.equal(airdropAlertCalls, 1);
  assert.equal(defiLlamaCalls, 1);
  assert.equal(coinGeckoCalls, 1);

  const body = response.json<{
    data: {
      opportunities: Array<{
        confidence: "high" | "low" | "medium";
        project: string;
        score: number;
        sources: string[];
      }>;
      summary: {
        sourceCoveragePercent: number;
        sourcesHealthy: number;
        total: number;
        totalSources: number;
      };
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.summary.totalSources, 4);
  assert.equal(body.data.summary.sourcesHealthy, 4);
  assert.ok(body.data.summary.sourceCoveragePercent >= 100);
  assert.ok(body.data.summary.total >= 1);
  assert.ok(body.data.opportunities.length >= 1);
  assert.ok(body.data.opportunities[0]?.score !== undefined);
  assert.equal((body.data.opportunities[0]?.sources.length ?? 0) >= 1, true);
  assert.match(JSON.stringify(body.data.opportunities), /base/i);
});

void it("GET /v1/airdrops/opportunities mantem resposta em sucesso parcial", async () => {
  let failingSourceCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("airdrops.io")) {
      failingSourceCalls += 1;
      return Promise.reject(new Error("Temporary source outage"));
    }

    if (requestUrl.includes("airdropalert.com")) {
      return Promise.resolve(
        new Response(
          `<a href="/linea-airdrop">Linea Airdrop testnet campaign</a>`,
          {
            headers: {
              "content-type": "text/html",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("api.llama.fi/protocols")) {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              chain: "Arbitrum",
              gecko_id: null,
              name: "Orbit Lending",
              tvl: 82000000,
            },
          ]),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("api.coingecko.com/api/v3/search/trending")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            coins: [
              {
                item: {
                  id: "orbit",
                  market_cap_rank: 270,
                  name: "Orbit",
                  symbol: "ORBT",
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

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "GET",
    url: "/v1/airdrops/opportunities?limit=5&minScore=15",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(failingSourceCalls, 1);

  const body = response.json<{
    data: {
      opportunities: Array<{
        project: string;
      }>;
      sources: Array<{
        error: {
          code: string;
          message: string;
        } | null;
        source:
          | "airdrop_alert"
          | "airdrops_io"
          | "coingecko_trending"
          | "defillama"
          | "drops_tab"
          | "earnifi";
        status: "error" | "ok";
      }>;
      summary: {
        sourcesHealthy: number;
      };
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.ok(body.data.opportunities.length >= 1);

  const failingSource = body.data.sources.find((source) => source.source === "airdrops_io");

  assert.equal(failingSource?.status, "error");
  assert.equal(failingSource?.error?.code, "AIRDROPS_SOURCE_UNAVAILABLE");
  assert.equal((body.data.summary.sourcesHealthy ?? 0) < 4, true);
});

void it("GET /v1/airdrops/opportunities aplica filtros avancados e ordenacao recente", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("airdrops.io")) {
      return Promise.resolve(
        new Response(
          `<a href="/zksync-legacy-airdrop">zkSync Legacy Airdrop 2026-04-01</a><p>testnet bridge swap quest</p>`,
          {
            headers: {
              "content-type": "text/html",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("airdropalert.com")) {
      return Promise.resolve(
        new Response(
          `<a href="/zksync-alpha-airdrop">zkSync Alpha Airdrop 2026-04-03</a><p>testnet bridge swap quest galxe</p>`,
          {
            headers: {
              "content-type": "text/html",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("api.llama.fi/protocols")) {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              chain: "Base",
              gecko_id: null,
              name: "Other Protocol",
              tvl: 92000000,
            },
          ]),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("api.coingecko.com/api/v3/search/trending")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            coins: [
              {
                item: {
                  id: "unrelated-token",
                  market_cap_rank: 420,
                  name: "Unrelated Token",
                  symbol: "UNT",
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

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "GET",
    url:
      "/v1/airdrops/opportunities?limit=5&minScore=20&chain=zksync&confidence=high&sources=airdrop_alert,airdrops_io&sortBy=recent",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      opportunities: Array<{
        chain: string | null;
        confidence: "high" | "low" | "medium";
        discoveredAt: string;
        sources: string[];
      }>;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.ok(body.data.opportunities.length >= 1);

  for (const opportunity of body.data.opportunities) {
    assert.equal((opportunity.chain ?? "").toLowerCase(), "zksync");
    assert.equal(opportunity.confidence, "high");
    assert.equal(
      opportunity.sources.some((source) => source === "airdrops_io" || source === "airdrop_alert"),
      true,
    );
  }

  if (body.data.opportunities.length > 1) {
    const firstTs = Date.parse(body.data.opportunities[0]?.discoveredAt ?? "");
    const secondTs = Date.parse(body.data.opportunities[1]?.discoveredAt ?? "");
    assert.equal(Number.isNaN(firstTs), false);
    assert.equal(Number.isNaN(secondTs), false);
    assert.equal(firstTs >= secondTs, true);
  }
});

void it("GET /v1/airdrops/opportunities retorna 400 para source invalida", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/airdrops/opportunities?sources=airdrops_io,fonte_invalida",
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

void it("GET /v1/airdrops/opportunities retorna 400 para query invalida", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/airdrops/opportunities?limit=120",
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