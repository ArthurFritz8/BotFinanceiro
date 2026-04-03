import type { FastifyInstance } from "fastify";

import {
  getPortfolioMarketOverview,
  getPortfolioSnapshot,
  getPortfolioSnapshotBatch,
} from "./portfolios-controller.js";

export function registerPortfoliosRoutes(app: FastifyInstance): void {
  app.get("/portfolios/market-overview", getPortfolioMarketOverview);
  app.get("/portfolios/snapshot", getPortfolioSnapshot);
  app.get("/portfolios/snapshot/batch", getPortfolioSnapshotBatch);
}