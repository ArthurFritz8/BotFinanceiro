import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

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

export async function postCopilotChat(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedBody = copilotChatBodySchema.parse(request.body);
  const data = await copilotChatService.chat(parsedBody);

  void reply.send(buildSuccessResponse(request.id, data));
}

export async function getCopilotHistory(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = copilotHistoryQuerySchema.parse(request.query);
  const data = await copilotChatService.getSessionHistory(parsedQuery);

  void reply.send(buildSuccessResponse(request.id, data));
}