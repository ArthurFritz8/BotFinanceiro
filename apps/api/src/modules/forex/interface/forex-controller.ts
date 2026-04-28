import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { ForexMarketService } from "../application/forex-market-service.js";
import {
  getUpcomingMacroEvents,
  InstitutionalMacroService,
} from "../application/institutional-macro-service.js";

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

const chartResolutionSchema = z.enum([
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
  "1S",
  "5S",
  "10S",
  "15S",
  "30S",
  "45S",
  "D",
  "W",
  "M",
]);

const institutionalMacroQuerySchema = z.object({
  mode: z.enum(["delayed", "live"]).default("delayed"),
  module: z.string().trim().min(1).max(32).optional(),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("7d"),
  resolution: chartResolutionSchema.optional(),
  symbol: z.string().trim().min(2).max(32)
    .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .refine((value) => value.length >= 2, {
      message: "symbol must contain at least 2 alphanumeric characters",
    }),
  timezone: z.string().trim().min(2).max(64).optional(),
});

const forexMarketService = new ForexMarketService();
const institutionalMacroService = new InstitutionalMacroService();

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

export async function getInstitutionalMacroSnapshot(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedQuery = institutionalMacroQuerySchema.parse(request.query);
  const snapshot = await institutionalMacroService.getStrategySnapshot({
    mode: parsedQuery.mode,
    module: parsedQuery.module,
    range: parsedQuery.range,
    resolution: parsedQuery.resolution,
    symbol: parsedQuery.symbol,
    timezone: parsedQuery.timezone,
  });

  void reply.send(buildSuccessResponse(request.id, snapshot));
}

// ADR-121 — Onda 3: macro execution gate. Endpoint enxuto consumido pela
// pill macro do Intelligence Desk e por futura integracao com execution-gate.
export async function getMacroUpcomingEvents(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const snapshot = await getUpcomingMacroEvents();
  void reply.send(buildSuccessResponse(request.id, snapshot));
}
