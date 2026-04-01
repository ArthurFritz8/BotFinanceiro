import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import { env } from "../config/env.js";
import { logger } from "../logger/logger.js";
import { resolvePersistenceMode, type PersistenceMode } from "../persistence/persistence-mode.js";
import { getPostgresPool } from "../persistence/postgres-pool.js";

const healthStatusSchema = z.enum(["ok", "warning", "critical"]);

const operationalHealthSnapshotSchema = z.object({
  diagnostics: z.object({
    budgetRemainingPercent: z.number(),
    circuitState: z.enum(["closed", "half_open", "open"]),
    consecutiveOpenCycles: z.number(),
    scopeFailureRates: z.array(
      z.object({
        failureRatePercent: z.number(),
        failed: z.number(),
        processed: z.number(),
        scope: z.string(),
        synced: z.number(),
      }),
    ),
  }),
  evaluatedAt: z.string(),
  reasons: z.array(
    z.object({
      code: z.string(),
      details: z.unknown().optional(),
      message: z.string(),
      severity: z.enum(["warning", "critical"]),
    }),
  ),
  status: healthStatusSchema,
});

const historyRecordSchema = z.object({
  recordedAt: z.string(),
  snapshot: operationalHealthSnapshotSchema,
});

const persistedPayloadSchema = z.object({
  records: z.array(historyRecordSchema),
  version: z.literal(1),
});

export type PersistedOperationalHealthRecord = z.infer<typeof historyRecordSchema>;
export type PersistedOperationalHealthSnapshot = z.infer<typeof operationalHealthSnapshotSchema>;

interface PersistedPayload {
  records: PersistedOperationalHealthRecord[];
  version: 1;
}

function clampLimit(limit: number): number {
  return Math.max(1, Math.min(limit, env.OPS_HEALTH_SNAPSHOT_MAX_ITEMS));
}

export class OperationalHealthHistoryStore {
  private readonly filePath = resolve(process.cwd(), env.OPS_HEALTH_SNAPSHOT_FILE_PATH);

  private initialized = false;

  private mode: PersistenceMode = resolvePersistenceMode();

  private records: PersistedOperationalHealthRecord[] = [];

  public async initialize(): Promise<void> {
    if (this.initialized) {
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
        mode: this.mode,
      },
      "Operational health history store initialized",
    );
  }

  public getRecent(limit = 100): PersistedOperationalHealthRecord[] {
    const safeLimit = clampLimit(limit);
    const newestFirst = [...this.records].reverse();

    return newestFirst.slice(0, safeLimit);
  }

  public getStoredCount(): number {
    return this.records.length;
  }

  public async append(snapshot: PersistedOperationalHealthSnapshot): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const record: PersistedOperationalHealthRecord = {
      recordedAt: new Date().toISOString(),
      snapshot,
    };

    this.records.push(record);

    if (this.records.length > env.OPS_HEALTH_SNAPSHOT_MAX_ITEMS) {
      this.records = this.records.slice(-env.OPS_HEALTH_SNAPSHOT_MAX_ITEMS);
    }

    if (this.mode === "postgres") {
      const persisted = await this.appendToPostgres(record);

      if (persisted) {
        return;
      }

      this.mode = "file";
    }

    await this.persistToDisk();
  }

  public async clear(): Promise<{ clearedAt: string; removedCount: number }> {
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
          removedCount,
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

  private async appendToPostgres(record: PersistedOperationalHealthRecord): Promise<boolean> {
    try {
      const pool = getPostgresPool();

      await pool.query(
        `
          INSERT INTO operational_health_snapshots (recorded_at, snapshot)
          VALUES ($1, $2::jsonb)
        `,
        [record.recordedAt, JSON.stringify(record.snapshot)],
      );

      await pool.query(
        `
          DELETE FROM operational_health_snapshots
          WHERE id IN (
            SELECT id
            FROM operational_health_snapshots
            ORDER BY recorded_at DESC, id DESC
            OFFSET $1
          )
        `,
        [env.OPS_HEALTH_SNAPSHOT_MAX_ITEMS],
      );

      return true;
    } catch (error) {
      logger.warn(
        {
          err: error,
        },
        "Failed to persist operational health snapshot in postgres, switching to file mode",
      );

      return false;
    }
  }

  private async clearPostgres(): Promise<boolean> {
    try {
      const pool = getPostgresPool();
      await pool.query("DELETE FROM operational_health_snapshots");
      return true;
    } catch (error) {
      logger.warn(
        {
          err: error,
        },
        "Failed to clear operational health snapshots in postgres, switching to file mode",
      );

      return false;
    }
  }

  private async initializePostgres(): Promise<boolean> {
    try {
      const pool = getPostgresPool();

      await pool.query(`
        CREATE TABLE IF NOT EXISTS operational_health_snapshots (
          id BIGSERIAL PRIMARY KEY,
          recorded_at TIMESTAMPTZ NOT NULL,
          snapshot JSONB NOT NULL
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_operational_health_snapshots_recorded_at
        ON operational_health_snapshots (recorded_at DESC)
      `);

      const result = await pool.query<{ recorded_at: Date | string; snapshot: unknown }>(
        `
          SELECT recorded_at, snapshot
          FROM operational_health_snapshots
          ORDER BY recorded_at DESC, id DESC
          LIMIT $1
        `,
        [clampLimit(env.OPS_HEALTH_SNAPSHOT_MAX_ITEMS)],
      );

      const parsedRecords: PersistedOperationalHealthRecord[] = [];

      for (const row of result.rows) {
        const recordedAt =
          row.recorded_at instanceof Date ? row.recorded_at.toISOString() : String(row.recorded_at);

        if (Number.isNaN(Date.parse(recordedAt))) {
          continue;
        }

        const parsedSnapshot = operationalHealthSnapshotSchema.safeParse(row.snapshot);

        if (!parsedSnapshot.success) {
          continue;
        }

        parsedRecords.push({
          recordedAt,
          snapshot: parsedSnapshot.data,
        });
      }

      this.records = parsedRecords.reverse();
      return true;
    } catch (error) {
      logger.warn(
        {
          err: error,
        },
        "Failed to initialize operational health snapshots in postgres, using file mode",
      );

      return false;
    }
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const payload = persistedPayloadSchema.parse(JSON.parse(content));

      this.records = payload.records.slice(-env.OPS_HEALTH_SNAPSHOT_MAX_ITEMS);
      logger.info(
        {
          count: this.records.length,
          filePath: this.filePath,
        },
        "Loaded operational health history from disk",
      );
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
        "Failed to load operational health history, starting with empty store",
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

export const operationalHealthHistoryStore = new OperationalHealthHistoryStore();