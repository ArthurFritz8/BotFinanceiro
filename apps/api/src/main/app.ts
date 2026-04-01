import Fastify from "fastify";
import cors from "@fastify/cors";

import { registerCopilotRoutes } from "../modules/copilot/interface/copilot-routes.js";
import { registerCryptoRoutes } from "../modules/crypto/interface/crypto-routes.js";
import { registerSystemRoutes } from "../modules/system/interface/system-routes.js";
import { env } from "../shared/config/env.js";
import { httpErrorHandler } from "../shared/errors/http-error-handler.js";
import { logger } from "../shared/logger/logger.js";

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/$/, "");
}

export function buildApp() {
  const app = Fastify({
    disableRequestLogging: true,
    logger: false,
  });

  if (env.CORS_ALLOWED_ORIGINS.length > 0) {
    const allowedOrigins = new Set(env.CORS_ALLOWED_ORIGINS.map((origin) => normalizeOrigin(origin)));

    void app.register(cors, {
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        callback(null, allowedOrigins.has(normalizeOrigin(origin)));
      },
    });

    logger.info(
      {
        allowedOrigins: [...allowedOrigins],
      },
      "CORS enabled",
    );
  }

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

  registerSystemRoutes(app);
  void app.register(
    (instance, _, done) => {
      registerCopilotRoutes(instance);
      registerCryptoRoutes(instance);
      done();
    },
    { prefix: "/v1" },
  );

  return app;
}