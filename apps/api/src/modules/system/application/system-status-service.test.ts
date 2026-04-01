import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";

const { SystemStatusService } = await import("./system-status-service.js");
const {
  operationalHealthHistoryStore,
} = await import("../../../shared/observability/operational-health-history-store.js");
const { env } = await import("../../../shared/config/env.js");

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

void after(() => {
  storeInternal.initialized = originalStoreState.initialized;
  storeInternal.records = originalStoreState.records;
});

void describe("SystemStatusService.getOperationalHealthHistoryAggregatedCsv", () => {
  void it("gera CSV agregado por dia com colunas e metricas esperadas", () => {
    const service = new SystemStatusService();

    const csvExport = service.getOperationalHealthHistoryAggregatedCsv({
      bucketLimit: 10,
      granularity: "day",
    });

    const lines = csvExport.csv.split("\n");

    assert.equal(csvExport.granularity, "day");
    assert.equal(csvExport.bucketLimit, 10);
    assert.equal(csvExport.exportedCount, 2);
    assert.equal(csvExport.totalBuckets, 2);
    assert.equal(csvExport.totalStored, buildFixtureRecords().length);
    assert.match(
      csvExport.fileName,
      /^operational-health-history-aggregate-day-\d{4}-\d{2}-\d{2}T/,
    );

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
    assert.match(lines[1] ?? "", /,2,0,1,1,35,5,90$/);
    assert.match(lines[2] ?? "", /,1,1,0,0,80,0,10$/);
  });

  void it("aplica bucketLimit no CSV agregado por hora", () => {
    const service = new SystemStatusService();

    const csvExport = service.getOperationalHealthHistoryAggregatedCsv({
      bucketLimit: 1,
      granularity: "hour",
    });

    const lines = csvExport.csv.split("\n");

    assert.equal(csvExport.exportedCount, 1);
    assert.equal(csvExport.totalBuckets, 3);
    assert.equal(lines.length, 2);
  });

  void it("respeita filtro temporal e retorna apenas cabecalho quando nao ha buckets", () => {
    const service = new SystemStatusService();
    const from = new Date("2026-03-31T10:30:00.000Z");
    const to = new Date("2026-03-31T10:59:59.999Z");

    const csvExport = service.getOperationalHealthHistoryAggregatedCsv({
      bucketLimit: env.OPS_HEALTH_SNAPSHOT_MAX_ITEMS,
      from,
      granularity: "hour",
      to,
    });

    const lines = csvExport.csv.split("\n");

    assert.equal(csvExport.exportedCount, 0);
    assert.equal(csvExport.totalBuckets, 0);
    assert.equal(csvExport.filters.from, from.toISOString());
    assert.equal(csvExport.filters.to, to.toISOString());
    assert.equal(lines.length, 1);
  });
});
