import assert from "node:assert/strict";
import { after, beforeEach, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";

const { buildApp } = await import("../../../main/app.js");
const {
  copilotChatAuditStore,
} = await import("../../../shared/observability/copilot-chat-audit-store.js");
const {
  operationalHealthHistoryStore,
} = await import("../../../shared/observability/operational-health-history-store.js");
const {
  brokerLiveQuoteStreamMetricsStore,
} = await import("../../../shared/observability/broker-live-quote-stream-metrics-store.js");
const {
  cryptoLiveChartMetricsStore,
} = await import("../../../shared/observability/crypto-live-chart-metrics-store.js");
const {
  intelligenceSyncTelemetryStore,
} = await import("../../../shared/observability/intelligence-sync-telemetry-store.js");
const {
  resetCryptoChartLiveBrokerResilienceState,
} = await import("../../crypto/application/crypto-chart-service.js");
const {
  airdropsIntelligenceMetricsStore,
} = await import("../../../shared/observability/airdrops-intelligence-metrics-store.js");
const app = buildApp();
await app.ready();

type PersistedOperationalHealthRecord = {
  recordedAt: string;
  snapshot: {
    diagnostics: {
      budgetRemainingPercent: number;
      circuitState: "closed" | "half_open" | "open";
      consecutiveOpenCycles: number;
      scopeFailureRates: Array<{
        failureRatePercent: number;
        failed: number;
        processed: number;
        scope: string;
        synced: number;
      }>;
    };
    evaluatedAt: string;
    reasons: Array<{
      code: string;
      details?: unknown;
      message: string;
      severity: "warning" | "critical";
    }>;
    status: "ok" | "warning" | "critical";
  };
};

type CopilotAuditRecord = {
  completion: {
    answer: string;
    fetchedAt: string;
    model: string;
    provider: "openrouter";
    responseId: string;
    toolCallsUsed: string[];
    usage: {
      completionTokens?: number;
      promptTokens?: number;
      totalTokens?: number;
    };
  };
  input: {
    maxTokens?: number;
    message: string;
    systemPrompt?: string;
    temperature?: number;
  };
  recordedAt: string;
};

interface MutableOperationalHealthHistoryStore {
  clear: () => Promise<{ clearedAt: string; removedCount: number }>;
  initialized: boolean;
  records: PersistedOperationalHealthRecord[];
}

interface MutableCopilotChatAuditStore {
  clear: () => Promise<{ clearedAt: string; removedCount: number }>;
  getHistory: (options?: {
    from?: Date;
    limit?: number;
    offset?: number;
    to?: Date;
    toolName?: string;
  }) => Promise<{
    filters: {
      from: string | null;
      to: string | null;
      toolName: string | null;
    };
    limit: number;
    offset: number;
    records: CopilotAuditRecord[];
    totalMatched: number;
    totalStored: number;
  }>;
  initialized: boolean;
  records: CopilotAuditRecord[];
}

interface ApiSuccessResponse<TData> {
  data: TData;
  meta: {
    requestId: string;
    timestamp: string;
  };
  status: "success";
}

interface ApiErrorResponse {
  error: {
    code: string;
    details?: unknown;
    message: string;
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
  status: "error";
}

interface OperationalHealthAggregatedBucket {
  avgBudgetRemainingPercent: number;
  bucketEnd: string;
  bucketStart: string;
  maxConsecutiveOpenCycles: number;
  maxScopeFailureRatePercent: number;
  sampleCount: number;
  statusCounts: {
    critical: number;
    ok: number;
    warning: number;
  };
}

interface OperationalHealthHistoryAggregatedResponse {
  bucketLimit: number;
  buckets: OperationalHealthAggregatedBucket[];
  filters: {
    from: string | null;
    to: string | null;
  };
  granularity: "hour" | "day";
  totalBuckets: number;
  totalStored: number;
}

interface OperationalHealthHistoryResponse {
  filters: {
    from: string | null;
    to: string | null;
  };
  limit: number;
  records: PersistedOperationalHealthRecord[];
  totalMatched: number;
  totalStored: number;
}

interface OperationalHealthHistoryClearResult {
  clearedAt: string;
  removedCount: number;
}

interface BrokerStreamHealthResponse {
  brokers: Record<
    "binance" | "bybit" | "coinbase" | "kraken" | "okx" | "iqoption",
    {
      activeConnections: number;
      closedConnections: number;
      keepAliveEvents: number;
      lastErrorAt: string | null;
      lastErrorMessage: string | null;
      lastKeepAliveAt: string | null;
      lastSnapshotAt: string | null;
      openedConnections: number;
      snapshotErrors: number;
      snapshotsPublished: number;
    }
  >;
  generatedAt: string;
  global: {
    activeConnections: number;
    closedConnections: number;
    openedConnections: number;
    snapshotErrors: number;
    snapshotsPublished: number;
  };
}

interface FuturesStreamHealthResponse {
  stream: {
    cacheSize: number;
    connected: boolean;
    connecting: boolean;
    enabled: boolean;
    freshSymbols: number;
    freshestTickerAt: string | null;
    reconnectAttempt: number;
    staleSymbols: number;
    stalenessThresholdMs: number;
    streamUrl: string;
  };
}

interface MarketNavigatorModulesHealthResponse {
  cache: {
    cached: boolean;
    ttlMs: number;
  };
  generatedAt: string;
  modules: Array<{
    errorCode: string | null;
    errorMessage: string | null;
    failureCount: number | null;
    failureRatePercent: number | null;
    fetchedAt: string | null;
    fromCache: boolean | null;
    label: string;
    latencyMs: number;
    limit: number;
    module: string;
    preset: string | null;
    provider: string | null;
    status: "critical" | "ok" | "warning";
    successCount: number | null;
    totalCount: number | null;
  }>;
  probeMode: "live" | "stub";
  summary: {
    avgFailureRatePercent: number | null;
    criticalModules: number;
    maxFailureRatePercent: number | null;
    okModules: number;
    staleModules: number;
    status: "critical" | "ok" | "warning";
    totalFailureCount: number;
    totalModules: number;
    totalSuccessCount: number;
    warningModules: number;
  };
}

interface CryptoLiveChartHealthResponse {
  brokers: Record<
    "binance" | "bybit" | "coinbase" | "kraken" | "okx",
    {
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
    }
  >;
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

interface CryptoLiveChartResilienceHealthResponse {
  brokers: Array<{
    broker: "binance" | "bybit" | "coinbase" | "kraken" | "okx";
    circuitOpen: boolean;
    circuitRemainingMs: number;
    failureStreak: number;
    healthScore: number;
    metrics: {
      failedRequests: number;
      lastErrorAt: string | null;
      lastErrorMessage: string | null;
      lastSuccessAt: string | null;
      p95LatencyMs: number | null;
      requests: number;
      successRatePercent: number;
      successfulRequests: number;
    };
  }>;
  failoverChain: Array<"binance" | "bybit" | "coinbase" | "kraken" | "okx">;
  generatedAt: string;
  requestedBroker: "auto" | "binance" | "bybit" | "coinbase" | "kraken" | "okx";
  resolvedPreferredBroker: "binance" | "bybit" | "coinbase" | "kraken" | "okx";
}

interface IntelligenceSyncTelemetryHealthResponse {
  generatedAt: string;
  recent: Array<{
    contextId: string;
    correlationId: string;
    latencyMs: number;
    recordedAt: string;
    reason: string;
    sessionId: string;
    success: boolean;
  }>;
  summary: {
    alertLevel: "critical" | "ok" | "warning";
    averageLatencyMs: number;
    failedRequests: number;
    lastContextId: string;
    lastCorrelationId: string;
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

interface AirdropsIntelligenceHealthResponse {
  generatedAt: string;
  global: {
    failedRequests: number;
    requests: number;
    successRatePercent: number;
    successfulRequests: number;
    totalItems: number;
  };
  sources: Record<
    "airdrop_alert" | "airdrops_io" | "coingecko_trending" | "defillama" | "drops_tab" | "earnifi",
    {
      failedRequests: number;
      requests: number;
      successRatePercent: number;
      successfulRequests: number;
      totalItems: number;
    }
  >;
}

interface CopilotAuditHistoryResponse {
  filters: {
    from: string | null;
    to: string | null;
    toolName: string | null;
  };
  limit: number;
  offset: number;
  records: CopilotAuditRecord[];
  totalMatched: number;
  totalStored: number;
}

function createRecord(
  recordedAt: string,
  status: "ok" | "warning" | "critical",
  budgetRemainingPercent: number,
  consecutiveOpenCycles: number,
  maxFailureRatePercent: number,
): PersistedOperationalHealthRecord {
  return {
    recordedAt,
    snapshot: {
      diagnostics: {
        budgetRemainingPercent,
        circuitState: "closed",
        consecutiveOpenCycles,
        scopeFailureRates: [
          {
            failureRatePercent: maxFailureRatePercent,
            failed: 1,
            processed: 10,
            scope: "hot",
            synced: 9,
          },
          {
            failureRatePercent: Math.max(0, maxFailureRatePercent - 5),
            failed: 1,
            processed: 10,
            scope: "warm",
            synced: 9,
          },
          {
            failureRatePercent: Math.max(0, maxFailureRatePercent - 10),
            failed: 1,
            processed: 10,
            scope: "cold",
            synced: 9,
          },
        ],
      },
      evaluatedAt: recordedAt,
      reasons: [],
      status,
    },
  };
}

function buildFixtureRecords(): PersistedOperationalHealthRecord[] {
  return [
    createRecord("2026-03-30T09:15:00.000Z", "ok", 80, 0, 10),
    createRecord("2026-03-31T10:00:00.000Z", "warning", 50, 2, 30),
    createRecord("2026-03-31T11:00:00.000Z", "critical", 20, 5, 90),
  ];
}

function buildCopilotAuditFixtureRecords(): CopilotAuditRecord[] {
  return [
    {
      completion: {
        answer: "Politica de sync normal retornada.",
        fetchedAt: "2026-03-31T10:00:01.000Z",
        model: "google/gemini-1.5-flash",
        provider: "openrouter",
        responseId: "copilot-audit-001",
        toolCallsUsed: ["get_crypto_sync_policy"],
        usage: {
          totalTokens: 40,
        },
      },
      input: {
        message: "Qual a politica de sync atual?",
        temperature: 0.1,
      },
      recordedAt: "2026-03-31T10:00:00.000Z",
    },
    {
      completion: {
        answer: "Comparativo entre bitcoin e ethereum concluido.",
        fetchedAt: "2026-03-31T11:00:01.000Z",
        model: "google/gemini-1.5-flash",
        provider: "openrouter",
        responseId: "copilot-audit-002",
        toolCallsUsed: ["get_crypto_multi_spot_price"],
        usage: {
          totalTokens: 68,
        },
      },
      input: {
        message: "Compare bitcoin e ethereum em usd",
        temperature: 0.1,
      },
      recordedAt: "2026-03-31T11:00:00.000Z",
    },
  ];
}

const storeInternal = operationalHealthHistoryStore as unknown as MutableOperationalHealthHistoryStore;
const originalClear = operationalHealthHistoryStore.clear.bind(operationalHealthHistoryStore);
const originalStoreState = {
  initialized: storeInternal.initialized,
  records: [...storeInternal.records],
};
const copilotStoreInternal = copilotChatAuditStore as unknown as MutableCopilotChatAuditStore;
const originalCopilotClear = copilotChatAuditStore.clear.bind(copilotChatAuditStore);
const originalCopilotGetHistory = copilotChatAuditStore.getHistory.bind(copilotChatAuditStore);
const originalCopilotStoreState = {
  initialized: copilotStoreInternal.initialized,
  records: [...copilotStoreInternal.records],
};

void beforeEach(() => {
  brokerLiveQuoteStreamMetricsStore.reset();
  cryptoLiveChartMetricsStore.reset();
  intelligenceSyncTelemetryStore.reset();
  resetCryptoChartLiveBrokerResilienceState();
  airdropsIntelligenceMetricsStore.reset();

  storeInternal.initialized = true;
  storeInternal.records = buildFixtureRecords();
  storeInternal.clear = () => {
    const removedCount = storeInternal.records.length;
    storeInternal.records = [];

    return Promise.resolve({
      clearedAt: new Date().toISOString(),
      removedCount,
    });
  };

  copilotStoreInternal.initialized = true;
  copilotStoreInternal.records = buildCopilotAuditFixtureRecords();
  copilotStoreInternal.clear = () => {
    const removedCount = copilotStoreInternal.records.length;
    copilotStoreInternal.records = [];

    return Promise.resolve({
      clearedAt: new Date().toISOString(),
      removedCount,
    });
  };

  copilotStoreInternal.getHistory = (options = {}) => {
    const safeLimit = Math.max(1, Math.min(options.limit ?? 50, 10000));
    const safeOffset = Math.max(0, options.offset ?? 0);
    const fromMs = options.from?.getTime();
    const toMs = options.to?.getTime();
    const toolName = options.toolName?.trim().toLowerCase();

    const newestFirst = [...copilotStoreInternal.records].reverse();
    const filtered = newestFirst.filter((record) => {
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

      if (toolName) {
        return record.completion.toolCallsUsed.some((item) => item.toLowerCase() === toolName);
      }

      return true;
    });

    return Promise.resolve({
      filters: {
        from: options.from ? options.from.toISOString() : null,
        to: options.to ? options.to.toISOString() : null,
        toolName: options.toolName?.trim() || null,
      },
      limit: safeLimit,
      offset: safeOffset,
      records: filtered.slice(safeOffset, safeOffset + safeLimit),
      totalMatched: filtered.length,
      totalStored: copilotStoreInternal.records.length,
    });
  };
});

void after(async () => {
  await app.close();
  storeInternal.clear = originalClear;
  storeInternal.initialized = originalStoreState.initialized;
  storeInternal.records = originalStoreState.records;
  copilotStoreInternal.clear = originalCopilotClear;
  copilotStoreInternal.getHistory = originalCopilotGetHistory;
  copilotStoreInternal.initialized = originalCopilotStoreState.initialized;
  copilotStoreInternal.records = originalCopilotStoreState.records;
});

void it("GET /internal/health/operational/history retorna 401 sem token", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/internal/health/operational/history?limit=2",
  });

  assert.equal(response.statusCode, 401);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "INTERNAL_AUTH_MISSING_TOKEN");
  assert.equal(body.error.message, "Missing internal route token");
});

void it("GET /internal/health/streams/brokers retorna 401 sem token", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/internal/health/streams/brokers",
  });

  assert.equal(response.statusCode, 401);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "INTERNAL_AUTH_MISSING_TOKEN");
  assert.equal(body.error.message, "Missing internal route token");
});

