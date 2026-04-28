import type { FastifyInstance } from "fastify";

import {
  getAssetCatalog,
  getChart,
  getCryptoStrategyChart,
  getCvd,
  getDerivatives,
  getLiveChart,
  getMarketOverview,
  getNewsIntelligence,
  getOrderbookDepth,
  postIntelligenceSyncTelemetry,
  getSpotPrice,
  getSpotPriceBatch,
  getSyncPolicy,
  streamLiveChart,
} from "./crypto-controller.js";

export function registerCryptoRoutes(app: FastifyInstance): void {
  app.get("/crypto/asset-catalog", getAssetCatalog);
  app.get("/crypto/chart", getChart);
  app.get("/crypto/strategy-chart", getCryptoStrategyChart);
  app.get("/crypto/live-chart", getLiveChart);
  app.get("/crypto/live-stream", streamLiveChart);
  app.get("/crypto/market-overview", getMarketOverview);
  app.get("/crypto/news-intelligence", getNewsIntelligence);
  app.get("/crypto/spot-price", getSpotPrice);
  app.get("/crypto/spot-price/batch", getSpotPriceBatch);
  app.get("/crypto/sync-policy", getSyncPolicy);
  app.post("/crypto/intelligence-sync/telemetry", postIntelligenceSyncTelemetry);
  // ADR-119 — Onda 2: ingestao institucional.
  app.get("/crypto/derivatives", getDerivatives);
  app.get("/crypto/cvd", getCvd);
  app.get("/crypto/orderbook-depth", getOrderbookDepth);
}
