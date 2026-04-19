import { z } from "zod";

import type { MultiExchangeMarketDataAdapter } from "../../../integrations/market_data/multi-exchange-market-data-adapter.js";
import {
  type BacktestRunResult,
  type Candle,
  emaCrossoverParamsSchema,
  rsiMeanReversionParamsSchema,
  strategyKindSchema,
} from "../domain/backtest-types.js";
import type { BacktestEngine } from "./backtest-engine.js";

export const backtestRunAssetRequestSchema = z.object({
  asset: z.string().trim().min(1).max(40),
  broker: z.enum(["bybit", "coinbase", "kraken", "okx"]).default("bybit"),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("30d"),
  strategy: strategyKindSchema,
  emaParams: emaCrossoverParamsSchema.partial().optional(),
  rsiParams: rsiMeanReversionParamsSchema.partial().optional(),
  cooldownCandles: z.number().int().min(0).max(500).default(1),
  commissionPercent: z.number().min(0).max(5).default(0),
  slippagePercent: z.number().min(0).max(5).default(0),
});

export type BacktestRunAssetRequest = z.infer<
  typeof backtestRunAssetRequestSchema
>;

interface BacktestingServiceOptions {
  readonly engine: BacktestEngine;
  readonly marketDataAdapter: MultiExchangeMarketDataAdapter;
}

/**
 * BacktestingService: orquestra fetch de OHLC histórico via
 * MultiExchangeMarketDataAdapter (zero-cost — exchanges publicas) e
 * delega a execucao para o BacktestEngine puro. Permite ao frontend
 * disparar backtests sem ter que enviar candles serializados via HTTP.
 */
export class BacktestingService {
  private readonly engine: BacktestEngine;
  private readonly marketDataAdapter: MultiExchangeMarketDataAdapter;

  public constructor(options: BacktestingServiceOptions) {
    this.engine = options.engine;
    this.marketDataAdapter = options.marketDataAdapter;
  }

  public async runForAsset(rawRequest: unknown): Promise<BacktestRunResult> {
    const request = backtestRunAssetRequestSchema.parse(rawRequest);
    const chart = await this.marketDataAdapter.getMarketChart({
      assetId: request.asset,
      broker: request.broker,
      range: request.range,
    });
    const candles: Candle[] = chart.points.map((point) => ({
      tMs: Date.parse(point.timestamp),
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      ...(point.volume !== null ? { volume: point.volume } : {}),
    }));
    return this.engine.run({
      asset: request.asset,
      candles,
      strategy: request.strategy,
      emaParams: request.emaParams,
      rsiParams: request.rsiParams,
      cooldownCandles: request.cooldownCandles,
      commissionPercent: request.commissionPercent,
      slippagePercent: request.slippagePercent,
    });
  }
}
