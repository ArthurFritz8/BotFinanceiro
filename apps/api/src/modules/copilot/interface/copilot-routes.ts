import type { FastifyInstance } from "fastify";

import { getCopilotHistory, postCopilotChat } from "./copilot-controller.js";

export function registerCopilotRoutes(app: FastifyInstance): void {
  app.post("/copilot/chat", postCopilotChat);
  app.get("/copilot/history", getCopilotHistory);
}