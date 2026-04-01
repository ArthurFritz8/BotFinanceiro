import Fastify from "fastify";

import { env } from "../shared/config/env.js";
import { httpErrorHandler } from "../shared/errors/http-error-handler.js";
import { logger } from "../shared/logger/logger.js";

export function buildApp() {
  const app = Fastify({
    disableRequestLogging: true,
    logger: false,
  });

  app.setErrorHandler(httpErrorHandler);

  app.addHook("onResponse", (request, reply) => {
    logger.info(
      {
        method: request.method,
        responseTimeMs: reply.elapsedTime,
        route: request.url,
        statusCode: reply.statusCode,
      },
      "Request completed",
    );
  });

  app.get("/health", () => {
    return {
      service: "botfinanceiro-api",
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  });

  app.get("/ready", () => {
    return {
      schedulerEconomyMode: env.SCHEDULER_ECONOMY_MODE,
      schedulerEnabled: env.SCHEDULER_ENABLED,
      status: "ready",
      timestamp: new Date().toISOString(),
    };
  });

  return app;
}