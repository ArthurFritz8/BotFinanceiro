import { z } from "zod";

import {
  type PaperTradingStats,
  tradeSideSchema,
} from "../../paper_trading/domain/paper-trading-types.js";

/**
 * Candle OHLCV para backtest. Tempo em ms epoch UTC. Origem agnostica
 * (pode vir de exchange, CoinGecko snapshot, fixture sintetica, etc.).
 */
export const candleSchema = z
  .object({
    tMs: z.number().int().positive(),
    open: z.number().positive(),
    high: z.number().positive(),
    low: z.number().positive(),
    close: z.number().positive(),
    volume: z.number().nonnegative().optional(),
  })
  .refine((c) => c.high >= Math.max(c.open, c.close, c.low), {
    message: "high deve ser >= max(open, close, low)",
  })
  .refine((c) => c.low <= Math.min(c.open, c.close, c.high), {
    message: "low deve ser <= min(open, close, high)",
  });

export type Candle = z.infer<typeof candleSchema>;

export const strategyKindSchema = z.enum(["ema_crossover", "rsi_mean_reversion"]);
export type StrategyKind = z.infer<typeof strategyKindSchema>;

export const emaCrossoverParamsSchema = z.object({
  fastPeriod: z.number().int().min(2).max(200).default(9),
  slowPeriod: z.number().int().min(3).max(400).default(21),
  stopLossPercent: z.number().positive().max(50).default(2),
  takeProfitPercent: z.number().positive().max(200).default(4),
});

export type EmaCrossoverParams = z.infer<typeof emaCrossoverParamsSchema>;

export const rsiMeanReversionParamsSchema = z.object({
  period: z.number().int().min(2).max(100).default(14),
  oversold: z.number().min(1).max(49).default(30),
  overbought: z.number().min(51).max(99).default(70),
  stopLossPercent: z.number().positive().max(50).default(3),
  takeProfitPercent: z.number().positive().max(200).default(6),
});

export type RsiMeanReversionParams = z.infer<typeof rsiMeanReversionParamsSchema>;

/**
 * Sinal emitido por uma estrategia em um candle especifico. `null` = sem
 * acao (estrategia espera). Stop e target sao sempre derivados do entry
 * pelo proprio sinal (estrategia decide o R:R).
 */
export const strategySignalSchema = z.object({
  side: tradeSideSchema,
  entryPrice: z.number().positive(),
  stopPrice: z.number().positive(),
  targetPrice: z.number().positive(),
});

export type StrategySignal = z.infer<typeof strategySignalSchema>;

export const backtestRunRequestSchema = z.object({
  asset: z.string().trim().min(1).max(40),
  candles: z.array(candleSchema).min(20).max(20000),
  strategy: strategyKindSchema,
  emaParams: emaCrossoverParamsSchema.optional(),
  rsiParams: rsiMeanReversionParamsSchema.optional(),
  /**
   * Permite sobrescrever a janela de cooldown entre trades (em candles).
   * Default: 1 (estrategia nao pode reentrar no proximo candle apos saida).
   */
  cooldownCandles: z.number().int().min(0).max(500).default(1),
  /**
   * Comissao por lado em % do notional (ex.: 0.1 = 0.1% por entrada +
   * 0.1% por saida = 0.2% total descontado do PnL). Default 0 (zero-cost).
   */
  commissionPercent: z.number().min(0).max(5).default(0),
  /**
   * Slippage modelado em % aplicado contra o trader: entradas piores +
   * saidas piores em `slippagePercent` cada. Default 0.
   */
  slippagePercent: z.number().min(0).max(5).default(0),
});

export type BacktestRunRequest = z.infer<typeof backtestRunRequestSchema>;

/**
 * Trade simulado dentro do backtest. Mais leve que o `Trade` do paper
 * trading (sem id persistente, sem status `expired`).
 */
export interface BacktestTrade {
  readonly index: number;
  readonly side: "long" | "short";
  readonly entryTMs: number;
  readonly entryPrice: number;
  readonly exitTMs: number;
  readonly exitPrice: number;
  readonly stopPrice: number;
  readonly targetPrice: number;
  readonly outcome: "win" | "loss";
  readonly pnlPercent: number;
}

export interface BacktestRunResult {
  readonly asset: string;
  readonly strategy: StrategyKind;
  readonly candleCount: number;
  readonly firstTMs: number;
  readonly lastTMs: number;
  readonly trades: ReadonlyArray<BacktestTrade>;
  readonly stats: PaperTradingStats;
}