void it("GET /internal/health/streams/brokers retorna metricas do stream com token valido", async () => {
  brokerLiveQuoteStreamMetricsStore.onConnectionOpened({
    broker: "okx",
    streamId: "stream_okx_1",
  });
  brokerLiveQuoteStreamMetricsStore.onSnapshotPublished({
    broker: "okx",
  });
  brokerLiveQuoteStreamMetricsStore.onKeepAlive({
    broker: "okx",
  });
  brokerLiveQuoteStreamMetricsStore.onSnapshotError({
    broker: "okx",
    message: "upstream timeout",
  });

  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/streams/brokers",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<ApiSuccessResponse<BrokerStreamHealthResponse>>();
  assert.equal(body.status, "success");
  assert.equal(typeof body.data.generatedAt, "string");
  assert.equal(body.data.global.openedConnections, 1);
  assert.equal(body.data.global.activeConnections, 1);
  assert.equal(body.data.global.snapshotsPublished, 1);
  assert.equal(body.data.global.snapshotErrors, 1);
  assert.equal(body.data.brokers.okx.openedConnections, 1);
  assert.equal(body.data.brokers.okx.keepAliveEvents, 1);
  assert.equal(body.data.brokers.okx.snapshotsPublished, 1);
  assert.equal(body.data.brokers.okx.snapshotErrors, 1);
  assert.equal(body.data.brokers.okx.lastErrorMessage, "upstream timeout");
});

