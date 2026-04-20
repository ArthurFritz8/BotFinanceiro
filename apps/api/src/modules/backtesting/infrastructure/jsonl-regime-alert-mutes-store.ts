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
 * Snapshot persistido de UM mute manual de regime alert (Wave 26 /
 * ADR-066). O operador pode silenciar push notifications de uma
 * combinacao `(asset, strategy)` sem ocultar o alerta da UI nem
 * desabilitar todo o scanner. Persistencia LWW por chave
 * `${asset}::${strategy}`.
 */
export const regimeAlertMuteEntrySchema = z.object({
  asset: z.string().min(1),
  strategy: strategyKindSchema,
  mutedUntilMs: z.number().int().positive(),
  createdAtMs: z.number().int().positive(),
  reason: z.string().max(200).optional(),
});

export type RegimeAlertMuteEntry = z.infer<typeof regimeAlertMuteEntrySchema>;

/**
 * Store JSONL append-only para mutes de regime alerts (Wave 26 /
 * ADR-066). Mesmo padrao do JsonlRegimeAlertsHistoryStore: load O(N)
 * boot, append O(1). Estado em memoria mantido como Map LWW por
 * `${asset}::${strategy}` — append do mesmo bucket sobrescreve a entrada
 * anterior. Compactacao FIFO ao ultrapassar `maxEntries`.
 */
export class JsonlRegimeAlertMutesStore {
  private readonly entries = new Map<string, RegimeAlertMuteEntry>();

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

  private static keyFor(asset: string, strategy: string): string {
    return `${asset}::${strategy}`;
  }

  private loadFromDisk(): void {
    const raw = readFileSync(this.filePath, { encoding: "utf8" });
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);
    for (const line of lines) {
      try {
        const parsed: unknown = JSON.parse(line);
        const entry = regimeAlertMuteEntrySchema.parse(parsed);
        this.entries.set(
          JsonlRegimeAlertMutesStore.keyFor(entry.asset, entry.strategy),
          entry,
        );
      } catch {
        /* linha corrompida: ignora silenciosamente */
      }
    }
  }

  public upsert(entry: RegimeAlertMuteEntry): void {
    regimeAlertMuteEntrySchema.parse(entry);
    this.entries.set(
      JsonlRegimeAlertMutesStore.keyFor(entry.asset, entry.strategy),
      entry,
    );
    appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, {
      encoding: "utf8",
    });
    if (this.entries.size > this.maxEntries) {
      this.compact();
    }
  }

  public remove(asset: string, strategy: string): boolean {
    const key = JsonlRegimeAlertMutesStore.keyFor(asset, strategy);
    if (!this.entries.has(key)) return false;
    this.entries.delete(key);
    this.compact();
    return true;
  }

  /**
   * Retorna o mute ativo (mutedUntilMs > nowMs) para o bucket, ou
   * `undefined` se nao houver ou se ja expirou.
   */
  public getActive(
    asset: string,
    strategy: string,
    nowMs: number,
  ): RegimeAlertMuteEntry | undefined {
    const entry = this.entries.get(
      JsonlRegimeAlertMutesStore.keyFor(asset, strategy),
    );
    if (entry === undefined) return undefined;
    if (entry.mutedUntilMs <= nowMs) return undefined;
    return entry;
  }

  /**
   * Lista todos os mutes (incluindo expirados — UI pode filtrar). Ordenado
   * por mutedUntilMs desc (mais recente primeiro).
   */
  public list(): readonly RegimeAlertMuteEntry[] {
    return [...this.entries.values()].sort(
      (a, b) => b.mutedUntilMs - a.mutedUntilMs,
    );
  }

  private compact(): void {
    const serialized = [...this.entries.values()]
      .map((entry) => JSON.stringify(entry))
      .join("\n");
    writeFileSync(
      this.filePath,
      serialized.length > 0 ? `${serialized}\n` : "",
      { encoding: "utf8" },
    );
  }

  public size(): number {
    return this.entries.size;
  }

  public clear(): void {
    this.entries.clear();
    writeFileSync(this.filePath, "", { encoding: "utf8" });
  }
}
