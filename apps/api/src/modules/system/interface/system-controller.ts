import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { SystemStatusService } from "../application/system-status-service.js";

const systemStatusService = new SystemStatusService();

const optionalDateTimeSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => new Date(value))
  .refine((value) => !Number.isNaN(value.getTime()), "must be a valid datetime");

const historyQuerySchema = z.object({
  from: optionalDateTimeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(50),
  to: optionalDateTimeSchema.optional(),
}).superRefine((value, ctx) => {
  if (!value.from || !value.to) {
    return;
  }

  if (value.from.getTime() <= value.to.getTime()) {
    return;
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: "from must be less than or equal to to",
    path: ["from"],
  });
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
  const data = systemStatusService.getOperationalHealthHistory({
    from: parsedQuery.from,
    limit: parsedQuery.limit,
    to: parsedQuery.to,
  });
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
  const csvExport = systemStatusService.getOperationalHealthHistoryCsv({
    from: parsedQuery.from,
    limit: parsedQuery.limit,
    to: parsedQuery.to,
  });

  void reply
    .header("Content-Type", "text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${csvExport.fileName}"`)
    .send(csvExport.csv);
}