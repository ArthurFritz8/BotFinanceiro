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
 * Snapshot leve do resultado de UMA estrategia dentro de uma rodada de
 * comparacao. Persistimos apenas as metricas (nao a serie de trades) para
 * manter o arquivo enxuto — historico e leaderboard nao precisam de
 * drill-down por trade individual.
 */
export const backtestHistoryStrategyResultSchema = z.object({
  strategy: strategyKindSchema,
  totalTrades: z.number().int().nonnegative(),
  winRatePercent: z.number(),
  profitFactor: z.number(),
  totalPnlPercent: z.number(),
  maxDrawdownPercent: z.number(),
});

export type BacktestHistoryStrategyResult = z.infer<
  typeof backtestHistoryStrategyResultSchema
>;

/**
 * Linha do JSONL: uma rodada de comparacao multi-estrategia (Wave 21 /
 * ADR-061). Cada rodada e identificada por `id` (timestamp + asset + broker
 * + range hash curto) e referencia o snapshot temporal via `ranAtMs`.
 */
export const backtestHistoryEntrySchema = z.object({
  id: z.string().min(1),
  ranAtMs: z.number().int().positive(),
  asset: z.string().min(1),
  broker: z.string().min(1),
  range: z.string().min(1),
  candleCount: z.number().int().nonnegative(),
  cooldownCandles: z.number().int().nonnegative(),
  commissionPercent: z.number().nonnegative(),
  slippagePercent: z.number().nonnegative(),
  results: z.array(backtestHistoryStrategyResultSchema).min(1),
});

export type BacktestHistoryEntry = z.infer<typeof backtestHistoryEntrySchema>;

/**
 * Store JSONL append-only para o historico de rodadas comparativas de
 * backtest. Reusa o padrao do `JsonlTradeStore` (paper-trading) — load
 * sequencial no boot, append O(1) por rodada nova. Cap maximo via
 * `maxEntries` (default 500) — quando ultrapassado, recompacta o arquivo
 * mantendo apenas as N mais recentes (FIFO).
 */
export class JsonlBacktestRunStore {
  private readonly entries: BacktestHistoryEntry[] = [];

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
        const entry = backtestHistoryEntrySchema.parse(parsed);
        this.entries.push(entry);
      } catch {
        /* linha corrompida: ignora silenciosamente para nao quebrar boot */
      }
    }
  }

  public append(entry: BacktestHistoryEntry): void {
    backtestHistoryEntrySchema.parse(entry);
    this.entries.push(entry);
    appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, {
      encoding: "utf8",
    });
    if (this.entries.length > this.maxEntries) {
      this.compact();
    }
  }

  /**
   * Recompacta o arquivo mantendo apenas as N entradas mais recentes
   * (FIFO). Reescreve o JSONL inteiro de uma vez (atomico via writeFile).
   */
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

  /** Lista as entradas ordenadas por `ranAtMs` descendente (mais recente primeiro). */
  public list(): readonly BacktestHistoryEntry[] {
    return [...this.entries].sort((a, b) => b.ranAtMs - a.ranAtMs);
  }

  public size(): number {
    return this.entries.length;
  }

  public clear(): void {
    this.entries.length = 0;
    writeFileSync(this.filePath, "", { encoding: "utf8" });
  }
}
