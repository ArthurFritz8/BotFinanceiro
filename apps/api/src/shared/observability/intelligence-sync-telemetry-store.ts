export type IntelligenceSyncAlertLevel = "ok" | "warning" | "critical";

export type IntelligenceSyncStrategy = "crypto" | "institutional_macro" | "external_symbol";

export type IntelligenceSyncExchange = "auto" | "binance" | "bybit" | "coinbase" | "kraken" | "okx";

export type IntelligenceSyncRange = "24h" | "7d" | "30d" | "90d" | "1y";

export interface IntelligenceSyncTelemetryRecordInput {
  chartAssetId?: string;
  chartRange?: IntelligenceSyncRange;
  contextId: string;
  correlationId: string;
  exchange?: IntelligenceSyncExchange;
  latencyMs: number;
  reason: string;
  requestId?: string;
  sessionId: string;
  strategy: IntelligenceSyncStrategy;
  success: boolean;
  terminalSymbol?: string;
}

export interface IntelligenceSyncTelemetryRecord {
  chartAssetId: string | null;
  chartRange: IntelligenceSyncRange | null;
  contextId: string;
  correlationId: string;
  exchange: IntelligenceSyncExchange | null;
  latencyMs: number;
  reason: string;
  recordedAt: string;
  requestId: string | null;
  sessionId: string;
  strategy: IntelligenceSyncStrategy;
  success: boolean;
  terminalSymbol: string | null;
}

interface IntelligenceSyncSessionMetrics {
  failedRequests: number;
  lastAlertLevel: IntelligenceSyncAlertLevel;
  lastContextId: string;
  lastCorrelationId: string;
  lastReason: string;
  lastRecordedAt: string;
  requests: number;
  successfulRequests: number;
}

export interface IntelligenceSyncTelemetrySnapshot {
  generatedAt: string;
  recent: IntelligenceSyncTelemetryRecord[];
  sessions: Array<{
    failedRequests: number;
    lastAlertLevel: IntelligenceSyncAlertLevel;
    lastContextId: string;
    lastCorrelationId: string;
    lastReason: string;
    lastRecordedAt: string;
    requests: number;
    sessionId: string;
    successRatePercent: number;
    successfulRequests: number;
  }>;
  summary: {
    alertLevel: IntelligenceSyncAlertLevel;
    averageLatencyMs: number;
    failedRequests: number;
    lastContextId: string;
    lastCorrelationId: string;
    lastReason: string;
    lastRecordedAt: string;
    p95LatencyMs: number;
    requests: number;
    successRatePercent: number;
    successfulRequests: number;
  };
  thresholds: {
    criticalP95LatencyMs: number;
    criticalSuccessRatePercent: number;
    warningP95LatencyMs: number;
    warningSuccessRatePercent: number;
  };
}

const MAX_RECENT_EVENTS = 1000;
const MAX_RECENT_LATENCY_SAMPLES = 1000;
const MAX_TRACKED_SESSIONS = 250;
const MAX_RETURNED_RECENT_EVENTS = 25;
const MAX_RETURNED_SESSIONS = 25;
const WARNING_P95_LATENCY_MS = 1200;
const CRITICAL_P95_LATENCY_MS = 2000;
const WARNING_SUCCESS_RATE_PERCENT = 95;
const CRITICAL_SUCCESS_RATE_PERCENT = 90;

function clampLatencyMs(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value * 100) / 100);
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function computePercentile(values: number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const normalizedPercentile = Math.min(1, Math.max(0, percentile));
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.floor((sortedValues.length - 1) * normalizedPercentile)),
  );

  return sortedValues[index] ?? 0;
}

function computeSuccessRatePercent(successfulRequests: number, requests: number): number {
  if (requests <= 0) {
    return 0;
  }

  return roundToTwoDecimals((successfulRequests / requests) * 100);
}

function resolveAlertLevel(input: {
  p95LatencyMs: number;
  requests: number;
  successRatePercent: number;
}): IntelligenceSyncAlertLevel {
  if (input.requests <= 0) {
    return "ok";
  }

  if (
    input.p95LatencyMs >= CRITICAL_P95_LATENCY_MS
    || input.successRatePercent <= CRITICAL_SUCCESS_RATE_PERCENT
  ) {
    return "critical";
  }

  if (
    input.p95LatencyMs >= WARNING_P95_LATENCY_MS
    || input.successRatePercent <= WARNING_SUCCESS_RATE_PERCENT
  ) {
    return "warning";
  }

  return "ok";
}

