import { randomUUID } from "node:crypto";

import {
  computePnlPercent,
  openTradeInputSchema,
  type EvaluatePriceInput,
  type OpenTradeInput,
  type PaperTradingStats,
  type Trade,
} from "../domain/paper-trading-types.js";
import type { JsonlTradeStore } from "../infrastructure/jsonl-trade-store.js";

export interface PaperTradingServiceOptions {
  readonly store: JsonlTradeStore;
  readonly clock?: () => number;
}

/**
 * Resultado da avaliacao de um trade contra o preco atual de mercado.
 *
 * - `closed`: hit stop ou target — gera nova versao do trade com status final.
 * - `open`: preco entre stop e target — trade segue aberto, nada muda.
 */
export interface EvaluationResult {
  readonly trade: Trade;
  readonly closed: boolean;
  readonly outcome: "win" | "loss" | "open";
}

export class PaperTradingService {
  private readonly clock: () => number;

  public constructor(private readonly options: PaperTradingServiceOptions) {
    this.clock = options.clock ?? Date.now;
  }

  public openTrade(input: OpenTradeInput): Trade {
    const validated = openTradeInputSchema.parse(input);
    const trade: Trade = {
      id: randomUUID(),
      asset: validated.asset,
      side: validated.side,
      entryPrice: validated.entryPrice,
      stopPrice: validated.stopPrice,
      targetPrice: validated.targetPrice,
      openedAtMs: this.clock(),
      closedAtMs: null,
      exitPrice: null,
      status: "open",
      pnlPercent: null,
      confluenceScore: validated.confluenceScore ?? null,
      notes: validated.notes,
    };
    this.options.store.upsert(trade);
    return trade;
  }

  /**
   * Avalia preco atual contra todos os trades abertos do ativo. Fecha em
   * stop ou target (modelo simplificado: assume execucao a preco exato — sem
   * slippage, sem gap; aceitavel para paper trading conservador).
   */
  public evaluatePrice(input: EvaluatePriceInput): readonly EvaluationResult[] {
    const openTrades = this.options.store.listOpenForAsset(input.asset);
    const results: EvaluationResult[] = [];

    for (const trade of openTrades) {
      const evaluation = this.evaluateSingle(trade, input.price);
      results.push(evaluation);
    }

    return results;
  }

  private evaluateSingle(trade: Trade, price: number): EvaluationResult {
    const hitTarget =
      trade.side === "long" ? price >= trade.targetPrice : price <= trade.targetPrice;
    const hitStop =
      trade.side === "long" ? price <= trade.stopPrice : price >= trade.stopPrice;

    if (!hitTarget && !hitStop) {
      return { trade, closed: false, outcome: "open" };
    }

    const exitPrice = hitTarget ? trade.targetPrice : trade.stopPrice;
    const status = hitTarget ? "win" : "loss";
    const closedTrade: Trade = {
      ...trade,
      closedAtMs: this.clock(),
      exitPrice,
      status,
      pnlPercent: computePnlPercent(trade.side, trade.entryPrice, exitPrice),
    };
    this.options.store.upsert(closedTrade);
    return { trade: closedTrade, closed: true, outcome: status };
  }

  public listTrades(): readonly Trade[] {
    return this.options.store.list();
  }

  public computeStats(): PaperTradingStats {
    const trades = this.options.store.list();
    const closed = trades.filter((t) => t.status === "win" || t.status === "loss");
    const wins = closed.filter((t) => t.status === "win");
    const losses = closed.filter((t) => t.status === "loss");
    const winRatePercent = closed.length === 0 ? 0 : (wins.length / closed.length) * 100;

    const sumWinPnl = wins.reduce((acc, t) => acc + (t.pnlPercent ?? 0), 0);
    const sumLossPnl = losses.reduce((acc, t) => acc + Math.abs(t.pnlPercent ?? 0), 0);
    const profitFactor =
      sumLossPnl === 0 ? (sumWinPnl > 0 ? Number.POSITIVE_INFINITY : 0) : sumWinPnl / sumLossPnl;
    const avgWinPercent = wins.length === 0 ? 0 : sumWinPnl / wins.length;
    const avgLossPercent = losses.length === 0 ? 0 : -(sumLossPnl / losses.length);
    const totalPnlPercent = closed.reduce((acc, t) => acc + (t.pnlPercent ?? 0), 0);

    const equityCurve = this.buildEquityCurve(closed);
    const maxDrawdownPercent = this.computeMaxDrawdown(equityCurve.map((p) => p.equity));

    return {
      totalTrades: trades.length,
      openTrades: trades.length - closed.length,
      closedTrades: closed.length,
      wins: wins.length,
      losses: losses.length,
      winRatePercent,
      profitFactor,
      avgWinPercent,
      avgLossPercent,
      totalPnlPercent,
      maxDrawdownPercent,
      equityCurve,
    };
  }

  private buildEquityCurve(closed: readonly Trade[]): PaperTradingStats["equityCurve"] {
    const sorted = [...closed].sort((a, b) => (a.closedAtMs ?? 0) - (b.closedAtMs ?? 0));
    let equity = 0;
    return sorted.map((trade) => {
      equity += trade.pnlPercent ?? 0;
      return { tMs: trade.closedAtMs ?? 0, equity };
    });
  }

  private computeMaxDrawdown(equityPoints: readonly number[]): number {
    let peak = 0;
    let maxDrawdown = 0;
    for (const equity of equityPoints) {
      if (equity > peak) {
        peak = equity;
      }
      const drawdown = peak - equity;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    return maxDrawdown;
  }
}
