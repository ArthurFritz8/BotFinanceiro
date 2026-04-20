import type { BacktestingService } from "../modules/backtesting/application/backtesting-service.js";
import { env } from "../shared/config/env.js";
import { logger } from "../shared/logger/logger.js";

export interface RegimeAlertsScannerJobRunnerOptions {
  readonly service: BacktestingService;
  readonly intervalMs?: number;
}

/**
 * Tickera periodicamente chamando `BacktestingService.computeRegimeAlerts()`,
 * que internamente persiste criticals novos e dispara push notifications
 * (Wave 24 / ADR-064) respeitando o cooldown anti-spam. Sem este job,
 * alertas so seriam detectados quando a UI faz GET ou nova rodada compare
 * e executada — periodicidade garante deteccao mesmo em uso ocioso
 * (Wave 25 / ADR-065).
 *
 * Failure-soft: erros sao logados mas nao quebram o ciclo. `unref()` para
 * nao prender o event loop.
 */
export class RegimeAlertsScannerJobRunner {
  private intervalHandle: NodeJS.Timeout | null = null;

  private started = false;

  public constructor(
    private readonly options: RegimeAlertsScannerJobRunnerOptions,
  ) {}

  public start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    if (!env.BACKTESTING_REGIME_ALERTS_SCAN_ENABLED) {
      logger.info("Regime alerts scanner job disabled by environment");
      return;
    }

    const intervalMs =
      this.options.intervalMs ?? env.BACKTESTING_REGIME_ALERTS_SCAN_INTERVAL_MS;

    this.intervalHandle = setInterval(() => {
      this.tick();
    }, intervalMs);
    this.intervalHandle.unref();

    logger.info({ intervalMs }, "Regime alerts scanner job started");
  }

  public stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    logger.info("Regime alerts scanner job stopped");
  }

  /**
   * Executa um scan unico. Exposto para testes. computeRegimeAlerts e
   * sincrono, mas envolvemos em try/catch para garantir failure-soft.
   */
  public tick(): void {
    try {
      const alerts = this.options.service.computeRegimeAlerts();
      if (alerts.length > 0) {
        logger.info(
          {
            total: alerts.length,
            critical: alerts.filter((a) => a.severity === "critical").length,
          },
          "Regime alerts scanner tick",
        );
      }
    } catch (error) {
      logger.warn({ err: error }, "Regime alerts scanner tick failed");
    }
  }
}
