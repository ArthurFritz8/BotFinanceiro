import type { FastifyInstance } from "fastify";

import {
  getEtfSnapshot,
  getEtfSnapshotBatch,
  getEtfsMarketOverview,
} from "./etfs-controller.js";

export function registerEtfsRoutes(app: FastifyInstance): void {
  app.get("/etfs/market-overview", getEtfsMarketOverview);
  app.get("/etfs/snapshot", getEtfSnapshot);
  app.get("/etfs/snapshot/batch", getEtfSnapshotBatch);
}