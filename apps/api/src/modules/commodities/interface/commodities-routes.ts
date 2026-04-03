import type { FastifyInstance } from "fastify";

import {
  getCommoditiesMarketOverview,
  getCommoditiesSnapshot,
  getCommoditiesSnapshotBatch,
} from "./commodities-controller.js";

export function registerCommoditiesRoutes(app: FastifyInstance): void {
  app.get("/commodities/market-overview", getCommoditiesMarketOverview);
  app.get("/commodities/snapshot", getCommoditiesSnapshot);
  app.get("/commodities/snapshot/batch", getCommoditiesSnapshotBatch);
}
