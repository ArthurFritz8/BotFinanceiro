import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { ForexMarketService } from "../application/forex-market-service.js";

const pairSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toUpperCase().replace(/[^A-Z]/g, ""))
  .refine((value) => value.length === 6, {
    message: "pair must contain 6 alphabetic characters",
  });

const pairsCsvSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => {
    return [...new Set(
      value
        .split(",")
        .map((pair) => pair.toUpperCase().replace(/[^A-Z]/g, ""))
        .filter((pair) => pair.length > 0),
    )];
  })
  .pipe(z.array(pairSchema).min(1).max(20));

const spotRateQuerySchema = z.object({
  pair: pairSchema.default("EURUSD"),
});

const spotRateBatchQuerySchema = z.object({
  pairs: pairsCsvSchema,
});

const marketOverviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(8),
  pairs: pairsCsvSchema.optional(),
  preset: z.enum(["majors", "latam", "europe", "asia", "global"]).default("majors"),
});

const forexMarketService = new ForexMarketService();

export async function getForexSpotRate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = spotRateQuerySchema.parse(request.query);
  const snapshot = await forexMarketService.getSpotRate({
    pair: parsedQuery.pair,
  });

  void reply.send(buildSuccessResponse(request.id, snapshot));
}

export async function getForexSpotRateBatch(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = spotRateBatchQuerySchema.parse(request.query);
  const batch = await forexMarketService.getSpotRateBatch({
    pairs: parsedQuery.pairs,
  });

  void reply.send(buildSuccessResponse(request.id, batch));
}

export async function getForexMarketOverview(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = marketOverviewQuerySchema.parse(request.query);
  const overview = await forexMarketService.getMarketOverview({
    limit: parsedQuery.limit,
    pairs: parsedQuery.pairs,
    preset: parsedQuery.preset,
  });

  void reply.send(buildSuccessResponse(request.id, overview));
}
