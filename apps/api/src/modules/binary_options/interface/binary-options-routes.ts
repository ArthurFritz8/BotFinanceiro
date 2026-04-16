import type { FastifyInstance } from "fastify";

import {
  getBinaryOptionsStrategyChart,
  streamBinaryOptionsLiveChart,
} from "./binary-options-controller.js";

export function registerBinaryOptionsRoutes(app: FastifyInstance): void {
  app.get("/binary-options/live-stream", streamBinaryOptionsLiveChart);
  app.get("/binary-options/strategy-chart", getBinaryOptionsStrategyChart);
}
