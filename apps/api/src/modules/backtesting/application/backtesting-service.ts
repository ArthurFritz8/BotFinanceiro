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
import type {
  JsonlRegimeAlertMutesStore,
  RegimeAlertMuteEntry,
} from "../infrastructure/jsonl-regime-alert-mutes-store.js";
import type {
  JsonlRegimeAlertsHistoryStore,
  RegimeAlertHistoryEntry,
} from "../infrastructure/jsonl-regime-alerts-history-store.js";
import type { BacktestEngine } from "./backtest-engine.js";

/**
 * Schema do request publico para silenciar push notifications de regime
 * alerts em uma combinacao (asset, strategy) (Wave 26 / ADR-066). O
 * alerta continua aparecendo na UI; apenas o broadcast Web Push e
 * suprimido durante a janela.
 */
export const muteRegimeAlertRequestSchema = z.object({
  asset: z.string().trim().min(1).max(40),
  strategy: strategyKindSchema,
  durationMs: z.number().int().min(60_000).max(30 * 24 * 60 * 60 * 1000),
  reason: z.string().trim().max(200).optional(),
});

export type MuteRegimeAlertRequest = z.infer<
  typeof muteRegimeAlertRequestSchema
>;

export const unmuteRegimeAlertRequestSchema = z.object({
  asset: z.string().trim().min(1).max(40),
  strategy: strategyKindSchema,
});

export type UnmuteRegimeAlertRequest = z.infer<
  typeof unmuteRegimeAlertRequestSchema
>;

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
  /** Store opcional para historico de alertas critical de regime (Wave 23 / ADR-063). */
  readonly alertsHistoryStore?: JsonlRegimeAlertsHistoryStore;
  /**
   * Notifier opcional para broadcast de alertas critical NOVOS via Web Push
   * (Wave 24 / ADR-064). Interface estreita para evitar acoplar com o
   * modulo notifications inteiro.
   */
  readonly notifier?: RegimeAlertNotifier;
  /**
   * Janela de cooldown em ms para evitar spam de notificacoes do mesmo
   * bucket (Wave 24 / ADR-064). Default 1h. Quando ja existe critical
   * persistido para o mesmo (asset, strategy) dentro dessa janela, NAO
   * dispara broadcast novo.
   */
  readonly notificationCooldownMs?: number;
  /**
   * Store opcional para mutes manuais de push de regime alerts (Wave 26 /
   * ADR-066). Quando presente, broadcast e suprimido para buckets com
   * mute ativo. O alerta principal continua aparecendo em
   * `computeRegimeAlerts` com `muted: true`.
   */
  readonly mutesStore?: JsonlRegimeAlertMutesStore;
  /** Clock injetavel para tests (default Date.now). */
  readonly clock?: () => number;
}

/**
 * Interface minima do notifier consumido pelo service. Compatible com
 * `NotificationService` do modulo notifications (Wave 24 / ADR-064).
 */
