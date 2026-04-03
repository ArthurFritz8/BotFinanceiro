import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { EtfsMarketService } from "../application/etfs-market-service.js";

const symbolSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toUpperCase())
  .transform((value) => {
    if (value.startsWith("^")) {
      return `^${value.slice(1).replace(/[^A-Z0-9]/g, "")}`;
    }

    return value.replace(/[^A-Z0-9.=-]/g, "");
  })
  .refine((value) => value.length >= 1 && value.length <= 32, {
    message: "symbol must contain between 1 and 32 characters",
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
  symbol: symbolSchema.default("SPY"),
});

const snapshotBatchQuerySchema = z.object({
  symbols: symbolsCsvSchema,
});

const marketOverviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(8),
  preset: z.enum(["broad_market", "thematic", "international", "fixed_income"]).default("broad_market"),
  symbols: symbolsCsvSchema.optional(),
});

const etfsMarketService = new EtfsMarketService();

export async function getEtfSnapshot(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = snapshotQuerySchema.parse(request.query);
  const snapshot = await etfsMarketService.getSnapshot({
    symbol: parsedQuery.symbol,
  });

  void reply.send(buildSuccessResponse(request.id, snapshot));
}

export async function getEtfSnapshotBatch(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = snapshotBatchQuerySchema.parse(request.query);
  const batch = await etfsMarketService.getSnapshotBatch({
    symbols: parsedQuery.symbols,
  });

  void reply.send(buildSuccessResponse(request.id, batch));
}

export async function getEtfsMarketOverview(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = marketOverviewQuerySchema.parse(request.query);
  const overview = await etfsMarketService.getMarketOverview({
    limit: parsedQuery.limit,
    preset: parsedQuery.preset,
    symbols: parsedQuery.symbols,
  });

  void reply.send(buildSuccessResponse(request.id, overview));
}