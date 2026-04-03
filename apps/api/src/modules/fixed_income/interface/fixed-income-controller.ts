import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { FixedIncomeMarketService } from "../application/fixed-income-market-service.js";

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
  symbol: symbolSchema.default("^TNX"),
});

const snapshotBatchQuerySchema = z.object({
  symbols: symbolsCsvSchema,
});

const marketOverviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(8),
  preset: z.enum(["us_curve", "credit_proxies", "rates_risk", "global_macro"]).default("us_curve"),
  symbols: symbolsCsvSchema.optional(),
});

const fixedIncomeMarketService = new FixedIncomeMarketService();

export async function getFixedIncomeSnapshot(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedQuery = snapshotQuerySchema.parse(request.query);
  const snapshot = await fixedIncomeMarketService.getSnapshot({
    symbol: parsedQuery.symbol,
  });

  void reply.send(buildSuccessResponse(request.id, snapshot));
}

export async function getFixedIncomeSnapshotBatch(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedQuery = snapshotBatchQuerySchema.parse(request.query);
  const batch = await fixedIncomeMarketService.getSnapshotBatch({
    symbols: parsedQuery.symbols,
  });

  void reply.send(buildSuccessResponse(request.id, batch));
}

export async function getFixedIncomeMarketOverview(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedQuery = marketOverviewQuerySchema.parse(request.query);
  const overview = await fixedIncomeMarketService.getMarketOverview({
    limit: parsedQuery.limit,
    preset: parsedQuery.preset,
    symbols: parsedQuery.symbols,
  });

  void reply.send(buildSuccessResponse(request.id, overview));
}
