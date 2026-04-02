import type { FastifyInstance } from "fastify";

import { getBrokerCatalog, getBrokerLiveQuote } from "./brokers-controller.js";

export function registerBrokersRoutes(app: FastifyInstance): void {
  app.get("/brokers/catalog", getBrokerCatalog);
  app.get("/brokers/live-quote", getBrokerLiveQuote);
}