export interface RegimeAlertNotifier {
  isEnabled(): boolean;
  broadcast(payload: {
    readonly title: string;
    readonly body: string;
    readonly tag?: string;
    readonly url?: string;
    readonly data?: Record<string, unknown>;
  }): Promise<unknown>;
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
 * Alerta de degradacao de regime (Wave 22 / ADR-062). Comparacao entre
 * baseline (primeiras N rodadas de uma combinacao asset+strategy) e
 * recente (ultimas M rodadas). `severity` escala com a queda: warning
 * (>= threshold), critical (>= 2 * threshold).
 */
export interface RegimeAlert {
  readonly asset: string;
  readonly strategy: StrategyKind;
  readonly baselineRoundsCount: number;
  readonly recentRoundsCount: number;
  readonly baselineAvgPnlPercent: number;
  readonly recentAvgPnlPercent: number;
  readonly deltaPnlPercent: number;
  readonly severity: "warning" | "critical";
  readonly lastRanAtMs: number;
  /**
   * Quantos alertas critical anteriores existem no historico para essa
   * combinacao (asset, strategy) dentro da `recurrenceWindowMs` (Wave 23
   * / ADR-063). 0 quando nao ha alertsHistoryStore configurado.
   */
  readonly recurrenceCount: number;
  /**
   * `true` quando o alerta foi promovido de warning -> critical por
   * recorrencia (Wave 23 / ADR-063).
   */
  readonly escalatedByRecurrence: boolean;
  /**
   * `true` quando ha mute manual ativo para esse bucket (Wave 26 /
   * ADR-066). UI continua exibindo, push notifications sao suprimidas
   * durante a janela.
   */
  readonly muted: boolean;
  /** Timestamp ms ate quando o mute esta ativo (Wave 26 / ADR-066). */
  readonly mutedUntilMs: number | null;
}

export interface RegimeAlertOptions {
  /** Numero minimo de rodadas para considerar baseline + recente (default 6: 3+3). */
  readonly minTotalRounds?: number;
  /** Tamanho da janela recente em rodadas (default 3). */
  readonly recentWindow?: number;
  /** Queda em pontos percentuais para emitir warning (default 5). */
  readonly warningThresholdPercent?: number;
  /**
   * Janela retroativa em ms para contagem de recorrencia (Wave 23 /
   * ADR-063). Default 7 dias. `recurrenceCount` em cada alerta retornado
   * indica quantos alertas critical ja existem para o mesmo bucket dentro
   * dessa janela ANTES da gravacao atual.
   */
  readonly recurrenceWindowMs?: number;
  /**
   * Limite de alertas critical recentes para escalar warning -> critical
   * (Wave 23 / ADR-063). Default 3.
   */
  readonly recurrenceEscalationCount?: number;
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
  private readonly alertsHistoryStore:
    | JsonlRegimeAlertsHistoryStore
    | undefined;
  private readonly notifier: RegimeAlertNotifier | undefined;
  private readonly notificationCooldownMs: number;
  private readonly mutesStore: JsonlRegimeAlertMutesStore | undefined;
  private readonly clock: () => number;

