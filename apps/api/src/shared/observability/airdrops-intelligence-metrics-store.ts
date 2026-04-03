export type AirdropsIntelligenceSourceName =
  | "airdrop_alert"
  | "airdrops_io"
  | "coingecko_trending"
  | "defillama"
  | "drops_tab"
  | "earnifi";

type AirdropsIntelligenceSourceStatus = "error" | "ok";

interface AirdropsIntelligenceSourceCounters {
  failedRequests: number;
  requests: number;
  successfulRequests: number;
  totalItems: number;
}

interface AirdropsIntelligenceSourceState {
  counters: AirdropsIntelligenceSourceCounters;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastFetchAt: string | null;
  lastLatencyMs: number | null;
  lastStatus: AirdropsIntelligenceSourceStatus | null;
  recentLatenciesMs: number[];
}

export interface AirdropsIntelligenceMetricsSnapshot {
  generatedAt: string;
  global: {
    avgLatencyMs: number | null;
    failedRequests: number;
    lastErrorAt: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    p95LatencyMs: number | null;
    requests: number;
    successRatePercent: number;
    successfulRequests: number;
    totalItems: number;
  };
  sources: Record<AirdropsIntelligenceSourceName, {
    avgLatencyMs: number | null;
    failedRequests: number;
    lastErrorAt: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    lastFetchAt: string | null;
    lastLatencyMs: number | null;
    lastStatus: AirdropsIntelligenceSourceStatus | null;
    p95LatencyMs: number | null;
    requests: number;
    successRatePercent: number;
    successfulRequests: number;
    totalItems: number;
  }>;
}

const sourceNames: AirdropsIntelligenceSourceName[] = [
  "airdrop_alert",
  "airdrops_io",
  "coingecko_trending",
  "defillama",
  "drops_tab",
  "earnifi",
];

const maxRecentLatencySamplesPerSource = 250;
const maxRecentLatencySamplesGlobal = 500;

function createCounters(): AirdropsIntelligenceSourceCounters {
  return {
    failedRequests: 0,
    requests: 0,
    successfulRequests: 0,
    totalItems: 0,
  };
}

