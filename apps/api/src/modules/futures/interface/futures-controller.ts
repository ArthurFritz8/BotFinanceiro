import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { FuturesMarketService } from "../application/futures-market-service.js";

const symbolSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
  .transform((value) => {
    if (value.endsWith("USDT") || value.endsWith("BUSD") || value.endsWith("USD")) {
      return value;
    }

    return `${value}USDT`;
  })
  .refine((value) => value.length >= 6 && value.length <= 20, {
    message: "symbol must contain between 6 and 20 characters",
  });

const symbolsCsvSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => {
    return [...new Set(
      value
        .split(",")
        .map((symbol) => symbol.toUpperCase().replace(/[^A-Z0-9]/g, ""))
        .filter((symbol) => symbol.length > 0),
    )];
  })
  .pipe(z.array(symbolSchema).min(1).max(20));

const snapshotQuerySchema = z.object({
  symbol: symbolSchema.default("BTCUSDT"),
});

const snapshotBatchQuerySchema = z.object({
  symbols: symbolsCsvSchema,
});

const marketOverviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(8),
  preset: z.enum(["crypto_majors", "layer1", "defi"]).default("crypto_majors"),
  symbols: symbolsCsvSchema.optional(),
});

const futuresMarketService = new FuturesMarketService();

export async function getFuturesSnapshot(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = snapshotQuerySchema.parse(request.query);
  const snapshot = await futuresMarketService.getSnapshot({
    symbol: parsedQuery.symbol,
  });

  void reply.send(buildSuccessResponse(request.id, snapshot));
}

export async function getFuturesSnapshotBatch(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = snapshotBatchQuerySchema.parse(request.query);
  const batch = await futuresMarketService.getSnapshotBatch({
    symbols: parsedQuery.symbols,
  });

  void reply.send(buildSuccessResponse(request.id, batch));
}

export async function getFuturesMarketOverview(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = marketOverviewQuerySchema.parse(request.query);
  const overview = await futuresMarketService.getMarketOverview({
    limit: parsedQuery.limit,
    preset: parsedQuery.preset,
    symbols: parsedQuery.symbols,
  });

  void reply.send(buildSuccessResponse(request.id, overview));
}