void it("GET /internal/health/streams/futures retorna estado do stream com token valido", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/streams/futures",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<ApiSuccessResponse<FuturesStreamHealthResponse>>();
  assert.equal(body.status, "success");
  assert.equal(typeof body.data.stream.enabled, "boolean");
  assert.equal(typeof body.data.stream.connected, "boolean");
  assert.equal(typeof body.data.stream.cacheSize, "number");
  assert.equal(typeof body.data.stream.freshSymbols, "number");
  assert.equal(typeof body.data.stream.staleSymbols, "number");
  assert.equal(typeof body.data.stream.reconnectAttempt, "number");
  assert.equal(typeof body.data.stream.streamUrl, "string");
  assert.equal(typeof body.data.stream.stalenessThresholdMs, "number");
});

void it("GET /internal/health/market-navigator/modules retorna 401 sem token", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/internal/health/market-navigator/modules",
  });

  assert.equal(response.statusCode, 401);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "INTERNAL_AUTH_MISSING_TOKEN");
  assert.equal(body.error.message, "Missing internal route token");
});

void it("GET /internal/health/market-navigator/modules retorna resumo por modulo com token valido", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/market-navigator/modules",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<ApiSuccessResponse<MarketNavigatorModulesHealthResponse>>();
  assert.equal(body.status, "success");
  assert.equal(typeof body.data.generatedAt, "string");
  assert.equal(typeof body.data.cache.cached, "boolean");
  assert.equal(typeof body.data.cache.ttlMs, "number");
  assert.equal(typeof body.data.summary.totalModules, "number");
  assert.ok(Array.isArray(body.data.modules));
  assert.ok(body.data.modules.length >= 11);

  const modules = body.data.modules.map((item) => item.module);
  assert.equal(modules.includes("crypto"), true);
  assert.equal(modules.includes("futures"), true);
  assert.equal(modules.includes("forex"), true);
  assert.equal(modules.includes("equities"), true);
  assert.equal(modules.includes("commodities"), true);
  assert.equal(modules.includes("wall-street"), true);
  assert.equal(modules.includes("macro-rates"), true);
  assert.equal(modules.includes("defi"), true);
  assert.equal(modules.includes("b3"), true);
  assert.equal(modules.includes("etfs"), true);
  assert.equal(modules.includes("fixed-income"), true);
});

