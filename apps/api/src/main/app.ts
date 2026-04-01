import Fastify from "fastify";

import { registerCopilotRoutes } from "../modules/copilot/interface/copilot-routes.js";
import { registerCryptoRoutes } from "../modules/crypto/interface/crypto-routes.js";
import { registerSystemRoutes } from "../modules/system/interface/system-routes.js";
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