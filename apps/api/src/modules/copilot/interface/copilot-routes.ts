import type { FastifyInstance } from "fastify";

import { getCopilotHistory, postCopilotChat, postCopilotChatStream } from "./copilot-controller.js";

export function registerCopilotRoutes(app: FastifyInstance): void {
  app.post("/copilot/chat", postCopilotChat);
  app.post("/copilot/chat/stream", postCopilotChatStream);
  app.get("/copilot/history", getCopilotHistory);
}
