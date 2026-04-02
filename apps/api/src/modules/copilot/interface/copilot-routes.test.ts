import assert from "node:assert/strict";
import { after, beforeEach, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";

const { buildApp } = await import("../../../main/app.js");
const { env } = await import("../../../shared/config/env.js");
const { memoryCache } = await import("../../../shared/cache/memory-cache.js");

const app = buildApp();
await app.ready();

interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
  status: "error";
}

interface ApiSuccessResponse<TData> {
  data: TData;
  status: "success";
}

interface CopilotChatResponse {
  answer: string;
  fetchedAt: string;
  model: string;
  provider: "openrouter";
  responseId: string;
  toolCallsUsed: string[];
  usage: {
    completionTokens?: number;
    promptTokens?: number;
    totalTokens?: number;
  };
}

interface CopilotHistoryResponse {
  interactions: number;
  limit: number;
  messages: Array<{
    content: string;
    model?: string;
    role: "assistant" | "user";
    timestamp: string;
    toolCallsUsed?: string[];
    totalTokens?: number;
  }>;
  sessionId: string;
}

interface MutableEnv {
  OPENROUTER_API_BASE_URL: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_APP_NAME: string;
  OPENROUTER_APP_URL: string;
  OPENROUTER_MODEL: string;
  OPENROUTER_TIMEOUT_MS: number;
}

const mutableEnv = env as unknown as MutableEnv;
const originalFetch = globalThis.fetch;
const originalOpenRouterConfig: MutableEnv = {
  OPENROUTER_API_BASE_URL: mutableEnv.OPENROUTER_API_BASE_URL,
  OPENROUTER_API_KEY: mutableEnv.OPENROUTER_API_KEY,
  OPENROUTER_APP_NAME: mutableEnv.OPENROUTER_APP_NAME,
  OPENROUTER_APP_URL: mutableEnv.OPENROUTER_APP_URL,
  OPENROUTER_MODEL: mutableEnv.OPENROUTER_MODEL,
  OPENROUTER_TIMEOUT_MS: mutableEnv.OPENROUTER_TIMEOUT_MS,
};

void beforeEach(() => {
  mutableEnv.OPENROUTER_API_BASE_URL = "https://openrouter.ai/api/v1";
  mutableEnv.OPENROUTER_API_KEY = "";
  mutableEnv.OPENROUTER_APP_NAME = "BotFinanceiro";
  mutableEnv.OPENROUTER_APP_URL = "";
  mutableEnv.OPENROUTER_MODEL = "google/gemini-1.5-flash";
  mutableEnv.OPENROUTER_TIMEOUT_MS = 15_000;
  globalThis.fetch = originalFetch;
  memoryCache.clear();
});

void after(async () => {
  globalThis.fetch = originalFetch;
  mutableEnv.OPENROUTER_API_BASE_URL = originalOpenRouterConfig.OPENROUTER_API_BASE_URL;
  mutableEnv.OPENROUTER_API_KEY = originalOpenRouterConfig.OPENROUTER_API_KEY;
  mutableEnv.OPENROUTER_APP_NAME = originalOpenRouterConfig.OPENROUTER_APP_NAME;
  mutableEnv.OPENROUTER_APP_URL = originalOpenRouterConfig.OPENROUTER_APP_URL;
  mutableEnv.OPENROUTER_MODEL = originalOpenRouterConfig.OPENROUTER_MODEL;
  mutableEnv.OPENROUTER_TIMEOUT_MS = originalOpenRouterConfig.OPENROUTER_TIMEOUT_MS;
  await app.close();
});

void it("POST /v1/copilot/chat retorna 503 quando OpenRouter nao esta configurado", async () => {
  const response = await app.inject({
    method: "POST",
    payload: {
      message: "Resuma o mercado cripto de hoje",
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 503);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "OPENROUTER_NOT_CONFIGURED");
});

void it("POST /v1/copilot/chat retorna resposta da IA quando OpenRouter esta configurado", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  let capturedRequestUrl = "";
  let capturedRequestBody = "";

  globalThis.fetch = ((input, init) => {
    capturedRequestUrl = String(input);
    capturedRequestBody = typeof init?.body === "string" ? init.body : "";

    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Resumo: BTC em consolidacao e ETH com leve alta.",
                role: "assistant",
              },
            },
          ],
          id: "gen-test-001",
          model: "google/gemini-1.5-flash",
          usage: {
            completion_tokens: 12,
            prompt_tokens: 20,
            total_tokens: 32,
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
  }) as typeof fetch;

  const response = await app.inject({
    method: "POST",
    payload: {
      maxTokens: 350,
      message: "Resuma o mercado cripto de hoje",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(capturedRequestUrl, "https://openrouter.ai/api/v1/chat/completions");
  assert.match(capturedRequestBody, /"model":"google\/gemini-1.5-flash"/);
  assert.match(capturedRequestBody, /"message":"Resuma o mercado cripto de hoje"|"content":"Resuma o mercado cripto de hoje"/);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.provider, "openrouter");
  assert.equal(body.data.model, "google/gemini-1.5-flash");
  assert.equal(body.data.answer, "Resumo: BTC em consolidacao e ETH com leve alta.");
  assert.equal(body.data.responseId, "gen-test-001");
  assert.deepEqual(body.data.toolCallsUsed, []);
  assert.equal(body.data.usage.totalTokens, 32);
});

