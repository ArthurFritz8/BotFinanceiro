import type { FastifyInstance } from "fastify";

import {
  getInstitutionalMacroSnapshot,
  getForexMarketOverview,
  getForexSpotRate,
  getForexSpotRateBatch,
  getMacroUpcomingEvents,
} from "./forex-controller.js";

export function registerForexRoutes(app: FastifyInstance): void {
  app.get("/forex/market-overview", getForexMarketOverview);
  app.get("/forex/strategy-chart", getInstitutionalMacroSnapshot);
  app.get("/forex/institutional-macro/snapshot", getInstitutionalMacroSnapshot);
  app.get("/forex/spot-rate", getForexSpotRate);
  app.get("/forex/spot-rate/batch", getForexSpotRateBatch);
  // ADR-121 — Onda 3: alias top-level para macro execution gate.
  app.get("/macro/upcoming-events", getMacroUpcomingEvents);
}
