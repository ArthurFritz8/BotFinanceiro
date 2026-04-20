import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import { z } from "zod";

import { strategyKindSchema } from "../domain/backtest-types.js";

/**
 * Linha do JSONL: snapshot persistido de UM alerta de degradacao critical
 * disparado por `BacktestingService.computeRegimeAlerts` (Wave 23 /
 * ADR-063). Persistimos apenas critical (warning permanece efemero) para
 * manter o arquivo focado em sinais acionaveis.
 */
export const regimeAlertHistoryEntrySchema = z.object({
  id: z.string().min(1),
  recordedAtMs: z.number().int().positive(),
  asset: z.string().min(1),
  strategy: strategyKindSchema,
  baselineAvgPnlPercent: z.number(),
  recentAvgPnlPercent: z.number(),
  deltaPnlPercent: z.number(),
  baselineRoundsCount: z.number().int().nonnegative(),
  recentRoundsCount: z.number().int().nonnegative(),
  severity: z.enum(["warning", "critical"]),
  lastRanAtMs: z.number().int().positive(),
});

export type RegimeAlertHistoryEntry = z.infer<
  typeof regimeAlertHistoryEntrySchema
>;

/**
 * Store JSONL append-only para o historico de alertas critical de regime
 * (Wave 23 / ADR-063). Mesmo padrao do JsonlBacktestRunStore: load O(N)
 * boot, append O(1), compactacao FIFO ao ultrapassar `maxEntries`
 * (default 500).
 */
export class JsonlRegimeAlertsHistoryStore {
  private readonly entries: RegimeAlertHistoryEntry[] = [];

  public constructor(
    private readonly filePath: string,
    private readonly maxEntries: number = 500,
  ) {
    this.ensureDirectory();
    this.loadFromDisk();
  }

  private ensureDirectory(): void {
    const directory = dirname(this.filePath);
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
    if (!existsSync(this.filePath)) {
      writeFileSync(this.filePath, "", { encoding: "utf8" });
    }
  }

  private loadFromDisk(): void {
    const raw = readFileSync(this.filePath, { encoding: "utf8" });
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);
    for (const line of lines) {
      try {
        const parsed: unknown = JSON.parse(line);
        const entry = regimeAlertHistoryEntrySchema.parse(parsed);
        this.entries.push(entry);
      } catch {
        /* linha corrompida: ignora silenciosamente */
      }
    }
  }

  public append(entry: RegimeAlertHistoryEntry): void {
    regimeAlertHistoryEntrySchema.parse(entry);
    this.entries.push(entry);
    appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, {
      encoding: "utf8",
    });
    if (this.entries.length > this.maxEntries) {
      this.compact();
    }
  }

  private compact(): void {
    const trimmed = this.entries.slice(-this.maxEntries);
    this.entries.length = 0;
    for (const entry of trimmed) {
      this.entries.push(entry);
    }
    const serialized = trimmed
      .map((entry) => JSON.stringify(entry))
      .join("\n");
    writeFileSync(
      this.filePath,
      serialized.length > 0 ? `${serialized}\n` : "",
      { encoding: "utf8" },
    );
  }

  /** Lista entradas ordenadas por `recordedAtMs` desc (mais recentes primeiro). */
  public list(): readonly RegimeAlertHistoryEntry[] {
    return [...this.entries].sort((a, b) => b.recordedAtMs - a.recordedAtMs);
  }

  /**
   * Conta quantos alertas existem no historico para uma combinacao
   * `(asset, strategy)` dentro da janela `windowMs` retroativa a partir
   * de `nowMs` (incluso). Usado pelo service para detectar recorrencia
   * (escalada warning -> critical).
   */
  public countRecentForBucket(
    asset: string,
    strategy: string,
    nowMs: number,
    windowMs: number,
  ): number {
    const cutoff = nowMs - windowMs;
    let count = 0;
    for (const entry of this.entries) {
      if (
        entry.asset === asset &&
        entry.strategy === strategy &&
        entry.recordedAtMs >= cutoff &&
        entry.recordedAtMs <= nowMs
      ) {
        count += 1;
      }
    }
    return count;
  }

  public size(): number {
    return this.entries.length;
  }

  public clear(): void {
    this.entries.length = 0;
    writeFileSync(this.filePath, "", { encoding: "utf8" });
  }
}
