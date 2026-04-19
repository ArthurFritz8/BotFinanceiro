import {
  computePnlPercent,
  type PaperTradingStats,
} from "../../paper_trading/domain/paper-trading-types.js";
import {
  type BacktestRunRequest,
  type BacktestRunResult,
  type BacktestTrade,
  backtestRunRequestSchema,
  type Candle,
  emaCrossoverParamsSchema,
  rsiMeanReversionParamsSchema,
  type StrategySignal,
} from "../domain/backtest-types.js";
import {
  emaCrossoverStrategy,
  rsiMeanReversionStrategy,
} from "../domain/strategies.js";

interface OpenSimTrade {
  readonly side: "long" | "short";
  readonly entryIndex: number;
  readonly entryTMs: number;
  readonly entryPrice: number;
  readonly stopPrice: number;
  readonly targetPrice: number;
}

/**
 * BacktestEngine: replay sequencial bar-a-bar de candles aplicando uma
 * estrategia injetada. Modelo conservador de execucao:
 *
 * - Entry: preco de fechamento do candle do sinal (fill same-bar).
 * - Stop/Target: avaliados a partir do PROXIMO candle, comparando high/low
 *   do candle ao preco de stop/target. Se ambos forem tocados no mesmo
 *   candle, assume-se STOP (worst case — sem dados intra-bar para
 *   resolver ordem).
 * - Cooldown: apos um trade fechar, espera N candles antes de aceitar
 *   novo sinal (default 1).
 *
 * Reusa `computePnlPercent` e shape `PaperTradingStats` do dominio paper
 * trading para que clientes possam tratar resultado de backtest e paper
 * trading uniformemente.
 */
export class BacktestEngine {
  public run(rawRequest: unknown): BacktestRunResult {
    const request = backtestRunRequestSchema.parse(rawRequest);
    const candles = request.candles;
    const trades: BacktestTrade[] = [];
    let openTrade: OpenSimTrade | null = null;
    let cooldownUntilIndex = 0;

    for (let i = 0; i < candles.length; i += 1) {
      if (openTrade) {
        const closed = this.tryCloseTrade(
          openTrade,
          candles[i]!,
          i,
          request.commissionPercent,
          request.slippagePercent,
        );
        if (closed) {
          trades.push(closed);
          cooldownUntilIndex = i + request.cooldownCandles;
          openTrade = null;
        }
        continue;
      }
      if (i < cooldownUntilIndex) {
        continue;
      }
      const signal = this.evaluateStrategy(request, candles, i);
      if (!signal) {
        continue;
      }
      // Slippage: entrada pior em `slippagePercent` (long paga mais, short recebe menos)
      const slippageFactor = request.slippagePercent / 100;
      const adjustedEntry =
        signal.side === "long"
          ? signal.entryPrice * (1 + slippageFactor)
          : signal.entryPrice * (1 - slippageFactor);
      openTrade = {
        side: signal.side,
        entryIndex: i,
        entryTMs: candles[i]!.tMs,
        entryPrice: adjustedEntry,
        stopPrice: signal.stopPrice,
        targetPrice: signal.targetPrice,
      };
    }

    const stats = computeStatsFromBacktestTrades(trades);
    return {
      asset: request.asset,
      strategy: request.strategy,
      candleCount: candles.length,
      firstTMs: candles[0]!.tMs,
      lastTMs: candles[candles.length - 1]!.tMs,
      trades,
      stats,
    };
  }

  private evaluateStrategy(
    request: BacktestRunRequest,
    candles: ReadonlyArray<Candle>,
    index: number,
  ): StrategySignal | null {
    if (request.strategy === "ema_crossover") {
      const params = emaCrossoverParamsSchema.parse(request.emaParams ?? {});
      return emaCrossoverStrategy(candles, index, params);
    }
    const params = rsiMeanReversionParamsSchema.parse(request.rsiParams ?? {});
    return rsiMeanReversionStrategy(candles, index, params);
  }

  private tryCloseTrade(
    open: OpenSimTrade,
    candle: Candle,
    index: number,
    commissionPercent: number,
    slippagePercent: number,
  ): BacktestTrade | null {
    if (index === open.entryIndex) {
      return null;
    }
    const stopHit =
      open.side === "long"
        ? candle.low <= open.stopPrice
        : candle.high >= open.stopPrice;
    const targetHit =
      open.side === "long"
        ? candle.high >= open.targetPrice
        : candle.low <= open.targetPrice;
    if (!stopHit && !targetHit) {
      return null;
    }
    const rawExit = stopHit ? open.stopPrice : open.targetPrice;
    // Slippage na saida tambem (long sai mais barato, short recompra mais caro)
    const slippageFactor = slippagePercent / 100;
    const exitPrice =
      open.side === "long"
        ? rawExit * (1 - slippageFactor)
        : rawExit * (1 + slippageFactor);
    const grossPnl = computePnlPercent(open.side, open.entryPrice, exitPrice);
    // Comissao por lado: descontada 2x (entrada + saida)
    const totalCommissionPercent = commissionPercent * 2;
    const netPnl = grossPnl - totalCommissionPercent;
    const outcome: "win" | "loss" = netPnl >= 0 ? "win" : "loss";
    return {
      index: open.entryIndex,
      side: open.side,
      entryTMs: open.entryTMs,
      entryPrice: open.entryPrice,
      exitTMs: candle.tMs,
      exitPrice,
      stopPrice: open.stopPrice,
      targetPrice: open.targetPrice,
      outcome,
      pnlPercent: netPnl,
    };
  }
}

/**
 * Reproduz a logica de `PaperTradingService.computeStats` em cima dos
 * trades sinteticos do backtest (todos closed, sem `open`/`expired`).
 */
export function computeStatsFromBacktestTrades(
  trades: ReadonlyArray<BacktestTrade>,
): PaperTradingStats {
  const closed = trades.length;
  const wins = trades.filter((t) => t.outcome === "win").length;
  const losses = closed - wins;
  const winRatePercent = closed === 0 ? 0 : (wins / closed) * 100;

  let sumWin = 0;
  let sumLossAbs = 0;
  let sumWinPercent = 0;
  let sumLossPercent = 0;
  let totalPnlPercent = 0;
  for (const trade of trades) {
    totalPnlPercent += trade.pnlPercent;
    if (trade.outcome === "win") {
      sumWin += trade.pnlPercent;
      sumWinPercent += trade.pnlPercent;
    } else {
      sumLossAbs += Math.abs(trade.pnlPercent);
      sumLossPercent += trade.pnlPercent;
    }
  }
  const profitFactor =
    sumLossAbs === 0 ? (sumWin === 0 ? 0 : Infinity) : sumWin / sumLossAbs;
  const avgWinPercent = wins === 0 ? 0 : sumWinPercent / wins;
  const avgLossPercent = losses === 0 ? 0 : sumLossPercent / losses;

  const equityCurve: { tMs: number; equity: number }[] = [];
  let equity = 0;
  let peak = 0;
  let maxDrawdownPercent = 0;
  for (const trade of trades) {
    equity += trade.pnlPercent;
    equityCurve.push({ tMs: trade.exitTMs, equity });
    if (equity > peak) {
      peak = equity;
    }
    const dd = peak - equity;
    if (dd > maxDrawdownPercent) {
      maxDrawdownPercent = dd;
    }
  }

  return {
    totalTrades: closed,
    openTrades: 0,
    closedTrades: closed,
    wins,
    losses,
    winRatePercent,
    profitFactor,
    avgWinPercent,
    avgLossPercent,
    totalPnlPercent,
    maxDrawdownPercent,
    equityCurve,
  };
}
