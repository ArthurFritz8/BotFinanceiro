import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from "fastify";

import { assertInternalRouteAuth } from "../../../shared/http/internal-route-auth.js";

import {
  clearBinaryOptionsGhostAuditHistory,
  getBinaryOptionsStrategyChart,
  getBinaryOptionsGhostAuditHistory,
  postBinaryOptionsGhostAuditSettlement,
  streamBinaryOptionsLiveChart,
} from "./binary-options-controller.js";

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

export function registerBinaryOptionsRoutes(app: FastifyInstance): void {
  app.get("/binary-options/live-stream", streamBinaryOptionsLiveChart);
  app.get("/binary-options/strategy-chart", getBinaryOptionsStrategyChart);
  app.post("/binary-options/ghost-audit/settlements", postBinaryOptionsGhostAuditSettlement);
  app.get(
    "/binary-options/ghost-audit/history",
    internalRouteOptions,
    getBinaryOptionsGhostAuditHistory,
  );
  app.delete(
    "/binary-options/ghost-audit/history",
    internalRouteOptions,
    clearBinaryOptionsGhostAuditHistory,
  );
}
