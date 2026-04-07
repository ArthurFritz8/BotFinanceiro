import assert from "node:assert/strict";
import { after, beforeEach, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";
process.env.OPENROUTER_API_KEY = "";
process.env.MEME_RADAR_AI_MAX_ITEMS = "0";
process.env.MEME_RADAR_NEW_POOLS_PER_CHAIN = "4";
process.env.MEME_RADAR_DEX_ENRICH_LIMIT = "4";
process.env.MEME_RADAR_CONSENSUS_WEIGHT_BUNDLE_RISK = "60";
process.env.MEME_RADAR_CONSENSUS_WEIGHT_SECURITY_STATUS = "20";
process.env.MEME_RADAR_CONSENSUS_WEIGHT_LIQUIDITY_DEPTH = "10";
process.env.MEME_RADAR_CONSENSUS_WEIGHT_WEB_SIGNAL = "5";
process.env.MEME_RADAR_CONSENSUS_WEIGHT_COMMUNITY_HEALTH = "5";

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

function buildGeckoPoolPayload(input: {
  chain: "base" | "solana";
  pairAddress: string;
  poolCreatedAt?: string;
  quoteId: string;
  quoteName: string;
  quoteSymbol: string;
  tokenAddress: string;
  tokenId: string;
  tokenName: string;
  tokenSymbol: string;
}): Record<string, unknown> {
  return {
    data: [
      {
        attributes: {
          address: input.pairAddress,
          fdv_usd: "1800000",
          market_cap_usd: "900000",
          name: `${input.tokenSymbol} / ${input.quoteSymbol}`,
          pool_created_at: input.poolCreatedAt ?? new Date(Date.now() - 10 * 60_000).toISOString(),
          price_change_percentage: {
            h24: "32.6",
          },
          reserve_in_usd: "145000",
          transactions: {
            h24: {
              buys: 172,
              sells: 133,
            },
          },
          volume_usd: {
            h24: "850000",
          },
        },
        id: `${input.chain}_${input.pairAddress}`,
        relationships: {
          base_token: {
            data: {
              id: input.tokenId,
            },
          },
          quote_token: {
            data: {
              id: input.quoteId,
            },
          },
        },
        type: "pool",
      },
    ],
    included: [
      {
        attributes: {
          address: input.tokenAddress,
          name: input.tokenName,
          symbol: input.tokenSymbol,
        },
        id: input.tokenId,
        type: "token",
      },
      {
        attributes: {
          address: input.quoteId,
          name: input.quoteName,
          symbol: input.quoteSymbol,
        },
        id: input.quoteId,
        type: "token",
      },
    ],
  };
}

function buildDexPayload(input: {
  chain: "base" | "solana";
  pairAddress: string;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
}): Record<string, unknown> {
  return {
    pairs: [
      {
        baseToken: {
          address: input.tokenAddress,
          name: input.tokenName,
          symbol: input.tokenSymbol,
        },
        chainId: input.chain,
        dexId: input.chain === "solana" ? "raydium" : "aerodrome",
        info: {
          socials: [
            {
              type: "twitter",
              url: `https://x.com/${input.tokenSymbol.toLowerCase()}`,
            },
          ],
          websites: [
            {
              label: "website",
              url: `https://${input.tokenSymbol.toLowerCase()}.fun`,
            },
          ],
        },
        liquidity: {
          usd: 245000,
        },
        marketCap: 1250000,
        pairAddress: input.pairAddress,
        priceChange: {
          h24: 46.2,
        },
        quoteToken: {
          symbol: input.chain === "solana" ? "SOL" : "USDC",
        },
        txns: {
          h24: {
            buys: 233,
            sells: 168,
          },
        },
        url: `https://dexscreener.com/${input.chain}/${input.pairAddress.toLowerCase()}`,
        volume: {
          h24: 1420000,
        },
      },
    ],
  };
}

void it("GET /v1/meme-radar/notifications retorna board com Solana e Base", async () => {
  let geckoCalls = 0;
  let dexCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("geckoterminal.com/api/v2/networks/solana/new_pools")) {
      geckoCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify(
            buildGeckoPoolPayload({
              chain: "solana",
              pairAddress: "SoPaIr111111111111111111111111111111111",
              quoteId: "token_sol",
              quoteName: "Solana",
              quoteSymbol: "SOL",
              tokenAddress: "SoToken1111111111111111111111111111111111",
              tokenId: "token_sol_meme",
              tokenName: "Solana Meme One",
              tokenSymbol: "SMONE",
            }),
          ),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("geckoterminal.com/api/v2/networks/base/new_pools")) {
      geckoCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify(
            buildGeckoPoolPayload({
              chain: "base",
              pairAddress: "BaSePaIr22222222222222222222222222222222",
              quoteId: "token_usdc",
              quoteName: "USD Coin",
              quoteSymbol: "USDC",
              tokenAddress: "BaseToken22222222222222222222222222222222",
              tokenId: "token_base_meme",
              tokenName: "Base Meme Two",
              tokenSymbol: "BMTWO",
            }),
          ),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("api.dexscreener.com/latest/dex/pairs/")) {
      dexCalls += 1;

      if (requestUrl.includes("/solana/")) {
        return Promise.resolve(
          new Response(
            JSON.stringify(
              buildDexPayload({
                chain: "solana",
                pairAddress: "SoPaIr111111111111111111111111111111111",
                tokenAddress: "SoToken1111111111111111111111111111111111",
                tokenName: "Solana Meme One",
                tokenSymbol: "SMONE",
              }),
            ),
            {
              headers: {
                "content-type": "application/json",
              },
              status: 200,
            },
          ),
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify(
            buildDexPayload({
              chain: "base",
              pairAddress: "BaSePaIr22222222222222222222222222222222",
              tokenAddress: "BaseToken22222222222222222222222222222222",
              tokenName: "Base Meme Two",
              tokenSymbol: "BMTWO",
            }),
          ),
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
    url: "/v1/meme-radar/notifications?refresh=true&limit=20",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(geckoCalls, 2);
  assert.ok(dexCalls >= 1);

  const body = response.json<{
    data: {
      board: {
        byChain: {
          base: number;
          solana: number;
        };
        total: number;
      };
      notifications: Array<{
        chain: "base" | "solana";
        id: string;
        pairFingerprint: string;
        priority: "critical" | "high" | "watch";
        sentiment: {
          hypeScore: number;
        };
      }>;
      sources: Array<{
        source: "dexscreener" | "geckoterminal_base" | "geckoterminal_solana" | "openrouter";
        status: "error" | "ok";
      }>;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.ok(body.data.board.total >= 2);
  assert.ok(body.data.board.byChain.solana >= 1);
  assert.ok(body.data.board.byChain.base >= 1);
  assert.ok(body.data.notifications.length >= 2);
  assert.ok(body.data.notifications.some((item) => item.chain === "solana"));
  assert.ok(body.data.notifications.some((item) => item.chain === "base"));
  assert.ok(body.data.notifications.every((item) => typeof item.sentiment.hypeScore === "number"));
  assert.ok(body.data.sources.some((item) => item.source === "geckoterminal_solana"));
  assert.ok(body.data.sources.some((item) => item.source === "geckoterminal_base"));
});

void it("POST /v1/meme-radar/notifications/:id/pin fixa e lista em pinnedOnly", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("geckoterminal.com/api/v2/networks/solana/new_pools")) {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            buildGeckoPoolPayload({
              chain: "solana",
              pairAddress: "SoPaIr333333333333333333333333333333333",
              quoteId: "token_sol",
              quoteName: "Solana",
              quoteSymbol: "SOL",
              tokenAddress: "SoToken3333333333333333333333333333333333",
              tokenId: "token_sol_meme_3",
              tokenName: "Solana Meme Three",
              tokenSymbol: "SMTHREE",
            }),
          ),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("geckoterminal.com/api/v2/networks/base/new_pools")) {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            buildGeckoPoolPayload({
              chain: "base",
              pairAddress: "BaSePaIr44444444444444444444444444444444",
              quoteId: "token_usdc",
              quoteName: "USD Coin",
              quoteSymbol: "USDC",
              tokenAddress: "BaseToken44444444444444444444444444444444",
              tokenId: "token_base_meme_4",
              tokenName: "Base Meme Four",
              tokenSymbol: "BMFOUR",
            }),
          ),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("api.dexscreener.com/latest/dex/pairs/")) {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            buildDexPayload({
              chain: requestUrl.includes("/solana/") ? "solana" : "base",
              pairAddress: requestUrl.includes("/solana/")
                ? "SoPaIr333333333333333333333333333333333"
                : "BaSePaIr44444444444444444444444444444444",
              tokenAddress: requestUrl.includes("/solana/")
                ? "SoToken3333333333333333333333333333333333"
                : "BaseToken44444444444444444444444444444444",
              tokenName: requestUrl.includes("/solana/") ? "Solana Meme Three" : "Base Meme Four",
              tokenSymbol: requestUrl.includes("/solana/") ? "SMTHREE" : "BMFOUR",
            }),
          ),
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

  const refreshResponse = await app.inject({
    method: "GET",
    url: "/v1/meme-radar/notifications?refresh=true&limit=10",
  });

  assert.equal(refreshResponse.statusCode, 200);

  const refreshBody = refreshResponse.json<{
    data: {
      notifications: Array<{
        id: string;
      }>;
    };
    status: "success";
  }>();

  const targetNotificationId = refreshBody.data.notifications[0]?.id;
  assert.equal(typeof targetNotificationId, "string");

  const pinResponse = await app.inject({
    method: "POST",
    payload: {
      pinned: true,
    },
    url: `/v1/meme-radar/notifications/${encodeURIComponent(targetNotificationId ?? "")}/pin`,
  });

  assert.equal(pinResponse.statusCode, 200);

  const pinBody = pinResponse.json<{
    data: {
      notificationId: string;
      pinned: boolean;
      updatedAt: string;
    };
    status: "success";
  }>();

  assert.equal(pinBody.status, "success");
  assert.equal(pinBody.data.notificationId, targetNotificationId);
  assert.equal(pinBody.data.pinned, true);
  assert.equal(typeof pinBody.data.updatedAt, "string");

  const pinnedOnlyResponse = await app.inject({
    method: "GET",
    url: "/v1/meme-radar/notifications?pinnedOnly=true&limit=5",
  });

  assert.equal(pinnedOnlyResponse.statusCode, 200);

  const pinnedOnlyBody = pinnedOnlyResponse.json<{
    data: {
      notifications: Array<{
        id: string;
        pinned: boolean;
      }>;
    };
    status: "success";
  }>();

  assert.equal(pinnedOnlyBody.status, "success");
  assert.ok(pinnedOnlyBody.data.notifications.length >= 1);
  assert.ok(pinnedOnlyBody.data.notifications.every((item) => item.pinned));
  assert.ok(pinnedOnlyBody.data.notifications.some((item) => item.id === targetNotificationId));
});

void it("GET /v1/meme-radar/risk-audit retorna checklist institucional para ativo monitorado", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("geckoterminal.com/api/v2/networks/solana/new_pools")) {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            buildGeckoPoolPayload({
              chain: "solana",
              pairAddress: "SoPaIr555555555555555555555555555555555",
              quoteId: "token_sol",
              quoteName: "Solana",
              quoteSymbol: "SOL",
              tokenAddress: "SoToken5555555555555555555555555555555555",
              tokenId: "token_sol_meme_5",
              tokenName: "Solana Meme Five",
              tokenSymbol: "SMFIVE",
            }),
          ),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("geckoterminal.com/api/v2/networks/base/new_pools")) {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            buildGeckoPoolPayload({
              chain: "base",
              pairAddress: "BaSePaIr66666666666666666666666666666666",
              quoteId: "token_usdc",
              quoteName: "USD Coin",
              quoteSymbol: "USDC",
              tokenAddress: "BaseToken66666666666666666666666666666666",
              tokenId: "token_base_meme_6",
              tokenName: "Base Meme Six",
              tokenSymbol: "BMSIX",
            }),
          ),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("api.dexscreener.com/latest/dex/pairs/")) {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            buildDexPayload({
              chain: requestUrl.includes("/solana/") ? "solana" : "base",
              pairAddress: requestUrl.includes("/solana/")
                ? "SoPaIr555555555555555555555555555555555"
                : "BaSePaIr66666666666666666666666666666666",
              tokenAddress: requestUrl.includes("/solana/")
                ? "SoToken5555555555555555555555555555555555"
                : "BaseToken66666666666666666666666666666666",
              tokenName: requestUrl.includes("/solana/") ? "Solana Meme Five" : "Base Meme Six",
              tokenSymbol: requestUrl.includes("/solana/") ? "SMFIVE" : "BMSIX",
            }),
          ),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("duckduckgo.com") || requestUrl.includes("tavily") || requestUrl.includes("serper") || requestUrl.includes("serpapi")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            AbstractText: "",
            Heading: "",
            RelatedTopics: [],
            Results: [],
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

  const refreshResponse = await app.inject({
    method: "GET",
    url: "/v1/meme-radar/notifications?refresh=true&limit=20",
  });

  assert.equal(refreshResponse.statusCode, 200);

  const auditResponse = await app.inject({
    method: "GET",
    url: "/v1/meme-radar/risk-audit?assetId=SMFIVE",
  });

  assert.equal(auditResponse.statusCode, 200);

  const auditBody = auditResponse.json<{
    data: {
      bundleRiskReport: {
        riskScore: number;
      };
      checklistMarkdown: string;
      found: boolean;
      token: {
        symbol: string | null;
      };
    };
    status: "success";
  }>();

  assert.equal(auditBody.status, "success");
  assert.equal(auditBody.data.found, true);
  assert.equal(auditBody.data.token.symbol, "SMFIVE");
  assert.ok(typeof auditBody.data.bundleRiskReport.riskScore === "number");
  assert.match(auditBody.data.checklistMarkdown, /\[RISK SCORE:\s*\d+\/100\]/);
  assert.match(auditBody.data.checklistMarkdown, /Checklist de Seguranca/);
});

