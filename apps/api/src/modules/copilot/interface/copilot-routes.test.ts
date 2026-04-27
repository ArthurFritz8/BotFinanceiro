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
  WEB_SEARCH_PROVIDER_STRATEGY:
    | "tavily_only"
    | "tavily_then_serper"
    | "tavily_then_serper_then_serpapi";
  WEB_SEARCH_DEXSCREENER_API_BASE_URL: string;
  WEB_SEARCH_SERPER_API_BASE_URL: string;
  WEB_SEARCH_SERPER_API_KEY: string;
  WEB_SEARCH_SERPAPI_API_BASE_URL: string;
  WEB_SEARCH_SERPAPI_API_KEY: string;
  WEB_SEARCH_TAVILY_API_BASE_URL: string;
  WEB_SEARCH_TAVILY_API_KEY: string;
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
  WEB_SEARCH_PROVIDER_STRATEGY: mutableEnv.WEB_SEARCH_PROVIDER_STRATEGY,
  WEB_SEARCH_DEXSCREENER_API_BASE_URL: mutableEnv.WEB_SEARCH_DEXSCREENER_API_BASE_URL,
  WEB_SEARCH_SERPER_API_BASE_URL: mutableEnv.WEB_SEARCH_SERPER_API_BASE_URL,
  WEB_SEARCH_SERPER_API_KEY: mutableEnv.WEB_SEARCH_SERPER_API_KEY,
  WEB_SEARCH_SERPAPI_API_BASE_URL: mutableEnv.WEB_SEARCH_SERPAPI_API_BASE_URL,
  WEB_SEARCH_SERPAPI_API_KEY: mutableEnv.WEB_SEARCH_SERPAPI_API_KEY,
  WEB_SEARCH_TAVILY_API_BASE_URL: mutableEnv.WEB_SEARCH_TAVILY_API_BASE_URL,
  WEB_SEARCH_TAVILY_API_KEY: mutableEnv.WEB_SEARCH_TAVILY_API_KEY,
};

void beforeEach(() => {
  mutableEnv.OPENROUTER_API_BASE_URL = "https://openrouter.ai/api/v1";
  mutableEnv.OPENROUTER_API_KEY = "";
  mutableEnv.OPENROUTER_APP_NAME = "BotFinanceiro";
  mutableEnv.OPENROUTER_APP_URL = "";
  mutableEnv.OPENROUTER_MODEL = "google/gemini-1.5-flash";
  mutableEnv.OPENROUTER_TIMEOUT_MS = 15_000;
  mutableEnv.WEB_SEARCH_PROVIDER_STRATEGY = "tavily_then_serper";
  mutableEnv.WEB_SEARCH_DEXSCREENER_API_BASE_URL = "https://api.dexscreener.com";
  mutableEnv.WEB_SEARCH_SERPER_API_BASE_URL = "https://google.serper.dev";
  mutableEnv.WEB_SEARCH_SERPER_API_KEY = "";
  mutableEnv.WEB_SEARCH_SERPAPI_API_BASE_URL = "https://serpapi.com";
  mutableEnv.WEB_SEARCH_SERPAPI_API_KEY = "";
  mutableEnv.WEB_SEARCH_TAVILY_API_BASE_URL = "https://api.tavily.com";
  mutableEnv.WEB_SEARCH_TAVILY_API_KEY = "";
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
  mutableEnv.WEB_SEARCH_PROVIDER_STRATEGY = originalOpenRouterConfig.WEB_SEARCH_PROVIDER_STRATEGY;
  mutableEnv.WEB_SEARCH_DEXSCREENER_API_BASE_URL = originalOpenRouterConfig.WEB_SEARCH_DEXSCREENER_API_BASE_URL;
  mutableEnv.WEB_SEARCH_SERPER_API_BASE_URL = originalOpenRouterConfig.WEB_SEARCH_SERPER_API_BASE_URL;
  mutableEnv.WEB_SEARCH_SERPER_API_KEY = originalOpenRouterConfig.WEB_SEARCH_SERPER_API_KEY;
  mutableEnv.WEB_SEARCH_SERPAPI_API_BASE_URL = originalOpenRouterConfig.WEB_SEARCH_SERPAPI_API_BASE_URL;
  mutableEnv.WEB_SEARCH_SERPAPI_API_KEY = originalOpenRouterConfig.WEB_SEARCH_SERPAPI_API_KEY;
  mutableEnv.WEB_SEARCH_TAVILY_API_BASE_URL = originalOpenRouterConfig.WEB_SEARCH_TAVILY_API_BASE_URL;
  mutableEnv.WEB_SEARCH_TAVILY_API_KEY = originalOpenRouterConfig.WEB_SEARCH_TAVILY_API_KEY;
  await app.close();
});

