import {
  cryptoSyncJobRunner,
  type CryptoSchedulerScopeMetrics,
  type CryptoSchedulerMetricsSnapshot,
} from "../../../jobs/crypto-sync-job-runner.js";
import { performance } from "node:perf_hooks";
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
  intelligenceSyncTelemetryStore,
  type IntelligenceSyncTelemetrySnapshot,
} from "../../../shared/observability/intelligence-sync-telemetry-store.js";
import {
  airdropsIntelligenceMetricsStore,
  type AirdropsIntelligenceMetricsSnapshot,
} from "../../../shared/observability/airdrops-intelligence-metrics-store.js";
import {
  operationalHealthHistoryStore,
  type PersistedOperationalHealthRecord,
} from "../../../shared/observability/operational-health-history-store.js";
import {
  FuturesMarketService,
  type FuturesMarketDataHealth,
} from "../../futures/application/futures-market-service.js";
import { B3MarketService } from "../../b3/application/b3-market-service.js";
import { CommoditiesMarketService } from "../../commodities/application/commodities-market-service.js";
import {
  getCryptoChartLiveBrokerResilienceSnapshot,
  type CryptoChartLiveBrokerResilienceSnapshot,
  type LiveChartRequestedBroker,
} from "../../crypto/application/crypto-chart-service.js";
import { CryptoMarketOverviewService } from "../../crypto/application/crypto-market-overview-service.js";
import { DefiMarketService } from "../../defi/application/defi-market-service.js";
import { EquitiesMarketService } from "../../equities/application/equities-market-service.js";
import { EtfsMarketService } from "../../etfs/application/etfs-market-service.js";
import { FixedIncomeMarketService } from "../../fixed_income/application/fixed-income-market-service.js";
import { ForexMarketService } from "../../forex/application/forex-market-service.js";
import { MacroRatesMarketService } from "../../macro_rates/application/macro-rates-market-service.js";
import { WallStreetMarketService } from "../../wall_street/application/wall-street-market-service.js";

const futuresMarketService = new FuturesMarketService();
const b3MarketService = new B3MarketService();
const commoditiesMarketService = new CommoditiesMarketService();
const cryptoMarketOverviewService = new CryptoMarketOverviewService();
const defiMarketService = new DefiMarketService();
const equitiesMarketService = new EquitiesMarketService();
const etfsMarketService = new EtfsMarketService();
const fixedIncomeMarketService = new FixedIncomeMarketService();
const forexMarketService = new ForexMarketService();
const macroRatesMarketService = new MacroRatesMarketService();
const wallStreetMarketService = new WallStreetMarketService();

const MARKET_NAVIGATOR_MODULE_HEALTH_TTL_MS = 15_000;
const MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT = 5;

type MarketNavigatorModuleId =
  | "b3"
  | "commodities"
  | "crypto"
  | "defi"
  | "equities"
  | "etfs"
  | "fixed-income"
  | "forex"
  | "futures"
  | "macro-rates"
  | "wall-street";

type MarketNavigatorModuleStatus = "critical" | "ok" | "warning";

interface MarketNavigatorModuleCounters {
  failureCount: number | null;
  failureRatePercent: number | null;
  fetchedAt: string | null;
  fromCache: boolean | null;
  provider: string | null;
  successCount: number | null;
  totalCount: number | null;
}

interface MarketNavigatorModuleProbeDefinition {
  label: string;
  limit: number;
  module: MarketNavigatorModuleId;
  preset: string | null;
  probe: () => Promise<unknown>;
}

export interface MarketNavigatorModuleHealthEntry {
  errorCode: string | null;
  errorMessage: string | null;
  failureCount: number | null;
  failureRatePercent: number | null;
  fetchedAt: string | null;
  fromCache: boolean | null;
  label: string;
  latencyMs: number;
  limit: number;
  module: MarketNavigatorModuleId;
  preset: string | null;
  provider: string | null;
  status: MarketNavigatorModuleStatus;
  successCount: number | null;
  totalCount: number | null;
}

