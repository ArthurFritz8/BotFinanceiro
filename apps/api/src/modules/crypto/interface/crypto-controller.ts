import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { env } from "../../../shared/config/env.js";
import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { openSsePipe } from "../../../shared/http/sse-pipe.js";
import { ASSET_CATALOG } from "../../../integrations/market_data/asset-catalog.js";
import { intelligenceSyncTelemetryStore } from "../../../shared/observability/intelligence-sync-telemetry-store.js";
import {
  CryptoChartService,
} from "../application/crypto-chart-service.js";
import {
  CryptoNewsIntelligenceService,
} from "../application/crypto-news-intelligence-service.js";
import {
  CryptoMarketOverviewService,
} from "../application/crypto-market-overview-service.js";
import {
  CryptoSpotPriceService,
} from "../application/crypto-spot-price-service.js";
import {
  CryptoSyncPolicyService,
} from "../application/crypto-sync-policy-service.js";
import {
  CryptoDerivativesService,
} from "../application/crypto-derivatives-service.js";

const syncPolicyQuerySchema = z.object({
  scope: z.enum(["hot", "warm", "cold"]).optional(),
});

const spotPriceQuerySchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  currency: z.string().trim().min(2).max(10).default("usd"),
});

const assetIdsCsvSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) =>
    [...new Set(value
      .split(",")
      .map((assetId) => assetId.trim().toLowerCase())
      .filter((assetId) => assetId.length > 0))],
  )
  .refine((assetIds) => assetIds.length >= 1 && assetIds.length <= 25, {
    message: "assetIds must contain between 1 and 25 items",
  });

const spotPriceBatchQuerySchema = z.object({
  assetIds: assetIdsCsvSchema,
  currency: z.string().trim().min(2).max(10).default("usd"),
});

const liveChartExchangeSchema = z.enum(["auto", "binance", "bybit", "coinbase", "kraken", "okx"]);
const chartResolutionSchema = z.enum([
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
  "1S",
  "5S",
  "10S",
  "15S",
  "30S",
  "45S",
  "D",
  "W",
  "M",
]);

const chartQuerySchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  currency: z.string().trim().min(2).max(10).default("usd"),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("7d"),
  resolution: chartResolutionSchema.optional(),
});

const liveChartQuerySchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  exchange: liveChartExchangeSchema.default("binance"),
  fresh: z
    .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0"), z.boolean()])
    .optional()
    .transform((value) => value === true || value === "true" || value === "1"),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("24h"),
  resolution: chartResolutionSchema.optional(),
});

const strategyChartQuerySchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  exchange: liveChartExchangeSchema.default("binance"),
  fresh: z
    .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0"), z.boolean()])
    .optional()
    .transform((value) => value === true || value === "true" || value === "1"),
  mode: z.enum(["delayed", "live"]).default("delayed"),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("7d"),
  resolution: chartResolutionSchema.optional(),
});

const liveStreamQuerySchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  exchange: liveChartExchangeSchema.default("binance"),
  intervalMs: z.coerce.number().int().min(500).max(15000).default(1000),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("24h"),
  resolution: chartResolutionSchema.optional(),
});

const marketOverviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(3).max(25).default(10),
});

const newsIntelligenceQuerySchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  limit: z.coerce.number().int().min(3).max(20).default(8),
});

const intelligenceSyncTelemetryBodySchema = z.object({
  chartAssetId: z.string().trim().min(1).max(64).optional(),
  chartRange: z.enum(["24h", "7d", "30d", "90d", "1y"]).optional(),
  contextId: z.string().trim().min(8).max(180),
  correlationId: z.string().trim().min(8).max(180),
  exchange: liveChartExchangeSchema.optional(),
  latencyMs: z.coerce.number().min(0).max(120000),
  reason: z.string().trim().min(2).max(120),
  sessionId: z
    .string()
    .trim()
    .min(8)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/),
  strategy: z.enum(["crypto", "institutional_macro", "external_symbol"]).default("crypto"),
  success: z.coerce.boolean(),
  terminalSymbol: z.string().trim().min(1).max(64).optional(),
});