void it("GET /internal/health/streams/brokers.csv retorna 401 sem token", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/internal/health/streams/brokers.csv",
  });

  assert.equal(response.statusCode, 401);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "INTERNAL_AUTH_MISSING_TOKEN");
  assert.equal(body.error.message, "Missing internal route token");
});

void it("GET /internal/health/streams/brokers.csv retorna CSV com token valido", async () => {
  brokerLiveQuoteStreamMetricsStore.onConnectionOpened({
    broker: "okx",
    streamId: "stream_okx_csv_1",
  });
  brokerLiveQuoteStreamMetricsStore.onSnapshotPublished({
    broker: "okx",
  });
  brokerLiveQuoteStreamMetricsStore.onKeepAlive({
    broker: "okx",
  });

  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/streams/brokers.csv",
  });

  assert.equal(response.statusCode, 200);

  const contentTypeHeader = response.headers["content-type"];
  const contentType = Array.isArray(contentTypeHeader)
    ? contentTypeHeader.join(";")
    : contentTypeHeader ?? "";
  assert.match(contentType, /^text\/csv/);

  const contentDispositionHeader = response.headers["content-disposition"];
  const contentDisposition = Array.isArray(contentDispositionHeader)
    ? contentDispositionHeader.join(";")
    : contentDispositionHeader ?? "";
  assert.match(contentDisposition, /^attachment; filename="broker-stream-health-/);

  const lines = response.body.split("\n");
  assert.equal(
    lines[0],
    [
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
    ].join(","),
  );
  assert.match(response.body, /global,all,1,1,0,1,0/);
  assert.match(response.body, /broker,okx,1,1,0,1,0,1/);
});

void it("GET /internal/health/live-chart/crypto retorna 401 sem token", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/internal/health/live-chart/crypto",
  });

  assert.equal(response.statusCode, 401);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "INTERNAL_AUTH_MISSING_TOKEN");
  assert.equal(body.error.message, "Missing internal route token");
});