void it("GET /v1/meme-radar/risk-audit retorna modo UNKNOWN quando ativo nao existe", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/meme-radar/risk-audit?assetId=UNKNOWN_TOKEN_777",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      found: boolean;
      checklistMarkdown: string;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.found, false);
  assert.match(body.data.checklistMarkdown, /UNKNOWN/);
});

void it("GET /v1/meme-radar/risk-audit retorna 400 para assetId invalido", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/meme-radar/risk-audit?assetId=a",
  });

  assert.equal(response.statusCode, 400);
});

void it("GET /v1/meme-radar/risk-audit/by-contract retorna checklist para endereco monitorado", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("geckoterminal.com/api/v2/networks/solana/new_pools")) {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            buildGeckoPoolPayload({
              chain: "solana",
              pairAddress: "SoPaIr777777777777777777777777777777777",
              quoteId: "token_sol",
              quoteName: "Solana",
              quoteSymbol: "SOL",
              tokenAddress: "SoToken7777777777777777777777777777777777",
              tokenId: "token_sol_meme_7",
              tokenName: "Solana Meme Seven",
              tokenSymbol: "SMSEVEN",
            }),
          ),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("geckoterminal.com/api/v2/networks/base/new_pools")) {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            buildGeckoPoolPayload({
              chain: "base",
              pairAddress: "BaSePaIr88888888888888888888888888888888",
              quoteId: "token_usdc",
              quoteName: "USD Coin",
              quoteSymbol: "USDC",
              tokenAddress: "0x8888888888888888888888888888888888888888",
              tokenId: "token_base_meme_8",
              tokenName: "Base Meme Eight",
              tokenSymbol: "BMEIGHT",
            }),
          ),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("api.dexscreener.com/latest/dex/pairs/")) {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            buildDexPayload({
              chain: requestUrl.includes("/solana/") ? "solana" : "base",
              pairAddress: requestUrl.includes("/solana/")
                ? "SoPaIr777777777777777777777777777777777"
                : "BaSePaIr88888888888888888888888888888888",
              tokenAddress: requestUrl.includes("/solana/")
                ? "SoToken7777777777777777777777777777777777"
                : "0x8888888888888888888888888888888888888888",
              tokenName: requestUrl.includes("/solana/") ? "Solana Meme Seven" : "Base Meme Eight",
              tokenSymbol: requestUrl.includes("/solana/") ? "SMSEVEN" : "BMEIGHT",
            }),
          ),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("duckduckgo.com") || requestUrl.includes("tavily") || requestUrl.includes("serper") || requestUrl.includes("serpapi")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            AbstractText: "",
            Heading: "",
            RelatedTopics: [],
            Results: [],
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

  const refreshResponse = await app.inject({
    method: "GET",
    url: "/v1/meme-radar/notifications?refresh=true&limit=20",
  });

  assert.equal(refreshResponse.statusCode, 200);

  const auditResponse = await app.inject({
    method: "GET",
    url: "/v1/meme-radar/risk-audit/by-contract?contractAddress=0x8888888888888888888888888888888888888888",
  });

  assert.equal(auditResponse.statusCode, 200);

  const auditBody = auditResponse.json<{
    data: {
      checklistMarkdown: string;
      consensus: {
        breakdown: Array<{
          contribution: number;
          score: number;
          source:
            | "bundle_risk"
            | "community_health"
            | "liquidity_depth"
            | "security_status"
            | "web_signal";
          weight: number;
        }>;
        score: number;
        weights: {
          bundle_risk: number;
          community_health: number;
          liquidity_depth: number;
          security_status: number;
          web_signal: number;
        };
      };
      contractAddress: string;
      found: boolean;
      matchedOn: "pair_address" | "token_address" | "vamp_contract_candidate" | null;
      token: {
        symbol: string | null;
      };
    };
    status: "success";
  }>();

  assert.equal(auditBody.status, "success");
  assert.equal(auditBody.data.found, true);
  assert.equal(auditBody.data.matchedOn, "token_address");
  assert.equal(auditBody.data.token.symbol, "BMEIGHT");
  assert.equal(auditBody.data.contractAddress, "0x8888888888888888888888888888888888888888");
  assert.ok(typeof auditBody.data.consensus.score === "number");
  assert.equal(auditBody.data.consensus.weights.bundle_risk, 60);
  assert.equal(auditBody.data.consensus.weights.security_status, 20);
  assert.equal(auditBody.data.consensus.weights.liquidity_depth, 10);
  assert.equal(auditBody.data.consensus.weights.web_signal, 5);
  assert.equal(auditBody.data.consensus.weights.community_health, 5);
  assert.equal(auditBody.data.consensus.breakdown.length, 5);
  assert.ok(auditBody.data.consensus.breakdown.some((item) => item.source === "bundle_risk"));
  assert.ok(auditBody.data.consensus.breakdown.some((item) => item.source === "security_status"));
  assert.ok(auditBody.data.consensus.breakdown.some((item) => item.source === "liquidity_depth"));
  assert.ok(auditBody.data.consensus.breakdown.some((item) => item.source === "web_signal"));
  assert.ok(auditBody.data.consensus.breakdown.some((item) => item.source === "community_health"));
  assert.match(auditBody.data.checklistMarkdown, /Checklist de Seguranca/);
});

