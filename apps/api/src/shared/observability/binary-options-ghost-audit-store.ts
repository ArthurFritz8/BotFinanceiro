import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import { env } from "../config/env.js";
import { logger } from "../logger/logger.js";
import { resolvePersistenceMode, type PersistenceMode } from "../persistence/persistence-mode.js";
import { getPostgresPool } from "../persistence/postgres-pool.js";

const ghostOutcomeSchema = z.enum(["win", "loss", "push"]);
const ghostDirectionSchema = z.enum(["call", "put"]);
const ghostTriggerHeatSchema = z.enum(["cold", "warm", "hot"]);
const ghostRangeSchema = z.enum(["24h", "7d", "30d", "90d", "1y"]);
const ghostResolutionSchema = z.enum([
  "1T",
  "10T",
  "100T",
  "1000T",
  "10R",
  "100R",
  "1000R",
  "1S",
  "5S",
  "10S",
  "15S",
  "30S",
  "45S",
  "1",
  "2",
  "3",
  "5",
  "10",
  "15",
  "30",
  "45",
  "60",
  "120",
  "180",
  "240",
  "D",
  "W",
  "M",
]);
const exchangeSchema = z.enum(["auto", "binance", "bybit", "coinbase", "kraken", "okx"]);
const isoDatetimeSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "must be a valid datetime");

const sessionIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);

const appendInputSchema = z.object({
  assetId: z.string().trim().min(1).max(64),
  callProbability: z.number().min(0).max(100).optional(),
  direction: ghostDirectionSchema,
  entryPrice: z.number().positive(),
  exchangeRequested: exchangeSchema.optional(),
  exchangeResolved: z.enum(["binance"]).optional(),
  expiryPrice: z.number().positive(),
  expirySeconds: z.number().int().min(5).max(600),
  momentumStrength: z.number().min(0).max(100).optional(),
  neutralProbability: z.number().min(0).max(100).optional(),
  openedAt: isoDatetimeSchema.optional(),
  outcome: ghostOutcomeSchema,
  probability: z.number().min(0).max(100),
  provider: z.enum(["binance"]).optional(),
  putProbability: z.number().min(0).max(100).optional(),
  range: ghostRangeSchema.optional(),
  requestId: z.string().trim().min(1).max(128).optional(),
  resolution: ghostResolutionSchema.optional(),
  sessionId: sessionIdSchema,
  settledAt: isoDatetimeSchema.optional(),
  signalId: z.string().trim().min(6).max(180),
  symbol: z.string().trim().min(1).max(32).optional(),
  triggerHeat: ghostTriggerHeatSchema.optional(),
});

const recordSchema = appendInputSchema.extend({
  recordedAt: isoDatetimeSchema,
});

const persistedPayloadSchema = z.object({
  records: z.array(recordSchema),
  version: z.literal(1),
});

export type BinaryOptionsGhostAuditDirection = z.infer<typeof ghostDirectionSchema>;
export type BinaryOptionsGhostAuditOutcome = z.infer<typeof ghostOutcomeSchema>;
export type BinaryOptionsGhostAuditTriggerHeat = z.infer<typeof ghostTriggerHeatSchema>;
export type BinaryOptionsGhostAuditRecord = z.infer<typeof recordSchema>;
export type BinaryOptionsGhostAuditAppendInput = z.infer<typeof appendInputSchema>;

export interface BinaryOptionsGhostAuditQueryOptions {
  assetId?: string;
  from?: Date;
  limit?: number;
  offset?: number;
  outcome?: BinaryOptionsGhostAuditOutcome;
  sessionId?: string;
  to?: Date;
  triggerHeat?: BinaryOptionsGhostAuditTriggerHeat | "unknown";
}

export interface BinaryOptionsGhostAuditAppendResult {
  accepted: boolean;
  deduplicated: boolean;
  generatedAt: string;
  mode: PersistenceMode;
}

