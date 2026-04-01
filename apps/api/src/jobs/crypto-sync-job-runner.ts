import {
  CryptoSpotPriceService,
} from "../modules/crypto/application/crypto-spot-price-service.js";
import {
  CryptoSyncPolicyService,
  type SyncScope,
} from "../modules/crypto/application/crypto-sync-policy-service.js";
import { env } from "../shared/config/env.js";
import { logger } from "../shared/logger/logger.js";
import { DailyBudgetGuard } from "../shared/scheduler/daily-budget-guard.js";
import { TokenBucketRateLimiter } from "../shared/scheduler/token-bucket-rate-limiter.js";

interface ScopeSchedule {
  assets: string[];
  intervalSeconds: number;
  scope: SyncScope;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export class CryptoSyncJobRunner {
  private readonly budgetGuard = new DailyBudgetGuard(env.COINGECKO_DAILY_BUDGET);
  private readonly rateLimiter = new TokenBucketRateLimiter(
    env.COINGECKO_MAX_REQUESTS_PER_MINUTE,
    env.COINGECKO_MAX_REQUESTS_PER_MINUTE / 60,
  );
  private readonly syncPolicyService = new CryptoSyncPolicyService();
  private readonly spotPriceService = new CryptoSpotPriceService();
  private readonly timeoutSet = new Set<NodeJS.Timeout>();

  private started = false;

  public start(): void {
    if (this.started) {
      return;
    }

    this.started = true;

    if (!env.SCHEDULER_ENABLED) {
      logger.info("Scheduler disabled by environment");
      return;
    }

    const schedules = this.buildScopeSchedules();

    logger.info(
      {
        dailyBudget: env.COINGECKO_DAILY_BUDGET,
        maxRequestsPerMinute: env.COINGECKO_MAX_REQUESTS_PER_MINUTE,
        scopes: schedules.map((schedule) => ({
          assets: schedule.assets,
          intervalSeconds: schedule.intervalSeconds,
          scope: schedule.scope,
        })),
        targetCurrency: env.CRYPTO_SYNC_TARGET_CURRENCY,
      },
      "Crypto sync scheduler started",
    );

    for (const schedule of schedules) {
      this.scheduleScopeRun(schedule, this.computeInitialDelayMs(schedule.intervalSeconds));
    }
  }

  public stop(): void {
    if (!this.started) {
      return;
    }

    this.started = false;

    for (const timeoutHandle of this.timeoutSet) {
      clearTimeout(timeoutHandle);
    }

    this.timeoutSet.clear();
    logger.info("Crypto sync scheduler stopped");
  }

  private buildScopeSchedules(): ScopeSchedule[] {
    const fullPolicy = this.syncPolicyService.getPolicy();

    return [
      {
        assets: env.CRYPTO_SYNC_HOT_ASSETS,
        intervalSeconds: fullPolicy.policy.hot.intervalSeconds,
        scope: "hot",
      },
      {
        assets: env.CRYPTO_SYNC_WARM_ASSETS,
        intervalSeconds: fullPolicy.policy.warm.intervalSeconds,
        scope: "warm",
      },
      {
        assets: env.CRYPTO_SYNC_COLD_ASSETS,
        intervalSeconds: fullPolicy.policy.cold.intervalSeconds,
        scope: "cold",
      },
    ];
  }

  private computeInitialDelayMs(intervalSeconds: number): number {
    const intervalMs = intervalSeconds * 1000;
    const capMs = Math.min(intervalMs, 15_000);

    return Math.max(1_000, Math.floor(Math.random() * capMs));
  }

  private computeIntervalWithJitterMs(intervalSeconds: number): number {
    const baseIntervalMs = intervalSeconds * 1000;
    const jitterWindowMs = Math.floor(
      (baseIntervalMs * env.SCHEDULER_JITTER_MAX_PERCENT) / 100,
    );
    const jitterMs = jitterWindowMs > 0 ? Math.floor(Math.random() * (jitterWindowMs + 1)) : 0;

    return baseIntervalMs + jitterMs;
  }

  private getInterRequestDelayMs(): number {
    return Math.ceil(60_000 / env.COINGECKO_MAX_REQUESTS_PER_MINUTE);
  }

  private scheduleScopeRun(schedule: ScopeSchedule, delayMs: number): void {
    const timeoutHandle = setTimeout(() => {
      this.timeoutSet.delete(timeoutHandle);

      void this.runScopeCycle(schedule)
        .catch((error: unknown) => {
          logger.error(
            {
              err: error,
              scope: schedule.scope,
            },
            "Unexpected scheduler cycle failure",
          );
        })
        .finally(() => {
          if (!this.started || !env.SCHEDULER_ENABLED) {
            return;
          }

          this.scheduleScopeRun(
            schedule,
            this.computeIntervalWithJitterMs(schedule.intervalSeconds),
          );
        });
    }, delayMs);

    timeoutHandle.unref();
    this.timeoutSet.add(timeoutHandle);
  }

  private async runScopeCycle(schedule: ScopeSchedule): Promise<void> {
    const startedAt = Date.now();
    let synced = 0;
    let failed = 0;
    let skippedByBudget = 0;
    let skippedByRate = 0;
    let processedAssets = 0;

    for (const assetId of schedule.assets) {
      if (!this.started) {
        return;
      }

      if (!this.budgetGuard.canConsume(1)) {
        skippedByBudget += schedule.assets.length - processedAssets;

        logger.warn(
          {
            consumedToday: this.budgetGuard.getConsumed(),
            dailyBudget: env.COINGECKO_DAILY_BUDGET,
            remainingToday: this.budgetGuard.getRemaining(),
            scope: schedule.scope,
          },
          "Skipping sync cycle due daily budget exhaustion",
        );

        break;
      }

      if (!this.rateLimiter.tryConsume(1)) {
        skippedByRate += 1;
        processedAssets += 1;
        continue;
      }

      try {
        await this.spotPriceService.refreshSpotPrice({
          assetId,
          currency: env.CRYPTO_SYNC_TARGET_CURRENCY,
        });

        this.budgetGuard.consume(1);
        synced += 1;
      } catch (error) {
        this.budgetGuard.consume(1);
        failed += 1;

        logger.warn(
          {
            assetId,
            currency: env.CRYPTO_SYNC_TARGET_CURRENCY,
            err: error,
            scope: schedule.scope,
          },
          "Failed to refresh crypto spot price in scheduler",
        );
      }

      processedAssets += 1;
      await sleep(this.getInterRequestDelayMs());
    }

    logger.info(
      {
        availableTokens: this.rateLimiter.getAvailableTokens(),
        failed,
        remainingBudget: this.budgetGuard.getRemaining(),
        runDurationMs: Date.now() - startedAt,
        scope: schedule.scope,
        skippedByBudget,
        skippedByRate,
        synced,
      },
      "Crypto sync scope cycle completed",
    );
  }
}

export const cryptoSyncJobRunner = new CryptoSyncJobRunner();