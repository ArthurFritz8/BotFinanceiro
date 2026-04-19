import type { FastifyReply, FastifyRequest } from "fastify";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import type { BacktestEngine } from "../application/backtest-engine.js";
import type { BacktestingService } from "../application/backtesting-service.js";

export class BacktestingController {
  public constructor(
    private readonly engine: BacktestEngine,
    private readonly service: BacktestingService,
  ) {}

  public runBacktest = (request: FastifyRequest, reply: FastifyReply): void => {
    const result = this.engine.run(request.body);
    void reply.send(buildSuccessResponse(request.id, result));
  };

  public runBacktestForAsset = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const result = await this.service.runForAsset(request.body);
    void reply.send(buildSuccessResponse(request.id, result));
  };
}