void it("GET /v1/meme-radar/risk-audit/by-contract resolve fallback live via DexScreener quando contrato nao esta no snapshot", async () => {
  const targetContract = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const livePairAddress = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes(`api.dexscreener.com/latest/dex/tokens/${targetContract}`)) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            pairs: [
              {
                baseToken: {
                  address: targetContract,
                  name: "Audit Live Token",
                  symbol: "ALIVE",
                },
                chainId: "base",
                dexId: "aerodrome",
                info: {
                  socials: [
                    {
                      type: "twitter",
                      url: "https://x.com/alive_token",
                    },
                  ],
                  websites: [
                    {
                      label: "website",
                      url: "https://alive-token.fun",
                    },
                  ],
                },
                liquidity: {
                  usd: 56000,
                },
                marketCap: 250000,
                pairAddress: livePairAddress,
                priceChange: {
                  h24: 15.2,
                },
                quoteToken: {
                  symbol: "USDC",
                },
                txns: {
                  h24: {
                    buys: 84,
                    sells: 41,
                  },
                },
                url: `https://dexscreener.com/base/${livePairAddress}`,
                volume: {
                  h24: 380000,
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

    if (requestUrl.includes("api.gopluslabs.io/api/v1/token_security/8453")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            result: {
              [targetContract]: {
                cannot_sell_all: "0",
                is_honeypot: "0",
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

    if (requestUrl.includes("duckduckgo.com") || requestUrl.includes("tavily") || requestUrl.includes("serper") || requestUrl.includes("serpapi")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            AbstractText: "",
            Heading: "",
            RelatedTopics: [],
            Results: [],
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

    if (requestUrl.includes("geckoterminal.com/api/v2/networks/solana/new_pools") || requestUrl.includes("geckoterminal.com/api/v2/networks/base/new_pools")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [],
            included: [],
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

    if (requestUrl.includes("api.dexscreener.com/latest/dex/pairs/")) {
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

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "GET",
    url: `/v1/meme-radar/risk-audit/by-contract?refresh=true&contractAddress=${targetContract}`,
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      bundleRiskReport: {
        riskScore: number;
      };
      consensus: {
        score: number;
      };
      found: boolean;
      matchedNotificationId: string | null;
      matchedOn: "pair_address" | "token_address" | "vamp_contract_candidate" | null;
      token: {
        symbol: string | null;
      };
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.found, true);
  assert.equal(body.data.matchedOn, "token_address");
  assert.equal(body.data.token.symbol, "ALIVE");
  assert.ok(typeof body.data.bundleRiskReport.riskScore === "number");
  assert.ok(typeof body.data.consensus.score === "number");
  assert.equal(typeof body.data.matchedNotificationId, "string");
});

void it("GET /v1/meme-radar/risk-audit/by-contract retorna modo UNKNOWN para endereco nao encontrado", async () => {
  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.dexscreener.com/latest/dex/tokens/0x9999999999999999999999999999999999999999")) {
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

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "GET",
    url: "/v1/meme-radar/risk-audit/by-contract?contractAddress=0x9999999999999999999999999999999999999999",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      consensus: {
        score: number;
      };
      found: boolean;
      matchedOn: "pair_address" | "token_address" | "vamp_contract_candidate" | null;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.ok(typeof body.data.consensus.score === "number");
  assert.equal(body.data.found, false);
  assert.equal(body.data.matchedOn, null);
});

void it("GET /v1/meme-radar/risk-audit/by-contract retorna 400 para endereco invalido", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/meme-radar/risk-audit/by-contract?contractAddress=0x123",
  });

  assert.equal(response.statusCode, 400);
});
