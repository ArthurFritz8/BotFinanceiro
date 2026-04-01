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

const openRouterToolCallSchema = z.object({
  function: z.object({
    arguments: z.string(),
    name: z.string().trim().min(1),
  }),
  id: z.string().trim().min(1),
  type: z.literal("function"),
});

const openRouterResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: openRouterMessageContentSchema.optional(),
          role: z.string(),
          tool_calls: z.array(openRouterToolCallSchema).optional(),
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

const parsedToolArgumentsSchema = z.record(z.string(), z.unknown());

type OpenRouterMessageContent = z.infer<typeof openRouterMessageContentSchema>;
type OpenRouterToolCall = z.infer<typeof openRouterToolCallSchema>;

interface OpenRouterRequestMessageSystem {
  content: string;
  role: "system";
}

interface OpenRouterRequestMessageUser {
  content: string;
  role: "user";
}

interface OpenRouterRequestMessageAssistant {
  content: OpenRouterMessageContent;
  role: "assistant";
  tool_calls?: OpenRouterToolCall[];
}

interface OpenRouterRequestMessageTool {
  content: string;
  name: string;
  role: "tool";
  tool_call_id: string;
}

type OpenRouterRequestMessage =
  | OpenRouterRequestMessageAssistant
  | OpenRouterRequestMessageSystem
  | OpenRouterRequestMessageTool
  | OpenRouterRequestMessageUser;

export interface OpenRouterToolDefinition<TInputSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  description: string;
  inputSchema: TInputSchema;
  name: string;
  parameters: Record<string, unknown>;
  run: (input: z.infer<TInputSchema>) => Promise<unknown>;
}

function isRetryableStatusCode(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

function extractAssistantContent(content: OpenRouterMessageContent): string {
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

function buildOpenRouterHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "X-Title": env.OPENROUTER_APP_NAME,
  };

  if (env.OPENROUTER_APP_URL.length > 0) {
    headers["HTTP-Referer"] = env.OPENROUTER_APP_URL;
  }

  return headers;
}

function parseToolArguments(argumentsJson: string): Record<string, unknown> {
  try {
    const rawParsedArguments = JSON.parse(argumentsJson) as unknown;
    const parsedArguments = parsedToolArgumentsSchema.safeParse(rawParsedArguments);

    if (!parsedArguments.success) {
      throw new Error("Tool arguments must be a JSON object");
    }

    return parsedArguments.data;
  } catch (error) {
    throw new AppError({
      code: "OPENROUTER_TOOL_ARGUMENTS_INVALID",
      details: {
        cause: error,
      },
      message: "OpenRouter tool arguments are invalid JSON",
      statusCode: 502,
    });
  }
}

function stringifyToolResult(result: unknown): string {
  try {
    return JSON.stringify(result);
  } catch {
    return JSON.stringify({
      error: {
        code: "TOOL_RESULT_SERIALIZATION_ERROR",
        message: "Tool result could not be serialized",
      },
      ok: false,
    });
  }
}

export interface OpenRouterChatCompletion {
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

export class OpenRouterChatAdapter {
  public async createCompletion(input: z.input<typeof openRouterChatInputSchema>): Promise<OpenRouterChatCompletion> {
    return this.createCompletionWithTools(input, []);
  }

