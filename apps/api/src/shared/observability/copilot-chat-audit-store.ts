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

type CopilotChatAuditRecord = z.infer<typeof copilotChatAuditRecordSchema>;

interface PersistedCopilotChatAuditPayload {
  records: CopilotChatAuditRecord[];
  version: 1;
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

export class CopilotChatAuditStore {
  private readonly filePath = resolve(process.cwd(), env.COPILOT_CHAT_AUDIT_FILE_PATH);

  private initialized = false;

  private mode: PersistenceMode = resolvePersistenceMode();

  private records: CopilotChatAuditRecord[] = [];

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

  private async initializePostgres(): Promise<boolean> {
    try {
      const pool = getPostgresPool();

      await pool.query(`
        CREATE TABLE IF NOT EXISTS copilot_chat_audit_logs (
          id BIGSERIAL PRIMARY KEY,
          recorded_at TIMESTAMPTZ NOT NULL,
          payload JSONB NOT NULL
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_copilot_chat_audit_logs_recorded_at
        ON copilot_chat_audit_logs (recorded_at DESC)
      `);

      const result = await pool.query<{ payload: unknown }>(
        `
          SELECT payload
          FROM copilot_chat_audit_logs
          ORDER BY recorded_at DESC, id DESC
          LIMIT $1
        `,
        [clampAuditItems(env.COPILOT_CHAT_AUDIT_MAX_ITEMS)],
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

      this.records = payload.records.slice(-env.COPILOT_CHAT_AUDIT_MAX_ITEMS);
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
