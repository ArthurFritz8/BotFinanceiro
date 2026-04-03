import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { BrokerMarketService } from "../application/broker-market-service.js";

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

const liveQuoteQuerySchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  broker: z.enum(["binance", "bybit", "coinbase", "kraken", "okx", "iqoption"]).default("binance"),
});

const liveQuoteBatchQuerySchema = z.object({
  assetIds: assetIdsCsvSchema,
  broker: z.enum(["binance", "bybit", "coinbase", "kraken", "okx", "iqoption"]).default("binance"),
});

const liveQuoteStreamQuerySchema = z.object({
  assetIds: assetIdsCsvSchema,
  broker: z.enum(["binance", "bybit", "coinbase", "kraken", "okx", "iqoption"]).default("binance"),
  intervalMs: z.coerce.number().int().min(2000).max(60000).default(10000),
});

const brokerMarketService = new BrokerMarketService();

export function getBrokerCatalog(request: FastifyRequest, reply: FastifyReply): void {
  const catalog = brokerMarketService.getBrokerCatalog();

  void reply.send(buildSuccessResponse(request.id, catalog));
}

export async function getBrokerLiveQuote(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedQuery = liveQuoteQuerySchema.parse(request.query);
  const liveQuote = await brokerMarketService.getLiveQuote(parsedQuery);

  void reply.send(buildSuccessResponse(request.id, liveQuote));
}

export async function getBrokerLiveQuoteBatch(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedQuery = liveQuoteBatchQuerySchema.parse(request.query);
  const liveQuoteBatch = await brokerMarketService.getLiveQuoteBatch(parsedQuery);

  void reply.send(buildSuccessResponse(request.id, liveQuoteBatch));
}

export function parseBrokerLiveQuoteStreamQuery(query: unknown): {
  assetIds: string[];
  broker: "binance" | "bybit" | "coinbase" | "kraken" | "okx" | "iqoption";
  intervalMs: number;
} {
  return liveQuoteStreamQuerySchema.parse(query);
}

export async function getBrokerLiveQuoteStreamSnapshot(input: {
  assetIds: string[];
  broker: "binance" | "bybit" | "coinbase" | "kraken" | "okx" | "iqoption";
}) {
  return brokerMarketService.getLiveQuoteBatch(input);
}