export interface BinaryOptionsGhostAuditOutcomeCounters {
  losses: number;
  pushes: number;
  resolvedTrades: number;
  winRatePercent: number;
  wins: number;
}

export interface BinaryOptionsGhostAuditSummary extends BinaryOptionsGhostAuditOutcomeCounters {
  byDirection: {
    call: BinaryOptionsGhostAuditOutcomeCounters;
    put: BinaryOptionsGhostAuditOutcomeCounters;
  };
  byTriggerHeat: {
    cold: BinaryOptionsGhostAuditOutcomeCounters;
    hot: BinaryOptionsGhostAuditOutcomeCounters;
    unknown: BinaryOptionsGhostAuditOutcomeCounters;
    warm: BinaryOptionsGhostAuditOutcomeCounters;
  };
}

export interface BinaryOptionsGhostAuditHistory {
  filters: {
    assetId: string | null;
    from: string | null;
    outcome: BinaryOptionsGhostAuditOutcome | null;
    sessionId: string | null;
    to: string | null;
    triggerHeat: BinaryOptionsGhostAuditTriggerHeat | "unknown" | null;
  };
  limit: number;
  offset: number;
  records: BinaryOptionsGhostAuditRecord[];
  summary: BinaryOptionsGhostAuditSummary;
  totalMatched: number;
  totalStored: number;
}

export interface BinaryOptionsGhostAuditClearResult {
  clearedAt: string;
  removedCount: number;
}

interface MutableOutcomeCounters {
  losses: number;
  pushes: number;
  wins: number;
}

interface PersistedPayload {
  records: BinaryOptionsGhostAuditRecord[];
  version: 1;
}

function clampLimit(limit: number): number {
  return Math.max(1, Math.min(limit, env.BINARY_OPTIONS_GHOST_AUDIT_MAX_ITEMS));
}

function clampOffset(offset: number): number {
  return Math.max(0, offset);
}

function roundTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function getRetentionCutoffDate(): Date {
  const cutoffTime = Date.now() - env.BINARY_OPTIONS_GHOST_AUDIT_RETENTION_DAYS * 86_400_000;
  return new Date(cutoffTime);
}

function isRecordAfterCutoff(record: BinaryOptionsGhostAuditRecord, cutoffDate: Date): boolean {
  const recordedAtMs = Date.parse(record.recordedAt);

  if (Number.isNaN(recordedAtMs)) {
    return false;
  }

  return recordedAtMs >= cutoffDate.getTime();
}

function normalizeOptionalTrimmed(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function applyFilters(
  records: BinaryOptionsGhostAuditRecord[],
  options: BinaryOptionsGhostAuditQueryOptions,
): BinaryOptionsGhostAuditRecord[] {
  const assetId = normalizeOptionalTrimmed(options.assetId)?.toLowerCase();
  const fromMs = options.from?.getTime();
  const outcome = options.outcome;
  const sessionId = normalizeOptionalTrimmed(options.sessionId);
  const toMs = options.to?.getTime();
  const triggerHeat = options.triggerHeat;

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

    if (sessionId && record.sessionId !== sessionId) {
      return false;
    }

    if (assetId && record.assetId.toLowerCase() !== assetId) {
      return false;
    }

    if (outcome && record.outcome !== outcome) {
      return false;
    }

    if (triggerHeat) {
      const normalizedRecordHeat = record.triggerHeat ?? "unknown";

      if (normalizedRecordHeat !== triggerHeat) {
        return false;
      }
    }

    return true;
  });
}

function createMutableCounters(): MutableOutcomeCounters {
  return {
    losses: 0,
    pushes: 0,
    wins: 0,
  };
}

function registerOutcome(counters: MutableOutcomeCounters, outcome: BinaryOptionsGhostAuditOutcome): void {
  if (outcome === "win") {
    counters.wins += 1;
    return;
  }

  if (outcome === "loss") {
    counters.losses += 1;
    return;
  }

  counters.pushes += 1;
}

