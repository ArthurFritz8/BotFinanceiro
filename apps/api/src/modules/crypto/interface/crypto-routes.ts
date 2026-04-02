import type { FastifyInstance } from "fastify";

import {
  getChart,
  getLiveChart,
  getMarketOverview,
  getSpotPrice,
  getSpotPriceBatch,
  getSyncPolicy,
} from "./crypto-controller.js";

export function registerCryptoRoutes(app: FastifyInstance): void {
  app.get("/crypto/chart", getChart);
  app.get("/crypto/live-chart", getLiveChart);
  app.get("/crypto/market-overview", getMarketOverview);
  app.get("/crypto/spot-price", getSpotPrice);
  app.get("/crypto/spot-price/batch", getSpotPriceBatch);
  app.get("/crypto/sync-policy", getSyncPolicy);
}
