import {
  cryptoSyncJobRunner,
  type CryptoSchedulerScopeMetrics,
  type CryptoSchedulerMetricsSnapshot,
} from "../../../jobs/crypto-sync-job-runner.js";
import { env } from "../../../shared/config/env.js";
import {
  operationalHealthHistoryStore,
  type PersistedOperationalHealthRecord,
} from "../../../shared/observability/operational-health-history-store.js";

export interface HealthStatus {
  service: string;
  status: "ok";
}

export interface ReadinessStatus {
  schedulerEconomyMode: boolean;
  schedulerEnabled: boolean;
  status: "ready";
}

type OperationalSeverity = "critical" | "warning";

export interface OperationalHealthReason {
  code: string;
  details?: unknown;
  message: string;
  severity: OperationalSeverity;
}

export interface ScopeFailureRateSummary {
  failureRatePercent: number;
  failed: number;
  processed: number;
  scope: string;
  synced: number;
}

export interface OperationalHealthStatus {
  diagnostics: {
    budgetRemainingPercent: number;
    circuitState: CryptoSchedulerMetricsSnapshot["providers"]["coingecko"]["circuit"]["state"];
    consecutiveOpenCycles: number;
    scopeFailureRates: ScopeFailureRateSummary[];
  };
  evaluatedAt: string;
  reasons: OperationalHealthReason[];
  status: "critical" | "ok" | "warning";
}

export interface OperationalHealthHistory {
  limit: number;
  records: PersistedOperationalHealthRecord[];
  totalStored: number;
}

export interface OperationalHealthHistoryClearResult {
  clearedAt: string;
  removedCount: number;
}

export interface OperationalHealthHistoryCsvExport {
  csv: string;
  exportedCount: number;
  fileName: string;
  generatedAt: string;
  limit: number;
  totalStored: number;
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const raw = String(value);

  if (raw.includes("\"") || raw.includes(",") || raw.includes("\n") || raw.includes("\r")) {
    return `"${raw.replaceAll("\"", "\"\"")}"`;
  }

  return raw;
}

function buildCsvRow(values: unknown[]): string {
  return values.map((value) => csvEscape(value)).join(",");
}

function getScopeFailureRate(
  record: PersistedOperationalHealthRecord,
  scope: string,
): number {
  const scopeRate = record.snapshot.diagnostics.scopeFailureRates.find(
    (item) => item.scope === scope,
  );

  return scopeRate ? scopeRate.failureRatePercent : 0;
}

function buildScopeFailureRateSummary(
  scope: string,
  metrics: CryptoSchedulerScopeMetrics,
): ScopeFailureRateSummary {
  const processed = metrics.lastRunFailed + metrics.lastRunSynced;
  const failureRatePercent =
    processed > 0 ? roundToTwoDecimals((metrics.lastRunFailed / processed) * 100) : 0;

  return {
    failureRatePercent,
    failed: metrics.lastRunFailed,
    processed,
    scope,
    synced: metrics.lastRunSynced,
  };
}

export class SystemStatusService {
  public getHealthStatus(): HealthStatus {
    return {
      service: "botfinanceiro-api",
      status: "ok",
    };
  }

  public getReadinessStatus(): ReadinessStatus {
    return {
      schedulerEconomyMode: env.SCHEDULER_ECONOMY_MODE,
      schedulerEnabled: env.SCHEDULER_ENABLED,
      status: "ready",
    };
  }

  public getSchedulerMetrics(): CryptoSchedulerMetricsSnapshot {
    return cryptoSyncJobRunner.getMetricsSnapshot();
  }