void it("POST /v1/copilot/chat retorna erro quando OpenRouter nao esta configurado", async () => {
  let openRouterCalled = false;

  globalThis.fetch = ((input, init) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("https://openrouter.ai/api/v1/chat/completions")) {
      openRouterCalled = true;
      return Promise.reject(new Error("OpenRouter nao deveria ser chamado neste cenario"));
    }

    if (requestUrl.startsWith("https://api.coincap.io/v2/assets")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                changePercent24Hr: "2.4",
                id: "bitcoin",
                marketCapUsd: "1200000000000",
                name: "Bitcoin",
                priceUsd: "64000",
                symbol: "BTC",
                volumeUsd24Hr: "28000000000",
              },
              {
                changePercent24Hr: "1.1",
                id: "ethereum",
                marketCapUsd: "420000000000",
                name: "Ethereum",
                priceUsd: "3200",
                symbol: "ETH",
                volumeUsd24Hr: "14000000000",
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

    void init;

    return Promise.reject(new Error(`Unhandled test fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "POST",
    payload: {
      message: "Resuma o mercado cripto de hoje",
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 503);
  assert.equal(openRouterCalled, false);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "OPENROUTER_NOT_CONFIGURED");
  assert.match(body.error.message, /not configured/i);
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

void it("POST /v1/copilot/chat injeta chartContext no system prompt sem exceder 4000 chars", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  let capturedRequestBody = "";

  globalThis.fetch = ((input, init) => {
    const requestUrl = String(input);

    if (!requestUrl.includes("/chat/completions")) {
      return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
    }

    capturedRequestBody = typeof init?.body === "string" ? init.body : "";

    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Contexto operacional considerado.",
                role: "assistant",
              },
            },
          ],
          id: "gen-chart-context-001",
          model: "google/gemini-1.5-flash",
          usage: {
            completion_tokens: 9,
            prompt_tokens: 40,
            total_tokens: 49,
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
      chartContext: {
        assetId: "ethereum",
        broker: "bybit",
        exchange: "BYBIT",
        interval: "15m",
        mode: "live",
        operationalMode: "spot_margin",
        range: "24h",
        strategy: "crypto",
        symbol: "ETHUSDT",
      },
      message: "Como esta o contexto atual?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);

  const openRouterPayload = JSON.parse(capturedRequestBody) as {
    messages?: Array<{
      content?: string;
      role?: string;
    }>;
  };
  const systemMessage = Array.isArray(openRouterPayload.messages)
    ? openRouterPayload.messages.find((message) => message.role === "system")
    : undefined;

  assert.ok(systemMessage && typeof systemMessage.content === "string");
  assert.match(systemMessage.content, /Contexto de terminal atual:/);
  assert.match(systemMessage.content, /asset=ethereum/);
  assert.match(systemMessage.content, /exchange=bybit/);
  assert.match(systemMessage.content, /mode=live/);
  assert.match(systemMessage.content, /range=24h/);
  assert.ok(systemMessage.content.length <= 4000);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.answer, "Contexto operacional considerado.");
});

void it("POST /v1/copilot/chat envia historico recente no payload do OpenRouter", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  const sessionId = `sessao_contexto_${Date.now()}`;
  const capturedBodies: string[] = [];
  let openRouterCalls = 0;

  globalThis.fetch = ((input, init) => {
    const requestUrl = String(input);

    if (!requestUrl.includes("/chat/completions")) {
      return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
    }

    openRouterCalls += 1;
    capturedBodies.push(typeof init?.body === "string" ? init.body : "");

    const assistantAnswer =
      openRouterCalls === 1
        ? "Contexto registrado para BMFOUR."
        : "Consigo seguir com BMFOUR usando o contexto desta sessao.";

    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: assistantAnswer,
                role: "assistant",
              },
            },
          ],
          id: `gen-history-context-${openRouterCalls}`,
          model: "google/gemini-1.5-flash",
          usage: {
            completion_tokens: 18,
            prompt_tokens: 30,
            total_tokens: 48,
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

  const firstResponse = await app.inject({
    method: "POST",
    payload: {
      message: "Token: BMFOUR. Quero acompanhamento profissional.",
      sessionId,
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(firstResponse.statusCode, 200);

  const secondResponse = await app.inject({
    method: "POST",
    payload: {
      message: "aonde posso comprar essa moeda?",
      sessionId,
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(secondResponse.statusCode, 200);
  assert.equal(openRouterCalls, 2);

  const secondRequestPayload = JSON.parse(capturedBodies[1] ?? "{}") as {
    messages?: Array<{
      content?: string;
      role?: string;
    }>;
  };
  const secondRequestMessages = Array.isArray(secondRequestPayload.messages)
    ? secondRequestPayload.messages
    : [];

  assert.ok(secondRequestMessages.length >= 3);
  assert.ok(secondRequestMessages.some((item) => item.role === "user" && item.content?.includes("BMFOUR")));
  assert.ok(secondRequestMessages.some((item) => item.role === "assistant" && item.content?.includes("Contexto registrado")));
  assert.equal(secondRequestMessages[secondRequestMessages.length - 1]?.role, "user");
  assert.equal(secondRequestMessages[secondRequestMessages.length - 1]?.content, "aonde posso comprar essa moeda?");
});

void it("POST /v1/copilot/chat aplica fallback geral para pergunta nao financeira", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  let openRouterCalls = 0;
  const capturedRequestBodies: string[] = [];

  globalThis.fetch = ((input, init) => {
    const requestUrl = String(input);

    if (!requestUrl.includes("/chat/completions")) {
      return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
    }

    openRouterCalls += 1;
    capturedRequestBodies.push(typeof init?.body === "string" ? init.body : "");

    if (openRouterCalls === 1) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "Sou um copiloto financeiro focado em dados e operacao. Nao consigo responder perguntas fora desse escopo.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-general-fallback-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 16,
              prompt_tokens: 24,
              total_tokens: 40,
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
                  "Procrastinacao e o habito de adiar tarefas importantes, mesmo sabendo que isso traz prejuizo depois. Uma forma simples de reduzir e quebrar a tarefa em passos pequenos e comecar por 5 minutos.",
                role: "assistant",
              },
            },
          ],
          id: "gen-general-fallback-002",
          model: "google/gemini-1.5-flash",
          usage: {
            completion_tokens: 27,
            prompt_tokens: 18,
            total_tokens: 45,
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
      message: "Explique procrastinacao de forma simples",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.ok(openRouterCalls >= 2);
  assert.ok(capturedRequestBodies.some((body) => /"tools":\[/.test(body)));
  assert.ok(capturedRequestBodies.some((body) => !/"tools":\[/.test(body)));

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.deepEqual(body.data.toolCallsUsed, []);
  assert.match(body.data.answer, /Procrastinacao e o habito de adiar tarefas importantes/);
  assert.doesNotMatch(body.data.answer, /copiloto financeiro focado/);
});

void it("POST /v1/copilot/chat substitui resposta com vazamento de raciocinio interno", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  let openRouterCalls = 0;
  const capturedRequestBodies: string[] = [];

  globalThis.fetch = ((input, init) => {
    const requestUrl = String(input);

    if (!requestUrl.includes("/chat/completions")) {
      return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
    }

    openRouterCalls += 1;
    capturedRequestBodies.push(typeof init?.body === "string" ? init.body : "");

    if (openRouterCalls === 1) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "We need to inspect the user request and call the tool before answering.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-quality-leak-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 19,
              prompt_tokens: 28,
              total_tokens: 47,
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
                  "Procrastinacao e o atraso recorrente de tarefas importantes. Uma forma pratica de reduzir isso e dividir a tarefa em blocos curtos e iniciar pelo primeiro bloco agora.",
                role: "assistant",
              },
            },
          ],
          id: "gen-quality-leak-002",
          model: "google/gemini-1.5-flash",
          usage: {
            completion_tokens: 24,
            prompt_tokens: 20,
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
  }) as typeof fetch;

  const response = await app.inject({
    method: "POST",
    payload: {
      message: "Como voce define procrastinacao em linguagem simples?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 2);
  assert.ok(capturedRequestBodies.some((body) => /"tools":\[/.test(body)));
  assert.ok(capturedRequestBodies.some((body) => !/"tools":\[/.test(body)));

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.deepEqual(body.data.toolCallsUsed, []);
  assert.match(body.data.answer, /Procrastinacao e o atraso recorrente de tarefas importantes/);
  assert.doesNotMatch(body.data.answer, /we need to|call the tool|user request/i);
});

void it("POST /v1/copilot/chat substitui resposta em ingles quando a pergunta esta em portugues", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  let openRouterCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (!requestUrl.includes("/chat/completions")) {
      return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
    }

    openRouterCalls += 1;

    if (openRouterCalls === 1) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "The market analysis summary is direct and the response should cover risk, chart, price, tool, user context and next step.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-quality-language-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 23,
              prompt_tokens: 26,
              total_tokens: 49,
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
                  "Procrastinacao e adiar o que importa. Para melhorar, escolha uma tarefa, defina um bloco de 10 minutos e conclua esse primeiro ciclo sem interrupcao.",
                role: "assistant",
              },
            },
          ],
          id: "gen-quality-language-002",
          model: "google/gemini-1.5-flash",
          usage: {
            completion_tokens: 21,
            prompt_tokens: 19,
            total_tokens: 40,
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
      message: "Como voce define procrastinacao em linguagem simples?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 2);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.deepEqual(body.data.toolCallsUsed, []);
  assert.match(body.data.answer, /Procrastinacao e adiar o que importa/);
  assert.doesNotMatch(body.data.answer, /The market analysis summary is direct/);
});

void it("POST /v1/copilot/chat aplica fallback FX para dolar sem tool de cambio", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  let openRouterCalls = 0;
  let yahooCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/chat/completions")) {
      openRouterCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "USD/BRL esta em 5,00 agora e deve continuar estavel.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-fx-no-tool-001",
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

    if (requestUrl.includes("query1.finance.yahoo.com/v7/finance/quote")) {
      yahooCalls += 1;
      assert.match(requestUrl, /USDBRL(?:%3D|=)X/);

      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              error: null,
              result: [
                {
                  currency: "BRL",
                  marketState: "REGULAR",
                  regularMarketChange: 0.044,
                  regularMarketChangePercent: 0.82,
                  regularMarketPrice: 5.4321,
                  regularMarketPreviousClose: 5.3881,
                  regularMarketTime: 1712018000,
                  symbol: "USDBRL=X",
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
    method: "POST",
    payload: {
      message: "Quanto esta o dolar agora em relacao ao real?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 1);
  assert.equal(yahooCalls, 1);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-fx-no-tool-001");
  assert.match(body.data.answer, /Cotacao FX em tempo real/);
  assert.match(body.data.answer, /USDBRL/);
  assert.match(body.data.answer, /Yahoo Finance/);
  assert.doesNotMatch(body.data.answer, /5,00 agora e deve continuar estavel/);
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
                  content: "Ocorreu uma falha ao obter dados do CoinCap. Por favor, tente novamente mais tarde.",
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
  assert.doesNotMatch(body.data.answer, /falha ao obter dados do CoinCap/);
});

void it("POST /v1/copilot/chat aplica fallback local para plano de monitoramento", async () => {
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
                  content:
                    "Ocorreu uma falha ao obter o panorama do mercado neste momento. Por favor, tente novamente mais tarde.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-monitoring-fallback-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 19,
              prompt_tokens: 28,
              total_tokens: 47,
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
      const parsedUrl = new URL(requestUrl);
      const assetId = parsedUrl.searchParams.get("ids") ?? "";
      const currency = parsedUrl.searchParams.get("vs_currencies") ?? "usd";

      const pricesByAsset: Record<string, number> = {
        bitcoin: 64000,
        ethereum: 3200,
        solana: 145,
      };

      return Promise.resolve(
        new Response(
          JSON.stringify({
            [assetId]: {
              [currency]: pricesByAsset[assetId] ?? 0,
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
      message: "Me de um plano de monitoramento para hoje com 3 checkpoints.",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-monitoring-fallback-001");
  assert.deepEqual(body.data.toolCallsUsed, []);
  assert.match(body.data.answer, /Plano de monitoramento para hoje/);
  assert.match(body.data.answer, /Checkpoint 1/);
  assert.match(body.data.answer, /Checkpoint 2/);
  assert.match(body.data.answer, /Checkpoint 3/);
  assert.doesNotMatch(body.data.answer, /falha ao obter o panorama/);
});

void it("POST /v1/copilot/chat aplica fallback local para analise de risco de curto prazo", async () => {
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
                  content:
                    "Sou um copiloto financeiro focado em dados e operacao. Nao posso fornecer analise de risco ou recomendacao de investimento.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-risk-fallback-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 20,
              prompt_tokens: 31,
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

    if (requestUrl.includes("api.coincap.io/v2/assets?limit=15")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                changePercent24Hr: "3.10",
                id: "bitcoin",
                marketCapUsd: "1300000000000",
                name: "Bitcoin",
                priceUsd: "65000",
                rank: "1",
                symbol: "BTC",
                volumeUsd24Hr: "32000000000",
              },
              {
                changePercent24Hr: "2.20",
                id: "ethereum",
                marketCapUsd: "430000000000",
                name: "Ethereum",
                priceUsd: "3300",
                rank: "2",
                symbol: "ETH",
                volumeUsd24Hr: "17000000000",
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

    if (requestUrl.includes("query1.finance.yahoo.com/v7/finance/quote")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              error: null,
              result: [
                {
                  currency: "USD",
                  longName: "CBOE Volatility Index",
                  marketState: "REGULAR",
                  regularMarketChangePercent: 1.8,
                  regularMarketPrice: 17.4,
                  symbol: "^VIX",
                },
                {
                  currency: "USD",
                  longName: "Treasury Yield 10 Years",
                  marketState: "REGULAR",
                  regularMarketChangePercent: 0.45,
                  regularMarketPrice: 4.2,
                  symbol: "^TNX",
                },
                {
                  currency: "USD",
                  longName: "Gold",
                  marketState: "REGULAR",
                  regularMarketChangePercent: -0.22,
                  regularMarketPrice: 2265,
                  symbol: "GC=F",
                },
                {
                  currency: "USD",
                  longName: "Crude Oil",
                  marketState: "REGULAR",
                  regularMarketChangePercent: 0.82,
                  regularMarketPrice: 81.2,
                  symbol: "CL=F",
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

    if (requestUrl.includes("/simple/price")) {
      const parsedUrl = new URL(requestUrl);
      const assetId = parsedUrl.searchParams.get("ids") ?? "";
      const currency = parsedUrl.searchParams.get("vs_currencies") ?? "usd";

      const pricesByAsset: Record<string, number> = {
        bitcoin: 65000,
        ethereum: 3300,
      };

      return Promise.resolve(
        new Response(
          JSON.stringify({
            [assetId]: {
              [currency]: pricesByAsset[assetId] ?? 0,
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
      message: "Quais os principais riscos de curto prazo para Bitcoin e Ethereum?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-risk-fallback-001");
  assert.match(body.data.answer, /Analise objetiva de risco de curto prazo/);
  assert.match(body.data.answer, /Bitcoin/);
  assert.match(body.data.answer, /Ethereum/);
  assert.match(body.data.answer, /Sinais macro/);
  assert.doesNotMatch(body.data.answer, /Nao posso fornecer analise de risco/);
});

void it("POST /v1/copilot/chat aplica fallback local para analise de grafico", async () => {
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
                  content:
                    "Bitcoin esta cotado em US$67.023. Nao posso fornecer recomendacoes de investimento ou prever se o preco vai subir ou cair.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-chart-fallback-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 18,
              prompt_tokens: 30,
              total_tokens: 48,
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

    if (requestUrl.includes("api.coingecko.com/api/v3/coins/bitcoin/market_chart")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            prices: [
              [1712000000000, 66200],
              [1712003600000, 66500],
              [1712007200000, 66820],
              [1712010800000, 67030],
              [1712014400000, 66910],
              [1712018000000, 67203],
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
    method: "POST",
    payload: {
      message: "Como esta o grafico do bitcoin nos ultimos 7 dias?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-chart-fallback-001");
  assert.match(body.data.answer, /Framework institucional SMC para Bitcoin/);
  assert.match(body.data.answer, /Leitura SMC & Wyckoff:/);
  assert.match(body.data.answer, /Confluencia SMC:/);
  assert.match(body.data.answer, /Cenario Bull:/);
  assert.match(body.data.answer, /Cenario Bear:/);
  assert.match(body.data.answer, /Gestao de risco dinamica/);
  assert.doesNotMatch(body.data.answer, /Nao posso fornecer recomendacoes/);
});

void it("POST /v1/copilot/chat aplica fallback de grafico live respeitando broker da mensagem", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  let openRouterCalls = 0;
  let bybitTickerCalls = 0;
  let bybitKlineCalls = 0;
  let binanceCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/chat/completions")) {
      openRouterCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "Sou um copiloto financeiro focado em dados e operacao. Nao posso fornecer recomendacao de investimento.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-chart-live-broker-fallback-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 19,
              prompt_tokens: 30,
              total_tokens: 49,
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

    if (requestUrl.includes("api.bybit.com/v5/market/tickers") && requestUrl.includes("symbol=BTCUSDT")) {
      bybitTickerCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            result: {
              list: [
                {
                  lastPrice: "67120.45",
                  symbol: "BTCUSDT",
                  turnover24h: "1934000000",
                  price24hPcnt: "0.0287",
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

    if (requestUrl.includes("api.bybit.com/v5/market/kline") && requestUrl.includes("symbol=BTCUSDT")) {
      bybitKlineCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            result: {
              list: [
                ["1712000000000", "66210", "66400", "66110", "66320", "1200"],
                ["1712003600000", "66320", "66500", "66280", "66470", "1320"],
                ["1712007200000", "66470", "66720", "66410", "66680", "1450"],
                ["1712010800000", "66680", "66910", "66600", "66840", "1510"],
                ["1712014400000", "66840", "67150", "66790", "67090", "1630"],
                ["1712018000000", "67090", "67210", "66980", "67120", "1710"],
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

    if (requestUrl.includes("api.binance.com")) {
      binanceCalls += 1;
      return Promise.reject(new Error(`Binance endpoint should not be called: ${requestUrl}`));
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "POST",
    payload: {
      message: "No grafico ao vivo da Bybit para bitcoin, qual leitura tecnica agora?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 1);
  assert.equal(bybitTickerCalls, 1);
  assert.equal(bybitKlineCalls, 1);
  assert.equal(binanceCalls, 0);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-chart-live-broker-fallback-001");
  assert.match(body.data.answer, /modo live/);
  assert.match(body.data.answer, /provider bybit/);
  assert.match(body.data.answer, /Leitura SMC & Wyckoff:/);
  assert.match(body.data.answer, /Confluencia SMC:/);
  assert.match(body.data.answer, /Cenario Bull:/);
});

void it("POST /v1/copilot/chat aplica fallback local para radar de airdrops", async () => {
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
                  content: "Nao tenho informacoes suficientes sobre airdrops no momento.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-airdrop-fallback-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 15,
              prompt_tokens: 24,
              total_tokens: 39,
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

    if (requestUrl.includes("airdrops.io")) {
      return Promise.resolve(
        new Response(
          `<a href="/base-quest-airdrop">Base Quest Airdrop campaign</a><p>Bridge + swap + points</p>`,
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
          `<a href="/zksync-retroactive-airdrop">zkSync Retroactive Airdrop</a>`,
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
              name: "Orbiter",
              tvl: 98000000,
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

    if (requestUrl.includes("/search/trending")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            coins: [
              {
                item: {
                  id: "orbiter-finance",
                  market_cap_rank: 230,
                  name: "Orbiter Finance",
                  symbol: "OBT",
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
    method: "POST",
    payload: {
      message: "Quais airdrops estao quentes essa semana em base e zksync?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-airdrop-fallback-001");
  assert.match(body.data.answer, /Radar de airdrops \(multi-fonte/);
  assert.match(body.data.answer, /Cobertura de fontes:/);
  assert.match(body.data.answer, /Base/);
  assert.match(body.data.answer, /score/);
  assert.doesNotMatch(body.data.answer, /Nao tenho informacoes suficientes sobre airdrops/);
});

void it("POST /v1/copilot/chat nao usa template de cotacao quando pedido e analise de airdrop em Solana", async () => {
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
                  content:
                    "Analise tecnica objetiva de Solana. Preco atual, EMA rapida e EMA lenta apontam alta.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-airdrop-misroute-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 20,
              prompt_tokens: 32,
              total_tokens: 52,
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

    if (requestUrl.includes("airdrops.io")) {
      return Promise.resolve(
        new Response(
          `<a href="/solana-quest-airdrop">Solana Quest Airdrop</a><p>swap + stake + activity</p>`,
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
          `<a href="/solana-retroactive-airdrop">Solana Retroactive Airdrop</a>`,
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
              chain: "Solana",
              gecko_id: null,
              name: "Solana Quest",
              tvl: 42000000,
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

    if (requestUrl.includes("/search/trending")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            coins: [
              {
                item: {
                  id: "solana-quest",
                  market_cap_rank: 321,
                  name: "Solana Quest",
                  symbol: "SQT",
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
    method: "POST",
    payload: {
      message:
        "Analisar um Airdrop na rede Solana em 4 blocos: leitura de momentum, risco de liquidez, elegibilidade e plano de execucao.",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-airdrop-misroute-001");
  assert.match(body.data.answer, /Leitura em 4 blocos para airdrops/);
  assert.match(body.data.answer, /Bloco 1 - Leitura de momentum/);
  assert.match(body.data.answer, /Bloco 2 - Risco de liquidez/);
  assert.match(body.data.answer, /Bloco 3 - Elegibilidade/);
  assert.match(body.data.answer, /Bloco 4 - Plano de execucao/);
  assert.doesNotMatch(body.data.answer, /Analise tecnica objetiva de Solana/);
  assert.doesNotMatch(body.data.answer, /EMA rapida/);
});

void it("POST /v1/copilot/chat executa tool de insights de grafico", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";
  const compliantInstitutionalAnswer = [
    "# Framework institucional SMC para Bitcoin (7 dias, modo delayed)",
    "",
    "## Contexto Quantitativo",
    "- Estrutura com BOS bullish e CHoCH none, com suporte tecnico respeitado.",
    "",
    "## Cenarios Institucionais",
    "### Cenario Bull:",
    "- Probabilidade 64%.",
    "- Gatilho acima de 67200 USD.",
    "- Invalida abaixo de 66700 USD.",
    "- Alvos: TP1 67950 USD | TP2 68640 USD.",
    "### Cenario Bear:",
    "- Probabilidade 36%.",
    "- Gatilho abaixo de 65980 USD.",
    "- Invalida acima de 66480 USD.",
    "- Alvos: TP1 65200 USD | TP2 64480 USD.",
    "",
    "## Gestao de risco dinamica",
    "- Position Size Bull e Position Size Bear definidos pela distancia entre entrada e stop.",
    "- Regra institucional: operar apenas cenarios com relacao risco/retorno minima de 1.5.",
  ].join("\n");

  let openRouterCalls = 0;
  let chartCalls = 0;
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
                          arguments: '{"assetId":"bitcoin","currency":"usd","range":"7d"}',
                          name: "get_crypto_chart_insights",
                        },
                        id: "call_chart_1",
                        type: "function",
                      },
                    ],
                  },
                },
              ],
              id: "gen-tool-chart-001",
              model: "google/gemini-1.5-flash",
              usage: {
                completion_tokens: 21,
                prompt_tokens: 33,
                total_tokens: 54,
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
                  content: compliantInstitutionalAnswer,
                  role: "assistant",
                },
              },
            ],
            id: "gen-tool-chart-002",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 25,
              prompt_tokens: 49,
              total_tokens: 74,
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

    if (requestUrl.includes("api.coingecko.com/api/v3/coins/bitcoin/market_chart")) {
      chartCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            prices: [
              [1712000000000, 66000],
              [1712003600000, 66420],
              [1712007200000, 66650],
              [1712010800000, 66880],
              [1712014400000, 67120],
              [1712018000000, 67340],
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
    method: "POST",
    payload: {
      message: "Analise o grafico de 7 dias do bitcoin.",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 2);
  assert.ok(chartCalls >= 1);
  assert.match(capturedOpenRouterBodies[0] ?? "", /"name":"get_crypto_chart_insights"/);
  assert.match(capturedOpenRouterBodies[1] ?? "", /"name":"get_crypto_chart_insights"/);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.match(body.data.answer, /Framework institucional SMC para Bitcoin/);
  assert.match(body.data.answer, /## Contexto Quantitativo/);
  assert.match(body.data.answer, /## Cenarios Institucionais/);
  assert.match(body.data.answer, /## Gestao de risco dinamica/);
  assert.match(body.data.answer, /Relacao risco\/retorno \(TP1\):/);
  assert.deepEqual(body.data.toolCallsUsed, ["get_crypto_chart_insights"]);
  assert.equal(body.data.responseId, "gen-tool-chart-002");
  assert.equal(body.data.usage.totalTokens, 74);
});

void it("POST /v1/copilot/chat aplica fallback quando probabilidades bull/bear nao somam 100", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  let openRouterCalls = 0;
  let chartCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/chat/completions")) {
      openRouterCalls += 1;

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
                          arguments: '{"assetId":"bitcoin","currency":"usd","range":"7d"}',
                          name: "get_crypto_chart_insights",
                        },
                        id: "call_chart_inconsistent_1",
                        type: "function",
                      },
                    ],
                  },
                },
              ],
              id: "gen-tool-chart-inconsistent-001",
              model: "google/gemini-1.5-flash",
              usage: {
                completion_tokens: 21,
                prompt_tokens: 33,
                total_tokens: 54,
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
                    "Leitura SMC institucional com suporte e resistencia ativos. Cenario Bull: Probabilidade 70%. Gatilho acima de 67.200 USD com TP1 67.950 e TP2 68.640. Cenario Bear: Probabilidade 20%. Gatilho abaixo de 65.980 USD com TP1 65.200 e TP2 64.480. Gestao de risco dinamica com Position Size Bull e Position Size Bear.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-tool-chart-inconsistent-002",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 25,
              prompt_tokens: 49,
              total_tokens: 74,
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

    if (requestUrl.includes("api.coingecko.com/api/v3/coins/bitcoin/market_chart")) {
      chartCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            prices: [
              [1712000000000, 66000],
              [1712003600000, 66420],
              [1712007200000, 66650],
              [1712010800000, 66880],
              [1712014400000, 67120],
              [1712018000000, 67340],
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
    method: "POST",
    payload: {
      message: "Analise o grafico institucional de 7 dias do bitcoin.",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 2);
  assert.ok(chartCalls >= 1);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-tool-chart-inconsistent-002");
  assert.deepEqual(body.data.toolCallsUsed, ["get_crypto_chart_insights"]);
  assert.match(body.data.answer, /Framework institucional SMC para Bitcoin/);
  assert.match(body.data.answer, /Confluencia SMC:/);
  assert.match(body.data.answer, /Cenario Bull:/);
  assert.match(body.data.answer, /Cenario Bear:/);
  assert.match(body.data.answer, /Gestao de risco dinamica/);
  assert.doesNotMatch(body.data.answer, /Probabilidade 70%/);
  assert.doesNotMatch(body.data.answer, /Probabilidade 20%/);
});

void it("POST /v1/copilot/chat aplica fallback quando relacao risco/retorno fica abaixo de 1.5", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  let openRouterCalls = 0;
  let chartCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/chat/completions")) {
      openRouterCalls += 1;

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
                          arguments: '{"assetId":"bitcoin","currency":"usd","range":"7d"}',
                          name: "get_crypto_chart_insights",
                        },
                        id: "call_chart_low_rr_1",
                        type: "function",
                      },
                    ],
                  },
                },
              ],
              id: "gen-tool-chart-low-rr-001",
              model: "google/gemini-1.5-flash",
              usage: {
                completion_tokens: 21,
                prompt_tokens: 33,
                total_tokens: 54,
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
                  content: [
                    "# Framework institucional SMC para Bitcoin (7 dias, modo delayed)",
                    "",
                    "## Contexto Quantitativo",
                    "- Leitura tatica valida no curto prazo.",
                    "",
                    "## Cenarios Institucionais",
                    "### Cenario Bull:",
                    "- Probabilidade 55%.",
                    "- Gatilho acima de 67200 USD.",
                    "- Invalida abaixo de 67000 USD.",
                    "- Alvos: TP1 67400 USD | TP2 67650 USD.",
                    "### Cenario Bear:",
                    "- Probabilidade 45%.",
                    "- Gatilho abaixo de 65980 USD.",
                    "- Invalida acima de 66180 USD.",
                    "- Alvos: TP1 65850 USD | TP2 65640 USD.",
                    "",
                    "## Gestao de risco dinamica",
                    "- Risco tatico curto para execucao rapida.",
                  ].join("\\n"),
                  role: "assistant",
                },
              },
            ],
            id: "gen-tool-chart-low-rr-002",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 25,
              prompt_tokens: 49,
              total_tokens: 74,
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

    if (requestUrl.includes("api.coingecko.com/api/v3/coins/bitcoin/market_chart")) {
      chartCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            prices: [
              [1712000000000, 66000],
              [1712003600000, 66420],
              [1712007200000, 66650],
              [1712010800000, 66880],
              [1712014400000, 67120],
              [1712018000000, 67340],
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
    method: "POST",
    payload: {
      message: "Analise o grafico institucional de 7 dias do bitcoin.",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 2);
  assert.ok(chartCalls >= 1);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-tool-chart-low-rr-002");
  assert.deepEqual(body.data.toolCallsUsed, ["get_crypto_chart_insights"]);
  assert.match(body.data.answer, /Confluencia SMC:/);
  assert.match(body.data.answer, /Relacao risco\/retorno \(TP1\):/);
  assert.match(body.data.answer, /## Checklist de Execucao/);
  assert.doesNotMatch(body.data.answer, /Risco tatico curto para execucao rapida/);
});

void it("POST /v1/copilot/chat aplica fallback live para pergunta de comprar/vender", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  let openRouterCalls = 0;
  let klineCalls = 0;
  let tickerCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/chat/completions")) {
      openRouterCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "Sou um copiloto financeiro focado em dados e operacao. Nao posso fornecer recomendacao de investimento.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-live-fallback-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 19,
              prompt_tokens: 29,
              total_tokens: 48,
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

    if (requestUrl.includes("api.binance.com/api/v3/klines") && requestUrl.includes("symbol=BTCUSDT")) {
      klineCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify([
            [1712000000000, "65100", "65220", "65020", "65170", "1200"],
            [1712000300000, "65170", "65300", "65120", "65240", "1250"],
            [1712000600000, "65240", "65410", "65190", "65350", "1380"],
            [1712000900000, "65350", "65520", "65300", "65460", "1410"],
            [1712001200000, "65460", "65600", "65410", "65520", "1580"],
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

    if (requestUrl.includes("api.binance.com/api/v3/ticker/24hr") && requestUrl.includes("symbol=BTCUSDT")) {
      tickerCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            lastPrice: "65524.2",
            priceChangePercent: "1.96",
            symbol: "BTCUSDT",
            volume: "70210.45",
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
      message: "No grafico ao vivo do bitcoin, vale comprar ou vender hoje?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 1);
  assert.equal(klineCalls, 1);
  assert.equal(tickerCalls, 1);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-live-fallback-001");
  assert.match(body.data.answer, /Sinal base/);
  assert.match(body.data.answer, /modo live/);
  assert.match(body.data.answer, /Confluencia SMC:/);
  assert.match(body.data.answer, /Cenario Bull:/);
  assert.match(body.data.answer, /Position Size Bull/);
  assert.doesNotMatch(body.data.answer, /Nao posso fornecer recomendacao/);
});

void it("POST /v1/copilot/chat aplica fallback de corretora para IQ Option", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  let openRouterCalls = 0;
  let fetchCalls = 0;

  globalThis.fetch = ((input) => {
    fetchCalls += 1;
    const requestUrl = String(input);

    if (requestUrl.includes("/chat/completions")) {
      openRouterCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Nao tenho informacoes suficientes sobre a corretora solicitada.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-broker-fallback-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 14,
              prompt_tokens: 24,
              total_tokens: 38,
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
      message: "A integracao da corretora IQ Option para bitcoin esta funcionando?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 1);
  assert.equal(fetchCalls, 1);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-broker-fallback-001");
  assert.match(body.data.answer, /IQOPTION/);
  assert.match(body.data.answer, /requires_configuration/);
  assert.match(body.data.answer, /bridge privada/);
  assert.doesNotMatch(body.data.answer, /Nao tenho informacoes suficientes/);
});

void it("POST /v1/copilot/chat prioriza DexScreener para responder onde comprar token", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  let openRouterCalls = 0;
  let dexScreenerCalls = 0;
  let tavilyCalls = 0;
  let serperCalls = 0;
  let serpApiCalls = 0;
  let duckDuckGoCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/chat/completions")) {
      openRouterCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Sem mais informacoes sobre esse token no momento.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-passive-dex-where-to-buy-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 16,
              prompt_tokens: 24,
              total_tokens: 40,
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

    if (requestUrl.startsWith("https://api.dexscreener.com/latest/dex/search/")) {
      dexScreenerCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            pairs: [
              {
                baseToken: {
                  address: "0xbase",
                  name: "Base Meme Four",
                  symbol: "BMFOUR",
                },
                chainId: "base",
                dexId: "uniswap",
                liquidity: {
                  usd: 125000,
                },
                pairAddress: "0xabc",
                quoteToken: {
                  symbol: "WETH",
                },
                url: "https://dexscreener.com/base/0xabc",
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

    if (requestUrl.startsWith("https://api.tavily.com/search")) {
      tavilyCalls += 1;
    }

    if (requestUrl.startsWith("https://google.serper.dev/search")) {
      serperCalls += 1;
    }

    if (requestUrl.startsWith("https://serpapi.com/search.json")) {
      serpApiCalls += 1;
    }

    if (requestUrl.startsWith("https://api.duckduckgo.com/?")) {
      duckDuckGoCalls += 1;
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "POST",
    payload: {
      message: "aonde posso comprar a BMFOUR?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 1);
  assert.equal(dexScreenerCalls, 1);
  assert.equal(tavilyCalls, 0);
  assert.equal(serperCalls, 0);
  assert.equal(serpApiCalls, 0);
  assert.equal(duckDuckGoCalls, 0);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-passive-dex-where-to-buy-001");
  assert.match(body.data.answer, /DexScreener \(API on-chain em tempo real\)/);
  assert.match(body.data.answer, /Voce pode comprar BMFOUR na Uniswap \(Rede Base\)\./);
  assert.doesNotMatch(body.data.answer, /pesquise no google/i);
});

void it("POST /v1/copilot/chat aplica fallback de where-to-buy e bloqueia cotacao alucinada de ativo nao relacionado", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";
  mutableEnv.WEB_SEARCH_PROVIDER_STRATEGY = "tavily_then_serper";
  mutableEnv.WEB_SEARCH_TAVILY_API_KEY = "tvly-test-key-1234567890";

  let openRouterCalls = 0;
  let dexScreenerCalls = 0;
  let tavilyCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/chat/completions")) {
      openRouterCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "Chainlink cotado a US$ 16.31, com viés altista e suporte em US$ 15.80.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-where-buy-misroute-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 18,
              prompt_tokens: 29,
              total_tokens: 47,
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

    if (requestUrl.startsWith("https://api.dexscreener.com/latest/dex/search/")) {
      dexScreenerCalls += 1;

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

    if (requestUrl.startsWith("https://api.tavily.com/search")) {
      tavilyCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              {
                content: "ROBOTMONEY token listings and trading references.",
                title: "ROBOTMONEY listing references",
                url: "https://dexscreener.com/search?q=robotmoney",
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
    method: "POST",
    payload: {
      message: "Onde compro a ROBOTMONEY?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 1);
  assert.equal(dexScreenerCalls, 1);
  assert.equal(tavilyCalls, 1);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-where-buy-misroute-001");
  assert.match(body.data.answer, /Pesquisa global em tempo real para ROBOTMONEY/);
  assert.match(body.data.answer, /Provider usado: tavily/);
  assert.doesNotMatch(body.data.answer, /Chainlink cotado/);
  assert.doesNotMatch(body.data.answer, /US\$ 16\.31/);
});

void it("POST /v1/copilot/chat usa busca web global quando DexScreener nao encontra listing", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";
  mutableEnv.WEB_SEARCH_PROVIDER_STRATEGY = "tavily_then_serper";
  mutableEnv.WEB_SEARCH_TAVILY_API_KEY = "tvly-test-key-1234567890";

  let openRouterCalls = 0;
  let dexScreenerCalls = 0;
  let tavilyCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/chat/completions")) {
      openRouterCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Sem mais informacoes sobre esse token no momento.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-passive-dex-where-to-buy-002",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 16,
              prompt_tokens: 24,
              total_tokens: 40,
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

    if (requestUrl.startsWith("https://api.dexscreener.com/latest/dex/search/")) {
      dexScreenerCalls += 1;

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

    if (requestUrl.startsWith("https://api.tavily.com/search")) {
      tavilyCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              {
                content: "Base Meme Four listing and token references.",
                title: "Base Meme Four listing",
                url: "https://www.coingecko.com/en/coins/base-meme-four",
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
    method: "POST",
    payload: {
      message: "aonde posso comprar BMFOUR?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 1);
  assert.equal(dexScreenerCalls, 1);
  assert.equal(tavilyCalls, 1);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-passive-dex-where-to-buy-002");
  assert.match(body.data.answer, /Pesquisa global em tempo real/);
  assert.match(body.data.answer, /Provider usado: tavily/);
});

void it("POST /v1/copilot/chat recupera contrato na web e reconsulta DexScreener automaticamente", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";
  mutableEnv.WEB_SEARCH_PROVIDER_STRATEGY = "tavily_then_serper";
  mutableEnv.WEB_SEARCH_TAVILY_API_KEY = "tvly-test-key-1234567890";

  let openRouterCalls = 0;
  let dexScreenerCalls = 0;
  let tavilyCalls = 0;
  const recoveredContractAddress = "0x1234567890abcdef1234567890abcdef12345678";

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/chat/completions")) {
      openRouterCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Sem mais informacoes sobre esse token no momento.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-detective-contract-recovery-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 18,
              prompt_tokens: 28,
              total_tokens: 46,
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

    if (requestUrl.startsWith("https://api.dexscreener.com/latest/dex/search/")) {
      dexScreenerCalls += 1;
      const query = new URL(requestUrl).searchParams.get("q")?.toLowerCase() ?? "";

      if (query.includes(recoveredContractAddress)) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              pairs: [
                {
                  baseToken: {
                    address: recoveredContractAddress,
                    name: "Base Meme Four",
                    symbol: "BMFOUR",
                  },
                  chainId: "base",
                  dexId: "uniswap",
                  liquidity: {
                    usd: 210000,
                  },
                  pairAddress: "0xpaircontract001",
                  quoteToken: {
                    symbol: "WETH",
                  },
                  url: "https://dexscreener.com/base/0xpaircontract001",
                  volume: {
                    h24: 145000,
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

    if (requestUrl.startsWith("https://api.tavily.com/search")) {
      tavilyCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              {
                content: `BMFOUR contract on Base: ${recoveredContractAddress}`,
                title: "BMFOUR contract on Base",
                url: `https://www.geckoterminal.com/base/tokens/${recoveredContractAddress}`,
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
    method: "POST",
    payload: {
      message: "aonde posso comprar BMFOUR hoje?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 1);
  assert.equal(dexScreenerCalls, 2);
  assert.equal(tavilyCalls, 1);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-detective-contract-recovery-001");
  assert.match(body.data.answer, /Encontrei os detalhes da BMFOUR atraves de uma busca em tempo real/);
  assert.match(body.data.answer, /Contrato identificado: 0x1234567890abcdef1234567890abcdef12345678/);
  assert.doesNotMatch(body.data.answer, /Provider usado:/);
});

void it("POST /v1/copilot/chat usa link enviado no historico para recuperar contrato e evitar web extra", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";
  mutableEnv.WEB_SEARCH_PROVIDER_STRATEGY = "tavily_then_serper";
  mutableEnv.WEB_SEARCH_TAVILY_API_KEY = "tvly-test-key-1234567890";

  const sessionId = `sessao_detective_link_${Date.now()}`;
  const historyContractAddress = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  let openRouterCalls = 0;
  let dexScreenerCalls = 0;
  let tavilyCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/chat/completions")) {
      openRouterCalls += 1;
      const answer =
        openRouterCalls === 1
          ? "Link registrado. Vou usar essa referencia nas proximas respostas."
          : "Sem mais informacoes sobre esse token no momento.";

      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: answer,
                  role: "assistant",
                },
              },
            ],
            id: `gen-detective-history-link-${openRouterCalls}`,
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 20,
              prompt_tokens: 31,
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

    if (requestUrl.startsWith("https://api.dexscreener.com/latest/dex/search/")) {
      dexScreenerCalls += 1;
      const query = new URL(requestUrl).searchParams.get("q")?.toLowerCase() ?? "";

      if (query.includes(historyContractAddress)) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              pairs: [
                {
                  baseToken: {
                    address: historyContractAddress,
                    name: "History Meme Four",
                    symbol: "HMF",
                  },
                  chainId: "base",
                  dexId: "aerodrome",
                  liquidity: {
                    usd: 99000,
                  },
                  pairAddress: "0xpairhistory001",
                  quoteToken: {
                    symbol: "USDC",
                  },
                  url: "https://dexscreener.com/base/0xpairhistory001",
                  volume: {
                    h24: 52000,
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

    if (requestUrl.startsWith("https://api.tavily.com/search")) {
      tavilyCalls += 1;
      return Promise.reject(new Error("Tavily nao deveria ser chamado neste cenario"));
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const firstResponse = await app.inject({
    method: "POST",
    payload: {
      message: `Guarde este link oficial: https://dexscreener.com/base/${historyContractAddress}`,
      sessionId,
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(firstResponse.statusCode, 200);

  const secondResponse = await app.inject({
    method: "POST",
    payload: {
      message: "aonde posso comprar esse token?",
      sessionId,
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(secondResponse.statusCode, 200);
  assert.equal(openRouterCalls, 2);
  assert.equal(dexScreenerCalls, 0);
  assert.equal(tavilyCalls, 0);

  const body = secondResponse.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-detective-history-link-2");
  assert.match(body.data.answer, /Nao foi possivel extrair ticker oficial ou contract address/);
  assert.match(body.data.answer, /Envie somente o ticker/);
});

void it("POST /v1/copilot/chat evita resposta passiva com busca global para onde comprar", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";
  mutableEnv.WEB_SEARCH_PROVIDER_STRATEGY = "tavily_then_serper";
  mutableEnv.WEB_SEARCH_TAVILY_API_KEY = "tvly-test-key-1234567890";

  let openRouterCalls = 0;
  let tavilyCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/chat/completions")) {
      openRouterCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "BMFOUR parece um projeto de meme. Sem mais informacoes, e dificil dizer exatamente onde comprar.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-passive-broker-001",
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

    if (requestUrl.startsWith("https://api.tavily.com/search")) {
      tavilyCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              {
                content: "Base Meme Four (BMFOUR) market page with exchange pairs and liquidity references.",
                title: "Base Meme Four (BMFOUR)",
                url: "https://www.coingecko.com/en/coins/base-meme-four",
              },
              {
                content: "BMFOUR pool on Base network with trading activity and liquidity metrics.",
                title: "BMFOUR pool on Base",
                url: "https://www.geckoterminal.com/base/pools/0xabc",
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
    method: "POST",
    payload: {
      message: "aonde posso comprar a BMFOUR?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 1);
  assert.equal(tavilyCalls, 1);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-passive-broker-001");
  assert.match(body.data.answer, /Pesquisa global em tempo real/);
  assert.match(body.data.answer, /Fontes verificadas agora/);
  assert.doesNotMatch(body.data.answer, /pesquise no google/i);
  assert.doesNotMatch(body.data.answer, /dificil dizer/i);
});

void it("POST /v1/copilot/chat executa tool de busca web global", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";
  mutableEnv.WEB_SEARCH_PROVIDER_STRATEGY = "tavily_then_serper";
  mutableEnv.WEB_SEARCH_TAVILY_API_KEY = "tvly-test-key-1234567890";

  let openRouterCalls = 0;
  let tavilyCalls = 0;
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
                          arguments: '{"focus":"where_to_buy","maxResults":5,"query":"BMFOUR"}',
                          name: "search_web_realtime",
                        },
                        id: "call_search_web_1",
                        type: "function",
                      },
                    ],
                  },
                },
              ],
              id: "gen-tool-web-001",
              model: "google/gemini-1.5-flash",
              usage: {
                completion_tokens: 21,
                prompt_tokens: 34,
                total_tokens: 55,
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
                    "Onde comprar BMFOUR: voce pode comprar em pools monitoradas na Base, com fontes verificadas de listagem e liquidez.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-tool-web-002",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 23,
              prompt_tokens: 47,
              total_tokens: 70,
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

    if (requestUrl.startsWith("https://api.tavily.com/search")) {
      tavilyCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              {
                content: "BMFOUR listing and market references.",
                title: "Base Meme Four (BMFOUR)",
                url: "https://www.coingecko.com/en/coins/base-meme-four",
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
    method: "POST",
    payload: {
      message: "Onde comprar BMFOUR hoje?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 2);
  assert.equal(tavilyCalls, 1);
  assert.match(capturedOpenRouterBodies[0] ?? "", /"name":"search_web_realtime"/);
  assert.match(capturedOpenRouterBodies[1] ?? "", /"name":"search_web_realtime"/);
  assert.match(capturedOpenRouterBodies[1] ?? "", /"role":"tool"/);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(
    body.data.answer,
    "Onde comprar BMFOUR: voce pode comprar em pools monitoradas na Base, com fontes verificadas de listagem e liquidez.",
  );
  assert.deepEqual(body.data.toolCallsUsed, ["search_web_realtime"]);
  assert.equal(body.data.responseId, "gen-tool-web-002");
  assert.equal(body.data.usage.totalTokens, 70);
});

void it("POST /v1/copilot/chat prioriza Tavily quando configurado e ordena fontes por confianca", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";
  mutableEnv.WEB_SEARCH_PROVIDER_STRATEGY = "tavily_then_serper";
  mutableEnv.WEB_SEARCH_TAVILY_API_KEY = "tvly-test-key-1234567890";

  let openRouterCalls = 0;
  let tavilyCalls = 0;
  let duckDuckGoCalls = 0;
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
                          arguments: '{"focus":"where_to_buy","maxResults":5,"query":"BMFOUR"}',
                          name: "search_web_realtime",
                        },
                        id: "call_search_web_tavily_1",
                        type: "function",
                      },
                    ],
                  },
                },
              ],
              id: "gen-tool-web-tavily-001",
              model: "google/gemini-1.5-flash",
              usage: {
                completion_tokens: 22,
                prompt_tokens: 33,
                total_tokens: 55,
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
                  content: "Onde comprar BMFOUR: fontes verificadas no Tavily priorizam listagens confiaveis por qualidade de origem.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-tool-web-tavily-002",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 19,
              prompt_tokens: 49,
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

    if (requestUrl.startsWith("https://api.tavily.com/search")) {
      tavilyCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              {
                content: "Rumor thread sobre BMFOUR no X.",
                title: "BMFOUR thread",
                url: "https://x.com/someuser/status/123",
              },
              {
                content: "Official listing and market references for BMFOUR.",
                title: "Base Meme Four (BMFOUR) - CoinGecko",
                url: "https://www.coingecko.com/en/coins/base-meme-four",
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

    if (requestUrl.startsWith("https://api.duckduckgo.com/?")) {
      duckDuckGoCalls += 1;
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "POST",
    payload: {
      message: "Onde comprar BMFOUR com fontes confiaveis?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 2);
  assert.equal(tavilyCalls, 1);
  assert.equal(duckDuckGoCalls, 0);
  assert.match(capturedOpenRouterBodies[1] ?? "", /provider\\":\\"tavily/);
  assert.match(capturedOpenRouterBodies[1] ?? "", /confidenceScore/);

  const rankedToolPayload = capturedOpenRouterBodies[1] ?? "";
  const firstCoingeckoOccurrence = rankedToolPayload.indexOf("coingecko.com");
  const firstXOccurrence = rankedToolPayload.indexOf("x.com");

  assert.ok(firstCoingeckoOccurrence >= 0);
  assert.ok(firstXOccurrence >= 0);
  assert.ok(firstCoingeckoOccurrence < firstXOccurrence);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-tool-web-tavily-002");
  assert.deepEqual(body.data.toolCallsUsed, ["search_web_realtime"]);
});

void it("POST /v1/copilot/chat aplica matriz contextual e prioriza fontes de equities sobre cripto", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";
  mutableEnv.WEB_SEARCH_PROVIDER_STRATEGY = "tavily_then_serper";
  mutableEnv.WEB_SEARCH_TAVILY_API_KEY = "tvly-test-key-1234567890";

  let openRouterCalls = 0;
  let tavilyCalls = 0;
  let duckDuckGoCalls = 0;
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
                          arguments: '{"focus":"general","maxResults":5,"query":"AAPL"}',
                          name: "search_web_realtime",
                        },
                        id: "call_search_web_equities_1",
                        type: "function",
                      },
                    ],
                  },
                },
              ],
              id: "gen-tool-web-equities-001",
              model: "google/gemini-1.5-flash",
              usage: {
                completion_tokens: 22,
                prompt_tokens: 36,
                total_tokens: 58,
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
                  content: "Resumo de equities atualizado com fontes de maior confianca para earnings.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-tool-web-equities-002",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 18,
              prompt_tokens: 44,
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
    }

    if (requestUrl.startsWith("https://api.tavily.com/search")) {
      tavilyCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              {
                content: "AAPL-like token sentiment with speculative rumor and unverified chatter.",
                title: "AAPL token tracker",
                url: "https://www.coingecko.com/en/coins/aapl-token",
              },
              {
                content: "Apple quarterly earnings official update with forward guidance from management.",
                title: "Apple earnings beat expectations",
                url: "https://www.reuters.com/markets/us/apple-earnings-update-2026-04-05/",
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

    if (requestUrl.startsWith("https://api.duckduckgo.com/?")) {
      duckDuckGoCalls += 1;
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "POST",
    payload: {
      message: "Atualize Apple earnings e guidance do ultimo trimestre.",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 2);
  assert.equal(tavilyCalls, 1);
  assert.equal(duckDuckGoCalls, 0);

  const secondRequestPayload = JSON.parse(capturedOpenRouterBodies[1] ?? "{}") as {
    messages?: Array<{
      content?: string;
      role?: string;
    }>;
  };

  const toolMessages = (secondRequestPayload.messages ?? []).filter((messageItem) => messageItem.role === "tool");

  const parsedToolPayloads = toolMessages
    .map((messageItem) => {
      if (typeof messageItem.content !== "string") {
        return null;
      }

      try {
        return JSON.parse(messageItem.content) as {
          data?: {
            provider?: string;
            results?: Array<{
              domain?: string;
            }>;
          };
          ok?: boolean;
        };
      } catch {
        return null;
      }
    })
    .filter(
      (
        toolPayload,
      ): toolPayload is {
        data?: {
          provider?: string;
          results?: Array<{ domain?: string }>;
        };
        ok?: boolean;
      } =>
      toolPayload !== null,
    );

  const webSearchToolPayload = parsedToolPayloads.find(
    (toolPayload) => toolPayload.data?.provider === "tavily" && Array.isArray(toolPayload.data.results),
  );

  assert.ok(webSearchToolPayload);

  const rankedDomains = (webSearchToolPayload?.data?.results ?? []).map((resultItem) => resultItem.domain ?? "");
  const reutersRank = rankedDomains.indexOf("reuters.com");
  const coingeckoRank = rankedDomains.indexOf("coingecko.com");

  assert.ok(reutersRank >= 0);
  assert.ok(coingeckoRank >= 0);
  assert.ok(reutersRank < coingeckoRank);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-tool-web-equities-002");
  assert.deepEqual(body.data.toolCallsUsed, ["search_web_realtime"]);
});

void it("POST /v1/copilot/chat usa Serper como segunda opcao quando Tavily falha", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";
  mutableEnv.WEB_SEARCH_PROVIDER_STRATEGY = "tavily_then_serper_then_serpapi";
  mutableEnv.WEB_SEARCH_TAVILY_API_KEY = "tvly-test-key-1234567890";
  mutableEnv.WEB_SEARCH_SERPER_API_KEY = "serper-test-key-1234567890";
  mutableEnv.WEB_SEARCH_SERPAPI_API_KEY = "serpapi-test-key-1234567890";

  let openRouterCalls = 0;
  let tavilyCalls = 0;
  let serperCalls = 0;
  let serpApiCalls = 0;
  let duckDuckGoCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/chat/completions")) {
      openRouterCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Sem mais informacoes sobre esse token no momento.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-serper-fallback-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 15,
              prompt_tokens: 26,
              total_tokens: 41,
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

    if (requestUrl.startsWith("https://api.tavily.com/search")) {
      tavilyCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: "temporary unavailable",
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 503,
          },
        ),
      );
    }

    if (requestUrl.startsWith("https://google.serper.dev/search")) {
      serperCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            organic: [
              {
                link: "https://www.coingecko.com/en/coins/base-meme-four",
                snippet: "Base Meme Four listing and token references.",
                title: "Base Meme Four (BMFOUR)",
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

    if (requestUrl.startsWith("https://serpapi.com/search.json")) {
      serpApiCalls += 1;
    }

    if (requestUrl.startsWith("https://api.duckduckgo.com/?")) {
      duckDuckGoCalls += 1;
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "POST",
    payload: {
      message: "aonde posso comprar BMFOUR?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 1);
  assert.equal(tavilyCalls, 2);
  assert.equal(serperCalls, 1);
  assert.equal(serpApiCalls, 0);
  assert.equal(duckDuckGoCalls, 0);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-serper-fallback-001");
  assert.match(body.data.answer, /Provider usado: serper/);
});

void it("POST /v1/copilot/chat usa SerpAPI como terceira opcao quando Tavily e Serper falham", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";
  mutableEnv.WEB_SEARCH_PROVIDER_STRATEGY = "tavily_then_serper_then_serpapi";
  mutableEnv.WEB_SEARCH_TAVILY_API_KEY = "tvly-test-key-1234567890";
  mutableEnv.WEB_SEARCH_SERPER_API_KEY = "serper-test-key-1234567890";
  mutableEnv.WEB_SEARCH_SERPAPI_API_KEY = "serpapi-test-key-1234567890";

  let openRouterCalls = 0;
  let tavilyCalls = 0;
  let serperCalls = 0;
  let serpApiCalls = 0;
  let duckDuckGoCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/chat/completions")) {
      openRouterCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Sem mais informacoes sobre esse token no momento.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-serpapi-fallback-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 15,
              prompt_tokens: 26,
              total_tokens: 41,
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

    if (requestUrl.startsWith("https://api.tavily.com/search")) {
      tavilyCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: "temporary unavailable",
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 503,
          },
        ),
      );
    }

    if (requestUrl.startsWith("https://google.serper.dev/search")) {
      serperCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: "quota exceeded",
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 503,
          },
        ),
      );
    }

    if (requestUrl.startsWith("https://serpapi.com/search.json")) {
      serpApiCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            organic_results: [
              {
                link: "https://www.coingecko.com/en/coins/base-meme-four",
                snippet: "Base Meme Four listing and token references.",
                title: "Base Meme Four (BMFOUR)",
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

    if (requestUrl.startsWith("https://api.duckduckgo.com/?")) {
      duckDuckGoCalls += 1;
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "POST",
    payload: {
      message: "aonde posso comprar BMFOUR?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 1);
  assert.ok(tavilyCalls >= 2);
  assert.ok(serperCalls >= 2);
  assert.ok(serpApiCalls >= 1);
  assert.equal(duckDuckGoCalls, 0);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-serpapi-fallback-001");
  assert.match(body.data.answer, /Provider usado: serpapi/);
});

void it("POST /v1/copilot/chat faz fallback para Serper quando Tavily falha", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";
  mutableEnv.WEB_SEARCH_PROVIDER_STRATEGY = "tavily_then_serper";
  mutableEnv.WEB_SEARCH_TAVILY_API_KEY = "tvly-test-key-1234567890";
  mutableEnv.WEB_SEARCH_SERPER_API_KEY = "serper-test-key-1234567890";

  let openRouterCalls = 0;
  let tavilyCalls = 0;
  let serperCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("/chat/completions")) {
      openRouterCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Sem mais informacoes sobre esse token no momento.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-passive-broker-fallback-provider-001",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 15,
              prompt_tokens: 26,
              total_tokens: 41,
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

    if (requestUrl.startsWith("https://api.tavily.com/search")) {
      tavilyCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: "temporary unavailable",
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 503,
          },
        ),
      );
    }

    if (requestUrl.startsWith("https://google.serper.dev/search")) {
      serperCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            organic: [
              {
                link: "https://www.coingecko.com/en/coins/base-meme-four",
                snippet: "Base Meme Four listing and token references.",
                title: "Base Meme Four (BMFOUR)",
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
    method: "POST",
    payload: {
      message: "aonde posso comprar BMFOUR?",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 1);
  assert.ok(tavilyCalls >= 2);
  assert.ok(serperCalls >= 1);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.responseId, "gen-passive-broker-fallback-provider-001");
  assert.match(body.data.answer, /Provider usado: serper/);
  assert.match(body.data.answer, /Fontes verificadas agora/);
});

void it("POST /v1/copilot/chat executa tool de cotacao por corretora", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  let openRouterCalls = 0;
  let tickerCalls = 0;
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
                          arguments: '{"broker":"binance","assetId":"bitcoin"}',
                          name: "get_broker_live_quote",
                        },
                        id: "call_broker_1",
                        type: "function",
                      },
                    ],
                  },
                },
              ],
              id: "gen-tool-broker-001",
              model: "google/gemini-1.5-flash",
              usage: {
                completion_tokens: 18,
                prompt_tokens: 27,
                total_tokens: 45,
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
                  content: "Binance responde com cotacao ao vivo e IQ Option permanece em fase de configuracao.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-tool-broker-002",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 22,
              prompt_tokens: 41,
              total_tokens: 63,
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

    if (requestUrl.includes("api.binance.com/api/v3/ticker/24hr") && requestUrl.includes("symbol=BTCUSDT")) {
      tickerCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            lastPrice: "65650.7",
            priceChangePercent: "1.62",
            symbol: "BTCUSDT",
            volume: "70500.2",
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
      message: "Traga a cotacao da corretora Binance para bitcoin.",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 2);
  assert.equal(tickerCalls, 1);
  assert.match(capturedOpenRouterBodies[0] ?? "", /"name":"get_broker_live_quote"/);
  assert.match(capturedOpenRouterBodies[1] ?? "", /"name":"get_broker_live_quote"/);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(
    body.data.answer,
    "Binance responde com cotacao ao vivo e IQ Option permanece em fase de configuracao.",
  );
  assert.deepEqual(body.data.toolCallsUsed, ["get_broker_live_quote"]);
  assert.equal(body.data.responseId, "gen-tool-broker-002");
  assert.equal(body.data.usage.totalTokens, 63);
});

