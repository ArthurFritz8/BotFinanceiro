import type { AutoPaperTradingBridge } from "../modules/paper_trading/application/auto-paper-trading-bridge.js";
import { env } from "../shared/config/env.js";
import { logger } from "../shared/logger/logger.js";

export interface AutoPaperTradingJobRunnerOptions {
  readonly bridge: AutoPaperTradingBridge;
  readonly intervalMs?: number;
}

/**
 * Tickera periodicamente, busca preco corrente para cada ativo com trade
 * aberto e delega ao AutoPaperTradingBridge.evaluateOpenTrades. Failure-soft:
 * erros sao logados mas nao quebram o ciclo (proxima iteracao tenta novamente).
 *
 * Use `unref()` para nao prender o event loop e permitir shutdown limpo.
 */
export class AutoPaperTradingJobRunner {
  private intervalHandle: NodeJS.Timeout | null = null;

  private started = false;

  public constructor(private readonly options: AutoPaperTradingJobRunnerOptions) {}

  public start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    if (!env.AUTO_PAPER_TRADING_ENABLED) {
      logger.info("Auto paper trading job disabled by environment");
      return;
    }

    const intervalMs =
      this.options.intervalMs ?? env.AUTO_PAPER_TRADING_INTERVAL_SECONDS * 1000;

    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.intervalHandle.unref();

    logger.info(
      { intervalMs },
      "Auto paper trading evaluator job started",
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
    logger.info("Auto paper trading evaluator job stopped");
  }

  private async tick(): Promise<void> {
    try {
      const result = await this.options.bridge.evaluateOpenTrades();
      if (result.evaluated > 0 || result.closed > 0 || result.errors > 0) {
        logger.info(
          {
            evaluated: result.evaluated,
            closed: result.closed,
            errors: result.errors,
          },
          "Auto paper trading evaluator tick",
        );
      }
    } catch (error) {
      logger.warn({ err: error }, "Auto paper trading evaluator tick failed");
    }
  }
}
