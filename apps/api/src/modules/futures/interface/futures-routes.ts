import type { FastifyInstance } from "fastify";

import {
  getFuturesMarketOverview,
  getFuturesSnapshot,
  getFuturesSnapshotBatch,
} from "./futures-controller.js";

export function registerFuturesRoutes(app: FastifyInstance): void {
  app.get("/futures/market-overview", getFuturesMarketOverview);
  app.get("/futures/snapshot", getFuturesSnapshot);
  app.get("/futures/snapshot/batch", getFuturesSnapshotBatch);
}
