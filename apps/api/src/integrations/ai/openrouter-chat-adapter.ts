import { z } from "zod";

import { env } from "../../shared/config/env.js";
import { AppError } from "../../shared/errors/app-error.js";

const openRouterChatInputSchema = z.object({
  maxTokens: z.number().int().min(1).max(2000).default(500),
  message: z.string().trim().min(1).max(4000),
  systemPrompt: z.string().trim().min(1).max(4000).optional(),
  temperature: z.number().min(0).max(2).default(0.2),
});

const openRouterMessageContentSchema = z.union([
  z.string(),
  z.array(
    z.object({
      text: z.string().optional(),
      type: z.string().optional(),
    }),
  ),
  z.null(),
]);

const openRouterResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: openRouterMessageContentSchema,
          role: z.string(),
        }),
      }),
    )
    .min(1),
  id: z.string(),
  model: z.string(),
  usage: z
    .object({
      completion_tokens: z.number().int().nonnegative().optional(),
      prompt_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

function isRetryableStatusCode(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

function extractAssistantContent(content: z.infer<typeof openRouterMessageContentSchema>): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (content === null) {
    return "";
  }

  const textParts = content
    .map((item) => (typeof item.text === "string" ? item.text.trim() : ""))
    .filter((item) => item.length > 0);

  return textParts.join("\n").trim();
}

export interface OpenRouterChatCompletion {
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

export class OpenRouterChatAdapter {
  public async createCompletion(input: z.input<typeof openRouterChatInputSchema>): Promise<OpenRouterChatCompletion> {
    if (env.OPENROUTER_API_KEY.length < 20) {
      throw new AppError({
        code: "OPENROUTER_NOT_CONFIGURED",
        message: "OpenRouter API key is not configured",
        statusCode: 503,
      });
    }

    const parsedInput = openRouterChatInputSchema.parse(input);

    const messages: Array<{ content: string; role: "system" | "user" }> = [];

    if (parsedInput.systemPrompt) {
      messages.push({
        content: parsedInput.systemPrompt,
        role: "system",
      });
    }

    messages.push({
      content: parsedInput.message,
      role: "user",
    });

    const requestBody = {
      max_tokens: parsedInput.maxTokens,
      messages,
      model: env.OPENROUTER_MODEL,
      temperature: parsedInput.temperature,
    };

    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": env.OPENROUTER_APP_NAME,
    };

    if (env.OPENROUTER_APP_URL.length > 0) {
      requestHeaders["HTTP-Referer"] = env.OPENROUTER_APP_URL;
    }

    let response: Response;

    try {
      response = await fetch(`${env.OPENROUTER_API_BASE_URL}/chat/completions`, {
        body: JSON.stringify(requestBody),
        headers: requestHeaders,
        method: "POST",
        signal: AbortSignal.timeout(env.OPENROUTER_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppError({
        code: "OPENROUTER_UNAVAILABLE",
        details: {
          cause: error,
        },
        message: "OpenRouter request failed",
        statusCode: 503,
      });
    }

    if (!response.ok) {
      const responseText = await response.text();
      const retryable = isRetryableStatusCode(response.status);

      throw new AppError({
        code: "OPENROUTER_BAD_STATUS",
        details: {
          responseBody: responseText.slice(0, 1000),
          responseStatus: response.status,
          retryable,
        },
        message: "OpenRouter returned a non-success status",
        statusCode: retryable ? 503 : 502,
      });
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new AppError({
        code: "OPENROUTER_INVALID_JSON",
        message: "OpenRouter returned invalid JSON",
        statusCode: 502,
      });
    }

    const parsedPayload = openRouterResponseSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new AppError({
        code: "OPENROUTER_SCHEMA_MISMATCH",
        details: {
          issues: parsedPayload.error.issues,
        },
        message: "OpenRouter payload schema mismatch",
        statusCode: 502,
      });
    }

    const firstChoice = parsedPayload.data.choices[0];

    if (!firstChoice) {
      throw new AppError({
        code: "OPENROUTER_EMPTY_CHOICES",
        message: "OpenRouter returned no choices",
        statusCode: 502,
      });
    }

    const answer = extractAssistantContent(firstChoice.message.content);

    if (answer.length === 0) {
      throw new AppError({
        code: "OPENROUTER_EMPTY_RESPONSE",
        message: "OpenRouter returned an empty completion",
        statusCode: 502,
      });
    }

    return {
      answer,
      fetchedAt: new Date().toISOString(),
      model: parsedPayload.data.model,
      provider: "openrouter",
      responseId: parsedPayload.data.id,
      usage: {
        completionTokens: parsedPayload.data.usage?.completion_tokens,
        promptTokens: parsedPayload.data.usage?.prompt_tokens,
        totalTokens: parsedPayload.data.usage?.total_tokens,
      },
    };
  }
}