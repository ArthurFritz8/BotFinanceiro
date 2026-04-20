import type { BacktestingService } from "../modules/backtesting/application/backtesting-service.js";
import { env } from "../shared/config/env.js";
import { logger } from "../shared/logger/logger.js";

export interface RegimeAlertsScannerJobRunnerOptions {
  readonly service: BacktestingService;
  readonly intervalMs?: number;
  /** Clock injetavel para tests (default Date.now). */
  readonly clock?: () => number;
}

/**
 * Snapshot de status do scanner exposto via UI/HTTP (Wave 27 / ADR-067).
 * Todos os campos sao "ultima execucao" exceto contadores cumulativos
 * `ticksTotal` e `ticksFailed`. `nextTickAtMs` e estimado como
 * `lastTickAtMs + intervalMs`; pode ser `null` antes do primeiro tick.
 */
export interface RegimeAlertsScannerStatus {
  readonly enabled: boolean;
  readonly running: boolean;
  readonly intervalMs: number;
  readonly ticksTotal: number;
  readonly ticksFailed: number;
  readonly lastTickAtMs: number | null;
  readonly lastDurationMs: number | null;
  readonly lastAlertsTotal: number | null;
  readonly lastAlertsCritical: number | null;
  readonly lastErrorMessage: string | null;
  readonly nextTickAtMs: number | null;
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
 *
 * Wave 27 / ADR-067: expoe `getStatus()` para observabilidade da
 * automacao em uso ocioso.
 */
export class RegimeAlertsScannerJobRunner {
  private intervalHandle: NodeJS.Timeout | null = null;

  private started = false;

  private readonly clock: () => number;

  private readonly intervalMs: number;

  private ticksTotal = 0;

  private ticksFailed = 0;

  private lastTickAtMs: number | null = null;

  private lastDurationMs: number | null = null;

  private lastAlertsTotal: number | null = null;

  private lastAlertsCritical: number | null = null;

  private lastErrorMessage: string | null = null;

  public constructor(
    private readonly options: RegimeAlertsScannerJobRunnerOptions,
  ) {
    this.clock = options.clock ?? ((): number => Date.now());
    this.intervalMs =
      options.intervalMs ?? env.BACKTESTING_REGIME_ALERTS_SCAN_INTERVAL_MS;
  }

  public start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    if (!env.BACKTESTING_REGIME_ALERTS_SCAN_ENABLED) {
      logger.info("Regime alerts scanner job disabled by environment");
      return;
    }

    this.intervalHandle = setInterval(() => {
      this.tick();
    }, this.intervalMs);
    this.intervalHandle.unref();

    logger.info(
      { intervalMs: this.intervalMs },
      "Regime alerts scanner job started",
    );
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
   * Atualiza metricas de status (Wave 27 / ADR-067).
   */
  public tick(): void {
    const startedAt = this.clock();
    this.ticksTotal += 1;
    try {
      const alerts = this.options.service.computeRegimeAlerts();
      const finishedAt = this.clock();
      this.lastTickAtMs = finishedAt;
      this.lastDurationMs = finishedAt - startedAt;
      this.lastAlertsTotal = alerts.length;
      this.lastAlertsCritical = alerts.filter(
        (a) => a.severity === "critical",
      ).length;
      this.lastErrorMessage = null;
      if (alerts.length > 0) {
        logger.info(
          {
            total: this.lastAlertsTotal,
            critical: this.lastAlertsCritical,
          },
          "Regime alerts scanner tick",
        );
      }
    } catch (error) {
      const finishedAt = this.clock();
      this.ticksFailed += 1;
      this.lastTickAtMs = finishedAt;
      this.lastDurationMs = finishedAt - startedAt;
      this.lastAlertsTotal = null;
      this.lastAlertsCritical = null;
      this.lastErrorMessage =
        error instanceof Error ? error.message : String(error);
      logger.warn({ err: error }, "Regime alerts scanner tick failed");
    }
  }

  public getStatus(): RegimeAlertsScannerStatus {
    return {
      enabled: env.BACKTESTING_REGIME_ALERTS_SCAN_ENABLED,
      running: this.started && this.intervalHandle !== null,
      intervalMs: this.intervalMs,
      ticksTotal: this.ticksTotal,
      ticksFailed: this.ticksFailed,
      lastTickAtMs: this.lastTickAtMs,
      lastDurationMs: this.lastDurationMs,
      lastAlertsTotal: this.lastAlertsTotal,
      lastAlertsCritical: this.lastAlertsCritical,
      lastErrorMessage: this.lastErrorMessage,
      nextTickAtMs:
        this.started && this.lastTickAtMs !== null
          ? this.lastTickAtMs + this.intervalMs
          : null,
    };
  }
}
