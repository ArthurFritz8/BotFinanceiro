import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { env } from "../../../shared/config/env.js";
import { buildSuccessResponse } from "../../../shared/http/api-response.js";
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

function writeSseEvent(reply: FastifyReply, eventName: string, payload: unknown): void {
  reply.raw.write(`event: ${eventName}\n`);
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

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

export function streamBinaryOptionsLiveChart(request: FastifyRequest, reply: FastifyReply): void {
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

  void reply.hijack();

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
      const chart = await binaryOptionsService.getStrategySnapshot({
        assetId: parsedQuery.assetId,
        exchange: parsedQuery.exchange,
        mode: "live",
        range: parsedQuery.range,
        resolution: parsedQuery.resolution,
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
        message: error instanceof Error ? error.message : "Falha no stream de binarias ao vivo",
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
