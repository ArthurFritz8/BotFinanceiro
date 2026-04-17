import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { env } from "../../../shared/config/env.js";
import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { openSsePipe } from "../../../shared/http/sse-pipe.js";
import { binaryOptionsGhostAuditStore } from "../../../shared/observability/binary-options-ghost-audit-store.js";
import { BinaryOptionsService } from "../application/binary-options-service.js";

const chartResolutionSchema = z.enum([
  "1T",
  "10T",
  "100T",
  "1000T",
  "10R",
  "100R",
  "1000R",
  "1S",
  "5S",
  "10S",
  "15S",
  "30S",
  "45S",
  "1",
  "2",
  "3",
  "5",
  "10",
  "15",
  "30",
  "45",
  "60",
  "120",
  "180",
  "240",
  "D",
  "W",
  "M",
]);

const strategyChartQuerySchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  exchange: z.enum(["auto", "binance", "bybit", "coinbase", "kraken", "okx"]).default("binance"),
  mode: z.enum(["delayed", "live"]).default("delayed"),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("24h"),
  resolution: chartResolutionSchema.default("1S"),
});

const liveStreamQuerySchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  exchange: z.enum(["auto", "binance", "bybit", "coinbase", "kraken", "okx"]).default("binance"),
  intervalMs: z.coerce.number().int().min(500).max(15000).default(1000),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("24h"),
  resolution: chartResolutionSchema.default("1S"),
});

const optionalDateTimeSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => new Date(value))
  .refine((value) => !Number.isNaN(value.getTime()), "must be a valid datetime");

const clearHistoryQuerySchema = z.object({
  confirm: z
    .string()
    .transform((value) => value.toLowerCase())
    .refine((value) => value === "true", "confirm must be true to clear history"),
});

const ghostAuditSettlementBodySchema = z.object({
  assetId: z.string().trim().min(1).max(64),
  callProbability: z.coerce.number().min(0).max(100).optional(),
  direction: z.enum(["call", "put"]),
  entryPrice: z.coerce.number().positive(),
  exchangeRequested: z.enum(["auto", "binance", "bybit", "coinbase", "kraken", "okx"]).optional(),
  exchangeResolved: z.enum(["binance", "bybit", "coinbase", "kraken", "okx"]).optional(),
  expiryPrice: z.coerce.number().positive(),
  expirySeconds: z.coerce.number().int().min(5).max(600),
  momentumStrength: z.coerce.number().min(0).max(100).optional(),
  neutralProbability: z.coerce.number().min(0).max(100).optional(),
  openedAt: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(Date.parse(value)), "must be a valid datetime")
    .optional(),
  operationalMode: z.enum(["binary_options", "spot_margin"]).optional(),
  outcome: z.enum(["win", "loss", "push"]),
  probability: z.coerce.number().min(0).max(100),
  provider: z.enum(["binance", "bybit", "coinbase", "kraken", "okx"]).optional(),
  putProbability: z.coerce.number().min(0).max(100).optional(),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).optional(),
  resolution: chartResolutionSchema.optional(),
  sessionId: z
    .string()
    .trim()
    .min(8)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/),
  settledAt: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(Date.parse(value)), "must be a valid datetime")
    .optional(),
  signalId: z.string().trim().min(6).max(180),
  symbol: z.string().trim().min(1).max(32).optional(),
  triggerHeat: z.enum(["cold", "warm", "hot"]).optional(),
});

const ghostAuditHistoryQuerySchema = z.object({
  assetId: z.string().trim().min(1).max(64).optional(),
  from: optionalDateTimeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(50),
  operationalMode: z.enum(["binary_options", "spot_margin"]).optional(),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  outcome: z.enum(["win", "loss", "push"]).optional(),
  sessionId: z
    .string()
    .trim()
    .min(8)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  to: optionalDateTimeSchema.optional(),
  triggerHeat: z.enum(["cold", "warm", "hot", "unknown"]).optional(),
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

const binaryOptionsService = new BinaryOptionsService();

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

export async function getBinaryOptionsStrategyChart(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedQuery = strategyChartQuerySchema.parse(request.query);
  const snapshot = await binaryOptionsService.getStrategySnapshot({
    assetId: parsedQuery.assetId,
    exchange: parsedQuery.exchange,
    mode: parsedQuery.mode,
    range: parsedQuery.range,
    resolution: parsedQuery.resolution,
  });

  void reply.send(buildSuccessResponse(request.id, snapshot));
}

export async function postBinaryOptionsGhostAuditSettlement(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedBody = ghostAuditSettlementBodySchema.parse(request.body ?? {});

  const result = await binaryOptionsGhostAuditStore.appendSettlement({
    assetId: parsedBody.assetId,
    callProbability: parsedBody.callProbability,
    direction: parsedBody.direction,
    entryPrice: parsedBody.entryPrice,
    exchangeRequested: parsedBody.exchangeRequested,
    exchangeResolved: parsedBody.exchangeResolved,
    expiryPrice: parsedBody.expiryPrice,
    expirySeconds: parsedBody.expirySeconds,
    momentumStrength: parsedBody.momentumStrength,
    neutralProbability: parsedBody.neutralProbability,
    openedAt: parsedBody.openedAt,
    operationalMode: parsedBody.operationalMode,
    outcome: parsedBody.outcome,
    probability: parsedBody.probability,
    provider: parsedBody.provider,
    putProbability: parsedBody.putProbability,
    range: parsedBody.range,
    requestId: request.id,
    resolution: parsedBody.resolution,
    sessionId: parsedBody.sessionId,
    settledAt: parsedBody.settledAt,
    signalId: parsedBody.signalId,
    symbol: parsedBody.symbol,
    triggerHeat: parsedBody.triggerHeat,
  });

  void reply.code(202).send(buildSuccessResponse(request.id, result));
}

export async function getBinaryOptionsGhostAuditHistory(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedQuery = ghostAuditHistoryQuerySchema.parse(request.query);
  const history = await binaryOptionsGhostAuditStore.getHistory({
    assetId: parsedQuery.assetId,
    from: parsedQuery.from,
    limit: parsedQuery.limit,
    operationalMode: parsedQuery.operationalMode,
    offset: parsedQuery.offset,
    outcome: parsedQuery.outcome,
    sessionId: parsedQuery.sessionId,
    to: parsedQuery.to,
    triggerHeat: parsedQuery.triggerHeat,
  });

  void reply.send(buildSuccessResponse(request.id, history));
}

export async function clearBinaryOptionsGhostAuditHistory(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  void clearHistoryQuerySchema.parse(request.query);
  const data = await binaryOptionsGhostAuditStore.clear();
  void reply.send(buildSuccessResponse(request.id, data));
}

export function streamBinaryOptionsLiveChart(request: FastifyRequest, reply: FastifyReply): void {
  const parsedQuery = liveStreamQuerySchema.parse(request.query);

  openSsePipe(request, reply, {
    allowedOrigins,
    intervalMs: parsedQuery.intervalMs,
    pushSnapshot: () =>
      binaryOptionsService.getStrategySnapshot({
        assetId: parsedQuery.assetId,
        exchange: parsedQuery.exchange,
        mode: "live",
        range: parsedQuery.range,
        resolution: parsedQuery.resolution,
      }),
    streamName: "de binarias",
  });
}
