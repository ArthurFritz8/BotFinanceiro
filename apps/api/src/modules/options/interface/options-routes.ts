import type { FastifyInstance } from "fastify";

import {
  getOptionsMarketOverview,
  getOptionsSnapshot,
  getOptionsSnapshotBatch,
} from "./options-controller.js";

export function registerOptionsRoutes(app: FastifyInstance): void {
  app.get("/options/market-overview", getOptionsMarketOverview);
  app.get("/options/snapshot", getOptionsSnapshot);
  app.get("/options/snapshot/batch", getOptionsSnapshotBatch);
}
