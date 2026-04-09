import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { env } from "../../../shared/config/env.js";
import { buildSuccessResponse } from "../../../shared/http/api-response.js";
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

const chartQuerySchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  currency: z.string().trim().min(2).max(10).default("usd"),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("7d"),
});

const liveChartExchangeSchema = z.enum(["binance", "bybit", "coinbase", "kraken", "okx"]);

const liveChartQuerySchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  exchange: liveChartExchangeSchema.default("binance"),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("24h"),
});

const liveStreamQuerySchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  exchange: liveChartExchangeSchema.default("binance"),
  intervalMs: z.coerce.number().int().min(500).max(15000).default(1000),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("24h"),
});

const marketOverviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(3).max(25).default(10),
});

const newsIntelligenceQuerySchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  limit: z.coerce.number().int().min(3).max(20).default(8),
});

const cryptoSyncPolicyService = new CryptoSyncPolicyService();
const cryptoSpotPriceService = new CryptoSpotPriceService();
const cryptoChartService = new CryptoChartService();
const cryptoNewsIntelligenceService = new CryptoNewsIntelligenceService();
const cryptoMarketOverviewService = new CryptoMarketOverviewService();

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

function writeSseEvent(reply: FastifyReply, eventName: string, payload: unknown): void {
  reply.raw.write(`event: ${eventName}\n`);
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

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

export async function getChart(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = chartQuerySchema.parse(request.query);
  const chart = await cryptoChartService.getChart(parsedQuery);

  void reply.send(buildSuccessResponse(request.id, chart));
}

export async function getLiveChart(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = liveChartQuerySchema.parse(request.query);
  const chart = await cryptoChartService.getLiveChart({
    assetId: parsedQuery.assetId,
    broker: parsedQuery.exchange,
    range: parsedQuery.range,
  });

  void reply.send(buildSuccessResponse(request.id, chart));
}

export async function streamLiveChart(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = liveStreamQuerySchema.parse(request.query);
  const requestOrigin =
    typeof request.headers.origin === "string" ? normalizeOrigin(request.headers.origin) : "";
  const originIsAllowed =
    requestOrigin.length > 0 &&
    (allowedOrigins.size === 0 || allowedOrigins.has(requestOrigin));

  if (requestOrigin.length > 0 && !originIsAllowed) {
    void reply.code(403).send({
      error: "Origin not allowed",
    });
    return;
  }

  reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("X-Accel-Buffering", "no");

  if (originIsAllowed) {
    reply.raw.setHeader("Access-Control-Allow-Origin", requestOrigin);
    reply.raw.setHeader("Vary", "Origin");
  }

  reply.hijack();

  if (typeof reply.raw.flushHeaders === "function") {
    reply.raw.flushHeaders();
  }

  let isClosed = false;
  let isInFlight = false;
  let streamTimer: NodeJS.Timeout | null = null;

  const cleanup = (): void => {
    if (isClosed) {
      return;
    }

    isClosed = true;

    if (streamTimer) {
      clearInterval(streamTimer);
      streamTimer = null;
    }

    if (!reply.raw.writableEnded) {
      reply.raw.end();
    }
  };

  request.raw.on("close", cleanup);
  request.raw.on("aborted", cleanup);

  const pushSnapshot = async (): Promise<void> => {
    if (isClosed || isInFlight) {
      return;
    }

    isInFlight = true;

    try {
      const chart = await cryptoChartService.getLiveStreamSnapshot({
        assetId: parsedQuery.assetId,
        broker: parsedQuery.exchange,
        range: parsedQuery.range,
      });

      if (isClosed) {
        return;
      }

      writeSseEvent(reply, "snapshot", {
        chart,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (isClosed) {
        return;
      }

      writeSseEvent(reply, "stream-error", {
        generatedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "Falha no stream de chart ao vivo",
      });
    } finally {
      isInFlight = false;
    }
  };

  writeSseEvent(reply, "meta", {
    generatedAt: new Date().toISOString(),
    mode: "live",
    requestId: request.id,
  });
  void pushSnapshot();

  streamTimer = setInterval(() => {
    void pushSnapshot();
  }, parsedQuery.intervalMs);
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
