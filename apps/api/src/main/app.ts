import Fastify from "fastify";
import cors from "@fastify/cors";

import { registerAirdropsRoutes } from "../modules/airdrops/interface/airdrops-routes.js";
import { registerB3Routes } from "../modules/b3/interface/b3-routes.js";
import { registerBinaryOptionsRoutes } from "../modules/binary_options/interface/binary-options-routes.js";
import { registerBrokersRoutes } from "../modules/brokers/interface/brokers-routes.js";
import { registerCommoditiesRoutes } from "../modules/commodities/interface/commodities-routes.js";
import { registerCopilotRoutes } from "../modules/copilot/interface/copilot-routes.js";
import { registerCryptoRoutes } from "../modules/crypto/interface/crypto-routes.js";
import { registerDefiRoutes } from "../modules/defi/interface/defi-routes.js";
import { registerEquitiesRoutes } from "../modules/equities/interface/equities-routes.js";
import { registerEtfsRoutes } from "../modules/etfs/interface/etfs-routes.js";
import { registerFiisRoutes } from "../modules/fiis/interface/fiis-routes.js";
import { registerFixedIncomeRoutes } from "../modules/fixed_income/interface/fixed-income-routes.js";
import { registerForexRoutes } from "../modules/forex/interface/forex-routes.js";
import { registerFuturesRoutes } from "../modules/futures/interface/futures-routes.js";
import { registerGlobalSectorsRoutes } from "../modules/global_sectors/interface/global-sectors-routes.js";
import { registerMacroRatesRoutes } from "../modules/macro_rates/interface/macro-rates-routes.js";
import { registerMemeRadarRoutes } from "../modules/meme_radar/interface/meme-radar-routes.js";
import { registerOptionsRoutes } from "../modules/options/interface/options-routes.js";
import { registerPortfoliosRoutes } from "../modules/portfolios/interface/portfolios-routes.js";
import { registerSystemRoutes } from "../modules/system/interface/system-routes.js";
import { registerWallStreetRoutes } from "../modules/wall_street/interface/wall-street-routes.js";
import { NotificationService } from "../modules/notifications/application/notification-service.js";
import { InMemoryPushSubscriptionStore } from "../modules/notifications/infrastructure/in-memory-push-subscription-store.js";
import { WebPushSender } from "../modules/notifications/infrastructure/web-push-sender.js";
import { NotificationsController } from "../modules/notifications/interface/notifications-controller.js";
import {
  registerNotificationsInternalRoutes,
  registerNotificationsPublicRoutes,
} from "../modules/notifications/interface/notifications-routes.js";
import { env } from "../shared/config/env.js";
import { httpErrorHandler } from "../shared/errors/http-error-handler.js";
import { logger } from "../shared/logger/logger.js";
import { registerPublicRateLimit } from "./plugins/public-rate-limit-plugin.js";
import { registerSecurityHeaders } from "./plugins/security-headers-plugin.js";
import { registerPrometheusMetrics } from "./plugins/prometheus-metrics-plugin.js";

function normalizeOrigin(value: string): string {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return "";
  }

  try {
    return new URL(trimmedValue).origin;
  } catch {
    return trimmedValue.replace(/\/$/, "");
  }
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

  registerSecurityHeaders(app, {
    enabled: env.SECURITY_HEADERS_ENABLED,
    hstsMaxAgeSeconds: env.SECURITY_HEADERS_HSTS_MAX_AGE_SECONDS,
  });

  registerPublicRateLimit(app, {
    enabled: env.PUBLIC_RATE_LIMIT_ENABLED,
    maxRequests: env.PUBLIC_RATE_LIMIT_MAX_REQUESTS,
    windowMs: env.PUBLIC_RATE_LIMIT_WINDOW_MS,
  });

  registerPrometheusMetrics(app, {
    enabled: env.METRICS_ENABLED,
  });

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
  const notificationsStore = new InMemoryPushSubscriptionStore();
  const notificationsSender =
    env.PUSH_NOTIFICATIONS_ENABLED &&
    env.VAPID_PUBLIC_KEY.length > 0 &&
    env.VAPID_PRIVATE_KEY.length > 0
      ? new WebPushSender({
          vapidPublicKey: env.VAPID_PUBLIC_KEY,
          vapidPrivateKey: env.VAPID_PRIVATE_KEY,
          vapidSubject: env.VAPID_SUBJECT,
        })
      : null;
  const notificationsService = new NotificationService({
    enabled: env.PUSH_NOTIFICATIONS_ENABLED,
    sender: notificationsSender,
    store: notificationsStore,
    vapidPublicKey: env.VAPID_PUBLIC_KEY,
  });
  const notificationsController = new NotificationsController(notificationsService);
  registerNotificationsInternalRoutes(app, notificationsController);
  void app.register(
    (instance, _, done) => {
      registerAirdropsRoutes(instance);
      registerB3Routes(instance);
      registerBinaryOptionsRoutes(instance);
      registerBrokersRoutes(instance);
      registerCommoditiesRoutes(instance);
      registerCopilotRoutes(instance);
      registerCryptoRoutes(instance);
      registerDefiRoutes(instance);
      registerEquitiesRoutes(instance);
      registerEtfsRoutes(instance);
      registerFiisRoutes(instance);
      registerFixedIncomeRoutes(instance);
      registerForexRoutes(instance);
      registerFuturesRoutes(instance);
      registerGlobalSectorsRoutes(instance);
      registerMacroRatesRoutes(instance);
      registerMemeRadarRoutes(instance);
      registerOptionsRoutes(instance);
      registerPortfoliosRoutes(instance);
      registerWallStreetRoutes(instance);
      registerNotificationsPublicRoutes(instance, notificationsController);
      done();
    },
    { prefix: "/v1" },
  );

  return app;
}