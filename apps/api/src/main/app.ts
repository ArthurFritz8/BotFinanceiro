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
import { PaperTradingService } from "../modules/paper_trading/application/paper-trading-service.js";
import { AutoPaperTradingBridge } from "../modules/paper_trading/application/auto-paper-trading-bridge.js";
import { JsonlTradeStore } from "../modules/paper_trading/infrastructure/jsonl-trade-store.js";
import { InMemoryOperatorDispatchJournal, renderOperatorDispatchPrometheusFragment } from "../modules/paper_trading/infrastructure/in-memory-operator-dispatch-journal.js";
import { PaperTradingController } from "../modules/paper_trading/interface/paper-trading-controller.js";
import { AutoPaperTradingController } from "../modules/paper_trading/interface/auto-paper-trading-controller.js";
import {
  registerPaperTradingInternalRoutes,
  registerPaperTradingPublicRoutes,
} from "../modules/paper_trading/interface/paper-trading-routes.js";
import { AutoPaperTradingJobRunner } from "../jobs/auto-paper-trading-job-runner.js";
import { RegimeAlertsScannerJobRunner } from "../jobs/regime-alerts-scanner-job-runner.js";
import { registerRegimeAlertsScannerRoutes } from "../jobs/regime-alerts-scanner-routes.js";
import { MultiExchangeMarketDataAdapter } from "../integrations/market_data/multi-exchange-market-data-adapter.js";
import { BacktestEngine } from "../modules/backtesting/application/backtest-engine.js";
import { BacktestingService } from "../modules/backtesting/application/backtesting-service.js";
import { BacktestingController } from "../modules/backtesting/interface/backtesting-controller.js";
import { JsonlBacktestRunStore } from "../modules/backtesting/infrastructure/jsonl-backtest-run-store.js";
import { JsonlRegimeAlertMutesStore } from "../modules/backtesting/infrastructure/jsonl-regime-alert-mutes-store.js";
import { JsonlRegimeAlertsHistoryStore } from "../modules/backtesting/infrastructure/jsonl-regime-alerts-history-store.js";
import {
  registerBacktestingInternalRoutes,
  registerBacktestingPublicRoutes,
} from "../modules/backtesting/interface/backtesting-routes.js";
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

  // ADR-108: criamos o journal cedo para que o coletor Prometheus consiga
  // ler os contadores cumulativos a cada scrape de `/internal/metrics`.
  // ADR-109: hidratamos a partir do NDJSON em disco para sobreviver a
  // restarts mantendo cumulativos e ring buffer.
  const operatorDispatchJournal = new InMemoryOperatorDispatchJournal({
    filePath: env.OPERATOR_DISPATCH_JOURNAL_FILE,
  });

  registerPrometheusMetrics(app, {
    enabled: env.METRICS_ENABLED,
    collectors: [() => renderOperatorDispatchPrometheusFragment(operatorDispatchJournal)],
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

  const paperTradingStore = new JsonlTradeStore(env.PAPER_TRADING_DATA_FILE);
  const paperTradingService = new PaperTradingService({ store: paperTradingStore });
  const paperTradingController = new PaperTradingController(paperTradingService);

  const autoPaperTradingBroker = env.AUTO_PAPER_TRADING_BROKER;
  const multiExchangeAdapter = new MultiExchangeMarketDataAdapter();
  const autoPaperTradingBridge = new AutoPaperTradingBridge({
    paperTradingService,
    notificationService: notificationsService,
    minTier: env.AUTO_PAPER_TRADING_MIN_TIER,
    priceProvider: async (assetId: string): Promise<number> => {
      const snapshot = await multiExchangeAdapter.getTickerSnapshot({
        assetId,
        broker: autoPaperTradingBroker,
      });
      return snapshot.lastPrice;
    },
    logger: {
      warn: (msg, ctx): void => {
        app.log.warn({ ...ctx }, msg);
      },
    },
  });
  const autoPaperTradingController = new AutoPaperTradingController(
    autoPaperTradingBridge,
    operatorDispatchJournal,
  );

  if (env.PAPER_TRADING_ENABLED) {
    registerPaperTradingInternalRoutes(
      app,
      paperTradingController,
      autoPaperTradingController,
    );
  }

  if (env.PAPER_TRADING_ENABLED && env.AUTO_PAPER_TRADING_ENABLED) {
    const autoPaperTradingJobRunner = new AutoPaperTradingJobRunner({
      bridge: autoPaperTradingBridge,
    });
    autoPaperTradingJobRunner.start();
    app.addHook("onClose", (_instance, done) => {
      autoPaperTradingJobRunner.stop();
      done();
    });
  }

  if (env.BACKTESTING_ENABLED) {
    const backtestEngine = new BacktestEngine();
    const backtestHistoryStore = new JsonlBacktestRunStore(
      env.BACKTESTING_HISTORY_DATA_FILE,
      env.BACKTESTING_HISTORY_MAX_ENTRIES,
    );
    const regimeAlertsHistoryStore = new JsonlRegimeAlertsHistoryStore(
      env.BACKTESTING_REGIME_ALERTS_DATA_FILE,
      env.BACKTESTING_REGIME_ALERTS_MAX_ENTRIES,
    );
    const regimeAlertMutesStore = new JsonlRegimeAlertMutesStore(
      env.BACKTESTING_REGIME_ALERTS_MUTES_DATA_FILE,
      env.BACKTESTING_REGIME_ALERTS_MUTES_MAX_ENTRIES,
    );
    const backtestingService = new BacktestingService({
      engine: backtestEngine,
      marketDataAdapter: multiExchangeAdapter,
      historyStore: backtestHistoryStore,
      alertsHistoryStore: regimeAlertsHistoryStore,
      notifier: notificationsService,
      notificationCooldownMs: env.BACKTESTING_REGIME_ALERTS_NOTIFY_COOLDOWN_MS,
      mutesStore: regimeAlertMutesStore,
    });
    const backtestingController = new BacktestingController(
      backtestEngine,
      backtestingService,
    );
    registerBacktestingInternalRoutes(app, backtestingController);
    const regimeAlertsScannerJobRunner = new RegimeAlertsScannerJobRunner({
      service: backtestingService,
    });
    void app.register(
      (instance, _, done) => {
        registerBacktestingPublicRoutes(instance, backtestingController);
        registerRegimeAlertsScannerRoutes(instance, regimeAlertsScannerJobRunner);
        done();
      },
      { prefix: "/v1" },
    );

    regimeAlertsScannerJobRunner.start();
    app.addHook("onClose", (_instance, done) => {
      regimeAlertsScannerJobRunner.stop();
      done();
    });
  }

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
      if (env.PAPER_TRADING_ENABLED) {
        registerPaperTradingPublicRoutes(
          instance,
          paperTradingController,
          env.AUTO_PAPER_TRADING_ENABLED ? autoPaperTradingController : undefined,
        );
      }
      done();
    },
    { prefix: "/v1" },
  );

  return app;
}