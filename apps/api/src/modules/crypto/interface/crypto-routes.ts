import type { FastifyInstance } from "fastify";

import { getSyncPolicy } from "./crypto-controller.js";

export function registerCryptoRoutes(app: FastifyInstance): void {
  app.get("/crypto/sync-policy", getSyncPolicy);
}