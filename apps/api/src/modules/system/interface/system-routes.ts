import type { FastifyInstance } from "fastify";

import { getHealth, getReady } from "./system-controller.js";

export function registerSystemRoutes(app: FastifyInstance): void {
  app.get("/health", getHealth);
  app.get("/ready", getReady);
}