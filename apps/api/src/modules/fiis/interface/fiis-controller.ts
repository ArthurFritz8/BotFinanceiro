import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { FiisMarketService } from "../application/fiis-market-service.js";

const symbolSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toUpperCase().replace(/[^A-Z0-9.]/g, ""))
  .transform((value) => {
    if (value.endsWith(".SA")) {
      return value;
    }

    return `${value}.SA`;
  })
  .refine((value) => value.length >= 6 && value.length <= 16, {
    message: "symbol must contain between 6 and 16 characters",
  });

const symbolsCsvSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => {
    return [
      ...new Set(
        value
          .split(",")
          .map((symbol) => symbol.trim())
          .filter((symbol) => symbol.length > 0),
      ),
    ];
  })
  .pipe(z.array(symbolSchema).min(1).max(20));

const snapshotQuerySchema = z.object({
  symbol: symbolSchema.default("HGLG11.SA"),
});

const snapshotBatchQuerySchema = z.object({
  symbols: symbolsCsvSchema,
});

const marketOverviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(8),
  preset: z.enum(["high_liquidity", "tijolo", "papel", "global"]).default("high_liquidity"),
  symbols: symbolsCsvSchema.optional(),
});

const fiisMarketService = new FiisMarketService();

export async function getFiisSnapshot(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = snapshotQuerySchema.parse(request.query);
  const snapshot = await fiisMarketService.getSnapshot({
    symbol: parsedQuery.symbol,
  });

  void reply.send(buildSuccessResponse(request.id, snapshot));
}

export async function getFiisSnapshotBatch(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = snapshotBatchQuerySchema.parse(request.query);
  const batch = await fiisMarketService.getSnapshotBatch({
    symbols: parsedQuery.symbols,
  });

  void reply.send(buildSuccessResponse(request.id, batch));
}

export async function getFiisMarketOverview(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = marketOverviewQuerySchema.parse(request.query);
  const overview = await fiisMarketService.getMarketOverview({
    limit: parsedQuery.limit,
    preset: parsedQuery.preset,
    symbols: parsedQuery.symbols,
  });

  void reply.send(buildSuccessResponse(request.id, overview));
}
