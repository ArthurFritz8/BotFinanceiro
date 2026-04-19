import { z } from "zod";

import type { MultiExchangeMarketDataAdapter } from "../../../integrations/market_data/multi-exchange-market-data-adapter.js";
import {
  type BacktestRunResult,
  type Candle,
  emaCrossoverParamsSchema,
  rsiMeanReversionParamsSchema,
  smcConfluenceParamsSchema,
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
  smcParams: smcConfluenceParamsSchema.partial().optional(),
  cooldownCandles: z.number().int().min(0).max(500).default(1),
  commissionPercent: z.number().min(0).max(5).default(0),
  slippagePercent: z.number().min(0).max(5).default(0),
});

export type BacktestRunAssetRequest = z.infer<
  typeof backtestRunAssetRequestSchema
>;

/**
 * Cada entrada do array `strategies` no compare-asset descreve uma
 * estrategia individual a ser rodada sobre o MESMO chart. Cada uma carrega
 * seus proprios params (sem mistura).
 */
export const backtestStrategyEntrySchema = z.object({
  strategy: strategyKindSchema,
  emaParams: emaCrossoverParamsSchema.partial().optional(),
  rsiParams: rsiMeanReversionParamsSchema.partial().optional(),
  smcParams: smcConfluenceParamsSchema.partial().optional(),
});

export type BacktestStrategyEntry = z.infer<typeof backtestStrategyEntrySchema>;

export const backtestCompareAssetRequestSchema = z.object({
  asset: z.string().trim().min(1).max(40),
  broker: z.enum(["bybit", "coinbase", "kraken", "okx"]).default("bybit"),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("30d"),
  strategies: z.array(backtestStrategyEntrySchema).min(1).max(5),
  cooldownCandles: z.number().int().min(0).max(500).default(1),
  commissionPercent: z.number().min(0).max(5).default(0),
  slippagePercent: z.number().min(0).max(5).default(0),
});

export type BacktestCompareAssetRequest = z.infer<
  typeof backtestCompareAssetRequestSchema
>;

export interface BacktestCompareAssetResult {
  readonly asset: string;
  readonly broker: string;
  readonly range: string;
  readonly candleCount: number;
  readonly firstTMs: number;
  readonly lastTMs: number;
  readonly results: ReadonlyArray<BacktestRunResult>;
}

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
    const candles = await this.fetchCandles(
      request.asset,
      request.broker,
      request.range,
    );
    return this.engine.run({
      asset: request.asset,
      candles,
      strategy: request.strategy,
      emaParams: request.emaParams,
      rsiParams: request.rsiParams,
      smcParams: request.smcParams,
      cooldownCandles: request.cooldownCandles,
      commissionPercent: request.commissionPercent,
      slippagePercent: request.slippagePercent,
    });
  }

  /**
   * Roda N estrategias (1..5) sobre o MESMO chart historico, retornando
   * um array de resultados na mesma ordem do request. Custo zero
   * adicional vs N chamadas individuais — busca chart UMA vez e itera.
   */
  public async compareForAsset(
    rawRequest: unknown,
  ): Promise<BacktestCompareAssetResult> {
    const request = backtestCompareAssetRequestSchema.parse(rawRequest);
    const candles = await this.fetchCandles(
      request.asset,
      request.broker,
      request.range,
    );
    const results = request.strategies.map((entry) =>
      this.engine.run({
        asset: request.asset,
        candles,
        strategy: entry.strategy,
        emaParams: entry.emaParams,
        rsiParams: entry.rsiParams,
        smcParams: entry.smcParams,
        cooldownCandles: request.cooldownCandles,
        commissionPercent: request.commissionPercent,
        slippagePercent: request.slippagePercent,
      }),
    );
    return {
      asset: request.asset,
      broker: request.broker,
      range: request.range,
      candleCount: candles.length,
      firstTMs: candles[0]!.tMs,
      lastTMs: candles[candles.length - 1]!.tMs,
      results,
    };
  }

  private async fetchCandles(
    assetId: string,
    broker: BacktestRunAssetRequest["broker"],
    range: BacktestRunAssetRequest["range"],
  ): Promise<Candle[]> {
    const chart = await this.marketDataAdapter.getMarketChart({
      assetId,
      broker,
      range,
    });
    return chart.points.map((point) => ({
      tMs: Date.parse(point.timestamp),
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      ...(point.volume !== null ? { volume: point.volume } : {}),
    }));
  }
}