function finalizeCounters(counters: MutableOutcomeCounters): BinaryOptionsGhostAuditOutcomeCounters {
  const resolvedTrades = counters.wins + counters.losses;
  const winRatePercent = resolvedTrades > 0 ? roundTwoDecimals((counters.wins / resolvedTrades) * 100) : 0;

  return {
    losses: counters.losses,
    pushes: counters.pushes,
    resolvedTrades,
    winRatePercent,
    wins: counters.wins,
  };
}

function buildSummary(records: BinaryOptionsGhostAuditRecord[]): BinaryOptionsGhostAuditSummary {
  const globalCounters = createMutableCounters();
  const countersByDirection: Record<BinaryOptionsGhostAuditDirection, MutableOutcomeCounters> = {
    call: createMutableCounters(),
    put: createMutableCounters(),
  };
  const countersByTriggerHeat: Record<BinaryOptionsGhostAuditTriggerHeat | "unknown", MutableOutcomeCounters> = {
    cold: createMutableCounters(),
    hot: createMutableCounters(),
    unknown: createMutableCounters(),
    warm: createMutableCounters(),
  };

  for (const record of records) {
    registerOutcome(globalCounters, record.outcome);
    registerOutcome(countersByDirection[record.direction], record.outcome);
    registerOutcome(countersByTriggerHeat[record.triggerHeat ?? "unknown"], record.outcome);
  }

  const global = finalizeCounters(globalCounters);

  return {
    ...global,
    byDirection: {
      call: finalizeCounters(countersByDirection.call),
      put: finalizeCounters(countersByDirection.put),
    },
    byTriggerHeat: {
      cold: finalizeCounters(countersByTriggerHeat.cold),
      hot: finalizeCounters(countersByTriggerHeat.hot),
      unknown: finalizeCounters(countersByTriggerHeat.unknown),
      warm: finalizeCounters(countersByTriggerHeat.warm),
    },
  };
}

function buildHistoryFilters(options: BinaryOptionsGhostAuditQueryOptions): BinaryOptionsGhostAuditHistory["filters"] {
  const assetId = normalizeOptionalTrimmed(options.assetId);
  const sessionId = normalizeOptionalTrimmed(options.sessionId);

  return {
    assetId,
    from: options.from ? options.from.toISOString() : null,
    outcome: options.outcome ?? null,
    sessionId,
    to: options.to ? options.to.toISOString() : null,
    triggerHeat: options.triggerHeat ?? null,
  };
}

export class BinaryOptionsGhostAuditStore {
  private readonly filePath = resolve(process.cwd(), env.BINARY_OPTIONS_GHOST_AUDIT_FILE_PATH);

  private initialized = false;

  private mode: PersistenceMode = resolvePersistenceMode();

