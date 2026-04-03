import {
  cryptoSyncJobRunner,
  type CryptoSchedulerScopeMetrics,
  type CryptoSchedulerMetricsSnapshot,
} from "../../../jobs/crypto-sync-job-runner.js";
import { env } from "../../../shared/config/env.js";
import {
  brokerLiveQuoteStreamMetricsStore,
  type BrokerLiveQuoteStreamMetricsSnapshot,
} from "../../../shared/observability/broker-live-quote-stream-metrics-store.js";
import {
  cryptoLiveChartMetricsStore,
  type CryptoLiveChartMetricsSnapshot,
} from "../../../shared/observability/crypto-live-chart-metrics-store.js";
import {
  airdropsIntelligenceMetricsStore,
  type AirdropsIntelligenceMetricsSnapshot,
} from "../../../shared/observability/airdrops-intelligence-metrics-store.js";
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

export interface BrokerLiveQuoteStreamHealth extends BrokerLiveQuoteStreamMetricsSnapshot {}

export interface CryptoLiveChartHealth extends CryptoLiveChartMetricsSnapshot {}

export interface AirdropsIntelligenceHealth extends AirdropsIntelligenceMetricsSnapshot {}

type OperationalSeverity = "critical" | "warning";

export type OperationalHealthAggregationGranularity = "day" | "hour";

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
  filters: {
    from: string | null;
    to: string | null;
  };
  limit: number;
  records: PersistedOperationalHealthRecord[];
  totalMatched: number;
  totalStored: number;
}

export interface OperationalHealthHistoryClearResult {
  clearedAt: string;
  removedCount: number;
}

interface StatusCountSummary {
  critical: number;
  ok: number;
  warning: number;
}

export interface OperationalHealthAggregatedBucket {
  avgBudgetRemainingPercent: number;
  bucketEnd: string;
  bucketStart: string;
  maxConsecutiveOpenCycles: number;
  maxScopeFailureRatePercent: number;
  sampleCount: number;
  statusCounts: StatusCountSummary;
}

export interface OperationalHealthHistoryAggregated {
  bucketLimit: number;
  buckets: OperationalHealthAggregatedBucket[];
  filters: {
    from: string | null;
    to: string | null;
  };
  granularity: OperationalHealthAggregationGranularity;
  totalBuckets: number;
  totalStored: number;
}

export interface OperationalHealthHistoryAggregatedCsvExport {
  bucketLimit: number;
  csv: string;
  exportedCount: number;
  fileName: string;
  filters: {
    from: string | null;
    to: string | null;
  };
  generatedAt: string;
  granularity: OperationalHealthAggregationGranularity;
  totalBuckets: number;
  totalStored: number;
}

export interface OperationalHealthHistoryCsvExport {
  csv: string;
  exportedCount: number;
  fileName: string;
  filters: {
    from: string | null;
    to: string | null;
  };
  generatedAt: string;
  limit: number;
  totalMatched: number;
  totalStored: number;
}

export interface AirdropsIntelligenceHealthCsvExport {
  csv: string;
  exportedCount: number;
  fileName: string;
  generatedAt: string;
  totalSources: number;
}

export interface BrokerLiveQuoteStreamHealthCsvExport {
  csv: string;
  exportedCount: number;
  fileName: string;
  generatedAt: string;
  totalBrokers: number;
}

export interface CryptoLiveChartHealthCsvExport {
  csv: string;
  exportedCount: number;
  fileName: string;
  generatedAt: string;
  totalBrokers: number;
}

export interface OperationalHistoryQueryOptions {
  from?: Date;
  limit?: number;
  to?: Date;
}

export interface OperationalHistoryAggregationOptions {
  bucketLimit?: number;
  from?: Date;
  granularity?: OperationalHealthAggregationGranularity;
  to?: Date;
}

