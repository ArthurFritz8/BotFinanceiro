import type { FastifyInstance } from "fastify";

import {
  getDefiMarketOverview,
  getDefiSpotRate,
  getDefiSpotRateBatch,
} from "./defi-controller.js";

export function registerDefiRoutes(app: FastifyInstance): void {
  app.get("/defi/market-overview", getDefiMarketOverview);
  app.get("/defi/spot-rate", getDefiSpotRate);
  app.get("/defi/spot-rate/batch", getDefiSpotRateBatch);
}
