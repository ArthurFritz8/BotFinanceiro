import { randomUUID } from "node:crypto";

import {
  operatorDispatchEntrySchema,
  type OperatorDispatchEntry,
  type OperatorDispatchJournalSnapshot,
} from "../domain/operator-dispatch-types.js";

const DEFAULT_MAX_ENTRIES = 100;
const ABSOLUTE_MAX_ENTRIES = 500;

export interface RecordOperatorDispatchInput {
  readonly asset: string;
  readonly side: OperatorDispatchEntry["side"];
  readonly tier: OperatorDispatchEntry["tier"];
  readonly confluenceScore: number;
  readonly action: OperatorDispatchEntry["action"];
  readonly reason?: string | null;
  readonly occurredAtMs?: number;
}

export interface OperatorDispatchSnapshotQuery {
  readonly limit?: number;
  readonly fromMs?: number;
  readonly toMs?: number;
  readonly action?: OperatorDispatchEntry["action"];
  readonly asset?: string;
}

/**
 * Journal in-memory (single-process) dos disparos do operador para a rota
 * publica autenticada `/v1/paper-trading/operator/auto-signal`. Implementa
 * ring buffer com limite configuravel (default 100, teto 500) para nao
 * crescer indefinidamente em sessoes longas.
 *
 * Escopo deliberadamente in-memory: o journal local do ADR-104 ja garante
 * persistencia por operador; este endpoint complementa com visao
 * centralizada do servidor para auditoria cross-device. Persistencia em
 * disco fica para evolucao futura (ADR proprio se a demanda surgir).
 */
export interface OperatorDispatchCumulativeTotals {
  readonly opened: number;
  readonly skipped: number;
  readonly error: number;
  readonly total: number;
}

export class InMemoryOperatorDispatchJournal {
  private readonly entries: OperatorDispatchEntry[] = [];

  private readonly maxEntries: number;

  /**
   * Contadores cumulativos por `action`, INDEPENDENTES do ring buffer:
   * cresce monotonicamente ao longo da vida do processo e nao decrementa
   * quando entradas antigas sao despejadas. Reseta apenas em `clear()`.
   *
   * Servem como counter Prometheus (ADR-108) e como base para taxas
   * observacionais cross-window — o snapshot filtrado segue refletindo
   * apenas as entradas presentes no buffer.
   */
  private readonly cumulative: { opened: number; skipped: number; error: number } = {
    opened: 0,
    skipped: 0,
    error: 0,
  };

  public constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      this.maxEntries = DEFAULT_MAX_ENTRIES;
      return;
    }
    this.maxEntries = Math.min(maxEntries, ABSOLUTE_MAX_ENTRIES);
  }

  public record(input: RecordOperatorDispatchInput): OperatorDispatchEntry {
    const candidate = {
      id: randomUUID(),
      occurredAtMs: input.occurredAtMs ?? Date.now(),
      asset: input.asset,
      side: input.side,
      tier: input.tier,
      confluenceScore: input.confluenceScore,
      action: input.action,
      reason: input.reason ?? null,
    } satisfies OperatorDispatchEntry;
    const entry = operatorDispatchEntrySchema.parse(candidate);
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
    this.cumulative[entry.action] += 1;
    return entry;
  }

  public cumulativeTotals(): OperatorDispatchCumulativeTotals {
    return {
      opened: this.cumulative.opened,
      skipped: this.cumulative.skipped,
      error: this.cumulative.error,
      total: this.cumulative.opened + this.cumulative.skipped + this.cumulative.error,
    };
  }

  public snapshot(
    queryOrLimit?: number | OperatorDispatchSnapshotQuery,
  ): OperatorDispatchJournalSnapshot {
    const query: OperatorDispatchSnapshotQuery =
      typeof queryOrLimit === "number"
        ? { limit: queryOrLimit }
        : queryOrLimit ?? {};
    const assetFilter = query.asset?.trim().toLowerCase();
    const filtered = this.entries.filter((entry) => {
      if (query.fromMs !== undefined && entry.occurredAtMs < query.fromMs) {
        return false;
      }
      if (query.toMs !== undefined && entry.occurredAtMs > query.toMs) {
        return false;
      }
      if (query.action !== undefined && entry.action !== query.action) {
        return false;
      }
      if (assetFilter && entry.asset.toLowerCase() !== assetFilter) {
        return false;
      }
      return true;
    });
    let opened = 0;
    let skipped = 0;
    let errors = 0;
    for (const entry of filtered) {
      if (entry.action === "opened") opened += 1;
      else if (entry.action === "skipped") skipped += 1;
      else errors += 1;
    }
    const ordered = [...filtered].sort(
      (a, b) => b.occurredAtMs - a.occurredAtMs,
    );
    const safeLimit =
      Number.isInteger(query.limit) && query.limit !== undefined && query.limit > 0
        ? Math.min(query.limit, this.maxEntries)
        : this.maxEntries;
    return {
      total: filtered.length,
      opened,
      skipped,
      errors,
      entries: ordered.slice(0, safeLimit),
    };
  }

  public size(): number {
    return this.entries.length;
  }

  public clear(): void {
    this.entries.length = 0;
    this.cumulative.opened = 0;
    this.cumulative.skipped = 0;
    this.cumulative.error = 0;
  }
}

/**
 * Coletor Prometheus (ADR-108) que renderiza os contadores cumulativos
 * do journal como counter unico `paper_trading_operator_dispatches_total`
 * com label `action="opened|skipped|error"`. Cardinalidade fixa em 3
 * series, independente do volume de ativos auditados.
 */
export function renderOperatorDispatchPrometheusFragment(
  journal: Pick<InMemoryOperatorDispatchJournal, "cumulativeTotals">,
): string {
  const totals = journal.cumulativeTotals();
  const lines = [
    "# HELP paper_trading_operator_dispatches_total Total operator auto-signal dispatches recorded since process start.",
    "# TYPE paper_trading_operator_dispatches_total counter",
    `paper_trading_operator_dispatches_total{action="opened"} ${totals.opened}`,
    `paper_trading_operator_dispatches_total{action="skipped"} ${totals.skipped}`,
    `paper_trading_operator_dispatches_total{action="error"} ${totals.error}`,
  ];
  return `${lines.join("\n")}\n`;
}