function normalizeOptionalString(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export class IntelligenceSyncTelemetryStore {
  private recentEvents: IntelligenceSyncTelemetryRecord[] = [];

  private recentLatencySamplesMs: number[] = [];

  private sessions = new Map<string, IntelligenceSyncSessionMetrics>();

  private summaryCounters = {
    failedRequests: 0,
    requests: 0,
    successfulRequests: 0,
  };

  public record(input: IntelligenceSyncTelemetryRecordInput): {
    accepted: true;
    alertLevel: IntelligenceSyncAlertLevel;
    generatedAt: string;
  } {
    const recordedAt = new Date().toISOString();
    const latencyMs = clampLatencyMs(input.latencyMs);

    const record: IntelligenceSyncTelemetryRecord = {
      chartAssetId: normalizeOptionalString(input.chartAssetId),
      chartRange: input.chartRange ?? null,
      contextId: input.contextId,
      correlationId: input.correlationId,
      exchange: input.exchange ?? null,
      latencyMs,
      reason: input.reason,
      recordedAt,
      requestId: normalizeOptionalString(input.requestId),
      sessionId: input.sessionId,
      strategy: input.strategy,
      success: input.success,
      terminalSymbol: normalizeOptionalString(input.terminalSymbol),
    };

    this.recentEvents.push(record);

    if (this.recentEvents.length > MAX_RECENT_EVENTS) {
      this.recentEvents.splice(0, this.recentEvents.length - MAX_RECENT_EVENTS);
    }

    this.recentLatencySamplesMs.push(latencyMs);

    if (this.recentLatencySamplesMs.length > MAX_RECENT_LATENCY_SAMPLES) {
      this.recentLatencySamplesMs.splice(
        0,
        this.recentLatencySamplesMs.length - MAX_RECENT_LATENCY_SAMPLES,
      );
    }

    this.summaryCounters.requests += 1;

    if (record.success) {
      this.summaryCounters.successfulRequests += 1;
    } else {
      this.summaryCounters.failedRequests += 1;
    }

    this.upsertSession(record);

    const snapshot = this.getSnapshot();

    return {
      accepted: true,
      alertLevel: snapshot.summary.alertLevel,
      generatedAt: snapshot.generatedAt,
    };
  }

  public getSnapshot(): IntelligenceSyncTelemetrySnapshot {
    const requests = this.summaryCounters.requests;
    const successfulRequests = this.summaryCounters.successfulRequests;
    const failedRequests = this.summaryCounters.failedRequests;
    const averageLatencyMs =
      this.recentLatencySamplesMs.length > 0
        ? roundToTwoDecimals(
          this.recentLatencySamplesMs.reduce((total, sample) => total + sample, 0)
            / this.recentLatencySamplesMs.length,
        )
        : 0;
    const p95LatencyMs = roundToTwoDecimals(computePercentile(this.recentLatencySamplesMs, 0.95));
    const successRatePercent = computeSuccessRatePercent(successfulRequests, requests);
    const lastRecord = this.recentEvents[this.recentEvents.length - 1] ?? null;
    const alertLevel = resolveAlertLevel({
      p95LatencyMs,
      requests,
      successRatePercent,
    });

    const generatedAt = new Date().toISOString();

    return {
      generatedAt,
      recent: this.recentEvents.slice(-MAX_RETURNED_RECENT_EVENTS).reverse(),
      sessions: [...this.sessions.entries()]
        .sort((left, right) => right[1].requests - left[1].requests)
        .slice(0, MAX_RETURNED_SESSIONS)
        .map(([sessionId, sessionMetrics]) => ({
          failedRequests: sessionMetrics.failedRequests,
          lastAlertLevel: sessionMetrics.lastAlertLevel,
          lastContextId: sessionMetrics.lastContextId,
          lastCorrelationId: sessionMetrics.lastCorrelationId,
          lastReason: sessionMetrics.lastReason,
          lastRecordedAt: sessionMetrics.lastRecordedAt,
          requests: sessionMetrics.requests,
          sessionId,
          successRatePercent: computeSuccessRatePercent(
            sessionMetrics.successfulRequests,
            sessionMetrics.requests,
          ),
          successfulRequests: sessionMetrics.successfulRequests,
        })),
      summary: {
        alertLevel,
        averageLatencyMs,
        failedRequests,
        lastContextId: lastRecord?.contextId ?? "",
        lastCorrelationId: lastRecord?.correlationId ?? "",
        lastReason: lastRecord?.reason ?? "",
        lastRecordedAt: lastRecord?.recordedAt ?? "",
        p95LatencyMs,
        requests,
        successRatePercent,
        successfulRequests,
      },
      thresholds: {
        criticalP95LatencyMs: CRITICAL_P95_LATENCY_MS,
        criticalSuccessRatePercent: CRITICAL_SUCCESS_RATE_PERCENT,
        warningP95LatencyMs: WARNING_P95_LATENCY_MS,
        warningSuccessRatePercent: WARNING_SUCCESS_RATE_PERCENT,
      },
    };
  }

  public reset(): void {
    this.recentEvents = [];
    this.recentLatencySamplesMs = [];
    this.sessions = new Map();
    this.summaryCounters = {
      failedRequests: 0,
      requests: 0,
      successfulRequests: 0,
    };
  }

  private upsertSession(record: IntelligenceSyncTelemetryRecord): void {
    const current = this.sessions.get(record.sessionId);

    const nextMetrics: IntelligenceSyncSessionMetrics = {
      failedRequests: (current?.failedRequests ?? 0) + (record.success ? 0 : 1),
      lastAlertLevel: "ok",
      lastContextId: record.contextId,
      lastCorrelationId: record.correlationId,
      lastReason: record.reason,
      lastRecordedAt: record.recordedAt,
      requests: (current?.requests ?? 0) + 1,
      successfulRequests: (current?.successfulRequests ?? 0) + (record.success ? 1 : 0),
    };

    const p95LatencyMs = roundToTwoDecimals(computePercentile(
      this.recentLatencySamplesMs,
      0.95,
    ));
    const successRatePercent = computeSuccessRatePercent(
      nextMetrics.successfulRequests,
      nextMetrics.requests,
    );

    nextMetrics.lastAlertLevel = resolveAlertLevel({
      p95LatencyMs,
      requests: nextMetrics.requests,
      successRatePercent,
    });

    // Refresh insertion order to keep oldest sessions removable in O(1).
    if (this.sessions.has(record.sessionId)) {
      this.sessions.delete(record.sessionId);
    }

    this.sessions.set(record.sessionId, nextMetrics);

    if (this.sessions.size <= MAX_TRACKED_SESSIONS) {
      return;
    }

    const oldestSessionId = this.sessions.keys().next().value;

    if (typeof oldestSessionId === "string") {
      this.sessions.delete(oldestSessionId);
    }
  }
}

export const intelligenceSyncTelemetryStore = new IntelligenceSyncTelemetryStore();
