import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { SystemStatusService } from "../application/system-status-service.js";

const systemStatusService = new SystemStatusService();

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10000).default(50),
});

const clearHistoryQuerySchema = z.object({
  confirm: z
    .string()
    .transform((value) => value.toLowerCase())
    .refine((value) => value === "true", "confirm must be true to clear history"),
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

export async function clearOperationalHealthHistory(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  void clearHistoryQuerySchema.parse(request.query);
  const data = await systemStatusService.clearOperationalHealthHistory();
  void reply.send(buildSuccessResponse(request.id, data));
}

export function exportOperationalHealthHistoryCsv(
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const parsedQuery = historyQuerySchema.parse(request.query);
  const csvExport = systemStatusService.getOperationalHealthHistoryCsv(parsedQuery.limit);

  void reply
    .header("Content-Type", "text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${csvExport.fileName}"`)
    .send(csvExport.csv);
}