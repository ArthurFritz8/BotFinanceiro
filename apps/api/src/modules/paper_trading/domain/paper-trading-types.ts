import { z } from "zod";

export const tradeSideSchema = z.enum(["long", "short"]);
export type TradeSide = z.infer<typeof tradeSideSchema>;

export const tradeStatusSchema = z.enum(["open", "win", "loss", "expired"]);
export type TradeStatus = z.infer<typeof tradeStatusSchema>;

/**
 * Trade simulado (paper trading). Todas as quantidades sao expressas em
 * percentual do tamanho de posicao base (1 unidade), nao em moeda — assim o
 * historico independe de capital alocado e pode ser reusado para qualquer
 * tamanho de book (Kelly fraction, fixed fractional, etc.).
 */
export const tradeSchema = z.object({
  id: z.string().min(8).max(64),
  asset: z.string().min(1).max(40),
  side: tradeSideSchema,
  entryPrice: z.number().positive(),
  stopPrice: z.number().positive(),
  targetPrice: z.number().positive(),
  openedAtMs: z.number().int().positive(),
  closedAtMs: z.number().int().positive().nullable(),
  exitPrice: z.number().positive().nullable(),
  status: tradeStatusSchema,
  pnlPercent: z.number().nullable(),
  confluenceScore: z.number().int().min(0).max(5).nullable(),
  notes: z.string().max(280).optional(),
});

export type Trade = z.infer<typeof tradeSchema>;

export const openTradeInputSchema = z
  .object({
    asset: z.string().trim().min(1).max(40),
    side: tradeSideSchema,
    entryPrice: z.number().positive(),
    stopPrice: z.number().positive(),
    targetPrice: z.number().positive(),
    confluenceScore: z.number().int().min(0).max(5).optional(),
    notes: z.string().trim().max(280).optional(),
  })
  .refine(
    (data) =>
      data.side === "long"
        ? data.stopPrice < data.entryPrice && data.targetPrice > data.entryPrice
        : data.stopPrice > data.entryPrice && data.targetPrice < data.entryPrice,
    {
      message:
        "Para long: stop < entry < target. Para short: target < entry < stop.",
    },
  );

export type OpenTradeInput = z.infer<typeof openTradeInputSchema>;

export const evaluatePriceInputSchema = z.object({
  asset: z.string().trim().min(1).max(40),
  price: z.number().positive(),
});

export type EvaluatePriceInput = z.infer<typeof evaluatePriceInputSchema>;

export interface PaperTradingStats {
  readonly totalTrades: number;
  readonly openTrades: number;
  readonly closedTrades: number;
  readonly wins: number;
  readonly losses: number;
  readonly winRatePercent: number;
  readonly profitFactor: number;
  readonly avgWinPercent: number;
  readonly avgLossPercent: number;
  readonly totalPnlPercent: number;
  readonly maxDrawdownPercent: number;
  readonly equityCurve: ReadonlyArray<{ readonly tMs: number; readonly equity: number }>;
}

/**
 * Calcula PnL (em %) para um trade fechado. Long: (exit-entry)/entry. Short: invertido.
 */
export function computePnlPercent(
  side: TradeSide,
  entryPrice: number,
  exitPrice: number,
): number {
  const raw = (exitPrice - entryPrice) / entryPrice;
  return side === "long" ? raw * 100 : -raw * 100;
}
