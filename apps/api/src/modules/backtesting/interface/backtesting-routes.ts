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
