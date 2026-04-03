import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { PortfolioAnalyticsService } from "../application/portfolio-analytics-service.js";

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

const portfolioPresetSchema = z.enum(["conservative", "balanced", "growth", "crypto_tilt"]);
const positionEntrySchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[^:,]+:[0-9]+(?:\.[0-9]+)?$/);

const positionsCsvSchema = z
  .string()
  .trim()
  .min(3)
  .max(700)
  .transform((value) => {
    return [
      ...new Set(
        value
          .split(",")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      ),
    ];
  })
  .pipe(z.array(positionEntrySchema).min(1).max(20))
  .transform((entries) => {
    return entries.map((entry) => {
      const [symbol, weight] = entry.split(":");

      return {
        symbol,
        weight: Number(weight),
      };
    });
  })
  .pipe(
    z
      .array(
        z.object({
          symbol: symbolSchema,
          weight: z.number().positive().max(1000),
        }),
      )
      .min(1)
      .max(20),
  );

const presetsCsvSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => {
    return [
      ...new Set(
        value
          .split(",")
          .map((preset) => preset.trim())
          .filter((preset) => preset.length > 0),
      ),
    ];
  })
  .pipe(z.array(portfolioPresetSchema).min(1).max(6));

const snapshotQuerySchema = z.object({
  positions: positionsCsvSchema.optional(),
  preset: portfolioPresetSchema.default("balanced"),
});

const snapshotBatchQuerySchema = z.object({
  presets: presetsCsvSchema.optional(),
});

const marketOverviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(6).default(4),
  presets: presetsCsvSchema.optional(),
});

const portfolioAnalyticsService = new PortfolioAnalyticsService();

export async function getPortfolioSnapshot(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = snapshotQuerySchema.parse(request.query);

  if (parsedQuery.positions) {
    const customSnapshot = await portfolioAnalyticsService.getSnapshot({
      positions: parsedQuery.positions,
    });

    void reply.send(buildSuccessResponse(request.id, customSnapshot));
    return;
  }

  const snapshot = await portfolioAnalyticsService.getSnapshot({
    preset: parsedQuery.preset,
  });

  void reply.send(buildSuccessResponse(request.id, snapshot));
}

export async function getPortfolioSnapshotBatch(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = snapshotBatchQuerySchema.parse(request.query);
  const batch = await portfolioAnalyticsService.getSnapshotBatch({
    presets: parsedQuery.presets,
  });

  void reply.send(buildSuccessResponse(request.id, batch));
}

export async function getPortfolioMarketOverview(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = marketOverviewQuerySchema.parse(request.query);
  const overview = await portfolioAnalyticsService.getMarketOverview({
    limit: parsedQuery.limit,
    presets: parsedQuery.presets,
  });

  void reply.send(buildSuccessResponse(request.id, overview));
}