  public constructor(options: BacktestingServiceOptions) {
    this.engine = options.engine;
    this.marketDataAdapter = options.marketDataAdapter;
    this.historyStore = options.historyStore;
    this.alertsHistoryStore = options.alertsHistoryStore;
    this.notifier = options.notifier;
    this.notificationCooldownMs =
      options.notificationCooldownMs ?? 60 * 60 * 1000;
    this.mutesStore = options.mutesStore;
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

  /**
   * Detecta degradacao de regime: compara avg PnL do baseline (rodadas
   * antigas) com janela recente para cada (asset, strategy). Emite alerta
   * quando `recent - baseline <= -warningThreshold`. Severity critical se
   * a queda for >= 2x o threshold. Ordenado por deltaPnlPercent ascendente
   * (piores degradacoes primeiro).
   */
  public computeRegimeAlerts(
    options: RegimeAlertOptions = {},
  ): readonly RegimeAlert[] {
    if (this.historyStore === undefined) return [];
    const recentWindow = options.recentWindow ?? 3;
    const warningThreshold = options.warningThresholdPercent ?? 5;
    const minTotalRounds = options.minTotalRounds ?? recentWindow * 2;
    if (recentWindow < 1) return [];

    const buckets = new Map<
      string,
      {
        asset: string;
        strategy: StrategyKind;
        runs: { ranAtMs: number; pnl: number }[];
      }
    >();
    for (const entry of this.historyStore.list()) {
      for (const result of entry.results) {
        const key = `${entry.asset}::${result.strategy}`;
        let bucket = buckets.get(key);
        if (bucket === undefined) {
          bucket = { asset: entry.asset, strategy: result.strategy, runs: [] };
          buckets.set(key, bucket);
        }
        bucket.runs.push({
          ranAtMs: entry.ranAtMs,
          pnl: result.totalPnlPercent,
        });
      }
    }

    const recurrenceWindowMs =
      options.recurrenceWindowMs ?? 7 * 24 * 60 * 60 * 1000;
    const recurrenceEscalationCount = options.recurrenceEscalationCount ?? 3;
    const nowMs = this.clock();

    const alerts: RegimeAlert[] = [];
    for (const bucket of buckets.values()) {
      if (bucket.runs.length < minTotalRounds) continue;
      bucket.runs.sort((a, b) => a.ranAtMs - b.ranAtMs);
      const recent = bucket.runs.slice(-recentWindow);
      const baseline = bucket.runs.slice(0, bucket.runs.length - recentWindow);
      if (baseline.length === 0) continue;
      const last = recent[recent.length - 1];
      if (last === undefined) continue;
      const baselineAvg = avg(baseline.map((r) => r.pnl));
      const recentAvg = avg(recent.map((r) => r.pnl));
      const delta = recentAvg - baselineAvg;
      if (delta > -warningThreshold) continue;
      const baseSeverity: RegimeAlert["severity"] =
        delta <= -2 * warningThreshold ? "critical" : "warning";
      const recurrenceCount =
        this.alertsHistoryStore !== undefined
          ? this.alertsHistoryStore.countRecentForBucket(
              bucket.asset,
              bucket.strategy,
              nowMs,
              recurrenceWindowMs,
            )
          : 0;
      const escalatedByRecurrence =
        baseSeverity === "warning" &&
        recurrenceCount >= recurrenceEscalationCount;
      const severity: RegimeAlert["severity"] = escalatedByRecurrence
        ? "critical"
        : baseSeverity;
      const activeMute =
        this.mutesStore !== undefined
          ? this.mutesStore.getActive(bucket.asset, bucket.strategy, nowMs)
          : undefined;
      const alert: RegimeAlert = {
        asset: bucket.asset,
        strategy: bucket.strategy,
        baselineRoundsCount: baseline.length,
        recentRoundsCount: recent.length,
        baselineAvgPnlPercent: baselineAvg,
        recentAvgPnlPercent: recentAvg,
        deltaPnlPercent: delta,
        severity,
        lastRanAtMs: last.ranAtMs,
        recurrenceCount,
        escalatedByRecurrence,
        muted: activeMute !== undefined,
        mutedUntilMs: activeMute?.mutedUntilMs ?? null,
      };
      alerts.push(alert);
      if (severity === "critical" && this.alertsHistoryStore !== undefined) {
        // Anti-spam: so notifica se NAO houver critical persistido para o
        // mesmo bucket dentro da janela de cooldown (Wave 24 / ADR-064).
        // Conta ANTES de persistir (countRecentForBucket le do store atual).
        const recentCriticalsForCooldown =
          this.alertsHistoryStore.countRecentForBucket(
            bucket.asset,
            bucket.strategy,
            nowMs,
            this.notificationCooldownMs,
          );
        this.persistRegimeAlert(alert, nowMs);
        // Wave 26 / ADR-066: mute manual suprime push, mas alerta segue
        // visivel na UI e persistido no historico.
        if (recentCriticalsForCooldown === 0 && !alert.muted) {
          this.notifyRegimeAlert(alert);
        }
      }
    }
    alerts.sort((a, b) => a.deltaPnlPercent - b.deltaPnlPercent);
    return alerts;
  }

  /**
   * Dispara broadcast Web Push para o alerta critical novo (Wave 24 /
   * ADR-064). Failure-soft: erros sao silenciados — alerta principal nao
   * deve falhar por problema de notificacao. Retorno fire-and-forget.
   */
  private notifyRegimeAlert(alert: RegimeAlert): void {
    if (this.notifier === undefined) return;
    if (!this.notifier.isEnabled()) return;
    const deltaTxt = alert.deltaPnlPercent.toFixed(1);
    const recentTxt = alert.recentAvgPnlPercent.toFixed(1);
    const escalatedSuffix = alert.escalatedByRecurrence
      ? ` (escalado x${alert.recurrenceCount})`
      : "";
    const payload = {
      title: `Regime degradation: ${alert.asset}`,
      body: `${alert.strategy} | PnL recente ${recentTxt}% | Delta ${deltaTxt} pp${escalatedSuffix}`,
      tag: `regime-alert:${alert.asset}:${alert.strategy}`,
      url: "/#/backtesting",
      data: {
        kind: "regime-alert" as const,
        asset: alert.asset,
        strategy: alert.strategy,
        severity: alert.severity,
        deltaPnlPercent: alert.deltaPnlPercent,
      },
    };
    void this.notifier.broadcast(payload).catch(() => {
      /* failure-soft: ignora erros do canal de notificacao */
    });
  }

  /**
   * Lista o historico persistido de alertas critical de regime
   * (Wave 23 / ADR-063), mais recentes primeiro. Retorna [] sem store.
   */
  public listRegimeAlertsHistory(
    limit?: number,
  ): readonly RegimeAlertHistoryEntry[] {
    if (this.alertsHistoryStore === undefined) return [];
    const all = this.alertsHistoryStore.list();
    if (limit === undefined || limit <= 0) return all;
    return all.slice(0, limit);
  }

  /**
   * Cria/renova um mute manual de push notifications para `(asset,
   * strategy)` (Wave 26 / ADR-066). Lanca se `mutesStore` nao foi
   * configurado. Valida via Zod no boundary.
   */
  public muteRegimeAlert(rawRequest: unknown): RegimeAlertMuteEntry {
    if (this.mutesStore === undefined) {
      throw new Error("Regime alert mutes store nao configurado");
    }
    const request = muteRegimeAlertRequestSchema.parse(rawRequest);
    const nowMs = this.clock();
    const entry: RegimeAlertMuteEntry = {
      asset: request.asset,
      strategy: request.strategy,
      mutedUntilMs: nowMs + request.durationMs,
      createdAtMs: nowMs,
      ...(request.reason !== undefined ? { reason: request.reason } : {}),
    };
    this.mutesStore.upsert(entry);
    return entry;
  }

  /**
   * Remove o mute do bucket (Wave 26 / ADR-066). Retorna `true` se
   * existia algo para remover.
   */
  public unmuteRegimeAlert(rawRequest: unknown): boolean {
    if (this.mutesStore === undefined) {
      throw new Error("Regime alert mutes store nao configurado");
    }
    const request = unmuteRegimeAlertRequestSchema.parse(rawRequest);
    return this.mutesStore.remove(request.asset, request.strategy);
  }

  /**
   * Lista mutes (Wave 26 / ADR-066). Quando `activeOnly`, filtra os ja
   * expirados em relacao ao clock atual.
   */
  public listRegimeAlertMutes(
    activeOnly = false,
  ): readonly RegimeAlertMuteEntry[] {
    if (this.mutesStore === undefined) return [];
    const all = this.mutesStore.list();
    if (!activeOnly) return all;
    const nowMs = this.clock();
    return all.filter((entry) => entry.mutedUntilMs > nowMs);
  }

  private persistRegimeAlert(alert: RegimeAlert, nowMs: number): void {
    if (this.alertsHistoryStore === undefined) return;
    const id = `${nowMs.toString(36)}-${alert.asset}-${alert.strategy}`;
    this.alertsHistoryStore.append({
      id,
      recordedAtMs: nowMs,
      asset: alert.asset,
      strategy: alert.strategy,
      baselineAvgPnlPercent: alert.baselineAvgPnlPercent,
      recentAvgPnlPercent: alert.recentAvgPnlPercent,
      deltaPnlPercent: alert.deltaPnlPercent,
      baselineRoundsCount: alert.baselineRoundsCount,
      recentRoundsCount: alert.recentRoundsCount,
      severity: alert.severity,
      lastRanAtMs: alert.lastRanAtMs,
    });
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
