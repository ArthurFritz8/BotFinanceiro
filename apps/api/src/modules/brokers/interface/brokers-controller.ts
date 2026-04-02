import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import { BrokerMarketService } from "../application/broker-market-service.js";

const liveQuoteQuerySchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  broker: z.enum(["binance", "iqoption"]).default("binance"),
});

const brokerMarketService = new BrokerMarketService();

export function getBrokerCatalog(request: FastifyRequest, reply: FastifyReply): void {
  const catalog = brokerMarketService.getBrokerCatalog();

  void reply.send(buildSuccessResponse(request.id, catalog));
}

export async function getBrokerLiveQuote(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsedQuery = liveQuoteQuerySchema.parse(request.query);
  const liveQuote = await brokerMarketService.getLiveQuote(parsedQuery);

  void reply.send(buildSuccessResponse(request.id, liveQuote));
}