  private records: BinaryOptionsGhostAuditRecord[] = [];

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!env.BINARY_OPTIONS_GHOST_AUDIT_ENABLED) {
      this.initialized = true;
      return;
    }

    if (this.mode === "postgres") {
      const initializedInPostgres = await this.initializePostgres();

      if (!initializedInPostgres) {
        this.mode = "file";
      }
    }

    if (this.mode === "file") {
      await this.loadFromDisk();
    }

    this.initialized = true;

    logger.info(
      {
        count: this.records.length,
        enabled: env.BINARY_OPTIONS_GHOST_AUDIT_ENABLED,
        mode: this.mode,
      },
      "Binary options ghost audit store initialized",
    );
  }

  public async appendSettlement(
    input: BinaryOptionsGhostAuditAppendInput,
  ): Promise<BinaryOptionsGhostAuditAppendResult> {
    if (!env.BINARY_OPTIONS_GHOST_AUDIT_ENABLED) {
      return {
        accepted: false,
        deduplicated: false,
        generatedAt: new Date().toISOString(),
        mode: this.mode,
      };
    }

    if (!this.initialized) {
      await this.initialize();
    }

    const parsedInput = appendInputSchema.parse(input);

    if (this.mode === "postgres") {
      const duplicateInPostgres = await this.hasDuplicateInPostgres(
        parsedInput.sessionId,
        parsedInput.signalId,
      );

      if (duplicateInPostgres === null) {
        this.mode = "file";
      } else if (duplicateInPostgres) {
        return {
          accepted: true,
          deduplicated: true,
          generatedAt: new Date().toISOString(),
          mode: this.mode,
        };
      }
    }

    if (
      this.mode === "file"
      && this.records.some((record) =>
        record.sessionId === parsedInput.sessionId && record.signalId === parsedInput.signalId)
    ) {
      return {
        accepted: true,
        deduplicated: true,
        generatedAt: new Date().toISOString(),
        mode: this.mode,
      };
    }

    const record = recordSchema.parse({
      ...parsedInput,
      recordedAt: new Date().toISOString(),
    });

    this.records.push(record);
    this.records = this.records.filter((item) => isRecordAfterCutoff(item, getRetentionCutoffDate()));

    if (this.records.length > env.BINARY_OPTIONS_GHOST_AUDIT_MAX_ITEMS) {
      this.records = this.records.slice(-env.BINARY_OPTIONS_GHOST_AUDIT_MAX_ITEMS);
    }

    if (this.mode === "postgres") {
      const persisted = await this.appendToPostgres(record);

      if (persisted) {
        return {
          accepted: true,
          deduplicated: false,
          generatedAt: new Date().toISOString(),
          mode: this.mode,
        };
      }

      this.mode = "file";
    }

    await this.persistToDisk();

    return {
      accepted: true,
      deduplicated: false,
      generatedAt: new Date().toISOString(),
      mode: this.mode,
    };
  }

  public async getHistory(options: BinaryOptionsGhostAuditQueryOptions = {}): Promise<BinaryOptionsGhostAuditHistory> {
    if (!this.initialized) {
      await this.initialize();
    }

    const safeLimit = clampLimit(options.limit ?? 50);
    const safeOffset = clampOffset(options.offset ?? 0);

    if (!env.BINARY_OPTIONS_GHOST_AUDIT_ENABLED) {
      return {
        filters: buildHistoryFilters(options),
        limit: safeLimit,
        offset: safeOffset,
        records: [],
        summary: buildSummary([]),
        totalMatched: 0,
        totalStored: 0,
      };
    }

    if (this.mode === "postgres") {
      const historyFromPostgres = await this.getHistoryFromPostgres({
        ...options,
        limit: safeLimit,
        offset: safeOffset,
      });

      if (historyFromPostgres) {
        return historyFromPostgres;
      }

      this.mode = "file";
    }

    const newestFirst = [...this.records].reverse();
    const filteredRecords = applyFilters(newestFirst, options);
    const paginatedRecords = filteredRecords.slice(safeOffset, safeOffset + safeLimit);
    const summary = buildSummary(filteredRecords);

    return {
      filters: buildHistoryFilters(options),
      limit: safeLimit,
      offset: safeOffset,
      records: paginatedRecords,
      summary,
      totalMatched: filteredRecords.length,
      totalStored: this.records.length,
    };
  }

  public async clear(): Promise<BinaryOptionsGhostAuditClearResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const removedCount = this.records.length;
    this.records = [];

    if (this.mode === "postgres") {
      const cleared = await this.clearPostgres();

      if (cleared) {
        return {
          clearedAt: new Date().toISOString(),
          removedCount: cleared.removedCount,
        };
      }

      this.mode = "file";
    }

    await this.persistToDisk();

    return {
      clearedAt: new Date().toISOString(),
      removedCount,
    };
  }

  private async hasDuplicateInPostgres(sessionId: string, signalId: string): Promise<boolean | null> {
    try {
      const pool = getPostgresPool();
      const result = await pool.query(
        `
          SELECT 1
          FROM binary_options_ghost_audit_logs
          WHERE payload ->> 'sessionId' = $1
            AND payload ->> 'signalId' = $2
          LIMIT 1
        `,
        [sessionId, signalId],
      );

      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      logger.warn(
        {
          err: error,
        },
        "Failed to check duplicate binary options ghost audit in postgres, switching to file mode",
      );

      return null;
    }
  }

  private async appendToPostgres(record: BinaryOptionsGhostAuditRecord): Promise<boolean> {
    try {
      const pool = getPostgresPool();
      const retentionCutoff = getRetentionCutoffDate();

      await pool.query(
        `
          INSERT INTO binary_options_ghost_audit_logs (recorded_at, payload)
          VALUES ($1, $2::jsonb)
        `,
        [record.recordedAt, JSON.stringify(record)],
      );

      await pool.query(
        `
          DELETE FROM binary_options_ghost_audit_logs
          WHERE recorded_at < $1
        `,
        [retentionCutoff.toISOString()],
      );

      await pool.query(
        `
          DELETE FROM binary_options_ghost_audit_logs
          WHERE id IN (
            SELECT id
            FROM binary_options_ghost_audit_logs
            ORDER BY recorded_at DESC, id DESC
            OFFSET $1
          )
        `,
        [env.BINARY_OPTIONS_GHOST_AUDIT_MAX_ITEMS],
      );

      return true;
    } catch (error) {
      logger.warn(
        {
          err: error,
        },
        "Failed to persist binary options ghost audit in postgres, switching to file mode",
      );

      return false;
    }
  }

  private async clearPostgres(): Promise<{ removedCount: number } | null> {
    try {
      const pool = getPostgresPool();
      const result = await pool.query("DELETE FROM binary_options_ghost_audit_logs");

      return {
        removedCount: result.rowCount ?? 0,
      };
    } catch (error) {
      logger.warn(
        {
          err: error,
        },
        "Failed to clear binary options ghost audit in postgres, switching to file mode",
      );

      return null;
    }
  }

  private async getHistoryFromPostgres(
    options: Required<Pick<BinaryOptionsGhostAuditQueryOptions, "limit" | "offset">> &
      Omit<BinaryOptionsGhostAuditQueryOptions, "limit" | "offset">,
  ): Promise<BinaryOptionsGhostAuditHistory | null> {
    try {
      const pool = getPostgresPool();
      const whereParts: string[] = [];
      const params: unknown[] = [];
      const assetId = normalizeOptionalTrimmed(options.assetId)?.toLowerCase();
      const sessionId = normalizeOptionalTrimmed(options.sessionId);

      if (options.from) {
        params.push(options.from.toISOString());
        whereParts.push(`recorded_at >= $${params.length}`);
      }

      if (options.to) {
        params.push(options.to.toISOString());
        whereParts.push(`recorded_at <= $${params.length}`);
      }

      if (sessionId) {
        params.push(sessionId);
        whereParts.push(`payload ->> 'sessionId' = $${params.length}`);
      }

      if (assetId) {
        params.push(assetId);
        whereParts.push(`LOWER(payload ->> 'assetId') = $${params.length}`);
      }

      if (options.outcome) {
        params.push(options.outcome);
        whereParts.push(`payload ->> 'outcome' = $${params.length}`);
      }

      if (options.triggerHeat) {
        params.push(options.triggerHeat);
        whereParts.push(`COALESCE(payload ->> 'triggerHeat', 'unknown') = $${params.length}`);
      }

      const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

      const totalMatchedResult = await pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM binary_options_ghost_audit_logs ${whereClause}`,
        params,
      );
      const totalStoredResult = await pool.query<{ total: number }>(
        "SELECT COUNT(*)::int AS total FROM binary_options_ghost_audit_logs",
      );

      const limitParamPosition = params.length + 1;
      const offsetParamPosition = params.length + 2;
      const recordsResult = await pool.query<{ payload: unknown }>(
        `
          SELECT payload
          FROM binary_options_ghost_audit_logs
          ${whereClause}
          ORDER BY recorded_at DESC, id DESC
          LIMIT $${limitParamPosition}
          OFFSET $${offsetParamPosition}
        `,
        [...params, options.limit, options.offset],
      );

      const parsedRecords: BinaryOptionsGhostAuditRecord[] = [];

      for (const row of recordsResult.rows) {
        const parsedRecord = recordSchema.safeParse(row.payload);

        if (!parsedRecord.success) {
          continue;
        }

        parsedRecords.push(parsedRecord.data);
      }

      const summaryResult = await pool.query<{
        losses: number;
        pushes: number;
        wins: number;
      }>(
        `
          SELECT
            COALESCE(SUM(CASE WHEN payload ->> 'outcome' = 'win' THEN 1 ELSE 0 END), 0)::int AS wins,
            COALESCE(SUM(CASE WHEN payload ->> 'outcome' = 'loss' THEN 1 ELSE 0 END), 0)::int AS losses,
            COALESCE(SUM(CASE WHEN payload ->> 'outcome' = 'push' THEN 1 ELSE 0 END), 0)::int AS pushes
          FROM binary_options_ghost_audit_logs
          ${whereClause}
        `,
        params,
      );

      const byDirectionResult = await pool.query<{
        direction: string;
        outcome: string;
        total: number;
      }>(
        `
          SELECT
            COALESCE(payload ->> 'direction', 'call') AS direction,
            payload ->> 'outcome' AS outcome,
            COUNT(*)::int AS total
          FROM binary_options_ghost_audit_logs
          ${whereClause}
          GROUP BY 1, 2
        `,
        params,
      );

      const byTriggerHeatResult = await pool.query<{
        outcome: string;
        total: number;
        trigger_heat: string;
      }>(
        `
          SELECT
            COALESCE(payload ->> 'triggerHeat', 'unknown') AS trigger_heat,
            payload ->> 'outcome' AS outcome,
            COUNT(*)::int AS total
          FROM binary_options_ghost_audit_logs
          ${whereClause}
          GROUP BY 1, 2
        `,
        params,
      );

      const globalMutable = createMutableCounters();
      const summaryRow = summaryResult.rows[0];
      globalMutable.wins = Number(summaryRow?.wins ?? 0);
      globalMutable.losses = Number(summaryRow?.losses ?? 0);
      globalMutable.pushes = Number(summaryRow?.pushes ?? 0);

      const directionMutable: Record<BinaryOptionsGhostAuditDirection, MutableOutcomeCounters> = {
        call: createMutableCounters(),
        put: createMutableCounters(),
      };

      for (const row of byDirectionResult.rows) {
        const parsedDirection = ghostDirectionSchema.safeParse(row.direction);
        const parsedOutcome = ghostOutcomeSchema.safeParse(row.outcome);

        if (!parsedDirection.success || !parsedOutcome.success) {
          continue;
        }

        const safeTotal = Number(row.total ?? 0);

        if (!Number.isFinite(safeTotal) || safeTotal <= 0) {
          continue;
        }

        if (parsedOutcome.data === "win") {
          directionMutable[parsedDirection.data].wins += safeTotal;
        } else if (parsedOutcome.data === "loss") {
          directionMutable[parsedDirection.data].losses += safeTotal;
        } else {
          directionMutable[parsedDirection.data].pushes += safeTotal;
        }
      }

      const triggerMutable: Record<BinaryOptionsGhostAuditTriggerHeat | "unknown", MutableOutcomeCounters> = {
        cold: createMutableCounters(),
        hot: createMutableCounters(),
        unknown: createMutableCounters(),
        warm: createMutableCounters(),
      };

      for (const row of byTriggerHeatResult.rows) {
        const parsedOutcome = ghostOutcomeSchema.safeParse(row.outcome);

        if (!parsedOutcome.success) {
          continue;
        }

        const triggerHeatKey = row.trigger_heat === "unknown"
          ? "unknown"
          : ghostTriggerHeatSchema.safeParse(row.trigger_heat).success
            ? (row.trigger_heat as BinaryOptionsGhostAuditTriggerHeat)
            : null;

        if (!triggerHeatKey) {
          continue;
        }

        const safeTotal = Number(row.total ?? 0);

        if (!Number.isFinite(safeTotal) || safeTotal <= 0) {
          continue;
        }

        if (parsedOutcome.data === "win") {
          triggerMutable[triggerHeatKey].wins += safeTotal;
        } else if (parsedOutcome.data === "loss") {
          triggerMutable[triggerHeatKey].losses += safeTotal;
        } else {
          triggerMutable[triggerHeatKey].pushes += safeTotal;
        }
      }

      const summary: BinaryOptionsGhostAuditSummary = {
        ...finalizeCounters(globalMutable),
        byDirection: {
          call: finalizeCounters(directionMutable.call),
          put: finalizeCounters(directionMutable.put),
        },
        byTriggerHeat: {
          cold: finalizeCounters(triggerMutable.cold),
          hot: finalizeCounters(triggerMutable.hot),
          unknown: finalizeCounters(triggerMutable.unknown),
          warm: finalizeCounters(triggerMutable.warm),
        },
      };

      return {
        filters: buildHistoryFilters(options),
        limit: options.limit,
        offset: options.offset,
        records: parsedRecords,
        summary,
        totalMatched: totalMatchedResult.rows[0]?.total ?? 0,
        totalStored: totalStoredResult.rows[0]?.total ?? 0,
      };
    } catch (error) {
      logger.warn(
        {
          err: error,
        },
        "Failed to query binary options ghost audit in postgres, switching to file mode",
      );

      return null;
    }
  }

  private async initializePostgres(): Promise<boolean> {
    try {
      const pool = getPostgresPool();
      const retentionCutoff = getRetentionCutoffDate();

      await pool.query(
        `
          DELETE FROM binary_options_ghost_audit_logs
          WHERE recorded_at < $1
        `,
        [retentionCutoff.toISOString()],
      );

      const result = await pool.query<{ payload: unknown }>(
        `
          SELECT payload
          FROM binary_options_ghost_audit_logs
          WHERE recorded_at >= $1
          ORDER BY recorded_at DESC, id DESC
          LIMIT $2
        `,
        [retentionCutoff.toISOString(), clampLimit(env.BINARY_OPTIONS_GHOST_AUDIT_MAX_ITEMS)],
      );

      const parsedRecords: BinaryOptionsGhostAuditRecord[] = [];

      for (const row of result.rows) {
        const parsedRow = recordSchema.safeParse(row.payload);

        if (!parsedRow.success) {
          continue;
        }

        parsedRecords.push(parsedRow.data);
      }

      this.records = parsedRecords.reverse();
      return true;
    } catch (error) {
      logger.warn(
        {
          err: error,
        },
        "Failed to initialize binary options ghost audit in postgres, using file mode",
      );

      return false;
    }
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const payload = persistedPayloadSchema.parse(JSON.parse(content));

      const retentionCutoff = getRetentionCutoffDate();
      const retainedRecords = payload.records.filter((record) =>
        isRecordAfterCutoff(record, retentionCutoff));

      this.records = retainedRecords.slice(-env.BINARY_OPTIONS_GHOST_AUDIT_MAX_ITEMS);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.records = [];
        return;
      }

      logger.warn(
        {
          err: error,
          filePath: this.filePath,
        },
        "Failed to load binary options ghost audit file, starting empty",
      );

      this.records = [];
    }
  }

  private async persistToDisk(): Promise<void> {
    const directoryPath = dirname(this.filePath);
    await mkdir(directoryPath, { recursive: true });

    const tempPath = `${this.filePath}.tmp`;
    const payload: PersistedPayload = {
      records: this.records,
      version: 1,
    };

    await writeFile(tempPath, JSON.stringify(payload, null, 2), "utf8");
    await rename(tempPath, this.filePath);
  }
}

export const binaryOptionsGhostAuditStore = new BinaryOptionsGhostAuditStore();
