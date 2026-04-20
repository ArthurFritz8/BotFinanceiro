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

  public compareBacktestForAsset = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const result = await this.service.compareForAsset(request.body);
    void reply.send(buildSuccessResponse(request.id, result));
  };

  public listBacktestHistory = (
    request: FastifyRequest,
    reply: FastifyReply,
  ): void => {
    const query = request.query as { limit?: string } | undefined;
    let limit: number | undefined;
    if (query?.limit !== undefined) {
      const parsed = Number.parseInt(query.limit, 10);
      if (Number.isFinite(parsed) && parsed > 0) limit = parsed;
    }
    const items = this.service.listHistory(limit);
    void reply.send(
      buildSuccessResponse(request.id, { count: items.length, items }),
    );
  };

  public getBacktestLeaderboard = (
    request: FastifyRequest,
    reply: FastifyReply,
  ): void => {
    const items = this.service.computeLeaderboard();
    void reply.send(
      buildSuccessResponse(request.id, { count: items.length, items }),
    );
  };

  public getBacktestRegimeAlerts = (
    request: FastifyRequest,
    reply: FastifyReply,
  ): void => {
    const query = request.query as
      | {
          recentWindow?: string;
          warningThresholdPercent?: string;
          minTotalRounds?: string;
        }
      | undefined;
    const options: {
      recentWindow?: number;
      warningThresholdPercent?: number;
      minTotalRounds?: number;
    } = {};
    if (query?.recentWindow !== undefined) {
      const parsed = Number.parseInt(query.recentWindow, 10);
      if (Number.isFinite(parsed) && parsed >= 1) options.recentWindow = parsed;
    }
    if (query?.warningThresholdPercent !== undefined) {
      const parsed = Number.parseFloat(query.warningThresholdPercent);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.warningThresholdPercent = parsed;
      }
    }
    if (query?.minTotalRounds !== undefined) {
      const parsed = Number.parseInt(query.minTotalRounds, 10);
      if (Number.isFinite(parsed) && parsed >= 2) {
        options.minTotalRounds = parsed;
      }
    }
    const items = this.service.computeRegimeAlerts(options);
    void reply.send(
      buildSuccessResponse(request.id, { count: items.length, items }),
    );
  };
}
