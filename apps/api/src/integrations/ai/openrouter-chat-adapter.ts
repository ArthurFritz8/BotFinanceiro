import { z } from "zod";

import { env } from "../../shared/config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { retryWithExponentialBackoff } from "../../shared/resilience/retry-with-backoff.js";

const openRouterConversationMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  role: z.enum(["assistant", "user"]),
});

const openRouterChatInputSchema = z
  .object({
    maxTokens: z.number().int().min(1).max(2000).default(500),
    message: z.string().trim().min(1).max(4000).optional(),
    messages: z.array(openRouterConversationMessageSchema).min(1).max(80).optional(),
    systemPrompt: z.string().trim().min(1).max(4000).optional(),
    temperature: z.number().min(0).max(2).default(0.2),
  })
  .superRefine((value, ctx) => {
    if (typeof value.message === "string" && value.message.trim().length > 0) {
      return;
    }

    if (Array.isArray(value.messages) && value.messages.length > 0) {
      return;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either message or messages must be provided",
      path: ["message"],
    });
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

export interface OpenRouterConversationMessage {
  content: string;
  role: "assistant" | "user";
}

function isRetryableStatusCode(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

interface RetryableErrorDetails {
  promptTokensLimitExceeded?: boolean;
  retryable?: boolean;
}

function hasRetryableFlag(details: unknown): details is RetryableErrorDetails {
  if (typeof details !== "object" || details === null) {
    return false;
  }

  const detailsRecord = details as Record<string, unknown>;
  return typeof detailsRecord.retryable === "boolean";
}

function hasPromptTokensLimitFlag(details: unknown): details is RetryableErrorDetails {
  if (typeof details !== "object" || details === null) {
    return false;
  }

  const detailsRecord = details as Record<string, unknown>;
  return typeof detailsRecord.promptTokensLimitExceeded === "boolean";
}

function toObjectRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  if (value < 0) {
    return undefined;
  }

  return Math.trunc(value);
}

function shouldRetryOpenRouterRequest(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return true;
  }

  if (error.code === "OPENROUTER_UNAVAILABLE") {
    return true;
  }

  if (error.code === "OPENROUTER_BAD_STATUS" && hasRetryableFlag(error.details)) {
    return error.details.retryable === true;
  }

  return false;
}

function shouldFallbackToPromptBudgetMode(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return false;
  }

  if (error.code !== "OPENROUTER_BAD_STATUS") {
    return false;
  }

  if (!hasPromptTokensLimitFlag(error.details)) {
    return false;
  }

  return error.details.promptTokensLimitExceeded === true;
}

