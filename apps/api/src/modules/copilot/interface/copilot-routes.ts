import type { FastifyInstance } from "fastify";

import { postCopilotChat } from "./copilot-controller.js";

export function registerCopilotRoutes(app: FastifyInstance): void {
  app.post("/copilot/chat", postCopilotChat);
}