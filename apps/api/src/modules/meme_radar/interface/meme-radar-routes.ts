import type { FastifyInstance } from "fastify";

import {
  getMemeRadarNotifications,
  setMemeRadarNotificationPinned,
} from "./meme-radar-controller.js";

export function registerMemeRadarRoutes(app: FastifyInstance): void {
  app.get("/meme-radar/notifications", getMemeRadarNotifications);
  app.post("/meme-radar/notifications/:notificationId/pin", setMemeRadarNotificationPinned);
}