  public async createCompletionWithTools(
    input: z.input<typeof openRouterChatInputSchema>,
    tools: OpenRouterToolDefinition[],
  ): Promise<OpenRouterChatCompletion> {
    if (env.OPENROUTER_API_KEY.length < 20) {
      throw new AppError({
        code: "OPENROUTER_NOT_CONFIGURED",
        message: "OpenRouter API key is not configured",
        statusCode: 503,
      });
    }

    const parsedInput = openRouterChatInputSchema.parse(input);

    const messages: OpenRouterRequestMessage[] = [];

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

    const usedTools = new Set<string>();
    const maxToolRounds = tools.length > 0 ? 3 : 0;

    for (let round = 0; round <= maxToolRounds; round += 1) {
      const parsedPayload = await this.requestCompletion(messages, parsedInput, tools);

      const firstChoice = parsedPayload.choices[0];

      if (!firstChoice) {
        throw new AppError({
          code: "OPENROUTER_EMPTY_CHOICES",
          message: "OpenRouter returned no choices",
          statusCode: 502,
        });
      }

      const responseMessage = firstChoice.message;
      const toolCalls = responseMessage.tool_calls ?? [];

      if (toolCalls.length === 0) {
        const answer = extractAssistantContent(responseMessage.content ?? "");

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
          model: parsedPayload.model,
          provider: "openrouter",
          responseId: parsedPayload.id,
          toolCallsUsed: [...usedTools],
          usage: {
            completionTokens: parsedPayload.usage?.completion_tokens,
            promptTokens: parsedPayload.usage?.prompt_tokens,
            totalTokens: parsedPayload.usage?.total_tokens,
          },
        };
      }

      if (round >= maxToolRounds) {
        throw new AppError({
          code: "OPENROUTER_TOOL_LOOP_EXCEEDED",
          details: {
            maxToolRounds,
          },
          message: "OpenRouter exceeded maximum tool-calling rounds",
          statusCode: 502,
        });
      }

      messages.push({
        content: responseMessage.content ?? null,
        role: "assistant",
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        const toolResult = await this.executeToolCall(toolCall, tools);

        if (toolResult.executedToolName) {
          usedTools.add(toolResult.executedToolName);
        }

        messages.push({
          content: stringifyToolResult(toolResult.payload),
          name: toolCall.function.name,
          role: "tool",
          tool_call_id: toolCall.id,
        });
      }
    }

    throw new AppError({
      code: "OPENROUTER_TOOL_CALLING_FAILED",
      message: "OpenRouter tool-calling flow failed",
      statusCode: 502,
    });
  }

  private async executeToolCall(
    toolCall: OpenRouterToolCall,
    tools: OpenRouterToolDefinition[],
  ): Promise<{ executedToolName?: string; payload: unknown }> {
    const matchingTool = tools.find((tool) => tool.name === toolCall.function.name);

    if (!matchingTool) {
      return {
        payload: {
          error: {
            code: "TOOL_NOT_ALLOWED",
            message: `Tool ${toolCall.function.name} is not available`,
          },
          ok: false,
        },
      };
    }

    const parsedArguments = parseToolArguments(toolCall.function.arguments);
    const parsedToolInput = matchingTool.inputSchema.safeParse(parsedArguments);

    if (!parsedToolInput.success) {
      return {
        payload: {
          error: {
            code: "TOOL_VALIDATION_ERROR",
            issues: parsedToolInput.error.issues,
            message: "Tool arguments validation failed",
          },
          ok: false,
        },
      };
    }

    try {
      const toolData = await matchingTool.run(parsedToolInput.data);

      return {
        executedToolName: matchingTool.name,
        payload: {
          data: toolData,
          ok: true,
        },
      };
    } catch (error) {
      return {
        payload: {
          error: {
            code: error instanceof AppError ? error.code : "TOOL_EXECUTION_ERROR",
            message: error instanceof Error ? error.message : "Unexpected tool error",
          },
          ok: false,
        },
      };
    }
  }

  private async requestCompletion(
    messages: OpenRouterRequestMessage[],
    input: z.infer<typeof openRouterChatInputSchema>,
    tools: OpenRouterToolDefinition[],
  ): Promise<z.infer<typeof openRouterResponseSchema>> {
    const requestBody: Record<string, unknown> = {
      max_tokens: input.maxTokens,
      messages,
      model: env.OPENROUTER_MODEL,
      temperature: input.temperature,
    };

    if (tools.length > 0) {
      requestBody.tool_choice = "auto";
      requestBody.tools = tools.map((tool) => ({
        function: {
          description: tool.description,
          name: tool.name,
          parameters: tool.parameters,
        },
        type: "function",
      }));
    }

    const requestHeaders = buildOpenRouterHeaders();

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

    return parsedPayload.data;
  }
}