export interface MarketNavigatorModulesHealthSummary {
  avgFailureRatePercent: number | null;
  criticalModules: number;
  maxFailureRatePercent: number | null;
  okModules: number;
  staleModules: number;
  status: MarketNavigatorModuleStatus;
  totalFailureCount: number;
  totalModules: number;
  totalSuccessCount: number;
  warningModules: number;
}

export interface MarketNavigatorModulesHealth {
  cache: {
    cached: boolean;
    ttlMs: number;
  };
  generatedAt: string;
  modules: MarketNavigatorModuleHealthEntry[];
  probeMode: "live" | "stub";
  summary: MarketNavigatorModulesHealthSummary;
}

interface MarketNavigatorModulesHealthCacheEntry {
  expiresAtMs: number;
  value: MarketNavigatorModulesHealth;
}

let marketNavigatorModulesHealthCache: MarketNavigatorModulesHealthCacheEntry | null = null;

const marketNavigatorModuleProbes: MarketNavigatorModuleProbeDefinition[] = [
  {
    label: "B3",
    limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT,
    module: "b3",
    preset: null,
    probe: () => b3MarketService.getMarketOverview({ limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT }),
  },
  {
    label: "Commodities",
    limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT,
    module: "commodities",
    preset: null,
    probe: () => commoditiesMarketService.getMarketOverview({ limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT }),
  },
  {
    label: "Crypto",
    limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT,
    module: "crypto",
    preset: null,
    probe: () => cryptoMarketOverviewService.getOverview({ limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT }),
  },
  {
    label: "DeFi",
    limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT,
    module: "defi",
    preset: null,
    probe: () => defiMarketService.getMarketOverview({ limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT }),
  },
  {
    label: "Equities",
    limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT,
    module: "equities",
    preset: null,
    probe: () => equitiesMarketService.getMarketOverview({ limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT }),
  },
  {
    label: "ETFs",
    limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT,
    module: "etfs",
    preset: null,
    probe: () => etfsMarketService.getMarketOverview({ limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT }),
  },
  {
    label: "Fixed Income",
    limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT,
    module: "fixed-income",
    preset: null,
    probe: () => fixedIncomeMarketService.getMarketOverview({ limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT }),
  },
  {
    label: "Forex",
    limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT,
    module: "forex",
    preset: null,
    probe: () => forexMarketService.getMarketOverview({ limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT }),
  },
  {
    label: "Futures",
    limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT,
    module: "futures",
    preset: "crypto_majors",
    probe: () => futuresMarketService.getMarketOverview({
      limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT,
      preset: "crypto_majors",
    }),
  },
  {
    label: "Macro Rates",
    limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT,
    module: "macro-rates",
    preset: null,
    probe: () => macroRatesMarketService.getMarketOverview({ limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT }),
  },
  {
    label: "Wall Street",
    limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT,
    module: "wall-street",
    preset: null,
    probe: () => wallStreetMarketService.getMarketOverview({ limit: MARKET_NAVIGATOR_MODULE_DEFAULT_LIMIT }),
  },
];

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

export interface IntelligenceSyncTelemetryHealth extends IntelligenceSyncTelemetrySnapshot {}

export interface CryptoLiveChartResilienceHealth extends CryptoChartLiveBrokerResilienceSnapshot {}

export interface AirdropsIntelligenceHealth extends AirdropsIntelligenceMetricsSnapshot {}

export interface FuturesMarketStreamHealth extends FuturesMarketDataHealth {}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractMarketNavigatorModuleCounters(payload: unknown): MarketNavigatorModuleCounters {
  const data = isRecord(payload) ? payload : {};
  const provider = typeof data.provider === "string" ? data.provider : null;
  const fromCache = typeof data.fromCache === "boolean" ? data.fromCache : null;
  const fetchedAt = typeof data.fetchedAt === "string" ? data.fetchedAt : null;

  let successCount = typeof data.successCount === "number" ? data.successCount : null;
  let failureCount = typeof data.failureCount === "number" ? data.failureCount : null;
  let totalCount: number | null = null;

  const snapshots = Array.isArray(data.snapshots) ? data.snapshots : null;
  const quotes = Array.isArray(data.quotes) ? data.quotes : null;
  const assets = Array.isArray(data.assets) ? data.assets : null;

