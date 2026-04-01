import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import { type OpenRouterChatCompletion } from "../../integrations/ai/openrouter-chat-adapter.js";
import { env } from "../config/env.js";
import { logger } from "../logger/logger.js";
import { resolvePersistenceMode, type PersistenceMode } from "../persistence/persistence-mode.js";
import { getPostgresPool } from "../persistence/postgres-pool.js";

const copilotChatAuditInputSchema = z.object({
  maxTokens: z.number().int().min(1).max(2000).optional(),
  message: z.string(),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const copilotChatAuditCompletionSchema = z.object({
  answer: z.string(),
  fetchedAt: z.string(),
  model: z.string(),
  provider: z.literal("openrouter"),
  responseId: z.string(),
  toolCallsUsed: z.array(z.string()),
  usage: z.object({
    completionTokens: z.number().optional(),
    promptTokens: z.number().optional(),
    totalTokens: z.number().optional(),
  }),
});

const copilotChatAuditRecordSchema = z.object({
  completion: copilotChatAuditCompletionSchema,
  input: copilotChatAuditInputSchema,
  recordedAt: z.string(),
});

const persistedCopilotChatAuditPayloadSchema = z.object({
  records: z.array(copilotChatAuditRecordSchema),
  version: z.literal(1),
});

export type CopilotChatAuditRecord = z.infer<typeof copilotChatAuditRecordSchema>;

interface PersistedCopilotChatAuditPayload {
  records: CopilotChatAuditRecord[];
  version: 1;
}

export interface CopilotChatAuditHistoryQueryOptions {
  from?: Date;
  limit?: number;
  offset?: number;
  to?: Date;
  toolName?: string;
}

export interface CopilotChatAuditHistory {
  filters: {
    from: string | null;
    to: string | null;
    toolName: string | null;
  };
  limit: number;
  offset: number;
  records: CopilotChatAuditRecord[];
  totalMatched: number;
  totalStored: number;
}

export interface CopilotChatAuditClearResult {
  clearedAt: string;
  removedCount: number;
}

export interface CopilotChatAuditAppendInput {
  completion: OpenRouterChatCompletion;
  input: {
    maxTokens?: number;
    message: string;
    systemPrompt?: string;
    temperature?: number;
  };
}

function clampAuditItems(items: number): number {
  return Math.max(1, Math.min(items, env.COPILOT_CHAT_AUDIT_MAX_ITEMS));
}

function clampAuditOffset(offset: number): number {
  return Math.max(0, offset);
}

function getRetentionCutoffDate(retentionDays: number): Date {
  const cutoffTime = Date.now() - retentionDays * 86_400_000;
  return new Date(cutoffTime);
}

function isRecordAfterCutoff(record: CopilotChatAuditRecord, cutoffDate: Date): boolean {
  const recordedAtMs = Date.parse(record.recordedAt);

  if (Number.isNaN(recordedAtMs)) {
    return false;
  }

  return recordedAtMs >= cutoffDate.getTime();
}

function applyAuditFilters(
  records: CopilotChatAuditRecord[],
  options: CopilotChatAuditHistoryQueryOptions,
): CopilotChatAuditRecord[] {
  const fromMs = options.from?.getTime();
  const toMs = options.to?.getTime();
  const toolName = options.toolName?.trim().toLowerCase();

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

    if (toolName && !record.completion.toolCallsUsed.some((item) => item.toLowerCase() === toolName)) {
      return false;
    }

    return true;
  });
}

export class CopilotChatAuditStore {
  private readonly filePath = resolve(process.cwd(), env.COPILOT_CHAT_AUDIT_FILE_PATH);

  private initialized = false;

  private mode: PersistenceMode = resolvePersistenceMode();

  private records: CopilotChatAuditRecord[] = [];

