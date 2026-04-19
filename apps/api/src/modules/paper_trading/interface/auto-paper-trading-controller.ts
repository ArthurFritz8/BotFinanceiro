import type { FastifyReply, FastifyRequest } from "fastify";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import type { AutoPaperTradingBridge } from "../application/auto-paper-trading-bridge.js";

export class AutoPaperTradingController {
  public constructor(private readonly bridge: AutoPaperTradingBridge) {}

  public submitConfluenceSignal = (
    request: FastifyRequest,
    reply: FastifyReply,
  ): void => {
    const result = this.bridge.tryOpenFromConfluence(request.body);
    const code = result.action === "opened" ? 201 : 200;
    void reply.code(code).send(buildSuccessResponse(request.id, result));
  };

  public triggerEvaluation = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const result = await this.bridge.evaluateOpenTrades();
    void reply.send(buildSuccessResponse(request.id, result));
  };
}
