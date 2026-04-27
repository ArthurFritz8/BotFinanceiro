import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, it } from "node:test";

process.env.NODE_ENV ??= "test";

const { CopilotChatAuditStore } = await import("./copilot-chat-audit-store.js");
const { env } = await import("../config/env.js");

interface MutableEnv {
  COPILOT_CHAT_AUDIT_ENABLED: boolean;
  COPILOT_CHAT_AUDIT_FILE_PATH: string;
  COPILOT_CHAT_AUDIT_MAX_ITEMS: number;
  COPILOT_CHAT_AUDIT_RETENTION_DAYS: number;
  DATABASE_PROVIDER: "auto" | "file" | "postgres";
  DATABASE_URL: string;
}

const mutableEnv = env as unknown as MutableEnv;
const originalEnv: MutableEnv = {
  COPILOT_CHAT_AUDIT_ENABLED: mutableEnv.COPILOT_CHAT_AUDIT_ENABLED,
  COPILOT_CHAT_AUDIT_FILE_PATH: mutableEnv.COPILOT_CHAT_AUDIT_FILE_PATH,
  COPILOT_CHAT_AUDIT_MAX_ITEMS: mutableEnv.COPILOT_CHAT_AUDIT_MAX_ITEMS,
  COPILOT_CHAT_AUDIT_RETENTION_DAYS: mutableEnv.COPILOT_CHAT_AUDIT_RETENTION_DAYS,
  DATABASE_PROVIDER: mutableEnv.DATABASE_PROVIDER,
  DATABASE_URL: mutableEnv.DATABASE_URL,
};

let tempDirectoryPath = "";

void beforeEach(() => {
  tempDirectoryPath = mkdtempSync(join(tmpdir(), "copilot-audit-store-"));

  mutableEnv.COPILOT_CHAT_AUDIT_ENABLED = true;
  mutableEnv.COPILOT_CHAT_AUDIT_FILE_PATH = join(tempDirectoryPath, "copilot-chat-audit.json");
  mutableEnv.COPILOT_CHAT_AUDIT_MAX_ITEMS = 5000;
  mutableEnv.COPILOT_CHAT_AUDIT_RETENTION_DAYS = 90;
  mutableEnv.DATABASE_PROVIDER = "file";
  mutableEnv.DATABASE_URL = "";
});

void afterEach(() => {
  mutableEnv.COPILOT_CHAT_AUDIT_ENABLED = originalEnv.COPILOT_CHAT_AUDIT_ENABLED;
  mutableEnv.COPILOT_CHAT_AUDIT_FILE_PATH = originalEnv.COPILOT_CHAT_AUDIT_FILE_PATH;
  mutableEnv.COPILOT_CHAT_AUDIT_MAX_ITEMS = originalEnv.COPILOT_CHAT_AUDIT_MAX_ITEMS;
  mutableEnv.COPILOT_CHAT_AUDIT_RETENTION_DAYS = originalEnv.COPILOT_CHAT_AUDIT_RETENTION_DAYS;
  mutableEnv.DATABASE_PROVIDER = originalEnv.DATABASE_PROVIDER;
  mutableEnv.DATABASE_URL = originalEnv.DATABASE_URL;

  if (tempDirectoryPath.length > 0) {
    rmSync(tempDirectoryPath, { force: true, recursive: true });
    tempDirectoryPath = "";
  }
});

void it("Copilot chat audit persiste chartContext e recupera no historico", async () => {
  const auditStore = new CopilotChatAuditStore();

  await auditStore.append({
    completion: {
      answer: "Contexto aplicado com sucesso.",
      fetchedAt: new Date().toISOString(),
      model: "google/gemini-1.5-flash",
      provider: "openrouter",
      responseId: "gen-audit-context-001",
      toolCallsUsed: [],
      usage: {
        completionTokens: 9,
        promptTokens: 41,
        totalTokens: 50,
      },
    },
    input: {
      chartContext: {
        assetId: "ethereum",
        broker: "bybit",
        exchange: "bybit",
        interval: "15m",
        mode: "live",
        operationalMode: "spot_margin",
        range: "24h",
        strategy: "crypto",
        symbol: "ethusdt",
      },
      maxTokens: 350,
      message: "Qual o contexto atual?",
      temperature: 0.1,
    },
    sessionId: "sessao_ctx_001",
  });

  const history = await auditStore.getHistory({
    limit: 10,
    offset: 0,
    sessionId: "sessao_ctx_001",
  });

  assert.equal(history.records.length, 1);

  const firstRecord = history.records[0];

  if (!firstRecord) {
    assert.fail("Historico deveria conter ao menos um registro");
  }

  assert.equal(firstRecord.input.chartContext?.assetId, "ethereum");
  assert.equal(firstRecord.input.chartContext?.exchange, "bybit");
  assert.equal(firstRecord.input.chartContext?.mode, "live");
  assert.equal(firstRecord.input.chartContext?.range, "24h");

  const persistedPayload = JSON.parse(
    readFileSync(join(tempDirectoryPath, "copilot-chat-audit.json"), "utf8"),
  ) as {
    records?: Array<{
      input?: {
        chartContext?: {
          assetId?: string;
          mode?: string;
        };
      };
    }>;
  };

  assert.equal(Array.isArray(persistedPayload.records), true);
  assert.equal(persistedPayload.records?.[0]?.input?.chartContext?.assetId, "ethereum");
  assert.equal(persistedPayload.records?.[0]?.input?.chartContext?.mode, "live");
});

void it("Copilot chat audit aceita registros legados sem chartContext", async () => {
  const auditStore = new CopilotChatAuditStore();

  await auditStore.append({
    completion: {
      answer: "Resposta sem contexto explicito.",
      fetchedAt: new Date().toISOString(),
      model: "google/gemini-1.5-flash",
      provider: "openrouter",
      responseId: "gen-audit-legacy-001",
      toolCallsUsed: [],
      usage: {
        completionTokens: 8,
        promptTokens: 18,
        totalTokens: 26,
      },
    },
    input: {
      maxTokens: 250,
      message: "Resumo rapido",
      temperature: 0.2,
    },
    sessionId: "sessao_legado_001",
  });

  const history = await auditStore.getHistory({
    limit: 10,
    offset: 0,
    sessionId: "sessao_legado_001",
  });

  assert.equal(history.records.length, 1);

  const firstRecord = history.records[0];

  if (!firstRecord) {
    assert.fail("Historico legado deveria conter um registro");
  }

  assert.equal(firstRecord.input.message, "Resumo rapido");
  assert.equal(firstRecord.input.chartContext, undefined);
});