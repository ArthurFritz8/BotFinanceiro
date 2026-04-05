import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { memeRadarService } from "../application/meme-radar-service.js";

const booleanQuerySchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .default("false");

const getMemeRadarNotificationsQuerySchema = z.object({
  chain: z.enum(["all", "base", "solana"]).default("all"),
  limit: z.coerce.number().int().min(1).max(80).default(30),
  pinnedOnly: booleanQuerySchema,
  priority: z.enum(["all", "critical", "high", "watch"]).default("all"),
  refresh: booleanQuerySchema,
});

const setMemeRadarPinParamsSchema = z.object({
  notificationId: z.string().trim().min(6).max(180),
});

const setMemeRadarPinBodySchema = z.object({
  pinned: z.coerce.boolean().default(true),
});

export async function getMemeRadarNotifications(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedQuery = getMemeRadarNotificationsQuerySchema.parse(request.query);
  const board = await memeRadarService.getNotificationBoard(parsedQuery);

  void reply.send(buildSuccessResponse(request.id, board));
}

export async function setMemeRadarNotificationPinned(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedParams = setMemeRadarPinParamsSchema.parse(request.params);
  const parsedBody = setMemeRadarPinBodySchema.parse(request.body ?? {});

  const updated = await memeRadarService.setNotificationPinned({
    notificationId: parsedParams.notificationId,
    pinned: parsedBody.pinned,
  });

  void reply.send(buildSuccessResponse(request.id, updated));
}
