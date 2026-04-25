import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from "fastify";

import { assertInternalRouteAuth } from "../../../shared/http/internal-route-auth.js";
import { assertPaperTradingOperatorAuth } from "../../../shared/http/paper-trading-operator-auth.js";
import type { AutoPaperTradingController } from "./auto-paper-trading-controller.js";
import type { PaperTradingController } from "./paper-trading-controller.js";

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

const operatorRouteOptions = {
  preHandler: (
    request: FastifyRequest,
    _reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void => {
    try {
      assertPaperTradingOperatorAuth(request);
      done();
    } catch (error) {
      done(error as Error);
    }
  },
};

export function registerPaperTradingPublicRoutes(
  app: FastifyInstance,
  controller: PaperTradingController,
  autoController?: AutoPaperTradingController,
): void {
  app.get("/paper-trading/trades", controller.listTrades);
  app.get("/paper-trading/stats", controller.getStats);
  if (autoController) {
    app.post(
      "/paper-trading/operator/auto-signal",
      operatorRouteOptions,
      autoController.submitConfluenceSignal,
    );
  }
}

export function registerPaperTradingInternalRoutes(
  app: FastifyInstance,
  controller: PaperTradingController,
  autoController?: AutoPaperTradingController,
): void {
  app.post(
    "/internal/paper-trading/trades",
    internalRouteOptions,
    controller.openTrade,
  );
  app.post(
    "/internal/paper-trading/evaluate",
    internalRouteOptions,
    controller.evaluatePrice,
  );
  if (autoController) {
    app.post(
      "/internal/paper-trading/auto-signal",
      internalRouteOptions,
      autoController.submitConfluenceSignal,
    );
    app.post(
      "/internal/paper-trading/auto-evaluate",
      internalRouteOptions,
      autoController.triggerEvaluation,
    );
  }
}
