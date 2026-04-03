import type { FastifyInstance } from "fastify";

import {
  getFiisMarketOverview,
  getFiisSnapshot,
  getFiisSnapshotBatch,
} from "./fiis-controller.js";

export function registerFiisRoutes(app: FastifyInstance): void {
  app.get("/fiis/market-overview", getFiisMarketOverview);
  app.get("/fiis/snapshot", getFiisSnapshot);
  app.get("/fiis/snapshot/batch", getFiisSnapshotBatch);
}
