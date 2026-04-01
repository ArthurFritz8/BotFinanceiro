import type { FastifyInstance } from "fastify";

import { assertInternalRouteAuth } from "../../../shared/http/internal-route-auth.js";
import {
  clearOperationalHealthHistory,
  getHealth,
  getOperationalHealth,
  getOperationalHealthHistory,
  getReady,
  getSchedulerMetrics,
} from "./system-controller.js";

const internalRouteOptions = {
  preHandler: (request: Parameters<typeof assertInternalRouteAuth>[0]) => {
    assertInternalRouteAuth(request);
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
  app.delete(
    "/internal/health/operational/history",
    internalRouteOptions,
    clearOperationalHealthHistory,
  );
}