void it("POST /v1/copilot/chat aplica fallback local para resumo de mercado quando IA recusa", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/chat/completions")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Sinto muito, nao tenho a capacidade de fornecer um resumo do mercado cripto.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-fallback-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 17,
              prompt_tokens: 26,
              total_tokens: 43,
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

    if (requestUrl.includes("api.coincap.io/v2/assets?limit=8")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                changePercent24Hr: "1.25",
                id: "bitcoin",
                marketCapUsd: "1290000000000",
                name: "Bitcoin",
                priceUsd: "64200",
                rank: "1",
                symbol: "BTC",
                volumeUsd24Hr: "28000000000",
              },
              {
                changePercent24Hr: "0.42",
                id: "ethereum",
                marketCapUsd: "420000000000",
                name: "Ethereum",
                priceUsd: "3250",
                rank: "2",
                symbol: "ETH",
                volumeUsd24Hr: "15000000000",
              },
              {
                changePercent24Hr: "3.10",
                id: "solana",
                marketCapUsd: "70000000000",
                name: "Solana",
                priceUsd: "148",
                rank: "5",
                symbol: "SOL",
                volumeUsd24Hr: "3500000000",
              },
            ],
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
    method: "POST",
    payload: {
      message: "Resuma o mercado cripto de hoje em 5 linhas",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-fallback-001");
  assert.deepEqual(body.data.toolCallsUsed, []);
  assert.match(body.data.answer, /Resumo rapido do mercado cripto/);
  assert.match(body.data.answer, /CoinCap/);
  assert.match(body.data.answer, /Melhor 24h:/);
  assert.doesNotMatch(body.data.answer, /nao tenho a capacidade/);
});

