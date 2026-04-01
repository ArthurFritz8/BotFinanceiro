import type { FastifyInstance } from "fastify";

import { getSpotPrice, getSyncPolicy } from "./crypto-controller.js";

export function registerCryptoRoutes(app: FastifyInstance): void {
  app.get("/crypto/spot-price", getSpotPrice);
  app.get("/crypto/sync-policy", getSyncPolicy);
}