const cryptoSyncPolicyService = new CryptoSyncPolicyService();
const cryptoSpotPriceService = new CryptoSpotPriceService();
const cryptoChartService = new CryptoChartService();
const cryptoNewsIntelligenceService = new CryptoNewsIntelligenceService();
const cryptoMarketOverviewService = new CryptoMarketOverviewService();
const cryptoDerivativesService = new CryptoDerivativesService();

// ADR-119: schemas dos endpoints institucionais (derivatives / CVD / orderbook).
const derivativesQuerySchema = z.object({
  assetId: z.string().trim().min(1).max(64).default("bitcoin"),
});

const cvdQuerySchema = z.object({
  assetId: z.string().trim().min(1).max(64).default("bitcoin"),
  limit: z.coerce.number().int().min(50).max(1000).default(500),
});

const orderbookQuerySchema = z.object({
  assetId: z.string().trim().min(1).max(64).default("bitcoin"),
  levels: z.coerce
    .number()
    .int()
    .refine((value) => [5, 10, 20, 50, 100].includes(value), {
      message: "levels must be one of 5, 10, 20, 50, 100",
    })
    .default(20),
});

// ADR-125: historico de funding rate para sparkline 24h.
const fundingHistoryQuerySchema = z.object({
  assetId: z.string().trim().min(1).max(64).default("bitcoin"),
  hours: z.coerce.number().int().min(8).max(168).default(24),
});

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

export function getSyncPolicy(request: FastifyRequest, reply: FastifyReply): void {
  const parsedQuery = syncPolicyQuerySchema.parse(request.query);
  const policy = parsedQuery.scope
    ? cryptoSyncPolicyService.getPolicy(parsedQuery.scope)
    : cryptoSyncPolicyService.getPolicy();

  void reply.send(buildSuccessResponse(request.id, policy));
}

export async function getSpotPrice(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = spotPriceQuerySchema.parse(request.query);
  const spotPrice = await cryptoSpotPriceService.getSpotPrice(parsedQuery);

  void reply.send(buildSuccessResponse(request.id, spotPrice));
}

export async function getSpotPriceBatch(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = spotPriceBatchQuerySchema.parse(request.query);
  const spotPriceBatch = await cryptoSpotPriceService.getSpotPriceBatch(parsedQuery);

  void reply.send(buildSuccessResponse(request.id, spotPriceBatch));
}

export function getAssetCatalog(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const assets = ASSET_CATALOG.map((entry) => {
    const supportedBrokers = (Object.keys(entry.brokerPairs) as Array<keyof typeof entry.brokerPairs>)
      .filter((broker) => entry.brokerPairs[broker] !== null);

    return {
      brokerPairs: entry.brokerPairs,
      id: entry.id,
      name: entry.name,
      rank: entry.rank,
      supportedBrokers,
      symbol: entry.symbol,
    };
  });

  void reply.send(
    buildSuccessResponse(request.id, {
      assets,
      total: assets.length,
    }),
  );
  return Promise.resolve();
}

export async function getChart(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = chartQuerySchema.parse(request.query);
  const chart = await cryptoChartService.getChart({
    assetId: parsedQuery.assetId,
    currency: parsedQuery.currency,
    range: parsedQuery.range,
    resolution: parsedQuery.resolution,
  });

  void reply.send(buildSuccessResponse(request.id, chart));
}

export async function getLiveChart(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = liveChartQuerySchema.parse(request.query);
  const chart = await cryptoChartService.getLiveChart({
    assetId: parsedQuery.assetId,
    broker: parsedQuery.exchange,
    bypassCache: parsedQuery.fresh,
    range: parsedQuery.range,
    resolution: parsedQuery.resolution,
  });

  void reply.send(buildSuccessResponse(request.id, chart));
}

