import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from "fastify";

import { assertInternalRouteAuth } from "../../../shared/http/internal-route-auth.js";
import {
  clearOperationalHealthHistory,
  exportOperationalHealthHistoryAggregatedCsv,
  exportOperationalHealthHistoryCsv,
  getHealth,
  getOperationalHealthHistoryAggregated,
  getOperationalHealth,
  getOperationalHealthHistory,
  getReady,
  getSchedulerMetrics,
} from "./system-controller.js";

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

export function registerSystemRoutes(app: FastifyInstance): void {
  app.get("/health", getHealth);
  app.get("/ready", getReady);
  app.get("/internal/scheduler/crypto-metrics", internalRouteOptions, getSchedulerMetrics);
  app.get("/internal/health/operational", internalRouteOptions, getOperationalHealth);
  app.get(
    "/internal/health/operational/history",
    internalRouteOptions,
    getOperationalHealthHistory,
  );
  app.get(
    "/internal/health/operational/history.csv",
    internalRouteOptions,
    exportOperationalHealthHistoryCsv,
  );
  app.get(
    "/internal/health/operational/history/aggregate",
    internalRouteOptions,
    getOperationalHealthHistoryAggregated,
  );
  app.get(
    "/internal/health/operational/history/aggregate.csv",
    internalRouteOptions,
    exportOperationalHealthHistoryAggregatedCsv,
  );
  app.delete(
    "/internal/health/operational/history",
    internalRouteOptions,
    clearOperationalHealthHistory,
  );
}