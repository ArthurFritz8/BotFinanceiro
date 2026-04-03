import type { FastifyInstance } from "fastify";

import { getAirdropOpportunities } from "./airdrops-controller.js";

export function registerAirdropsRoutes(app: FastifyInstance): void {
  app.get("/airdrops/opportunities", getAirdropOpportunities);
}