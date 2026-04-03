import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { AirdropIntelligenceService } from "../application/airdrop-intelligence-service.js";

const includeSpeculativeQuerySchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .default("true");

const airdropSourceQuerySchema = z.enum([
  "airdrop_alert",
  "airdrops_io",
  "coingecko_trending",
  "defillama",
  "drops_tab",
  "earnifi",
]);

const airdropSourcesQuerySchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .transform((value) => {
    return [...new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0),
    )];
  })
  .pipe(z.array(airdropSourceQuerySchema).min(1).max(6));

const airdropOpportunitiesQuerySchema = z.object({
  chain: z.string().trim().min(1).max(40).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  includeSpeculative: includeSpeculativeQuerySchema,
  limit: z.coerce.number().int().min(1).max(40).default(12),
  minScore: z.coerce.number().min(0).max(100).default(35),
  query: z.string().trim().max(160).optional(),
  sortBy: z.enum(["score", "recent"]).default("score"),
  sources: airdropSourcesQuerySchema.optional(),
});

const airdropIntelligenceService = new AirdropIntelligenceService();

export async function getAirdropOpportunities(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedQuery = airdropOpportunitiesQuerySchema.parse(request.query);
  const opportunities = await airdropIntelligenceService.getOpportunities(parsedQuery);

  void reply.send(buildSuccessResponse(request.id, opportunities));
}