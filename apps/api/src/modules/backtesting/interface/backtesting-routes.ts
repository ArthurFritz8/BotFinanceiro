import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from "fastify";

import { assertInternalRouteAuth } from "../../../shared/http/internal-route-auth.js";
import type { BacktestingController } from "./backtesting-controller.js";

const internalRouteOptions = {
  preHandler: (
    request: FastifyRequest,
    _reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void => {
    try {
      assertInternalRouteAuth(request);
      done();
    } catch (error) {
      done(error as Error);
    }
  },
};

/**
 * Backtest e leitura pesada (CPU-bound em arrays grandes) — gateamos atras
 * de auth interna para nao expor publicamente. Ainda assim e idempotente,
 * sem efeito colateral persistente.
 */
export function registerBacktestingInternalRoutes(
  app: FastifyInstance,
  controller: BacktestingController,
): void {
  app.post(
    "/internal/backtesting/run",
    internalRouteOptions,
    controller.runBacktest,
  );
}

/**
 * Rota publica para UI: aceita asset+broker+range+strategy, busca candles
 * via MultiExchangeAdapter (zero-cost) e roda backtest. Cap de 1y/365
 * candles ja limita CPU. Rate-limit publico (ADR-050) protege.
 */
export function registerBacktestingPublicRoutes(
  app: FastifyInstance,
  controller: BacktestingController,
): void {
  app.post("/backtesting/run-asset", controller.runBacktestForAsset);
  app.post("/backtesting/compare-asset", controller.compareBacktestForAsset);
}
