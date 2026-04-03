import type { FastifyInstance } from "fastify";

import {
  getFixedIncomeMarketOverview,
  getFixedIncomeSnapshot,
  getFixedIncomeSnapshotBatch,
} from "./fixed-income-controller.js";

export function registerFixedIncomeRoutes(app: FastifyInstance): void {
  app.get("/fixed-income/market-overview", getFixedIncomeMarketOverview);
  app.get("/fixed-income/snapshot", getFixedIncomeSnapshot);
  app.get("/fixed-income/snapshot/batch", getFixedIncomeSnapshotBatch);
}