void it("GET /internal/health/live-chart/crypto retorna metricas agregadas por broker", async () => {
  cryptoLiveChartMetricsStore.onRefreshSuccess({
    broker: "binance",
    latencyMs: 120,
  });
  cryptoLiveChartMetricsStore.onRefreshSuccess({
    broker: "okx",
    latencyMs: 210,
  });
  cryptoLiveChartMetricsStore.onRefreshError({
    broker: "okx",
    latencyMs: 420,
    message: "okx timeout",
  });

  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/live-chart/crypto",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<ApiSuccessResponse<CryptoLiveChartHealthResponse>>();
  assert.equal(body.status, "success");
  assert.equal(typeof body.data.generatedAt, "string");
  assert.equal(body.data.global.requests, 3);
  assert.equal(body.data.global.successfulRequests, 2);
  assert.equal(body.data.global.failedRequests, 1);
  assert.equal(body.data.global.successRatePercent, 66.67);
  assert.equal(body.data.brokers.okx.requests, 2);
  assert.equal(body.data.brokers.okx.successfulRequests, 1);
  assert.equal(body.data.brokers.okx.failedRequests, 1);
  assert.equal(body.data.brokers.okx.lastErrorMessage, "okx timeout");
  assert.equal(body.data.brokers.okx.lastLatencyMs, 420);
});

void it("GET /internal/health/intelligence-sync retorna 401 sem token", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/internal/health/intelligence-sync",
  });

  assert.equal(response.statusCode, 401);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "INTERNAL_AUTH_MISSING_TOKEN");
  assert.equal(body.error.message, "Missing internal route token");
});

void it("GET /internal/health/intelligence-sync retorna telemetria agregada com token valido", async () => {
  intelligenceSyncTelemetryStore.record({
    chartAssetId: "ethereum",
    chartRange: "7d",
    contextId: "ctx_system_test_001",
    correlationId: "sync_system_test_001",
    exchange: "binance",
    latencyMs: 380,
    reason: "interval-chip",
    sessionId: "sess_system_test_001",
    strategy: "crypto",
    success: true,
    terminalSymbol: "ETHUSDT",
  });

  intelligenceSyncTelemetryStore.record({
    chartAssetId: "ethereum",
    chartRange: "7d",
    contextId: "ctx_system_test_002",
    correlationId: "sync_system_test_002",
    exchange: "binance",
    latencyMs: 2480,
    reason: "symbol-enter",
    sessionId: "sess_system_test_001",
    strategy: "crypto",
    success: false,
    terminalSymbol: "ETHUSDT",
  });

  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/intelligence-sync",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<ApiSuccessResponse<IntelligenceSyncTelemetryHealthResponse>>();
  assert.equal(body.status, "success");
  assert.equal(typeof body.data.generatedAt, "string");
  assert.equal(body.data.summary.requests, 2);
  assert.equal(body.data.summary.successfulRequests, 1);
  assert.equal(body.data.summary.failedRequests, 1);
  assert.equal(body.data.summary.lastCorrelationId, "sync_system_test_002");
  assert.equal(body.data.summary.lastContextId, "ctx_system_test_002");
  assert.equal(body.data.summary.alertLevel, "critical");
  assert.ok(Array.isArray(body.data.recent));
  assert.equal(body.data.recent.length, 2);
  assert.equal(body.data.thresholds.warningP95LatencyMs, 1200);
  assert.equal(body.data.thresholds.criticalP95LatencyMs, 2000);
});

void it("GET /internal/health/live-chart/crypto/resilience retorna 401 sem token", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/internal/health/live-chart/crypto/resilience",
  });

  assert.equal(response.statusCode, 401);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "INTERNAL_AUTH_MISSING_TOKEN");
  assert.equal(body.error.message, "Missing internal route token");
});

void it("GET /internal/health/live-chart/crypto/resilience retorna telemetria de auto-selecao e failover", async () => {
  cryptoLiveChartMetricsStore.onRefreshError({
    broker: "binance",
    latencyMs: 480,
    message: "binance timeout",
  });
  cryptoLiveChartMetricsStore.onRefreshSuccess({
    broker: "bybit",
    latencyMs: 90,
  });
  cryptoLiveChartMetricsStore.onRefreshSuccess({
    broker: "bybit",
    latencyMs: 110,
  });

  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/live-chart/crypto/resilience?requestedBroker=auto",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<ApiSuccessResponse<CryptoLiveChartResilienceHealthResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.requestedBroker, "auto");
  assert.equal(body.data.resolvedPreferredBroker, "bybit");
  assert.equal(body.data.failoverChain[0], "bybit");
  assert.equal(body.data.brokers.length, 5);

  const bybit = body.data.brokers.find((item) => item.broker === "bybit");
  const binance = body.data.brokers.find((item) => item.broker === "binance");

  assert.ok(bybit);
  assert.ok(binance);
  assert.equal(bybit?.metrics.requests, 2);
  assert.equal(bybit?.metrics.successfulRequests, 2);
  assert.equal(bybit?.metrics.failedRequests, 0);
  assert.equal(binance?.metrics.requests, 1);
  assert.equal(binance?.metrics.failedRequests, 1);
  assert.equal(binance?.metrics.lastErrorMessage, "binance timeout");
});