export async function getCryptoStrategyChart(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = strategyChartQuerySchema.parse(request.query);

  if (parsedQuery.mode === "live") {
    const chart = await cryptoChartService.getLiveChart({
      assetId: parsedQuery.assetId,
      broker: parsedQuery.exchange,
      bypassCache: parsedQuery.fresh,
      range: parsedQuery.range,
      resolution: parsedQuery.resolution,
    });

    void reply.send(buildSuccessResponse(request.id, chart));
    return;
  }

  const chart = await cryptoChartService.getChart({
    assetId: parsedQuery.assetId,
    currency: "usd",
    range: parsedQuery.range,
    resolution: parsedQuery.resolution,
  });

  void reply.send(buildSuccessResponse(request.id, chart));
}

export function postIntelligenceSyncTelemetry(request: FastifyRequest, reply: FastifyReply): void {
  const parsedBody = intelligenceSyncTelemetryBodySchema.parse(request.body ?? {});
  const result = intelligenceSyncTelemetryStore.record({
    chartAssetId: parsedBody.chartAssetId,
    chartRange: parsedBody.chartRange,
    contextId: parsedBody.contextId,
    correlationId: parsedBody.correlationId,
    exchange: parsedBody.exchange,
    latencyMs: parsedBody.latencyMs,
    reason: parsedBody.reason,
    requestId: request.id,
    sessionId: parsedBody.sessionId,
    strategy: parsedBody.strategy,
    success: parsedBody.success,
    terminalSymbol: parsedBody.terminalSymbol,
  });

  void reply.code(202).send(buildSuccessResponse(request.id, result));
}

export function streamLiveChart(request: FastifyRequest, reply: FastifyReply): void {
  const parsedQuery = liveStreamQuerySchema.parse(request.query);

  openSsePipe(request, reply, {
    allowedOrigins,
    intervalMs: parsedQuery.intervalMs,
    pushSnapshot: () =>
      cryptoChartService.getLiveStreamSnapshot({
        assetId: parsedQuery.assetId,
        broker: parsedQuery.exchange,
        range: parsedQuery.range,
        resolution: parsedQuery.resolution,
      }),
    streamName: "de chart",
  });
}

export async function getMarketOverview(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = marketOverviewQuerySchema.parse(request.query);
  const marketOverview = await cryptoMarketOverviewService.getOverview(parsedQuery);

  void reply.send(buildSuccessResponse(request.id, marketOverview));
}

export async function getNewsIntelligence(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = newsIntelligenceQuerySchema.parse(request.query);
  const newsIntelligence = await cryptoNewsIntelligenceService.getNewsIntelligence(parsedQuery);

  void reply.send(buildSuccessResponse(request.id, newsIntelligence));
}

// ADR-119: handlers institucionais — derivativos, CVD, orderbook L2.
export async function getDerivatives(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = derivativesQuerySchema.parse(request.query);
  const snapshot = await cryptoDerivativesService.getDerivatives(parsedQuery);
  void reply.send(buildSuccessResponse(request.id, snapshot));
}

export async function getCvd(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = cvdQuerySchema.parse(request.query);
  const snapshot = await cryptoDerivativesService.getCvd(parsedQuery);
  void reply.send(buildSuccessResponse(request.id, snapshot));
}

export async function getOrderbookDepth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = orderbookQuerySchema.parse(request.query);
  const snapshot = await cryptoDerivativesService.getOrderbook({
    assetId: parsedQuery.assetId,
    levels: parsedQuery.levels as 5 | 10 | 20 | 50 | 100,
  });
  void reply.send(buildSuccessResponse(request.id, snapshot));
}

// ADR-125: handler para sparkline funding history.
export async function getFundingHistory(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = fundingHistoryQuerySchema.parse(request.query);
  const snapshot = await cryptoDerivativesService.getFundingHistory(parsedQuery);
  // Cache HTTP alinhado com TTL server-side (60s) e cadencia real do funding (8h).
  void reply.header("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
  void reply.send(buildSuccessResponse(request.id, snapshot));
}
