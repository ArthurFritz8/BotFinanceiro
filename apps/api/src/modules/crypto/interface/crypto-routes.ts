import type { FastifyInstance } from "fastify";

import { getChart, getSpotPrice, getSyncPolicy } from "./crypto-controller.js";

export function registerCryptoRoutes(app: FastifyInstance): void {
  app.get("/crypto/chart", getChart);
  app.get("/crypto/spot-price", getSpotPrice);
  app.get("/crypto/sync-policy", getSyncPolicy);
}