  public async clear(): Promise<CopilotChatAuditClearResult> {
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

  public async getHistory(options: CopilotChatAuditHistoryQueryOptions = {}): Promise<CopilotChatAuditHistory> {
    if (!this.initialized) {
      await this.initialize();
    }

    const safeLimit = clampAuditItems(options.limit ?? 50);
    const safeOffset = clampAuditOffset(options.offset ?? 0);

    if (this.mode === "postgres") {
      const historyFromPostgres = await this.getHistoryFromPostgres(
        {
          ...options,
          limit: safeLimit,
          offset: safeOffset,
        },
      );

      if (historyFromPostgres) {
        return historyFromPostgres;
      }

      this.mode = "file";
    }

    const newestFirst = [...this.records].reverse();
    const filteredRecords = applyAuditFilters(newestFirst, options);
    const paginatedRecords = filteredRecords.slice(safeOffset, safeOffset + safeLimit);

    return {
      filters: {
        from: options.from ? options.from.toISOString() : null,
        to: options.to ? options.to.toISOString() : null,
        toolName: options.toolName?.trim() || null,
      },
      limit: safeLimit,
      offset: safeOffset,
      records: paginatedRecords,
      totalMatched: filteredRecords.length,
      totalStored: this.records.length,
    };
  }

  public async append(input: CopilotChatAuditAppendInput): Promise<void> {
    if (!env.COPILOT_CHAT_AUDIT_ENABLED) {
      return;
    }

    if (!this.initialized) {
      await this.initialize();
    }

    const record = copilotChatAuditRecordSchema.parse({
      completion: input.completion,
      input: input.input,
      recordedAt: new Date().toISOString(),
    });

    this.records.push(record);
    this.records = this.records.filter((item) =>
      isRecordAfterCutoff(item, getRetentionCutoffDate(env.COPILOT_CHAT_AUDIT_RETENTION_DAYS)),
    );

    if (this.records.length > env.COPILOT_CHAT_AUDIT_MAX_ITEMS) {
      this.records = this.records.slice(-env.COPILOT_CHAT_AUDIT_MAX_ITEMS);
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

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!env.COPILOT_CHAT_AUDIT_ENABLED) {
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
        enabled: env.COPILOT_CHAT_AUDIT_ENABLED,
        mode: this.mode,
      },
      "Copilot chat audit store initialized",
    );
  }

  private async appendToPostgres(record: CopilotChatAuditRecord): Promise<boolean> {
    try {
      const pool = getPostgresPool();
      const retentionCutoff = getRetentionCutoffDate(env.COPILOT_CHAT_AUDIT_RETENTION_DAYS);

      await pool.query(
        `
          INSERT INTO copilot_chat_audit_logs (recorded_at, payload)
          VALUES ($1, $2::jsonb)
        `,
        [record.recordedAt, JSON.stringify(record)],
      );

      await pool.query(
        `
          DELETE FROM copilot_chat_audit_logs
          WHERE recorded_at < $1
        `,
        [retentionCutoff.toISOString()],
      );

      await pool.query(
        `
          DELETE FROM copilot_chat_audit_logs
          WHERE id IN (
            SELECT id
            FROM copilot_chat_audit_logs
            ORDER BY recorded_at DESC, id DESC
            OFFSET $1
          )
        `,
        [env.COPILOT_CHAT_AUDIT_MAX_ITEMS],
      );

      return true;
    } catch (error) {
      logger.warn(
        {
          err: error,
        },
        "Failed to persist copilot chat audit in postgres, switching to file mode",
      );

      return false;
    }
  }

  private async clearPostgres(): Promise<{ removedCount: number } | null> {
    try {
      const pool = getPostgresPool();
      const result = await pool.query("DELETE FROM copilot_chat_audit_logs");

      return {
        removedCount: result.rowCount ?? 0,
      };
    } catch (error) {
      logger.warn(
        {
          err: error,
        },
        "Failed to clear copilot chat audit in postgres, switching to file mode",
      );

      return null;
    }
  }