interface AggregationBucketAccumulator {
  bucketStartMs: number;
  budgetSum: number;
  maxConsecutiveOpenCycles: number;
  maxScopeFailureRatePercent: number;
  sampleCount: number;
  statusCounts: StatusCountSummary;
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

function buildBucketStartMs(
  timestampMs: number,
  granularity: OperationalHealthAggregationGranularity,
): number {
  const date = new Date(timestampMs);

  if (granularity === "day") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }

  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
  );
}

function getBucketDurationMs(granularity: OperationalHealthAggregationGranularity): number {
  return granularity === "day" ? 86_400_000 : 3_600_000;
}

function getMaxScopeFailureRate(record: PersistedOperationalHealthRecord): number {
  return record.snapshot.diagnostics.scopeFailureRates.reduce(
    (currentMax, item) => Math.max(currentMax, item.failureRatePercent),
    0,
  );
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

function applyPeriodFilter(
  records: PersistedOperationalHealthRecord[],
  options: OperationalHistoryQueryOptions,
): PersistedOperationalHealthRecord[] {
  const fromMs = options.from?.getTime();
  const toMs = options.to?.getTime();

  return records.filter((record) => {
    const recordedAtMs = Date.parse(record.recordedAt);

    if (Number.isNaN(recordedAtMs)) {
      return false;
    }

    if (fromMs !== undefined && recordedAtMs < fromMs) {
      return false;
    }

    if (toMs !== undefined && recordedAtMs > toMs) {
      return false;
    }

    return true;
  });
}

function aggregateHistoryByGranularity(
  records: PersistedOperationalHealthRecord[],
  options: OperationalHistoryAggregationOptions,
): OperationalHealthHistoryAggregated {
  const granularity = options.granularity ?? "hour";
  const bucketLimit = Math.max(1, Math.min(options.bucketLimit ?? 48, env.OPS_HEALTH_SNAPSHOT_MAX_ITEMS));
  const filteredRecords = applyPeriodFilter(records, options);
  const accumulators = new Map<number, AggregationBucketAccumulator>();

  for (const record of filteredRecords) {
    const recordedAtMs = Date.parse(record.recordedAt);

    if (Number.isNaN(recordedAtMs)) {
      continue;
    }

    const bucketStartMs = buildBucketStartMs(recordedAtMs, granularity);
    const existingAccumulator = accumulators.get(bucketStartMs);

    if (existingAccumulator) {
      existingAccumulator.budgetSum += record.snapshot.diagnostics.budgetRemainingPercent;
      existingAccumulator.maxConsecutiveOpenCycles = Math.max(
        existingAccumulator.maxConsecutiveOpenCycles,
        record.snapshot.diagnostics.consecutiveOpenCycles,
      );
      existingAccumulator.maxScopeFailureRatePercent = Math.max(
        existingAccumulator.maxScopeFailureRatePercent,
        getMaxScopeFailureRate(record),
      );
      existingAccumulator.sampleCount += 1;
      existingAccumulator.statusCounts[record.snapshot.status] += 1;
      continue;
    }

    accumulators.set(bucketStartMs, {
      bucketStartMs,
      budgetSum: record.snapshot.diagnostics.budgetRemainingPercent,
      maxConsecutiveOpenCycles: record.snapshot.diagnostics.consecutiveOpenCycles,
      maxScopeFailureRatePercent: getMaxScopeFailureRate(record),
      sampleCount: 1,
      statusCounts: {
        critical: record.snapshot.status === "critical" ? 1 : 0,
        ok: record.snapshot.status === "ok" ? 1 : 0,
        warning: record.snapshot.status === "warning" ? 1 : 0,
      },
    });
  }

  const bucketDurationMs = getBucketDurationMs(granularity);
  const sortedBuckets = [...accumulators.values()].sort(
    (left, right) => right.bucketStartMs - left.bucketStartMs,
  );
  const limitedBuckets = sortedBuckets.slice(0, bucketLimit);

  return {
    bucketLimit,
    buckets: limitedBuckets.map((bucket) => ({
      avgBudgetRemainingPercent: roundToTwoDecimals(bucket.budgetSum / bucket.sampleCount),
      bucketEnd: new Date(bucket.bucketStartMs + bucketDurationMs - 1).toISOString(),
      bucketStart: new Date(bucket.bucketStartMs).toISOString(),
      maxConsecutiveOpenCycles: bucket.maxConsecutiveOpenCycles,
      maxScopeFailureRatePercent: roundToTwoDecimals(bucket.maxScopeFailureRatePercent),
      sampleCount: bucket.sampleCount,
      statusCounts: {
        critical: bucket.statusCounts.critical,
        ok: bucket.statusCounts.ok,
        warning: bucket.statusCounts.warning,
      },
    })),
    filters: {
      from: options.from ? options.from.toISOString() : null,
      to: options.to ? options.to.toISOString() : null,
    },
    granularity,
    totalBuckets: sortedBuckets.length,
    totalStored: records.length,
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

  public getBrokerLiveQuoteStreamHealth(): BrokerLiveQuoteStreamHealth {
    return brokerLiveQuoteStreamMetricsStore.getSnapshot();
  }

  public getCryptoLiveChartHealth(): CryptoLiveChartHealth {
    return cryptoLiveChartMetricsStore.getSnapshot();
  }

  public getAirdropsIntelligenceHealth(): AirdropsIntelligenceHealth {
    return airdropsIntelligenceMetricsStore.getSnapshot();
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

  public getOperationalHealthHistory(options: OperationalHistoryQueryOptions = {}): OperationalHealthHistory {
    const safeLimit = Math.max(1, Math.min(options.limit ?? 50, env.OPS_HEALTH_SNAPSHOT_MAX_ITEMS));
    const allRecords = operationalHealthHistoryStore.getRecent(env.OPS_HEALTH_SNAPSHOT_MAX_ITEMS);
    const filteredRecords = applyPeriodFilter(allRecords, options);
    const limitedRecords = filteredRecords.slice(0, safeLimit);

    return {
      filters: {
        from: options.from ? options.from.toISOString() : null,
        to: options.to ? options.to.toISOString() : null,
      },
      limit: safeLimit,
      records: limitedRecords,
      totalMatched: filteredRecords.length,
      totalStored: operationalHealthHistoryStore.getStoredCount(),
    };
  }

  public async clearOperationalHealthHistory(): Promise<OperationalHealthHistoryClearResult> {
    return operationalHealthHistoryStore.clear();
  }

  public getOperationalHealthHistoryCsv(
    options: OperationalHistoryQueryOptions = {},
  ): OperationalHealthHistoryCsvExport {
    const history = this.getOperationalHealthHistory(options);
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
      filters: history.filters,
      generatedAt,
      limit: history.limit,
      totalMatched: history.totalMatched,
      totalStored: history.totalStored,
    };
  }

  public getOperationalHealthHistoryAggregated(
    options: OperationalHistoryAggregationOptions = {},
  ): OperationalHealthHistoryAggregated {
    const records = operationalHealthHistoryStore.getRecent(env.OPS_HEALTH_SNAPSHOT_MAX_ITEMS);
    return aggregateHistoryByGranularity(records, options);
  }

  public getOperationalHealthHistoryAggregatedCsv(
    options: OperationalHistoryAggregationOptions = {},
  ): OperationalHealthHistoryAggregatedCsvExport {
    const aggregatedHistory = this.getOperationalHealthHistoryAggregated(options);
    const headers = [
      "bucket_start",
      "bucket_end",
      "sample_count",
      "status_ok",
      "status_warning",
      "status_critical",
      "avg_budget_remaining_percent",
      "max_consecutive_open_cycles",
      "max_scope_failure_rate_percent",
    ];
    const lines = [buildCsvRow(headers)];

    for (const bucket of aggregatedHistory.buckets) {
      lines.push(
        buildCsvRow([
          bucket.bucketStart,
          bucket.bucketEnd,
          bucket.sampleCount,
          bucket.statusCounts.ok,
          bucket.statusCounts.warning,
          bucket.statusCounts.critical,
          bucket.avgBudgetRemainingPercent,
          bucket.maxConsecutiveOpenCycles,
          bucket.maxScopeFailureRatePercent,
        ]),
      );
    }

    const generatedAt = new Date().toISOString();
    const safeDate = generatedAt.replaceAll(":", "-").replaceAll(".", "-");

    return {
      bucketLimit: aggregatedHistory.bucketLimit,
      csv: lines.join("\n"),
      exportedCount: aggregatedHistory.buckets.length,
      fileName: `operational-health-history-aggregate-${aggregatedHistory.granularity}-${safeDate}.csv`,
      filters: aggregatedHistory.filters,
      generatedAt,
      granularity: aggregatedHistory.granularity,
      totalBuckets: aggregatedHistory.totalBuckets,
      totalStored: aggregatedHistory.totalStored,
    };
  }

  public getAirdropsIntelligenceHealthCsv(): AirdropsIntelligenceHealthCsvExport {
    const snapshot = this.getAirdropsIntelligenceHealth();
    const headers = [
      "scope",
      "source",
      "requests",
      "successful_requests",
      "failed_requests",
      "success_rate_percent",
      "total_items",
      "avg_latency_ms",
      "p95_latency_ms",
      "last_latency_ms",
      "last_status",
      "last_fetch_at",
      "last_error_at",
      "last_error_code",
      "last_error_message",
      "last_run_at",
      "last_success_at",
      "generated_at",
    ];
    const lines = [buildCsvRow(headers)];

    lines.push(
      buildCsvRow([
        "global",
        "all",
        snapshot.global.requests,
        snapshot.global.successfulRequests,
        snapshot.global.failedRequests,
        snapshot.global.successRatePercent,
        snapshot.global.totalItems,
        snapshot.global.avgLatencyMs,
        snapshot.global.p95LatencyMs,
        "",
        "",
        "",
        snapshot.global.lastErrorAt,
        snapshot.global.lastErrorCode,
        snapshot.global.lastErrorMessage,
        snapshot.global.lastRunAt,
        snapshot.global.lastSuccessAt,
        snapshot.generatedAt,
      ]),
    );

    for (const [sourceName, sourceSnapshot] of Object.entries(snapshot.sources)) {
      lines.push(
        buildCsvRow([
          "source",
          sourceName,
          sourceSnapshot.requests,
          sourceSnapshot.successfulRequests,
          sourceSnapshot.failedRequests,
          sourceSnapshot.successRatePercent,
          sourceSnapshot.totalItems,
          sourceSnapshot.avgLatencyMs,
          sourceSnapshot.p95LatencyMs,
          sourceSnapshot.lastLatencyMs,
          sourceSnapshot.lastStatus,
          sourceSnapshot.lastFetchAt,
          sourceSnapshot.lastErrorAt,
          sourceSnapshot.lastErrorCode,
          sourceSnapshot.lastErrorMessage,
          "",
          "",
          snapshot.generatedAt,
        ]),
      );
    }

    const generatedAt = new Date().toISOString();
    const safeDate = generatedAt.replaceAll(":", "-").replaceAll(".", "-");

    return {
      csv: lines.join("\n"),
      exportedCount: lines.length - 1,
      fileName: `airdrops-health-${safeDate}.csv`,
      generatedAt,
      totalSources: Object.keys(snapshot.sources).length,
    };
  }

  public getBrokerLiveQuoteStreamHealthCsv(): BrokerLiveQuoteStreamHealthCsvExport {
    const snapshot = this.getBrokerLiveQuoteStreamHealth();
    const headers = [
      "scope",
      "broker",
      "opened_connections",
      "active_connections",
      "closed_connections",
      "snapshots_published",
      "snapshot_errors",
      "keepalive_events",
      "last_snapshot_at",
      "last_keepalive_at",
      "last_error_at",
      "last_error_message",
      "generated_at",
    ];
    const lines = [buildCsvRow(headers)];

    lines.push(
      buildCsvRow([
        "global",
        "all",
        snapshot.global.openedConnections,
        snapshot.global.activeConnections,
        snapshot.global.closedConnections,
        snapshot.global.snapshotsPublished,
        snapshot.global.snapshotErrors,
        "",
        "",
        "",
        "",
        "",
        snapshot.generatedAt,
      ]),
    );

    for (const [brokerName, brokerSnapshot] of Object.entries(snapshot.brokers)) {
      lines.push(
        buildCsvRow([
          "broker",
          brokerName,
          brokerSnapshot.openedConnections,
          brokerSnapshot.activeConnections,
          brokerSnapshot.closedConnections,
          brokerSnapshot.snapshotsPublished,
          brokerSnapshot.snapshotErrors,
          brokerSnapshot.keepAliveEvents,
          brokerSnapshot.lastSnapshotAt,
          brokerSnapshot.lastKeepAliveAt,
          brokerSnapshot.lastErrorAt,
          brokerSnapshot.lastErrorMessage,
          snapshot.generatedAt,
        ]),
      );
    }

    const generatedAt = new Date().toISOString();
    const safeDate = generatedAt.replaceAll(":", "-").replaceAll(".", "-");

    return {
      csv: lines.join("\n"),
      exportedCount: lines.length - 1,
      fileName: `broker-stream-health-${safeDate}.csv`,
      generatedAt,
      totalBrokers: Object.keys(snapshot.brokers).length,
    };
  }

  public getCryptoLiveChartHealthCsv(): CryptoLiveChartHealthCsvExport {
    const snapshot = this.getCryptoLiveChartHealth();
    const headers = [
      "scope",
      "broker",
      "requests",
      "successful_requests",
      "failed_requests",
      "success_rate_percent",
      "avg_latency_ms",
      "p95_latency_ms",
      "last_latency_ms",
      "last_success_at",
      "last_error_at",
      "last_error_message",
      "generated_at",
    ];
    const lines = [buildCsvRow(headers)];

    lines.push(
      buildCsvRow([
        "global",
        "all",
        snapshot.global.requests,
        snapshot.global.successfulRequests,
        snapshot.global.failedRequests,
        snapshot.global.successRatePercent,
        snapshot.global.avgLatencyMs,
        snapshot.global.p95LatencyMs,
        "",
        "",
        "",
        "",
        snapshot.generatedAt,
      ]),
    );

    for (const [brokerName, brokerSnapshot] of Object.entries(snapshot.brokers)) {
      lines.push(
        buildCsvRow([
          "broker",
          brokerName,
          brokerSnapshot.requests,
          brokerSnapshot.successfulRequests,
          brokerSnapshot.failedRequests,
          brokerSnapshot.successRatePercent,
          brokerSnapshot.avgLatencyMs,
          brokerSnapshot.p95LatencyMs,
          brokerSnapshot.lastLatencyMs,
          brokerSnapshot.lastSuccessAt,
          brokerSnapshot.lastErrorAt,
          brokerSnapshot.lastErrorMessage,
          snapshot.generatedAt,
        ]),
      );
    }

    const generatedAt = new Date().toISOString();
    const safeDate = generatedAt.replaceAll(":", "-").replaceAll(".", "-");

    return {
      csv: lines.join("\n"),
      exportedCount: lines.length - 1,
      fileName: `crypto-live-chart-health-${safeDate}.csv`,
      generatedAt,
      totalBrokers: Object.keys(snapshot.brokers).length,
    };
  }
}