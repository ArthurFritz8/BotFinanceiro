import type { FastifyInstance } from "fastify";

import {
  getForexMarketOverview,
  getForexSpotRate,
  getForexSpotRateBatch,
} from "./forex-controller.js";

export function registerForexRoutes(app: FastifyInstance): void {
  app.get("/forex/market-overview", getForexMarketOverview);
  app.get("/forex/spot-rate", getForexSpotRate);
  app.get("/forex/spot-rate/batch", getForexSpotRateBatch);
}