function createSourceState(): AirdropsIntelligenceSourceState {
  return {
    counters: createCounters(),
    lastErrorAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastFetchAt: null,
    lastLatencyMs: null,
    lastStatus: null,
    recentLatenciesMs: [],
  };
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeLatencyMs(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function computeAverage(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sum = values.reduce((accumulator, currentValue) => accumulator + currentValue, 0);

  return roundToTwoDecimals(sum / values.length);
}

function computePercentile(values: number[], percentile: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const boundedPercentile = Math.min(1, Math.max(0, percentile));
  const index = Math.floor((sortedValues.length - 1) * boundedPercentile);

  return roundToTwoDecimals(sortedValues[index] ?? sortedValues[0] ?? 0);
}

function computeSuccessRatePercent(input: {
  failedRequests: number;
  successfulRequests: number;
}): number {
  const attemptedRequests = input.failedRequests + input.successfulRequests;

  if (attemptedRequests <= 0) {
    return 0;
  }

  return roundToTwoDecimals((input.successfulRequests / attemptedRequests) * 100);
}

function pushLatencySample(target: number[], value: number, maxItems: number): void {
  target.push(value);

  if (target.length > maxItems) {
    target.splice(0, target.length - maxItems);
  }
}

export class AirdropsIntelligenceMetricsStore {
  private sourceState = new Map<AirdropsIntelligenceSourceName, AirdropsIntelligenceSourceState>(
    sourceNames.map((sourceName) => [sourceName, createSourceState()]),
  );

  private globalCounters = createCounters();

  private globalLastErrorAt: string | null = null;

  private globalLastErrorCode: string | null = null;

  private globalLastErrorMessage: string | null = null;

  private globalLastRunAt: string | null = null;

  private globalLastSuccessAt: string | null = null;

  private globalRecentLatenciesMs: number[] = [];

  public recordSourceSnapshot(input: {
    error: {
      code: string;
      message: string;
    } | null;
    fetchedAt: string;
    latencyMs: number;
    source: AirdropsIntelligenceSourceName;
    status: AirdropsIntelligenceSourceStatus;
    totalItems: number;
  }): void {
    const source = this.getSourceState(input.source);
    const latencyMs = normalizeLatencyMs(input.latencyMs);

    source.counters.requests += 1;
    source.counters.totalItems += Math.max(0, input.totalItems);
    source.lastFetchAt = input.fetchedAt;
    source.lastLatencyMs = latencyMs;
    source.lastStatus = input.status;

    this.globalCounters.requests += 1;
    this.globalCounters.totalItems += Math.max(0, input.totalItems);
    this.globalLastRunAt = input.fetchedAt;

    pushLatencySample(source.recentLatenciesMs, latencyMs, maxRecentLatencySamplesPerSource);
    pushLatencySample(this.globalRecentLatenciesMs, latencyMs, maxRecentLatencySamplesGlobal);

    if (input.status === "ok") {
      source.counters.successfulRequests += 1;
      this.globalCounters.successfulRequests += 1;
      this.globalLastSuccessAt = input.fetchedAt;
      return;
    }

    source.counters.failedRequests += 1;
    source.lastErrorAt = input.fetchedAt;
    source.lastErrorCode = input.error?.code ?? "AIRDROPS_SOURCE_ERROR";
    source.lastErrorMessage = input.error?.message ?? "Airdrops source failed";

    this.globalCounters.failedRequests += 1;
    this.globalLastErrorAt = input.fetchedAt;
    this.globalLastErrorCode = source.lastErrorCode;
    this.globalLastErrorMessage = source.lastErrorMessage;
  }

  public getSnapshot(): AirdropsIntelligenceMetricsSnapshot {
    const sources = Object.fromEntries(
      sourceNames.map((sourceName) => {
        const source = this.getSourceState(sourceName);

        return [
          sourceName,
          {
            avgLatencyMs: computeAverage(source.recentLatenciesMs),
            failedRequests: source.counters.failedRequests,
            lastErrorAt: source.lastErrorAt,
            lastErrorCode: source.lastErrorCode,
            lastErrorMessage: source.lastErrorMessage,
            lastFetchAt: source.lastFetchAt,
            lastLatencyMs: source.lastLatencyMs,
            lastStatus: source.lastStatus,
            p95LatencyMs: computePercentile(source.recentLatenciesMs, 0.95),
            requests: source.counters.requests,
            successRatePercent: computeSuccessRatePercent(source.counters),
            successfulRequests: source.counters.successfulRequests,
            totalItems: source.counters.totalItems,
          },
        ];
      }),
    ) as AirdropsIntelligenceMetricsSnapshot["sources"];

    return {
      generatedAt: new Date().toISOString(),
      global: {
        avgLatencyMs: computeAverage(this.globalRecentLatenciesMs),
        failedRequests: this.globalCounters.failedRequests,
        lastErrorAt: this.globalLastErrorAt,
        lastErrorCode: this.globalLastErrorCode,
        lastErrorMessage: this.globalLastErrorMessage,
        lastRunAt: this.globalLastRunAt,
        lastSuccessAt: this.globalLastSuccessAt,
        p95LatencyMs: computePercentile(this.globalRecentLatenciesMs, 0.95),
        requests: this.globalCounters.requests,
        successRatePercent: computeSuccessRatePercent(this.globalCounters),
        successfulRequests: this.globalCounters.successfulRequests,
        totalItems: this.globalCounters.totalItems,
      },
      sources,
    };
  }

  public reset(): void {
    this.sourceState = new Map(
      sourceNames.map((sourceName) => [sourceName, createSourceState()]),
    );

    this.globalCounters = createCounters();
    this.globalLastErrorAt = null;
    this.globalLastErrorCode = null;
    this.globalLastErrorMessage = null;
    this.globalLastRunAt = null;
    this.globalLastSuccessAt = null;
    this.globalRecentLatenciesMs = [];
  }

  private getSourceState(sourceName: AirdropsIntelligenceSourceName): AirdropsIntelligenceSourceState {
    const source = this.sourceState.get(sourceName);

    if (source) {
      return source;
    }

    const created = createSourceState();
    this.sourceState.set(sourceName, created);
    return created;
  }
}

export const airdropsIntelligenceMetricsStore = new AirdropsIntelligenceMetricsStore();
