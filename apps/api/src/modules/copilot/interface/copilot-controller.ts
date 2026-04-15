import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { env } from "../../../shared/config/env.js";
import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { CopilotChatService } from "../application/copilot-chat-service.js";

const copilotChatBodySchema = z.object({
  maxTokens: z.number().int().min(1).max(2000).optional(),
  message: z.string().trim().min(1).max(4000),
  sessionId: z
    .string()
    .trim()
    .min(8)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  systemPrompt: z.string().trim().min(1).max(4000).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const copilotHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  sessionId: z.string().trim().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/),
});

const copilotChatService = new CopilotChatService();

function normalizeOrigin(value: string): string {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return "";
  }

  try {
    return new URL(trimmedValue).origin;
  } catch {
    return trimmedValue.replace(/\/$/, "");
  }
}

const allowedOrigins = new Set(env.CORS_ALLOWED_ORIGINS.map((origin) => normalizeOrigin(origin)));

function writeNdjsonEvent(reply: FastifyReply, payload: unknown): void {
  reply.raw.write(`${JSON.stringify(payload)}\n`);
}

export async function postCopilotChat(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedBody = copilotChatBodySchema.parse(request.body);
  const data = await copilotChatService.chat(parsedBody);

  void reply.send(buildSuccessResponse(request.id, data));
}

export async function postCopilotChatStream(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedBody = copilotChatBodySchema.parse(request.body);
  const requestOrigin =
    typeof request.headers.origin === "string" ? normalizeOrigin(request.headers.origin) : "";
  const originIsAllowed =
    requestOrigin.length > 0 &&
    (allowedOrigins.size === 0 || allowedOrigins.has(requestOrigin));

  if (requestOrigin.length > 0 && !originIsAllowed) {
    void reply.code(403).send({
      error: "Origin not allowed",
    });
    return;
  }

  reply.raw.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
  reply.raw.setHeader("Connection", "keep-alive");

  if (originIsAllowed) {
    reply.raw.setHeader("Access-Control-Allow-Origin", requestOrigin);
    reply.raw.setHeader("Vary", "Origin");
  }

  void reply.hijack();

  if (typeof reply.raw.flushHeaders === "function") {
    reply.raw.flushHeaders();
  }

  let isClosed = false;
  const closeStream = (): void => {
    if (isClosed) {
      return;
    }

    isClosed = true;

    if (!reply.raw.writableEnded) {
      reply.raw.end();
    }
  };

  request.raw.on("close", closeStream);
  request.raw.on("aborted", closeStream);

  writeNdjsonEvent(reply, {
    data: {
      requestId: request.id,
      startedAt: new Date().toISOString(),
    },
    type: "meta",
  });

  try {
    const completion = await copilotChatService.chatStream(parsedBody, (chunk) => {
      if (isClosed || chunk.length === 0) {
        return;
      }

      writeNdjsonEvent(reply, {
        data: chunk,
        type: "chunk",
      });
    });

    if (!isClosed) {
      writeNdjsonEvent(reply, {
        data: {
          answer: completion.answer,
          fetchedAt: completion.fetchedAt,
          model: completion.model,
          responseId: completion.responseId,
          toolCallsUsed: completion.toolCallsUsed,
          usage: completion.usage,
        },
        type: "done",
      });
    }
  } catch (error) {
    if (!isClosed) {
      writeNdjsonEvent(reply, {
        data: {
          message: error instanceof Error ? error.message : "Falha ao consultar o Copiloto",
        },
        type: "error",
      });
    }
  } finally {
    closeStream();
  }
}

export async function getCopilotHistory(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = copilotHistoryQuerySchema.parse(request.query);
  const data = await copilotChatService.getSessionHistory(parsedQuery);

  void reply.send(buildSuccessResponse(request.id, data));
}