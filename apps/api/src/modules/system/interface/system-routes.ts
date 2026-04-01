import type { FastifyInstance } from "fastify";

import { assertInternalRouteAuth } from "../../../shared/http/internal-route-auth.js";
import { getHealth, getReady, getSchedulerMetrics } from "./system-controller.js";

export function registerSystemRoutes(app: FastifyInstance): void {
  app.get("/health", getHealth);
  app.get("/ready", getReady);
  app.get(
    "/internal/scheduler/crypto-metrics",
    {
      preHandler: (request) => {
        assertInternalRouteAuth(request);
      },
    },
    getSchedulerMetrics,
  );
}