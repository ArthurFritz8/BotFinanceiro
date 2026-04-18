import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import { tradeSchema, type Trade } from "../domain/paper-trading-types.js";

/**
 * Store de trades persistido em JSONL append-only (event sourcing simplificado).
 *
 * - Cada linha eh um snapshot completo do trade serializado em JSON.
 * - Ao carregar, replay sequencial reconstroi o estado atual via "ultima
 *   versao por id vence" (LWW). Trades fechados por evaluatePrice tambem geram
 *   nova linha — o historico completo eh recuperavel para auditoria/debug.
 * - Append-only evita corrupcao por escrita concorrente parcial: cada flush
 *   eh atomico (uma linha por vez) e re-leitura do arquivo nao depende de
 *   ordem alem de "ultima ocorrencia do id".
 *
 * Escopo: single-node, single-processo. Concurrent writers exigem file locking
 * (fora do MVP). Desempenho: O(N) carga inicial, O(1) append. Para milhares
 * de trades por dia funciona; para milhoes migrar para SQLite.
 */
export class JsonlTradeStore {
  private readonly trades = new Map<string, Trade>();

  public constructor(private readonly filePath: string) {
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
        const trade = tradeSchema.parse(parsed);
        this.trades.set(trade.id, trade);
      } catch {
        /* linha corrompida: ignora silenciosamente para nao quebrar boot */
      }
    }
  }

  public upsert(trade: Trade): void {
    tradeSchema.parse(trade);
    this.trades.set(trade.id, trade);
    appendFileSync(this.filePath, `${JSON.stringify(trade)}\n`, { encoding: "utf8" });
  }

  public list(): readonly Trade[] {
    return [...this.trades.values()].sort((a, b) => a.openedAtMs - b.openedAtMs);
  }

  public listOpen(): readonly Trade[] {
    return this.list().filter((trade) => trade.status === "open");
  }

  public listOpenForAsset(asset: string): readonly Trade[] {
    const target = asset.toLowerCase();
    return this.listOpen().filter((trade) => trade.asset.toLowerCase() === target);
  }

  public size(): number {
    return this.trades.size;
  }

  public clear(): void {
    this.trades.clear();
    writeFileSync(this.filePath, "", { encoding: "utf8" });
  }
}
