import assert from "node:assert/strict";
import { after, beforeEach, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";

const { buildApp } = await import("../../../main/app.js");
const {
  operationalHealthHistoryStore,
} = await import("../../../shared/observability/operational-health-history-store.js");
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

interface MutableOperationalHealthHistoryStore {
  initialized: boolean;
  records: PersistedOperationalHealthRecord[];
}

interface ApiSuccessResponse<TData> {
  data: TData;
  meta: {
    requestId: string;
    timestamp: string;
  };
  status: "success";
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

const storeInternal = operationalHealthHistoryStore as unknown as MutableOperationalHealthHistoryStore;
const originalStoreState = {
  initialized: storeInternal.initialized,
  records: [...storeInternal.records],
};

void beforeEach(() => {
  storeInternal.initialized = true;
  storeInternal.records = buildFixtureRecords();
});

void after(async () => {
  await app.close();
  storeInternal.initialized = originalStoreState.initialized;
  storeInternal.records = originalStoreState.records;
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
