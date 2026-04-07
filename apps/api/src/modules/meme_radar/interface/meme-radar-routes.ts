import type { FastifyInstance } from "fastify";

import {
  getMemeRadarNotifications,
  getMemeRadarRiskAudit,
  setMemeRadarNotificationPinned,
} from "./meme-radar-controller.js";

export function registerMemeRadarRoutes(app: FastifyInstance): void {
  app.get("/meme-radar/notifications", getMemeRadarNotifications);
  app.get("/meme-radar/risk-audit", getMemeRadarRiskAudit);
  app.post("/meme-radar/notifications/:notificationId/pin", setMemeRadarNotificationPinned);
}