  if (snapshots) {
    const derivedSuccess = snapshots.filter((item) => isRecord(item) && item.status === "ok").length;
    const derivedFailure = snapshots.filter((item) => isRecord(item) && item.status === "error").length;
    successCount = successCount ?? derivedSuccess;
    failureCount = failureCount ?? derivedFailure;
    totalCount = snapshots.length;
  } else if (quotes) {
    const derivedSuccess = quotes.filter((item) => isRecord(item) && item.status === "ok").length;
    const derivedFailure = quotes.filter((item) => isRecord(item) && item.status === "error").length;
    successCount = successCount ?? derivedSuccess;
    failureCount = failureCount ?? derivedFailure;
    totalCount = quotes.length;
  } else if (assets) {
    const derivedSuccess = assets.filter((item) => item !== null && item !== undefined).length;
    successCount = successCount ?? derivedSuccess;
    failureCount = failureCount ?? 0;
    totalCount = assets.length;
  }

  if (totalCount === null && successCount !== null && failureCount !== null) {
    totalCount = successCount + failureCount;
  }

  if (successCount === null && totalCount !== null && failureCount !== null) {
    successCount = Math.max(0, totalCount - failureCount);
  }

  if (failureCount === null && totalCount !== null && successCount !== null) {
    failureCount = Math.max(0, totalCount - successCount);
  }

  const processed =
    successCount !== null && failureCount !== null
      ? successCount + failureCount
      : null;
  const failureRatePercent =
    processed !== null && processed > 0 && failureCount !== null
      ? roundToTwoDecimals((failureCount / processed) * 100)
      : null;

  return {
    failureCount,
    failureRatePercent,
    fetchedAt,
    fromCache,
    provider,
    successCount,
    totalCount,
  };
}

function resolveMarketNavigatorModuleStatus(
  counters: MarketNavigatorModuleCounters,
): MarketNavigatorModuleStatus {
  if (counters.failureRatePercent === null) {
    return "ok";
  }

  if (counters.failureRatePercent >= 70) {
    return "critical";
  }

  if (counters.failureRatePercent > 0) {
    return "warning";
  }

  return "ok";
}

function extractErrorCode(error: unknown): string | null {
  if (!isRecord(error)) {
    return null;
  }

  return typeof error.code === "string" ? error.code : null;
}

function extractErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }

  if (!isRecord(error)) {
    return null;
  }

  return typeof error.message === "string" ? error.message : null;
}

