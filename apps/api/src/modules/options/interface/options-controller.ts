import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { OptionsMarketService } from "../application/options-market-service.js";

const underlyingSchema = z
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
  .refine((value) => value.length >= 1 && value.length <= 24, {
    message: "underlying must contain between 1 and 24 characters",
  });

const underlyingsCsvSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => {
    return [
      ...new Set(
        value
          .split(",")
          .map((underlying) => underlying.trim())
          .filter((underlying) => underlying.length > 0),
      ),
    ];
  })
  .pipe(z.array(underlyingSchema).min(1).max(20));

const snapshotQuerySchema = z.object({
  daysToExpiry: z.coerce.number().int().min(1).max(365).default(30),
  underlying: underlyingSchema.default("SPY"),
});

const snapshotBatchQuerySchema = z.object({
  daysToExpiry: z.coerce.number().int().min(1).max(365).default(30),
  underlyings: underlyingsCsvSchema,
});

const marketOverviewQuerySchema = z.object({
  daysToExpiry: z.coerce.number().int().min(1).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(20).default(8),
  preset: z.enum(["us_indices", "us_mega_caps", "high_beta", "global"]).default("us_indices"),
  underlyings: underlyingsCsvSchema.optional(),
});

const optionsMarketService = new OptionsMarketService();

export async function getOptionsSnapshot(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = snapshotQuerySchema.parse(request.query);
  const snapshot = await optionsMarketService.getSnapshot({
    daysToExpiry: parsedQuery.daysToExpiry,
    underlying: parsedQuery.underlying,
  });

  void reply.send(buildSuccessResponse(request.id, snapshot));
}

export async function getOptionsSnapshotBatch(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = snapshotBatchQuerySchema.parse(request.query);
  const batch = await optionsMarketService.getSnapshotBatch({
    daysToExpiry: parsedQuery.daysToExpiry,
    underlyings: parsedQuery.underlyings,
  });

  void reply.send(buildSuccessResponse(request.id, batch));
}

export async function getOptionsMarketOverview(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = marketOverviewQuerySchema.parse(request.query);
  const overview = await optionsMarketService.getMarketOverview({
    daysToExpiry: parsedQuery.daysToExpiry,
    limit: parsedQuery.limit,
    preset: parsedQuery.preset,
    underlyings: parsedQuery.underlyings,
  });

  void reply.send(buildSuccessResponse(request.id, overview));
}
