import type { FastifyInstance } from "fastify";

import {
  getEquitiesMarketOverview,
  getEquitiesSnapshot,
  getEquitiesSnapshotBatch,
} from "./equities-controller.js";

export function registerEquitiesRoutes(app: FastifyInstance): void {
  app.get("/equities/market-overview", getEquitiesMarketOverview);
  app.get("/equities/snapshot", getEquitiesSnapshot);
  app.get("/equities/snapshot/batch", getEquitiesSnapshotBatch);
}