void it("POST /v1/copilot/chat executa snapshot financeiro global com tool calling", async () => {
  mutableEnv.OPENROUTER_API_KEY = "sk-or-v1-test-key-configured-123456";

  let openRouterCalls = 0;
  let yahooCalls = 0;
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
                          arguments: '{"preset":"global"}',
                          name: "get_financial_market_snapshot",
                        },
                        id: "call_financial_snapshot_1",
                        type: "function",
                      },
                    ],
                  },
                },
              ],
              id: "gen-tool-financial-001",
              model: "google/gemini-1.5-flash",
              usage: {
                completion_tokens: 20,
                prompt_tokens: 30,
                total_tokens: 50,
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
                    "Panorama global: bolsas em alta moderada, juros estaveis e commodities mistas no intraday.",
                  role: "assistant",
                },
              },
            ],
            id: "gen-tool-financial-002",
            model: "google/gemini-1.5-flash",
            usage: {
              completion_tokens: 23,
              prompt_tokens: 46,
              total_tokens: 69,
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

    if (requestUrl.includes("query1.finance.yahoo.com/v7/finance/quote")) {
      yahooCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            quoteResponse: {
              error: null,
              result: [
                {
                  currency: "USD",
                  longName: "S&P 500",
                  marketState: "REGULAR",
                  regularMarketChangePercent: 0.9,
                  regularMarketPrice: 5210,
                  symbol: "^GSPC",
                },
                {
                  currency: "USD",
                  longName: "NASDAQ Composite",
                  marketState: "REGULAR",
                  regularMarketChangePercent: 1.2,
                  regularMarketPrice: 16520,
                  symbol: "^IXIC",
                },
                {
                  currency: "USD",
                  longName: "Crude Oil",
                  marketState: "REGULAR",
                  regularMarketChangePercent: -0.4,
                  regularMarketPrice: 80.4,
                  symbol: "CL=F",
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
    method: "POST",
    payload: {
      message: "Me traga um panorama global com indices, cambio e commodities.",
      temperature: 0.1,
    },
    url: "/v1/copilot/chat",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(openRouterCalls, 2);
  assert.equal(yahooCalls, 1);
  assert.match(capturedOpenRouterBodies[0] ?? "", /"name":"get_financial_market_snapshot"/);
  assert.match(capturedOpenRouterBodies[1] ?? "", /"name":"get_financial_market_snapshot"/);

  const body = response.json<ApiSuccessResponse<CopilotChatResponse>>();
  assert.equal(body.status, "success");
  assert.equal(
    body.data.answer,
    "Panorama global: bolsas em alta moderada, juros estaveis e commodities mistas no intraday.",
  );
  assert.deepEqual(body.data.toolCallsUsed, ["get_financial_market_snapshot"]);
  assert.equal(body.data.responseId, "gen-tool-financial-002");
  assert.equal(body.data.usage.totalTokens, 69);
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