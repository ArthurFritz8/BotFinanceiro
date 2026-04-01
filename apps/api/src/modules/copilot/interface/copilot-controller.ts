import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { CopilotChatService } from "../application/copilot-chat-service.js";

const copilotChatBodySchema = z.object({
  maxTokens: z.number().int().min(1).max(2000).optional(),
  message: z.string().trim().min(1).max(4000),
  systemPrompt: z.string().trim().min(1).max(4000).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const copilotChatService = new CopilotChatService();

export async function postCopilotChat(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedBody = copilotChatBodySchema.parse(request.body);
  const data = await copilotChatService.chat(parsedBody);

  void reply.send(buildSuccessResponse(request.id, data));
}