import { z } from "zod";

import type { MultiExchangeMarketDataAdapter } from "../../../integrations/market_data/multi-exchange-market-data-adapter.js";
import {
  type BacktestRunResult,
  type Candle,
  emaCrossoverParamsSchema,
  rsiMeanReversionParamsSchema,
  smcConfluenceParamsSchema,
  strategyKindSchema,
  type StrategyKind,
} from "../domain/backtest-types.js";
import type {
  BacktestHistoryEntry,
  JsonlBacktestRunStore,
} from "../infrastructure/jsonl-backtest-run-store.js";
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
  /** Store opcional para persistir rodadas comparativas (Wave 21 / ADR-061). */
  readonly historyStore?: JsonlBacktestRunStore;
  /** Clock injetavel para tests (default Date.now). */
  readonly clock?: () => number;
}

/**
 * Agregado por (asset, strategy) sobre o historico de rodadas. Wave 21 /
 * ADR-061. `roundsCount` = numero de rodadas em que essa combinacao
 * apareceu; medias sao aritmeticas simples (cada rodada conta igual,
 * independente do candleCount).
 */
export interface LeaderboardEntry {
  readonly asset: string;
  readonly strategy: StrategyKind;
  readonly roundsCount: number;
  readonly avgWinRatePercent: number;
  readonly avgProfitFactor: number;
  readonly avgPnlPercent: number;
  readonly avgMaxDrawdownPercent: number;
  readonly bestPnlPercent: number;
  readonly worstPnlPercent: number;
  readonly lastRanAtMs: number;
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
  private readonly historyStore: JsonlBacktestRunStore | undefined;
  private readonly clock: () => number;

  public constructor(options: BacktestingServiceOptions) {
    this.engine = options.engine;
    this.marketDataAdapter = options.marketDataAdapter;
    this.historyStore = options.historyStore;
    this.clock = options.clock ?? ((): number => Date.now());
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
    const compareResult: BacktestCompareAssetResult = {
      asset: request.asset,
      broker: request.broker,
      range: request.range,
      candleCount: candles.length,
      firstTMs: candles[0]!.tMs,
      lastTMs: candles[candles.length - 1]!.tMs,
      results,
    };
    this.persistHistory(request, compareResult);
    return compareResult;
  }

  /**
   * Lista o historico persistido de rodadas comparativas (mais recentes
   * primeiro). Retorna array vazio se nao houver historyStore configurado.
   */
  public listHistory(limit?: number): readonly BacktestHistoryEntry[] {
    if (this.historyStore === undefined) return [];
    const all = this.historyStore.list();
    if (limit === undefined || limit <= 0) return all;
    return all.slice(0, limit);
  }

  /**
   * Computa leaderboard agregado por (asset, strategy) sobre o historico.
   * Ordenado por avgPnlPercent descendente. Retorna array vazio se nao
   * houver historyStore configurado.
   */
  public computeLeaderboard(): readonly LeaderboardEntry[] {
    if (this.historyStore === undefined) return [];
    const buckets = new Map<
      string,
      {
        asset: string;
        strategy: StrategyKind;
        winRates: number[];
        profitFactors: number[];
        pnls: number[];
        drawdowns: number[];
        lastRanAtMs: number;
      }
    >();
    for (const entry of this.historyStore.list()) {
      for (const result of entry.results) {
        const key = `${entry.asset}::${result.strategy}`;
        let bucket = buckets.get(key);
        if (bucket === undefined) {
          bucket = {
            asset: entry.asset,
            strategy: result.strategy,
            winRates: [],
            profitFactors: [],
            pnls: [],
            drawdowns: [],
            lastRanAtMs: entry.ranAtMs,
          };
          buckets.set(key, bucket);
        }
        bucket.winRates.push(result.winRatePercent);
        if (Number.isFinite(result.profitFactor)) {
          bucket.profitFactors.push(result.profitFactor);
        }
        bucket.pnls.push(result.totalPnlPercent);
        bucket.drawdowns.push(result.maxDrawdownPercent);
        if (entry.ranAtMs > bucket.lastRanAtMs) {
          bucket.lastRanAtMs = entry.ranAtMs;
        }
      }
    }
    const entries: LeaderboardEntry[] = [];
    for (const bucket of buckets.values()) {
      entries.push({
        asset: bucket.asset,
        strategy: bucket.strategy,
        roundsCount: bucket.pnls.length,
        avgWinRatePercent: avg(bucket.winRates),
        avgProfitFactor:
          bucket.profitFactors.length > 0 ? avg(bucket.profitFactors) : 0,
        avgPnlPercent: avg(bucket.pnls),
        avgMaxDrawdownPercent: avg(bucket.drawdowns),
        bestPnlPercent: Math.max(...bucket.pnls),
        worstPnlPercent: Math.min(...bucket.pnls),
        lastRanAtMs: bucket.lastRanAtMs,
      });
    }
    entries.sort((a, b) => b.avgPnlPercent - a.avgPnlPercent);
    return entries;
  }

  private persistHistory(
    request: BacktestCompareAssetRequest,
    result: BacktestCompareAssetResult,
  ): void {
    if (this.historyStore === undefined) return;
    const ranAtMs = this.clock();
    const id = `${ranAtMs.toString(36)}-${request.asset}-${request.broker}-${request.range}`;
    this.historyStore.append({
      id,
      ranAtMs,
      asset: result.asset,
      broker: result.broker,
      range: result.range,
      candleCount: result.candleCount,
      cooldownCandles: request.cooldownCandles,
      commissionPercent: request.commissionPercent,
      slippagePercent: request.slippagePercent,
      results: result.results.map((r) => ({
        strategy: r.strategy,
        totalTrades: r.stats.totalTrades,
        winRatePercent: r.stats.winRatePercent,
        profitFactor: Number.isFinite(r.stats.profitFactor)
          ? r.stats.profitFactor
          : 0,
        totalPnlPercent: r.stats.totalPnlPercent,
        maxDrawdownPercent: r.stats.maxDrawdownPercent,
      })),
    });
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

function avg(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}
