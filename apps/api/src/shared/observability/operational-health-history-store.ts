import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import { env } from "../config/env.js";
import { logger } from "../logger/logger.js";

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

  private records: PersistedOperationalHealthRecord[] = [];

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.loadFromDisk();
    this.initialized = true;
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

    this.records.push({
      recordedAt: new Date().toISOString(),
      snapshot,
    });

    if (this.records.length > env.OPS_HEALTH_SNAPSHOT_MAX_ITEMS) {
      this.records = this.records.slice(-env.OPS_HEALTH_SNAPSHOT_MAX_ITEMS);
    }

    await this.persistToDisk();
  }

  public async clear(): Promise<{ clearedAt: string; removedCount: number }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const removedCount = this.records.length;
    this.records = [];
    await this.persistToDisk();

    return {
      clearedAt: new Date().toISOString(),
      removedCount,
    };
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