void it("GET /internal/health/live-chart/crypto.csv retorna 401 sem token", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/internal/health/live-chart/crypto.csv",
  });

  assert.equal(response.statusCode, 401);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "INTERNAL_AUTH_MISSING_TOKEN");
  assert.equal(body.error.message, "Missing internal route token");
});

void it("GET /internal/health/live-chart/crypto.csv retorna CSV com token valido", async () => {
  cryptoLiveChartMetricsStore.onRefreshSuccess({
    broker: "binance",
    latencyMs: 120,
  });
  cryptoLiveChartMetricsStore.onRefreshError({
    broker: "okx",
    latencyMs: 480,
    message: "upstream timeout",
  });

  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/live-chart/crypto.csv",
  });

  assert.equal(response.statusCode, 200);

  const contentTypeHeader = response.headers["content-type"];
  const contentType = Array.isArray(contentTypeHeader)
    ? contentTypeHeader.join(";")
    : contentTypeHeader ?? "";
  assert.match(contentType, /^text\/csv/);

  const contentDispositionHeader = response.headers["content-disposition"];
  const contentDisposition = Array.isArray(contentDispositionHeader)
    ? contentDispositionHeader.join(";")
    : contentDispositionHeader ?? "";
  assert.match(contentDisposition, /^attachment; filename="crypto-live-chart-health-/);

  const lines = response.body.split("\n");
  assert.equal(
    lines[0],
    [
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
    ].join(","),
  );
  assert.match(response.body, /global,all,2,1,1,50/);
  assert.match(response.body, /broker,okx,1,0,1,0/);
});

void it("GET /internal/health/airdrops retorna 401 sem token", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/internal/health/airdrops",
  });

  assert.equal(response.statusCode, 401);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "INTERNAL_AUTH_MISSING_TOKEN");
  assert.equal(body.error.message, "Missing internal route token");
});

void it("GET /internal/health/airdrops retorna metricas de fontes com token valido", async () => {
  airdropsIntelligenceMetricsStore.recordSourceSnapshot({
    error: null,
    fetchedAt: "2026-04-03T12:00:00.000Z",
    latencyMs: 420,
    source: "airdrops_io",
    status: "ok",
    totalItems: 12,
  });

  airdropsIntelligenceMetricsStore.recordSourceSnapshot({
    error: {
      code: "AIRDROPS_SOURCE_UNAVAILABLE",
      message: "temporary outage",
    },
    fetchedAt: "2026-04-03T12:00:10.000Z",
    latencyMs: 680,
    source: "defillama",
    status: "error",
    totalItems: 0,
  });

  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/airdrops",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<ApiSuccessResponse<AirdropsIntelligenceHealthResponse>>();
  assert.equal(body.status, "success");
  assert.equal(typeof body.data.generatedAt, "string");
  assert.equal(body.data.global.requests, 2);
  assert.equal(body.data.global.successfulRequests, 1);
  assert.equal(body.data.global.failedRequests, 1);
  assert.equal(body.data.global.totalItems, 12);
  assert.equal(body.data.sources.airdrops_io.requests, 1);
  assert.equal(body.data.sources.airdrops_io.successfulRequests, 1);
  assert.equal(body.data.sources.defillama.failedRequests, 1);
  assert.equal(body.data.sources.defillama.requests, 1);
});

void it("GET /internal/health/airdrops.csv retorna 401 sem token", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/internal/health/airdrops.csv",
  });

  assert.equal(response.statusCode, 401);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "INTERNAL_AUTH_MISSING_TOKEN");
  assert.equal(body.error.message, "Missing internal route token");
});

void it("GET /internal/health/airdrops.csv retorna CSV com token valido", async () => {
  airdropsIntelligenceMetricsStore.recordSourceSnapshot({
    error: null,
    fetchedAt: "2026-04-03T12:00:00.000Z",
    latencyMs: 420,
    source: "airdrops_io",
    status: "ok",
    totalItems: 12,
  });

  airdropsIntelligenceMetricsStore.recordSourceSnapshot({
    error: {
      code: "AIRDROPS_SOURCE_UNAVAILABLE",
      message: "temporary outage",
    },
    fetchedAt: "2026-04-03T12:00:10.000Z",
    latencyMs: 680,
    source: "defillama",
    status: "error",
    totalItems: 0,
  });

  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/airdrops.csv",
  });

  assert.equal(response.statusCode, 200);

  const contentTypeHeader = response.headers["content-type"];
  const contentType = Array.isArray(contentTypeHeader)
    ? contentTypeHeader.join(";")
    : contentTypeHeader ?? "";
  assert.match(contentType, /^text\/csv/);

  const contentDispositionHeader = response.headers["content-disposition"];
  const contentDisposition = Array.isArray(contentDispositionHeader)
    ? contentDispositionHeader.join(";")
    : contentDispositionHeader ?? "";
  assert.match(contentDisposition, /^attachment; filename="airdrops-health-/);

  const lines = response.body.split("\n");
  assert.equal(
    lines[0],
    [
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
    ].join(","),
  );
  assert.equal(lines.length, 8);
  assert.match(response.body, /global,all,2,1,1/);
  assert.match(response.body, /source,airdrops_io,1,1,0/);
  assert.match(response.body, /source,defillama,1,0,1/);
});