function isPromptTokensLimitExceededStatus(responseStatus: number, responseText: string): boolean {
  if (responseStatus !== 402) {
    return false;
  }

  const normalizedResponseText = responseText.toLowerCase();

  return normalizedResponseText.includes("prompt tokens limit exceeded");
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

function buildRequestMessages(
  input: z.infer<typeof openRouterChatInputSchema>,
): OpenRouterRequestMessage[] {
  const messages: OpenRouterRequestMessage[] = [];

  if (input.systemPrompt) {
    messages.push({
      content: input.systemPrompt,
      role: "system",
    });
  }

  const conversationMessages: OpenRouterConversationMessage[] =
    input.messages && input.messages.length > 0
      ? input.messages
      : [
          {
            content: input.message ?? "",
            role: "user",
          },
        ];

  for (const conversationMessage of conversationMessages) {
    if (conversationMessage.role === "assistant") {
      messages.push({
        content: conversationMessage.content,
        role: "assistant",
      });
    } else {
      messages.push({
        content: conversationMessage.content,
        role: "user",
      });
    }
  }

  return messages;
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
    const messages = buildRequestMessages(parsedInput);

    const usedTools = new Set<string>();
    const maxToolRounds = tools.length > 0 ? 3 : 0;
    let warnedPromptBudgetFallback = false;

    for (let round = 0; round <= maxToolRounds; round += 1) {
      const parsedPayload = await this.requestCompletionWithPromptBudgetFallback(
        messages,
        parsedInput,
        tools,
        () => {
          if (warnedPromptBudgetFallback) {
            return;
          }

          warnedPromptBudgetFallback = true;
        },
      );

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

  public async createCompletionStreamWithTools(
    input: z.input<typeof openRouterChatInputSchema>,
    tools: OpenRouterToolDefinition[],
    onChunk: (chunk: string) => void | Promise<void>,
  ): Promise<OpenRouterChatCompletion> {
    if (env.OPENROUTER_API_KEY.length < 20) {
      throw new AppError({
        code: "OPENROUTER_NOT_CONFIGURED",
        message: "OpenRouter API key is not configured",
        statusCode: 503,
      });
    }

    const parsedInput = openRouterChatInputSchema.parse(input);
    const messages = buildRequestMessages(parsedInput);
    const usedTools = new Set<string>();
    const maxToolRounds = tools.length > 0 ? 3 : 0;
    let warnedPromptBudgetFallback = false;

    for (let round = 0; round <= maxToolRounds; round += 1) {
      const response = await this.requestCompletionStreamWithPromptBudgetFallback(
        messages,
        parsedInput,
        tools,
        () => {
          if (warnedPromptBudgetFallback) {
            return;
          }

          warnedPromptBudgetFallback = true;
        },
      );
      const streamedCompletion = await this.consumeCompletionStream(response, onChunk);
      const toolCalls = streamedCompletion.toolCalls;

      if (toolCalls.length === 0) {
        if (streamedCompletion.answer.length === 0) {
          throw new AppError({
            code: "OPENROUTER_EMPTY_RESPONSE",
            message: "OpenRouter returned an empty streamed completion",
            statusCode: 502,
          });
        }

        return {
          answer: streamedCompletion.answer,
          fetchedAt: new Date().toISOString(),
          model: streamedCompletion.model,
          provider: "openrouter",
          responseId: streamedCompletion.responseId,
          toolCallsUsed: [...usedTools],
          usage: streamedCompletion.usage,
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
        content: streamedCompletion.answer.length > 0 ? streamedCompletion.answer : null,
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
      message: "OpenRouter tool-calling stream flow failed",
      statusCode: 502,
    });
  }

  public async createCompletionStream(
    input: z.input<typeof openRouterChatInputSchema>,
    onChunk: (chunk: string) => void | Promise<void>,
  ): Promise<OpenRouterChatCompletion> {
    if (env.OPENROUTER_API_KEY.length < 20) {
      throw new AppError({
        code: "OPENROUTER_NOT_CONFIGURED",
        message: "OpenRouter API key is not configured",
        statusCode: 503,
      });
    }

    const parsedInput = openRouterChatInputSchema.parse(input);
    const messages = buildRequestMessages(parsedInput);

    const response = await this.requestCompletionStream(messages, parsedInput, []);
    const streamedCompletion = await this.consumeCompletionStream(response, onChunk);

    if (streamedCompletion.answer.length === 0) {
      throw new AppError({
        code: "OPENROUTER_EMPTY_RESPONSE",
        message: "OpenRouter returned an empty streamed completion",
        statusCode: 502,
      });
    }

    return {
      answer: streamedCompletion.answer,
      fetchedAt: new Date().toISOString(),
      model: streamedCompletion.model,
      provider: "openrouter",
      responseId: streamedCompletion.responseId,
      toolCallsUsed: [],
      usage: streamedCompletion.usage,
    };
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

  private async requestCompletionStream(
    messages: OpenRouterRequestMessage[],
    input: z.infer<typeof openRouterChatInputSchema>,
    tools: OpenRouterToolDefinition[],
  ): Promise<Response> {
    return retryWithExponentialBackoff(
      () => this.requestCompletionStreamOnce(messages, input, tools),
      {
        attempts: 3,
        baseDelayMs: 300,
        jitterPercent: 20,
        shouldRetry: shouldRetryOpenRouterRequest,
      },
    );
  }

  private async requestCompletionStreamWithPromptBudgetFallback(
    messages: OpenRouterRequestMessage[],
    input: z.infer<typeof openRouterChatInputSchema>,
    tools: OpenRouterToolDefinition[],
    onFallbackActivated: () => void,
  ): Promise<Response> {
    try {
      return await this.requestCompletionStream(messages, input, tools);
    } catch (error) {
      if (!shouldFallbackToPromptBudgetMode(error) || tools.length === 0) {
        throw error;
      }

      onFallbackActivated();

      return this.requestCompletionStream(messages, input, []);
    }
  }

  private async requestCompletionStreamOnce(
    messages: OpenRouterRequestMessage[],
    input: z.infer<typeof openRouterChatInputSchema>,
    tools: OpenRouterToolDefinition[],
  ): Promise<Response> {
    const requestBody: Record<string, unknown> = {
      max_tokens: input.maxTokens,
      messages,
      model: env.OPENROUTER_MODEL,
      stream: true,
      stream_options: {
        include_usage: true,
      },
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
        message: "OpenRouter streaming request failed",
        statusCode: 503,
      });
    }

    if (!response.ok) {
      const responseText = await response.text();
      const retryable = isRetryableStatusCode(response.status);
      const promptTokensLimitExceeded = isPromptTokensLimitExceededStatus(response.status, responseText);

      throw new AppError({
        code: "OPENROUTER_BAD_STATUS",
        details: {
          promptTokensLimitExceeded,
          responseBody: responseText.slice(0, 1000),
          responseStatus: response.status,
          retryable,
        },
        message: "OpenRouter returned a non-success status",
        statusCode: retryable ? 503 : 502,
      });
    }

    return response;
  }

  private async consumeCompletionStream(
    response: Response,
    onChunk: (chunk: string) => void | Promise<void>,
  ): Promise<{
    answer: string;
    model: string;
    responseId: string;
    toolCalls: OpenRouterToolCall[];
    usage: {
      completionTokens?: number;
      promptTokens?: number;
      totalTokens?: number;
    };
  }> {
    if (!response.body) {
      throw new AppError({
        code: "OPENROUTER_STREAM_UNAVAILABLE",
        message: "OpenRouter streaming body is unavailable",
        statusCode: 502,
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let streamBuffer = "";
    let answer = "";
    let model = env.OPENROUTER_MODEL;
    let responseId = "";
    const streamedToolCallsByIndex = new Map<number, {
      arguments: string;
      id: string;
      name: string;
    }>();
    const usage: {
      completionTokens?: number;
      promptTokens?: number;
      totalTokens?: number;
    } = {};

    const processEventBlock = async (eventBlock: string): Promise<boolean> => {
      const lines = eventBlock
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"));

      for (const line of lines) {
        const payload = line.slice(5).trim();

        if (payload.length === 0) {
          continue;
        }

        if (payload === "[DONE]") {
          return true;
        }

        let parsedPayload: unknown;

        try {
          parsedPayload = JSON.parse(payload) as unknown;
        } catch {
          continue;
        }

        const payloadRecord = toObjectRecord(parsedPayload);

        if (!payloadRecord) {
          continue;
        }

        if (typeof payloadRecord.id === "string" && payloadRecord.id.length > 0) {
          responseId = payloadRecord.id;
        }

        if (typeof payloadRecord.model === "string" && payloadRecord.model.length > 0) {
          model = payloadRecord.model;
        }

        const usageRecord = toObjectRecord(payloadRecord.usage);

        if (usageRecord) {
          usage.completionTokens = toNonNegativeInt(usageRecord.completion_tokens) ?? usage.completionTokens;
          usage.promptTokens = toNonNegativeInt(usageRecord.prompt_tokens) ?? usage.promptTokens;
          usage.totalTokens = toNonNegativeInt(usageRecord.total_tokens) ?? usage.totalTokens;
        }

        const choices = Array.isArray(payloadRecord.choices) ? payloadRecord.choices : [];
        const firstChoiceRecord = toObjectRecord(choices[0]);
        const deltaRecord = toObjectRecord(firstChoiceRecord?.delta);
        const chunk = typeof deltaRecord?.content === "string" ? deltaRecord.content : "";

        const deltaToolCalls = Array.isArray(deltaRecord?.tool_calls) ? deltaRecord.tool_calls : [];

        for (const rawToolCall of deltaToolCalls) {
          const toolCallRecord = toObjectRecord(rawToolCall);

          if (!toolCallRecord) {
            continue;
          }

          const toolIndex = toNonNegativeInt(toolCallRecord.index);

          if (toolIndex === undefined) {
            continue;
          }

          const currentToolCall = streamedToolCallsByIndex.get(toolIndex) ?? {
            arguments: "",
            id: "",
            name: "",
          };

          if (typeof toolCallRecord.id === "string" && toolCallRecord.id.length > 0) {
            currentToolCall.id = toolCallRecord.id;
          }

          const functionRecord = toObjectRecord(toolCallRecord.function);

          if (typeof functionRecord?.name === "string" && functionRecord.name.length > 0) {
            currentToolCall.name = functionRecord.name;
          }

          if (typeof functionRecord?.arguments === "string" && functionRecord.arguments.length > 0) {
            currentToolCall.arguments += functionRecord.arguments;
          }

          streamedToolCallsByIndex.set(toolIndex, currentToolCall);
        }

        if (chunk.length > 0) {
          answer += chunk;
          await onChunk(chunk);
        }
      }

      return false;
    };

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      streamBuffer += decoder.decode(value, {
        stream: true,
      });

      while (true) {
        const eventDelimiterIndex = streamBuffer.indexOf("\n\n");

        if (eventDelimiterIndex < 0) {
          break;
        }

        const eventBlock = streamBuffer.slice(0, eventDelimiterIndex);
        streamBuffer = streamBuffer.slice(eventDelimiterIndex + 2);
        const isDone = await processEventBlock(eventBlock);

        if (isDone) {
          const toolCalls = [...streamedToolCallsByIndex.entries()]
            .sort((left, right) => left[0] - right[0])
            .map(([index, item]) => {
              if (item.name.length === 0) {
                return null;
              }

              return {
                function: {
                  arguments: item.arguments.length > 0 ? item.arguments : "{}",
                  name: item.name,
                },
                id: item.id.length > 0 ? item.id : `tool_call_${index}_${Date.now()}`,
                type: "function",
              } satisfies OpenRouterToolCall;
            })
            .filter((item): item is OpenRouterToolCall => item !== null);

          return {
            answer: answer.trim(),
            model,
            responseId: responseId.length > 0 ? responseId : `openrouter-stream-${Date.now()}`,
            toolCalls,
            usage,
          };
        }
      }
    }

    if (streamBuffer.trim().length > 0) {
      await processEventBlock(streamBuffer);
    }

    const toolCalls = [...streamedToolCallsByIndex.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([index, item]) => {
        if (item.name.length === 0) {
          return null;
        }

        return {
          function: {
            arguments: item.arguments.length > 0 ? item.arguments : "{}",
            name: item.name,
          },
          id: item.id.length > 0 ? item.id : `tool_call_${index}_${Date.now()}`,
          type: "function",
        } satisfies OpenRouterToolCall;
      })
      .filter((item): item is OpenRouterToolCall => item !== null);

    return {
      answer: answer.trim(),
      model,
      responseId: responseId.length > 0 ? responseId : `openrouter-stream-${Date.now()}`,
      toolCalls,
      usage,
    };
  }

  private async requestCompletion(
    messages: OpenRouterRequestMessage[],
    input: z.infer<typeof openRouterChatInputSchema>,
    tools: OpenRouterToolDefinition[],
  ): Promise<z.infer<typeof openRouterResponseSchema>> {
    return retryWithExponentialBackoff(
      () => this.requestCompletionOnce(messages, input, tools),
      {
        attempts: 3,
        baseDelayMs: 300,
        jitterPercent: 20,
        shouldRetry: shouldRetryOpenRouterRequest,
      },
    );
  }

  private async requestCompletionWithPromptBudgetFallback(
    messages: OpenRouterRequestMessage[],
    input: z.infer<typeof openRouterChatInputSchema>,
    tools: OpenRouterToolDefinition[],
    onFallbackActivated: () => void,
  ): Promise<z.infer<typeof openRouterResponseSchema>> {
    try {
      return await this.requestCompletion(messages, input, tools);
    } catch (error) {
      if (!shouldFallbackToPromptBudgetMode(error) || tools.length === 0) {
        throw error;
      }

      onFallbackActivated();

      return this.requestCompletion(messages, input, []);
    }
  }

  private async requestCompletionOnce(
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
      const promptTokensLimitExceeded = isPromptTokensLimitExceededStatus(response.status, responseText);

      throw new AppError({
        code: "OPENROUTER_BAD_STATUS",
        details: {
          promptTokensLimitExceeded,
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