import type { FastifyReply, FastifyRequest } from "fastify";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import type { BacktestEngine } from "../application/backtest-engine.js";

export class BacktestingController {
  public constructor(private readonly engine: BacktestEngine) {}

  public runBacktest = (request: FastifyRequest, reply: FastifyReply): void => {
    const result = this.engine.run(request.body);
    void reply.send(buildSuccessResponse(request.id, result));
  };
}
