import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { SystemStatusService } from "../application/system-status-service.js";

const systemStatusService = new SystemStatusService();

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10000).default(50),
});

export function getHealth(request: FastifyRequest, reply: FastifyReply): void {
  const data = systemStatusService.getHealthStatus();
  void reply.send(buildSuccessResponse(request.id, data));
}

export function getReady(request: FastifyRequest, reply: FastifyReply): void {
  const data = systemStatusService.getReadinessStatus();
  void reply.send(buildSuccessResponse(request.id, data));
}

export function getSchedulerMetrics(request: FastifyRequest, reply: FastifyReply): void {
  const data = systemStatusService.getSchedulerMetrics();
  void reply.send(buildSuccessResponse(request.id, data));
}

export function getOperationalHealth(request: FastifyRequest, reply: FastifyReply): void {
  const data = systemStatusService.getOperationalHealth();
  void reply.send(buildSuccessResponse(request.id, data));
}

export function getOperationalHealthHistory(request: FastifyRequest, reply: FastifyReply): void {
  const parsedQuery = historyQuerySchema.parse(request.query);
  const data = systemStatusService.getOperationalHealthHistory(parsedQuery.limit);
  void reply.send(buildSuccessResponse(request.id, data));
}