  public getOperationalHealth(): OperationalHealthStatus {
    const schedulerMetrics = this.getSchedulerMetrics();
    const reasons: OperationalHealthReason[] = [];
    const budgetRemainingPercent =
      schedulerMetrics.dailyBudget.limit > 0
        ? roundToTwoDecimals(
            (schedulerMetrics.dailyBudget.remaining / schedulerMetrics.dailyBudget.limit) * 100,
          )
        : 0;

    if (!schedulerMetrics.schedulerEnabled) {
      reasons.push({
        code: "SCHEDULER_DISABLED",
        message: "Scheduler is disabled by configuration",
        severity: "warning",
      });
    }

    if (!schedulerMetrics.schedulerStarted && schedulerMetrics.schedulerEnabled) {
      reasons.push({
        code: "SCHEDULER_NOT_STARTED",
        message: "Scheduler is enabled but not started",
        severity: "critical",
      });
    }

    if (budgetRemainingPercent <= env.OPS_HEALTH_CRITICAL_BUDGET_PERCENT) {
      reasons.push({
        code: "BUDGET_CRITICAL",
        details: {
          remainingPercent: budgetRemainingPercent,
          threshold: env.OPS_HEALTH_CRITICAL_BUDGET_PERCENT,
        },
        message: "Provider daily budget is in critical range",
        severity: "critical",
      });
    } else if (budgetRemainingPercent <= env.OPS_HEALTH_WARNING_BUDGET_PERCENT) {
      reasons.push({
        code: "BUDGET_WARNING",
        details: {
          remainingPercent: budgetRemainingPercent,
          threshold: env.OPS_HEALTH_WARNING_BUDGET_PERCENT,
        },
        message: "Provider daily budget is in warning range",
        severity: "warning",
      });
    }

    const circuitState = schedulerMetrics.providers.coingecko.circuit.state;
    const consecutiveOpenCycles = schedulerMetrics.providers.coingecko.alerts.consecutiveOpenCycles;
    const openCyclesThreshold = schedulerMetrics.providers.coingecko.alerts.openCyclesThreshold;

    if (circuitState === "open" && consecutiveOpenCycles >= openCyclesThreshold) {
      reasons.push({
        code: "CIRCUIT_OPEN_CONSECUTIVE",
        details: {
          consecutiveOpenCycles,
          threshold: openCyclesThreshold,
        },
        message: "CoinGecko circuit is open for consecutive cycles",
        severity: "critical",
      });
    } else if (circuitState === "open") {
      reasons.push({
        code: "CIRCUIT_OPEN",
        message: "CoinGecko circuit is open",
        severity: "warning",
      });
    } else if (circuitState === "half_open") {
      reasons.push({
        code: "CIRCUIT_HALF_OPEN",
        message: "CoinGecko circuit is half-open",
        severity: "warning",
      });
    }

    const scopeFailureRates: ScopeFailureRateSummary[] = [
      buildScopeFailureRateSummary("hot", schedulerMetrics.scopes.hot),
      buildScopeFailureRateSummary("warm", schedulerMetrics.scopes.warm),
      buildScopeFailureRateSummary("cold", schedulerMetrics.scopes.cold),
    ];

    for (const summary of scopeFailureRates) {
      if (summary.processed === 0) {
        continue;
      }

      if (summary.failureRatePercent >= env.OPS_HEALTH_CRITICAL_SCOPE_FAILURE_RATE_PERCENT) {
        reasons.push({
          code: "SCOPE_FAILURE_RATE_CRITICAL",
          details: {
            failureRatePercent: summary.failureRatePercent,
            scope: summary.scope,
            threshold: env.OPS_HEALTH_CRITICAL_SCOPE_FAILURE_RATE_PERCENT,
          },
          message: `Scope ${summary.scope} failure rate is critical`,
          severity: "critical",
        });
        continue;
      }

      if (summary.failureRatePercent >= env.OPS_HEALTH_WARNING_SCOPE_FAILURE_RATE_PERCENT) {
        reasons.push({
          code: "SCOPE_FAILURE_RATE_WARNING",
          details: {
            failureRatePercent: summary.failureRatePercent,
            scope: summary.scope,
            threshold: env.OPS_HEALTH_WARNING_SCOPE_FAILURE_RATE_PERCENT,
          },
          message: `Scope ${summary.scope} failure rate is high`,
          severity: "warning",
        });
      }
    }

    const status: OperationalHealthStatus["status"] = reasons.some(
      (reason) => reason.severity === "critical",
    )
      ? "critical"
      : reasons.some((reason) => reason.severity === "warning")
        ? "warning"
        : "ok";

    return {
      diagnostics: {
        budgetRemainingPercent,
        circuitState,
        consecutiveOpenCycles,
        scopeFailureRates,
      },
      evaluatedAt: new Date().toISOString(),
      reasons,
      status,
    };
  }

  public getOperationalHealthHistory(limit = 50): OperationalHealthHistory {
    const safeLimit = Math.max(1, Math.min(limit, env.OPS_HEALTH_SNAPSHOT_MAX_ITEMS));
    const records = operationalHealthHistoryStore.getRecent(safeLimit);

    return {
      limit: safeLimit,
      records,
      totalStored: operationalHealthHistoryStore.getStoredCount(),
    };
  }

  public async clearOperationalHealthHistory(): Promise<OperationalHealthHistoryClearResult> {
    return operationalHealthHistoryStore.clear();
  }

  public getOperationalHealthHistoryCsv(limit = 50): OperationalHealthHistoryCsvExport {
    const history = this.getOperationalHealthHistory(limit);
    const headers = [
      "recorded_at",
      "status",
      "evaluated_at",
      "budget_remaining_percent",
      "circuit_state",
      "consecutive_open_cycles",
      "reasons_count",
      "reason_codes",
      "reason_messages",
      "hot_failure_rate_percent",
      "warm_failure_rate_percent",
      "cold_failure_rate_percent",
    ];

    const lines = [buildCsvRow(headers)];

    for (const record of history.records) {
      const reasonCodes = record.snapshot.reasons.map((reason) => reason.code).join("|");
      const reasonMessages = record.snapshot.reasons.map((reason) => reason.message).join("|");

      lines.push(
        buildCsvRow([
          record.recordedAt,
          record.snapshot.status,
          record.snapshot.evaluatedAt,
          record.snapshot.diagnostics.budgetRemainingPercent,
          record.snapshot.diagnostics.circuitState,
          record.snapshot.diagnostics.consecutiveOpenCycles,
          record.snapshot.reasons.length,
          reasonCodes,
          reasonMessages,
          getScopeFailureRate(record, "hot"),
          getScopeFailureRate(record, "warm"),
          getScopeFailureRate(record, "cold"),
        ]),
      );
    }

    const generatedAt = new Date().toISOString();
    const safeDate = generatedAt.replaceAll(":", "-").replaceAll(".", "-");

    return {
      csv: lines.join("\n"),
      exportedCount: history.records.length,
      fileName: `operational-health-history-${safeDate}.csv`,
      generatedAt,
      limit: history.limit,
      totalStored: history.totalStored,
    };
  }
}