  private async getHistoryFromPostgres(
    options: Required<Pick<CopilotChatAuditHistoryQueryOptions, "limit" | "offset">> &
      Omit<CopilotChatAuditHistoryQueryOptions, "limit" | "offset">,
  ): Promise<CopilotChatAuditHistory | null> {
    try {
      const pool = getPostgresPool();
      const whereParts: string[] = [];
      const params: unknown[] = [];

      if (options.from) {
        params.push(options.from.toISOString());
        whereParts.push(`recorded_at >= $${params.length}`);
      }

      if (options.to) {
        params.push(options.to.toISOString());
        whereParts.push(`recorded_at <= $${params.length}`);
      }

      if (options.toolName && options.toolName.trim().length > 0) {
        params.push(options.toolName.trim());
        whereParts.push(`(payload -> 'completion' -> 'toolCallsUsed') ? $${params.length}`);
      }

      const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
      const totalMatchedResult = await pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM copilot_chat_audit_logs ${whereClause}`,
        params,
      );
      const totalStoredResult = await pool.query<{ total: number }>(
        "SELECT COUNT(*)::int AS total FROM copilot_chat_audit_logs",
      );

      const limitParamPosition = params.length + 1;
      const offsetParamPosition = params.length + 2;
      const recordsResult = await pool.query<{ payload: unknown }>(
        `
          SELECT payload
          FROM copilot_chat_audit_logs
          ${whereClause}
          ORDER BY recorded_at DESC, id DESC
          LIMIT $${limitParamPosition}
          OFFSET $${offsetParamPosition}
        `,
        [...params, options.limit, options.offset],
      );

      const parsedRecords: CopilotChatAuditRecord[] = [];

      for (const row of recordsResult.rows) {
        const parsedRecord = copilotChatAuditRecordSchema.safeParse(row.payload);

        if (!parsedRecord.success) {
          continue;
        }

        parsedRecords.push(parsedRecord.data);
      }

      return {
        filters: {
          from: options.from ? options.from.toISOString() : null,
          to: options.to ? options.to.toISOString() : null,
          toolName: options.toolName?.trim() || null,
        },
        limit: options.limit,
        offset: options.offset,
        records: parsedRecords,
        totalMatched: totalMatchedResult.rows[0]?.total ?? 0,
        totalStored: totalStoredResult.rows[0]?.total ?? 0,
      };
    } catch (error) {
      logger.warn(
        {
          err: error,
        },
        "Failed to query copilot chat audit in postgres, switching to file mode",
      );

      return null;
    }
  }

  private async initializePostgres(): Promise<boolean> {
    try {
      const pool = getPostgresPool();
      const retentionCutoff = getRetentionCutoffDate(env.COPILOT_CHAT_AUDIT_RETENTION_DAYS);

      await pool.query(
        `
          DELETE FROM copilot_chat_audit_logs
          WHERE recorded_at < $1
        `,
        [retentionCutoff.toISOString()],
      );

      const result = await pool.query<{ payload: unknown }>(
        `
          SELECT payload
          FROM copilot_chat_audit_logs
          WHERE recorded_at >= $1
          ORDER BY recorded_at DESC, id DESC
          LIMIT $2
        `,
        [retentionCutoff.toISOString(), clampAuditItems(env.COPILOT_CHAT_AUDIT_MAX_ITEMS)],
      );

      const parsedRecords: CopilotChatAuditRecord[] = [];

      for (const row of result.rows) {
        const parsedRow = copilotChatAuditRecordSchema.safeParse(row.payload);

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
        "Failed to initialize copilot chat audit in postgres, using file mode",
      );

      return false;
    }
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const payload = persistedCopilotChatAuditPayloadSchema.parse(JSON.parse(content));

      const retentionCutoff = getRetentionCutoffDate(env.COPILOT_CHAT_AUDIT_RETENTION_DAYS);
      const retainedRecords = payload.records.filter((record) =>
        isRecordAfterCutoff(record, retentionCutoff),
      );

      this.records = retainedRecords.slice(-env.COPILOT_CHAT_AUDIT_MAX_ITEMS);
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
        "Failed to load copilot chat audit file, starting empty",
      );

      this.records = [];
    }
  }

  private async persistToDisk(): Promise<void> {
    const directoryPath = dirname(this.filePath);
    await mkdir(directoryPath, { recursive: true });

    const tempPath = `${this.filePath}.tmp`;
    const payload: PersistedCopilotChatAuditPayload = {
      records: this.records,
      version: 1,
    };

    await writeFile(tempPath, JSON.stringify(payload, null, 2), "utf8");
    await rename(tempPath, this.filePath);
  }
}

export const copilotChatAuditStore = new CopilotChatAuditStore();
