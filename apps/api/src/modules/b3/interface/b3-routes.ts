import type { FastifyInstance } from "fastify";

import {
  getB3MarketOverview,
  getB3Snapshot,
  getB3SnapshotBatch,
} from "./b3-controller.js";

export function registerB3Routes(app: FastifyInstance): void {
  app.get("/b3/market-overview", getB3MarketOverview);
  app.get("/b3/snapshot", getB3Snapshot);
  app.get("/b3/snapshot/batch", getB3SnapshotBatch);
}
