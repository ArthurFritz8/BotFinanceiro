export type CryptoLiveChartBroker = "binance" | "bybit" | "coinbase" | "kraken" | "okx";

interface CryptoLiveChartCounters {
  failedRequests: number;
  requests: number;
  successfulRequests: number;
}

interface CryptoLiveChartBrokerState {
  counters: CryptoLiveChartCounters;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  lastLatencyMs: number | null;
  lastSuccessAt: string | null;
  recentLatenciesMs: number[];
}

export interface CryptoLiveChartMetricsSnapshot {
  brokers: Record<CryptoLiveChartBroker, {
    avgLatencyMs: number | null;
    failedRequests: number;
    lastErrorAt: string | null;
    lastErrorMessage: string | null;
    lastLatencyMs: number | null;
    lastSuccessAt: string | null;
    p95LatencyMs: number | null;
    requests: number;
    successRatePercent: number;
    successfulRequests: number;
  }>;
  generatedAt: string;
  global: {
    avgLatencyMs: number | null;
    failedRequests: number;
    p95LatencyMs: number | null;
    requests: number;
    successRatePercent: number;
    successfulRequests: number;
  };
}

const brokerNames: CryptoLiveChartBroker[] = ["binance", "bybit", "coinbase", "kraken", "okx"];
const maxRecentLatencyItemsPerBroker = 250;
const maxRecentLatencyItemsGlobal = 500;

function createCounters(): CryptoLiveChartCounters {
  return {
    failedRequests: 0,
    requests: 0,
    successfulRequests: 0,
  };
}

function createBrokerState(): CryptoLiveChartBrokerState {
  return {
    counters: createCounters(),
    lastErrorAt: null,
    lastErrorMessage: null,
    lastLatencyMs: null,
    lastSuccessAt: null,
    recentLatenciesMs: [],
  };
}

function clampLatencyMs(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeAverage(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sum = values.reduce((accumulator, value) => accumulator + value, 0);
  return roundToTwoDecimals(sum / values.length);
}

function computePercentile(values: number[], percentile: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const ratio = Math.min(1, Math.max(0, percentile));
  const index = Math.floor((sortedValues.length - 1) * ratio);
  const selectedValue = sortedValues[index] ?? sortedValues[0] ?? 0;

  return roundToTwoDecimals(selectedValue);
}

function computeSuccessRatePercent(counters: CryptoLiveChartCounters): number {
  if (counters.requests === 0) {
    return 0;
  }

  return roundToTwoDecimals((counters.successfulRequests / counters.requests) * 100);
}

function pushLimited(target: number[], value: number, maxItems: number): void {
  target.push(value);

  if (target.length > maxItems) {
    target.splice(0, target.length - maxItems);
  }
}

export class CryptoLiveChartMetricsStore {
  private brokerState = new Map<CryptoLiveChartBroker, CryptoLiveChartBrokerState>(
    brokerNames.map((brokerName) => [brokerName, createBrokerState()]),
  );

  private globalCounters = createCounters();

  private globalRecentLatenciesMs: number[] = [];

  public onRefreshSuccess(input: {
    broker: CryptoLiveChartBroker;
    latencyMs: number;
  }): void {
    const state = this.getBrokerState(input.broker);
    const latencyMs = clampLatencyMs(input.latencyMs);

    state.counters.requests += 1;
    state.counters.successfulRequests += 1;
    state.lastLatencyMs = latencyMs;
    state.lastSuccessAt = new Date().toISOString();
    pushLimited(state.recentLatenciesMs, latencyMs, maxRecentLatencyItemsPerBroker);

    this.globalCounters.requests += 1;
    this.globalCounters.successfulRequests += 1;
    pushLimited(this.globalRecentLatenciesMs, latencyMs, maxRecentLatencyItemsGlobal);
  }

  public onRefreshError(input: {
    broker: CryptoLiveChartBroker;
    latencyMs: number;
    message: string;
  }): void {
    const state = this.getBrokerState(input.broker);
    const latencyMs = clampLatencyMs(input.latencyMs);

    state.counters.requests += 1;
    state.counters.failedRequests += 1;
    state.lastLatencyMs = latencyMs;
    state.lastErrorAt = new Date().toISOString();
    state.lastErrorMessage = input.message;
    pushLimited(state.recentLatenciesMs, latencyMs, maxRecentLatencyItemsPerBroker);

    this.globalCounters.requests += 1;
    this.globalCounters.failedRequests += 1;
    pushLimited(this.globalRecentLatenciesMs, latencyMs, maxRecentLatencyItemsGlobal);
  }

  public getSnapshot(): CryptoLiveChartMetricsSnapshot {
    const brokers = Object.fromEntries(
      brokerNames.map((brokerName) => {
        const state = this.getBrokerState(brokerName);

        return [
          brokerName,
          {
            avgLatencyMs: computeAverage(state.recentLatenciesMs),
            failedRequests: state.counters.failedRequests,
            lastErrorAt: state.lastErrorAt,
            lastErrorMessage: state.lastErrorMessage,
            lastLatencyMs: state.lastLatencyMs,
            lastSuccessAt: state.lastSuccessAt,
            p95LatencyMs: computePercentile(state.recentLatenciesMs, 0.95),
            requests: state.counters.requests,
            successRatePercent: computeSuccessRatePercent(state.counters),
            successfulRequests: state.counters.successfulRequests,
          },
        ];
      }),
    ) as CryptoLiveChartMetricsSnapshot["brokers"];

    return {
      brokers,
      generatedAt: new Date().toISOString(),
      global: {
        avgLatencyMs: computeAverage(this.globalRecentLatenciesMs),
        failedRequests: this.globalCounters.failedRequests,
        p95LatencyMs: computePercentile(this.globalRecentLatenciesMs, 0.95),
        requests: this.globalCounters.requests,
        successRatePercent: computeSuccessRatePercent(this.globalCounters),
        successfulRequests: this.globalCounters.successfulRequests,
      },
    };
  }

  public reset(): void {
    this.brokerState = new Map(
      brokerNames.map((brokerName) => [brokerName, createBrokerState()]),
    );

    this.globalCounters = createCounters();
    this.globalRecentLatenciesMs = [];
  }

  private getBrokerState(broker: CryptoLiveChartBroker): CryptoLiveChartBrokerState {
    const state = this.brokerState.get(broker);

    if (state) {
      return state;
    }

    const createdState = createBrokerState();
    this.brokerState.set(broker, createdState);
    return createdState;
  }
}

export const cryptoLiveChartMetricsStore = new CryptoLiveChartMetricsStore();
