import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { DefiMarketService } from "../application/defi-market-service.js";

const assetIdSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
  .refine((value) => value.length >= 2 && value.length <= 40, {
    message: "assetId must contain between 2 and 40 characters",
  });

const assetIdsCsvSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => {
    return [
      ...new Set(
        value
          .split(",")
          .map((assetId) => assetId.trim())
          .filter((assetId) => assetId.length > 0),
      ),
    ];
  })
  .pipe(z.array(assetIdSchema).min(1).max(20));

const spotRateQuerySchema = z.object({
  assetId: assetIdSchema.default("aave"),
});

const spotRateBatchQuerySchema = z.object({
  assetIds: assetIdsCsvSchema,
});

const marketOverviewQuerySchema = z.object({
  assetIds: assetIdsCsvSchema.optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
  preset: z.enum(["blue_chips", "dex", "lending", "infrastructure"]).default("blue_chips"),
});

const defiMarketService = new DefiMarketService();

export async function getDefiSpotRate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = spotRateQuerySchema.parse(request.query);
  const snapshot = await defiMarketService.getSpotRate({
    assetId: parsedQuery.assetId,
  });

  void reply.send(buildSuccessResponse(request.id, snapshot));
}

export async function getDefiSpotRateBatch(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = spotRateBatchQuerySchema.parse(request.query);
  const batch = await defiMarketService.getSpotRateBatch({
    assetIds: parsedQuery.assetIds,
  });

  void reply.send(buildSuccessResponse(request.id, batch));
}

export async function getDefiMarketOverview(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = marketOverviewQuerySchema.parse(request.query);
  const overview = await defiMarketService.getMarketOverview({
    assetIds: parsedQuery.assetIds,
    limit: parsedQuery.limit,
    preset: parsedQuery.preset,
  });

  void reply.send(buildSuccessResponse(request.id, overview));
}
