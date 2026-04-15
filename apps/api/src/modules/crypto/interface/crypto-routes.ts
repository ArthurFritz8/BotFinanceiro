import type { FastifyInstance } from "fastify";

import {
  getChart,
  getCryptoStrategyChart,
  getLiveChart,
  getMarketOverview,
  getNewsIntelligence,
  getSpotPrice,
  getSpotPriceBatch,
  getSyncPolicy,
  streamLiveChart,
} from "./crypto-controller.js";

export function registerCryptoRoutes(app: FastifyInstance): void {
  app.get("/crypto/chart", getChart);
  app.get("/crypto/strategy-chart", getCryptoStrategyChart);
  app.get("/crypto/live-chart", getLiveChart);
  app.get("/crypto/live-stream", streamLiveChart);
  app.get("/crypto/market-overview", getMarketOverview);
  app.get("/crypto/news-intelligence", getNewsIntelligence);
  app.get("/crypto/spot-price", getSpotPrice);
  app.get("/crypto/spot-price/batch", getSpotPriceBatch);
  app.get("/crypto/sync-policy", getSyncPolicy);
}
