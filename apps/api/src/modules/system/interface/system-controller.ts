import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { copilotChatAuditStore } from "../../../shared/observability/copilot-chat-audit-store.js";
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

const aggregateHistoryQuerySchema = z.object({
  bucketLimit: z.coerce.number().int().min(1).max(10000).default(48),
  from: optionalDateTimeSchema.optional(),
  granularity: z.enum(["hour", "day"]).default("hour"),
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

const copilotAuditHistoryQuerySchema = z.object({
  from: optionalDateTimeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  to: optionalDateTimeSchema.optional(),
  toolName: z.string().trim().min(1).max(100).optional(),
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

const marketNavigatorModulesHealthQuerySchema = z.object({
  refresh: z
    .string()
    .optional()
    .transform((value) => typeof value === "string" && value.toLowerCase() === "true"),
});

const cryptoLiveChartResilienceQuerySchema = z.object({
  requestedBroker: z.enum(["auto", "binance", "bybit", "coinbase", "kraken", "okx"]).default("auto"),
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

export function getBrokerLiveQuoteStreamHealth(request: FastifyRequest, reply: FastifyReply): void {
  const data = systemStatusService.getBrokerLiveQuoteStreamHealth();
  void reply.send(buildSuccessResponse(request.id, data));
}

export function getFuturesMarketStreamHealth(request: FastifyRequest, reply: FastifyReply): void {
  const data = systemStatusService.getFuturesMarketStreamHealth();
  void reply.send(buildSuccessResponse(request.id, data));
}

export async function getMarketNavigatorModulesHealth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedQuery = marketNavigatorModulesHealthQuerySchema.parse(request.query);
  const data = await systemStatusService.getMarketNavigatorModulesHealth({
    refresh: parsedQuery.refresh,
  });
  void reply.send(buildSuccessResponse(request.id, data));
}

export function exportBrokerLiveQuoteStreamHealthCsv(
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  const csvExport = systemStatusService.getBrokerLiveQuoteStreamHealthCsv();

  void reply
    .header("Content-Type", "text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${csvExport.fileName}"`)
    .send(csvExport.csv);
}

export function getCryptoLiveChartHealth(request: FastifyRequest, reply: FastifyReply): void {
  const data = systemStatusService.getCryptoLiveChartHealth();
  void reply.send(buildSuccessResponse(request.id, data));
}

export function getCryptoLiveChartResilienceHealth(request: FastifyRequest, reply: FastifyReply): void {
  const parsedQuery = cryptoLiveChartResilienceQuerySchema.parse(request.query);
  const data = systemStatusService.getCryptoLiveChartResilienceHealth({
    requestedBroker: parsedQuery.requestedBroker,
  });
  void reply.send(buildSuccessResponse(request.id, data));
}

export function exportCryptoLiveChartHealthCsv(
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  const csvExport = systemStatusService.getCryptoLiveChartHealthCsv();

  void reply
    .header("Content-Type", "text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${csvExport.fileName}"`)
    .send(csvExport.csv);
}

export function getAirdropsIntelligenceHealth(request: FastifyRequest, reply: FastifyReply): void {
  const data = systemStatusService.getAirdropsIntelligenceHealth();
  void reply.send(buildSuccessResponse(request.id, data));
}

export function exportAirdropsIntelligenceHealthCsv(
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  const csvExport = systemStatusService.getAirdropsIntelligenceHealthCsv();

  void reply
    .header("Content-Type", "text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${csvExport.fileName}"`)
    .send(csvExport.csv);
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

export async function getCopilotAuditHistory(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedQuery = copilotAuditHistoryQuerySchema.parse(request.query);
  const data = await copilotChatAuditStore.getHistory({
    from: parsedQuery.from,
    limit: parsedQuery.limit,
    offset: parsedQuery.offset,
    to: parsedQuery.to,
    toolName: parsedQuery.toolName,
  });

  void reply.send(buildSuccessResponse(request.id, data));
}

export async function clearCopilotAuditHistory(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  void clearHistoryQuerySchema.parse(request.query);
  const data = await copilotChatAuditStore.clear();

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

export function getOperationalHealthHistoryAggregated(
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const parsedQuery = aggregateHistoryQuerySchema.parse(request.query);
  const data = systemStatusService.getOperationalHealthHistoryAggregated({
    bucketLimit: parsedQuery.bucketLimit,
    from: parsedQuery.from,
    granularity: parsedQuery.granularity,
    to: parsedQuery.to,
  });

  void reply.send(buildSuccessResponse(request.id, data));
}

export function exportOperationalHealthHistoryAggregatedCsv(
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const parsedQuery = aggregateHistoryQuerySchema.parse(request.query);
  const csvExport = systemStatusService.getOperationalHealthHistoryAggregatedCsv({
    bucketLimit: parsedQuery.bucketLimit,
    from: parsedQuery.from,
    granularity: parsedQuery.granularity,
    to: parsedQuery.to,
  });

  void reply
    .header("Content-Type", "text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${csvExport.fileName}"`)
    .send(csvExport.csv);
}