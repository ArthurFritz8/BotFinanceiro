import type { FastifyInstance } from "fastify";

import {
  getWallStreetMarketOverview,
  getWallStreetSnapshot,
  getWallStreetSnapshotBatch,
} from "./wall-street-controller.js";

export function registerWallStreetRoutes(app: FastifyInstance): void {
  app.get("/wall-street/market-overview", getWallStreetMarketOverview);
  app.get("/wall-street/snapshot", getWallStreetSnapshot);
  app.get("/wall-street/snapshot/batch", getWallStreetSnapshotBatch);
}