function buildMarketNavigatorModulesSummary(
  modules: MarketNavigatorModuleHealthEntry[],
): MarketNavigatorModulesHealthSummary {
  const okModules = modules.filter((item) => item.status === "ok").length;
  const warningModules = modules.filter((item) => item.status === "warning").length;
  const criticalModules = modules.filter((item) => item.status === "critical").length;
  const staleModules = modules.filter((item) => item.fromCache === true).length;
  const totalSuccessCount = modules.reduce(
    (accumulator, item) => accumulator + (item.successCount ?? 0),
    0,
  );
  const totalFailureCount = modules.reduce(
    (accumulator, item) => accumulator + (item.failureCount ?? 0),
    0,
  );
  const failureRates = modules
    .map((item) => item.failureRatePercent)
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item));

  const avgFailureRatePercent =
    failureRates.length > 0
      ? roundToTwoDecimals(failureRates.reduce((acc, item) => acc + item, 0) / failureRates.length)
      : null;
  const maxFailureRatePercent =
    failureRates.length > 0
      ? roundToTwoDecimals(Math.max(...failureRates))
      : null;
  const status: MarketNavigatorModuleStatus =
    criticalModules > 0
      ? "critical"
      : warningModules > 0
        ? "warning"
        : "ok";

  return {
    avgFailureRatePercent,
    criticalModules,
    maxFailureRatePercent,
    okModules,
    staleModules,
    status,
    totalFailureCount,
    totalModules: modules.length,
    totalSuccessCount,
    warningModules,
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

  public getIntelligenceSyncTelemetryHealth(): IntelligenceSyncTelemetryHealth {
    return intelligenceSyncTelemetryStore.getSnapshot();
  }

  public getCryptoLiveChartResilienceHealth(options?: {
    requestedBroker?: LiveChartRequestedBroker;
  }): CryptoLiveChartResilienceHealth {
    return getCryptoChartLiveBrokerResilienceSnapshot({
      requestedBroker: options?.requestedBroker,
    });
  }

  public getAirdropsIntelligenceHealth(): AirdropsIntelligenceHealth {
    return airdropsIntelligenceMetricsStore.getSnapshot();
  }

  public getFuturesMarketStreamHealth(): FuturesMarketStreamHealth {
    return futuresMarketService.getMarketDataHealth();
  }

  public async getMarketNavigatorModulesHealth(options?: {
    refresh?: boolean;
  }): Promise<MarketNavigatorModulesHealth> {
    const shouldRefresh = options?.refresh === true;
    const nowMs = Date.now();

    if (
      !shouldRefresh
      && marketNavigatorModulesHealthCache
      && marketNavigatorModulesHealthCache.expiresAtMs > nowMs
    ) {
      return {
        ...marketNavigatorModulesHealthCache.value,
        cache: {
          cached: true,
          ttlMs: MARKET_NAVIGATOR_MODULE_HEALTH_TTL_MS,
        },
      };
    }

    const probeMode: MarketNavigatorModulesHealth["probeMode"] = env.NODE_ENV === "test" ? "stub" : "live";
    const generatedAt = new Date().toISOString();

    const modules =
      probeMode === "stub"
        ? marketNavigatorModuleProbes.map((moduleDefinition) => ({
          errorCode: null,
          errorMessage: "Live probe disabled in NODE_ENV=test",
          failureCount: null,
          failureRatePercent: null,
          fetchedAt: generatedAt,
          fromCache: null,
          label: moduleDefinition.label,
          latencyMs: 0,
          limit: moduleDefinition.limit,
          module: moduleDefinition.module,
          preset: moduleDefinition.preset,
          provider: null,
          status: "warning" as const,
          successCount: null,
          totalCount: null,
        }))
        : await Promise.all(
          marketNavigatorModuleProbes.map((moduleDefinition) =>
            this.probeMarketNavigatorModule(moduleDefinition),
          ),
        );

    const response: MarketNavigatorModulesHealth = {
      cache: {
        cached: false,
        ttlMs: MARKET_NAVIGATOR_MODULE_HEALTH_TTL_MS,
      },
      generatedAt,
      modules,
      probeMode,
      summary: buildMarketNavigatorModulesSummary(modules),
    };

    marketNavigatorModulesHealthCache = {
      expiresAtMs: nowMs + MARKET_NAVIGATOR_MODULE_HEALTH_TTL_MS,
      value: response,
    };

    return response;
  }

  private async probeMarketNavigatorModule(
    moduleDefinition: MarketNavigatorModuleProbeDefinition,
  ): Promise<MarketNavigatorModuleHealthEntry> {
    const startedAtMs = performance.now();

    try {
      const payload = await moduleDefinition.probe();
      const counters = extractMarketNavigatorModuleCounters(payload);
      const status = resolveMarketNavigatorModuleStatus(counters);

      return {
        errorCode: null,
        errorMessage: null,
        failureCount: counters.failureCount,
        failureRatePercent: counters.failureRatePercent,
        fetchedAt: counters.fetchedAt,
        fromCache: counters.fromCache,
        label: moduleDefinition.label,
        latencyMs: roundToTwoDecimals(performance.now() - startedAtMs),
        limit: moduleDefinition.limit,
        module: moduleDefinition.module,
        preset: moduleDefinition.preset,
        provider: counters.provider,
        status,
        successCount: counters.successCount,
        totalCount: counters.totalCount,
      };
    } catch (error) {
      return {
        errorCode: extractErrorCode(error),
        errorMessage: extractErrorMessage(error),
        failureCount: null,
        failureRatePercent: null,
        fetchedAt: null,
        fromCache: null,
        label: moduleDefinition.label,
        latencyMs: roundToTwoDecimals(performance.now() - startedAtMs),
        limit: moduleDefinition.limit,
        module: moduleDefinition.module,
        preset: moduleDefinition.preset,
        provider: null,
        status: "critical",
        successCount: null,
        totalCount: null,
      };
    }
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