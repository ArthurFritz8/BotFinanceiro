import type { FastifyReply, FastifyRequest } from "fastify";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import type { PaperTradingService } from "../application/paper-trading-service.js";
import {
  evaluatePriceInputSchema,
  openTradeInputSchema,
} from "../domain/paper-trading-types.js";

export class PaperTradingController {
  public constructor(private readonly service: PaperTradingService) {}

  public listTrades = (request: FastifyRequest, reply: FastifyReply): void => {
    const trades = this.service.listTrades();
    void reply.send(buildSuccessResponse(request.id, trades));
  };

  public getStats = (request: FastifyRequest, reply: FastifyReply): void => {
    const stats = this.service.computeStats();
    void reply.send(buildSuccessResponse(request.id, stats));
  };

  public openTrade = (request: FastifyRequest, reply: FastifyReply): void => {
    const input = openTradeInputSchema.parse(request.body);
    const trade = this.service.openTrade(input);
    void reply.code(201).send(buildSuccessResponse(request.id, trade));
  };

  public evaluatePrice = (request: FastifyRequest, reply: FastifyReply): void => {
    const input = evaluatePriceInputSchema.parse(request.body);
    const results = this.service.evaluatePrice(input);
    void reply.send(buildSuccessResponse(request.id, results));
  };
}
