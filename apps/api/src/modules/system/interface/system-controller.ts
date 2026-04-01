import type { FastifyReply, FastifyRequest } from "fastify";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { SystemStatusService } from "../application/system-status-service.js";

const systemStatusService = new SystemStatusService();

export function getHealth(request: FastifyRequest, reply: FastifyReply): void {
  const data = systemStatusService.getHealthStatus();
  void reply.send(buildSuccessResponse(request.id, data));
}

export function getReady(request: FastifyRequest, reply: FastifyReply): void {
  const data = systemStatusService.getReadinessStatus();
  void reply.send(buildSuccessResponse(request.id, data));
}