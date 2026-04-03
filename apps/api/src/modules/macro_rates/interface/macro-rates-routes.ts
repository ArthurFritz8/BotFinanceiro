import type { FastifyInstance } from "fastify";

import {
  getMacroRatesMarketOverview,
  getMacroRatesSnapshot,
  getMacroRatesSnapshotBatch,
} from "./macro-rates-controller.js";

export function registerMacroRatesRoutes(app: FastifyInstance): void {
  app.get("/macro-rates/market-overview", getMacroRatesMarketOverview);
  app.get("/macro-rates/snapshot", getMacroRatesSnapshot);
  app.get("/macro-rates/snapshot/batch", getMacroRatesSnapshotBatch);
}