void it("GET /internal/health/operational/history retorna payload esperado com token valido", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/operational/history?limit=2",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<ApiSuccessResponse<OperationalHealthHistoryResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.limit, 2);
  assert.equal(body.data.totalStored, 3);
  assert.equal(body.data.totalMatched, 3);
  assert.equal(body.data.records.length, 2);
  assert.equal(body.data.records[0]?.snapshot.status, "critical");
  assert.equal(body.data.records[1]?.snapshot.status, "warning");
});

void it("GET /internal/health/operational/history retorna 400 quando from e maior que to", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/operational/history?from=2026-04-01T01:00:00.000Z&to=2026-04-01T00:00:00.000Z",
  });

  assert.equal(response.statusCode, 400);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(body.error.message, "Invalid payload");
});

void it("GET /internal/health/operational/history.csv retorna CSV esperado com token valido", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/operational/history.csv?limit=2",
  });

  assert.equal(response.statusCode, 200);

  const contentTypeHeader = response.headers["content-type"];
  const contentType = Array.isArray(contentTypeHeader)
    ? contentTypeHeader.join(";")
    : contentTypeHeader ?? "";
  assert.match(contentType, /^text\/csv/);

  const contentDispositionHeader = response.headers["content-disposition"];
  const contentDisposition = Array.isArray(contentDispositionHeader)
    ? contentDispositionHeader.join(";")
    : contentDispositionHeader ?? "";
  assert.match(contentDisposition, /^attachment; filename="operational-health-history-/);

  const lines = response.body.split("\n");
  assert.equal(
    lines[0],
    [
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
    ].join(","),
  );
  assert.equal(lines.length, 3);
});

void it("GET /internal/health/operational/history.csv retorna 400 quando from e maior que to", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/operational/history.csv?from=2026-04-01T01:00:00.000Z&to=2026-04-01T00:00:00.000Z",
  });

  assert.equal(response.statusCode, 400);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(body.error.message, "Invalid payload");
});

void it("DELETE /internal/health/operational/history retorna 401 sem token", async () => {
  const response = await app.inject({
    method: "DELETE",
    url: "/internal/health/operational/history?confirm=true",
  });

  assert.equal(response.statusCode, 401);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "INTERNAL_AUTH_MISSING_TOKEN");
  assert.equal(body.error.message, "Missing internal route token");
});

void it("DELETE /internal/health/operational/history retorna 400 sem confirm=true", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "DELETE",
    url: "/internal/health/operational/history",
  });

  assert.equal(response.statusCode, 400);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(body.error.message, "Invalid payload");
});

void it("DELETE /internal/health/operational/history retorna sucesso com confirm=true", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "DELETE",
    url: "/internal/health/operational/history?confirm=true",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<ApiSuccessResponse<OperationalHealthHistoryClearResult>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.removedCount, 3);
  assert.ok(body.data.clearedAt.length > 0);
  assert.equal(storeInternal.records.length, 0);
});

void it("GET /internal/health/operational/history/aggregate.csv retorna 401 sem token", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/internal/health/operational/history/aggregate.csv",
  });

  assert.equal(response.statusCode, 401);

  const body = response.json<{
    error: { code: string; message: string };
    status: string;
  }>();

  assert.equal(body.status, "error");
  assert.equal(body.error.code, "INTERNAL_AUTH_MISSING_TOKEN");
  assert.equal(body.error.message, "Missing internal route token");
});

void it("GET /internal/health/operational/history/aggregate.csv retorna CSV com token valido", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/operational/history/aggregate.csv?granularity=day&bucketLimit=10",
  });

  assert.equal(response.statusCode, 200);

  const contentTypeHeader = response.headers["content-type"];
  const contentType = Array.isArray(contentTypeHeader)
    ? contentTypeHeader.join(";")
    : contentTypeHeader ?? "";
  assert.match(contentType, /^text\/csv/);

  const contentDispositionHeader = response.headers["content-disposition"];
  const contentDisposition = Array.isArray(contentDispositionHeader)
    ? contentDispositionHeader.join(";")
    : contentDispositionHeader ?? "";
  assert.match(
    contentDisposition,
    /^attachment; filename="operational-health-history-aggregate-day-/,
  );

  const lines = response.body.split("\n");
  assert.equal(
    lines[0],
    [
      "bucket_start",
      "bucket_end",
      "sample_count",
      "status_ok",
      "status_warning",
      "status_critical",
      "avg_budget_remaining_percent",
      "max_consecutive_open_cycles",
      "max_scope_failure_rate_percent",
    ].join(","),
  );
  assert.equal(lines.length, 3);
});

void it("GET /internal/health/operational/history/aggregate.csv retorna 401 com token invalido", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": "invalid_internal_token",
    },
    method: "GET",
    url: "/internal/health/operational/history/aggregate.csv",
  });

  assert.equal(response.statusCode, 401);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "INTERNAL_AUTH_INVALID_TOKEN");
  assert.equal(body.error.message, "Invalid internal route token");
});

