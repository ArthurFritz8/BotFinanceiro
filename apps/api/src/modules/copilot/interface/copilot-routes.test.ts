import assert from "node:assert/strict";
import { after, beforeEach, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";

const { buildApp } = await import("../../../main/app.js");
const { env } = await import("../../../shared/config/env.js");

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
  usage: {
    completionTokens?: number;
    promptTokens?: number;
    totalTokens?: number;
  };
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
  assert.equal(body.data.usage.totalTokens, 32);
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