void it("POST /v1/copilot/chat executa fluxo de tool calling read-only", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  const capturedRequestBodies: string[] = [];
  let fetchCallCount = 0;

  globalThis.fetch = ((_, init) => {
    fetchCallCount += 1;
    capturedRequestBodies.push(typeof init?.body === "string" ? init.body : "");

    if (fetchCallCount === 1) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: null,
                  role: "assistant",
                  tool_calls: [
                    {
                      function: {
                        arguments: "{}",
                        name: "get_crypto_sync_policy",
                      },
                      id: "call_sync_1",
                      type: "function",
                    },
                  ],
                },
              },
            ],
            id: "gen-tool-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 18,
              prompt_tokens: 26,
              total_tokens: 44,
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

    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  "A politica atual esta em modo normal com intervalos de hot em 180s, warm em 300s e cold em 21600s.",
                role: "assistant",
              },
            },
          ],
          id: "gen-tool-002",
          model: "google/gemini-1.5-flash",
          usage: {
            completion_tokens: 21,
            prompt_tokens: 41,
            total_tokens: 62,
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
  }) as typeof fetch;

  const response = await app.inject({
    method: "POST",
    payload: {
      message: "Qual a politica de sincronizacao atual?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(fetchCallCount, 2);
  assert.match(capturedRequestBodies[0] ?? "", /"tools":\[/);
  assert.match(capturedRequestBodies[1] ?? "", /"role":"tool"/);
  assert.match(capturedRequestBodies[1] ?? "", /"name":"get_crypto_sync_policy"/);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(
    body.data.answer,
    "A politica atual esta em modo normal com intervalos de hot em 180s, warm em 300s e cold em 21600s.",
  );
  assert.deepEqual(body.data.toolCallsUsed, ["get_crypto_sync_policy"]);
  assert.equal(body.data.responseId, "gen-tool-002");
  assert.equal(body.data.usage.totalTokens, 62);
});

void it("POST /v1/copilot/chat executa comparativo multi-ativos com tool calling", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  let openRouterCalls = 0;
  let coinGeckoCalls = 0;
  const capturedOpenRouterBodies: string[] = [];

  globalThis.fetch = ((input, init) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/chat/completions")) {
      openRouterCalls += 1;
      capturedOpenRouterBodies.push(typeof init?.body === "string" ? init.body : "");

      if (openRouterCalls === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: null,
                    role: "assistant",
                    tool_calls: [
                      {
                        function: {
                          arguments: '{"assetIds":["bitcoin","ethereum"],"currency":"usd"}',
                          name: "get_crypto_multi_spot_price",
                        },
                        id: "call_multi_spot_1",
                        type: "function",
                      },
                    ],
                  },
                },
              ],
              id: "gen-tool-multi-001",
              model: "google/gemini-1.5-flash",
              usage: {
                completion_tokens: 22,
                prompt_tokens: 29,
                total_tokens: 51,
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

      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "Comparativo: bitcoin esta acima de ethereum em USD, com tabela enviada no contexto da ferramenta.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-tool-multi-002",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 24,
              prompt_tokens: 44,
              total_tokens: 68,
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

    if (requestUrl.includes("/simple/price")) {
      coinGeckoCalls += 1;

      const parsedUrl = new URL(requestUrl);
      const assetId = parsedUrl.searchParams.get("ids") ?? "";
      const currency = parsedUrl.searchParams.get("vs_currencies") ?? "usd";
      const quotedPrice = assetId === "bitcoin" ? 64000 : assetId === "ethereum" ? 3200 : 0;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            [assetId]: {
              [currency]: quotedPrice,
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
    method: "POST",
    payload: {
      message: "Compare bitcoin e ethereum em usd",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 2);
  assert.equal(coinGeckoCalls, 2);
  assert.match(capturedOpenRouterBodies[0] ?? "", /"name":"get_crypto_multi_spot_price"/);
  assert.match(capturedOpenRouterBodies[1] ?? "", /"name":"get_crypto_multi_spot_price"/);
  assert.match(capturedOpenRouterBodies[1] ?? "", /tableMarkdown/);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(
    body.data.answer,
    "Comparativo: bitcoin esta acima de ethereum em USD, com tabela enviada no contexto da ferramenta.",
  );
  assert.deepEqual(body.data.toolCallsUsed, ["get_crypto_multi_spot_price"]);
  assert.equal(body.data.responseId, "gen-tool-multi-002");
  assert.equal(body.data.usage.totalTokens, 68);
});

void it("GET /v1/copilot/history retorna mensagens da sessao informada", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  const sessionId = `sessao_history_${Date.now()}`;

  globalThis.fetch = (() => {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Resumo da sessao para historico persistido.",
                role: "assistant",
              },
            },
          ],
          id: "gen-history-001",
          model: "google/gemini-1.5-flash",
          usage: {
            completion_tokens: 10,
            prompt_tokens: 18,
            total_tokens: 28,
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
  }) as typeof fetch;

  const chatResponse = await app.inject({
    method: "POST",
    payload: {
      message: "Mensagem para persistir no historico remoto",
      sessionId,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(chatResponse.statusCode, 200);

  const historyResponse = await app.inject({
    method: "GET",
    url: `/v1/copilot/history?sessionId=${encodeURIComponent(sessionId)}&limit=20`,
  });

  assert.equal(historyResponse.statusCode, 200);

  const historyBody = historyResponse.json<ApiSuccessResponse<CopilotHistoryResponse>>();
  assert.equal(historyBody.status, "success");
  assert.equal(historyBody.data.sessionId, sessionId);
  assert.equal(historyBody.data.interactions, 1);
  assert.equal(historyBody.data.messages.length, 2);
  assert.equal(historyBody.data.messages[0]?.role, "user");
  assert.equal(historyBody.data.messages[0]?.content, "Mensagem para persistir no historico remoto");
  assert.equal(historyBody.data.messages[1]?.role, "assistant");
  assert.equal(historyBody.data.messages[1]?.content, "Resumo da sessao para historico persistido.");
});

void it("GET /v1/copilot/history retorna 400 para sessionId invalido", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/copilot/history?sessionId=abc",
  });

  assert.equal(response.statusCode, 400);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(body.error.message, "Invalid payload");
});

void it("POST /v1/copilot/chat retorna 400 para payload invalido", async () => {
  const response = await app.inject({
    method: "POST",
    payload: {
      message: "",
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 400);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(body.error.message, "Invalid payload");
});