void it("GET /internal/health/operational/history/aggregate retorna 401 sem token", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/internal/health/operational/history/aggregate",
  });

  assert.equal(response.statusCode, 401);

  const body = response.json<{
    error: { code: string; message: string };
    status: string;
  }>();

  assert.equal(body.status, "error");
  assert.equal(body.error.code, "INTERNAL_AUTH_MISSING_TOKEN");
  assert.equal(body.error.message, "Missing internal route token");
});

void it("GET /internal/health/operational/history/aggregate retorna payload agregado com token valido", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/operational/history/aggregate?granularity=day&bucketLimit=10",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<ApiSuccessResponse<OperationalHealthHistoryAggregatedResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.granularity, "day");
  assert.equal(body.data.bucketLimit, 10);
  assert.equal(body.data.totalStored, 3);
  assert.equal(body.data.totalBuckets, 2);
  assert.equal(body.data.buckets.length, 2);

  const firstBucket = body.data.buckets[0];
  assert.ok(firstBucket);
  assert.equal(firstBucket.sampleCount, 2);
  assert.equal(firstBucket.statusCounts.warning, 1);
  assert.equal(firstBucket.statusCounts.critical, 1);
  assert.equal(firstBucket.statusCounts.ok, 0);
  assert.equal(firstBucket.avgBudgetRemainingPercent, 35);
  assert.equal(firstBucket.maxConsecutiveOpenCycles, 5);
  assert.equal(firstBucket.maxScopeFailureRatePercent, 90);
  assert.match(firstBucket.bucketStart, /^2026-03-31T00:00:00.000Z$/);
  assert.match(firstBucket.bucketEnd, /^2026-03-31T23:59:59.999Z$/);
});

void it("GET /internal/health/operational/history/aggregate retorna 401 com token invalido", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": "invalid_internal_token",
    },
    method: "GET",
    url: "/internal/health/operational/history/aggregate",
  });

  assert.equal(response.statusCode, 401);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "INTERNAL_AUTH_INVALID_TOKEN");
  assert.equal(body.error.message, "Invalid internal route token");
});

void it("GET /internal/health/operational/history/aggregate retorna 400 quando from e maior que to", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/operational/history/aggregate?from=2026-04-01T01:00:00.000Z&to=2026-04-01T00:00:00.000Z",
  });

  assert.equal(response.statusCode, 400);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(body.error.message, "Invalid payload");
});

void it("GET /internal/health/operational/history/aggregate.csv retorna 400 quando from e maior que to", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/operational/history/aggregate.csv?from=2026-04-01T01:00:00.000Z&to=2026-04-01T00:00:00.000Z",
  });

  assert.equal(response.statusCode, 400);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(body.error.message, "Invalid payload");
});

void it("GET /internal/health/operational/history/aggregate retorna 400 para granularity invalida", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/operational/history/aggregate?granularity=minute",
  });

  assert.equal(response.statusCode, 400);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(body.error.message, "Invalid payload");
});

void it("GET /internal/health/operational/history/aggregate retorna 400 para bucketLimit fora do intervalo", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/health/operational/history/aggregate?bucketLimit=0",
  });

  assert.equal(response.statusCode, 400);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(body.error.message, "Invalid payload");
});

void it("GET /internal/copilot/audit/history retorna 401 sem token", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/internal/copilot/audit/history?limit=2",
  });

  assert.equal(response.statusCode, 401);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "INTERNAL_AUTH_MISSING_TOKEN");
  assert.equal(body.error.message, "Missing internal route token");
});

void it("GET /internal/copilot/audit/history retorna payload com filtro de tool", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "GET",
    url: "/internal/copilot/audit/history?limit=5&offset=0&toolName=get_crypto_multi_spot_price",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<ApiSuccessResponse<CopilotAuditHistoryResponse>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.limit, 5);
  assert.equal(body.data.offset, 0);
  assert.equal(body.data.totalStored, 2);
  assert.equal(body.data.totalMatched, 1);
  assert.equal(body.data.records.length, 1);
  assert.equal(body.data.records[0]?.completion.responseId, "copilot-audit-002");
  assert.equal(body.data.filters.toolName, "get_crypto_multi_spot_price");
});

void it("DELETE /internal/copilot/audit/history retorna 400 sem confirm=true", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "DELETE",
    url: "/internal/copilot/audit/history",
  });

  assert.equal(response.statusCode, 400);

  const body = response.json<ApiErrorResponse>();
  assert.equal(body.status, "error");
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(body.error.message, "Invalid payload");
});

void it("DELETE /internal/copilot/audit/history retorna sucesso com confirm=true", async () => {
  const response = await app.inject({
    headers: {
      "x-internal-token": process.env.INTERNAL_API_TOKEN ?? "",
    },
    method: "DELETE",
    url: "/internal/copilot/audit/history?confirm=true",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<ApiSuccessResponse<{ clearedAt: string; removedCount: number }>>();
  assert.equal(body.status, "success");
  assert.equal(body.data.removedCount, 2);
  assert.ok(body.data.clearedAt.length > 0);
});
