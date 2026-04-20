import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type {
  MultiExchangeMarketChart,
  MultiExchangeMarketDataAdapter,
} from "../../../integrations/market_data/multi-exchange-market-data-adapter.js";
import { JsonlBacktestRunStore } from "../infrastructure/jsonl-backtest-run-store.js";
import { JsonlRegimeAlertsHistoryStore } from "../infrastructure/jsonl-regime-alerts-history-store.js";
import { BacktestEngine } from "./backtest-engine.js";
import { BacktestingService } from "./backtesting-service.js";

function buildChart(closes: ReadonlyArray<number>): MultiExchangeMarketChart {
  let prevClose = closes[0]!;
  const points = closes.map((close, i) => {
    const open = i === 0 ? close : prevClose;
    const high = Math.max(open, close) * 1.005;
    const low = Math.min(open, close) * 0.995;
    const tMs = 1_700_000_000_000 + i * 60_000;
    prevClose = close;
    return {
      close,
      high,
      low,
      open,
      timestamp: new Date(tMs).toISOString(),
      volume: null,
    };
  });
  return {
    assetId: "bitcoin",
    broker: "bybit",
    fetchedAt: new Date().toISOString(),
    points,
    range: "30d",
    symbol: "BTCUSDT",
  };
}

function buildFakeAdapter(
  chart: MultiExchangeMarketChart,
): MultiExchangeMarketDataAdapter {
  const fake = {
    getMarketChart: async (input: {
      assetId: string;
      broker: string;
      range: string;
    }): Promise<MultiExchangeMarketChart> => {
      return Promise.resolve({
        ...chart,
        assetId: input.assetId,
        broker: input.broker as MultiExchangeMarketChart["broker"],
        range: input.range as MultiExchangeMarketChart["range"],
      });
    },
  };
  return fake as unknown as MultiExchangeMarketDataAdapter;
}

void describe("BacktestingService", () => {
  void it("runForAsset busca chart via adapter e roda engine (Wave 18)", async () => {
    const closes: number[] = [];
    for (let i = 0; i < 25; i += 1) closes.push(100);
    for (let i = 0; i < 35; i += 1) closes.push(100 + (i + 1) * 1.5);
    const chart = buildChart(closes);
    const adapter = buildFakeAdapter(chart);
    const engine = new BacktestEngine();
    const service = new BacktestingService({
      engine,
      marketDataAdapter: adapter,
    });

    const result = await service.runForAsset({
      asset: "bitcoin",
      strategy: "ema_crossover",
      emaParams: {
        fastPeriod: 5,
        slowPeriod: 13,
        stopLossPercent: 1,
        takeProfitPercent: 2,
      },
    });

    assert.equal(result.asset, "bitcoin");
    assert.equal(result.candleCount, 60);
    assert.ok(result.trades.length >= 1);
  });

  void it("runForAsset rejeita asset vazio", async () => {
    const adapter = buildFakeAdapter(buildChart([100, 100]));
    const service = new BacktestingService({
      engine: new BacktestEngine(),
      marketDataAdapter: adapter,
    });
    await assert.rejects(() =>
      service.runForAsset({ asset: "", strategy: "ema_crossover" }),
    );
  });

  void it("runForAsset propaga commission/slippage para o engine", async () => {
    const closes: number[] = [];
    for (let i = 0; i < 25; i += 1) closes.push(100);
    for (let i = 0; i < 35; i += 1) closes.push(100 + (i + 1) * 1.5);
    const chart = buildChart(closes);
    const adapter = buildFakeAdapter(chart);
    const service = new BacktestingService({
      engine: new BacktestEngine(),
      marketDataAdapter: adapter,
    });

    const baseline = await service.runForAsset({
      asset: "bitcoin",
      strategy: "ema_crossover",
      emaParams: {
        fastPeriod: 5,
        slowPeriod: 13,
        stopLossPercent: 1,
        takeProfitPercent: 2,
      },
    });
    const withFees = await service.runForAsset({
      asset: "bitcoin",
      strategy: "ema_crossover",
      emaParams: {
        fastPeriod: 5,
        slowPeriod: 13,
        stopLossPercent: 1,
        takeProfitPercent: 2,
      },
      commissionPercent: 0.5,
      slippagePercent: 0.1,
    });

    assert.equal(baseline.trades.length, withFees.trades.length);
    if (baseline.trades.length > 0) {
      const a = baseline.trades[0]!;
      const b = withFees.trades[0]!;
      assert.ok(b.pnlPercent < a.pnlPercent);
    }
  });

  void it("compareForAsset busca chart UMA vez e roda N estrategias (Wave 20)", async () => {
    const closes: number[] = [];
    for (let i = 0; i < 25; i += 1) closes.push(100);
    for (let i = 0; i < 35; i += 1) closes.push(100 + (i + 1) * 1.5);
    const chart = buildChart(closes);

    let fetchCount = 0;
    const countingAdapter = {
      getMarketChart: async (input: {
        assetId: string;
        broker: string;
        range: string;
      }): Promise<MultiExchangeMarketChart> => {
        fetchCount += 1;
        return Promise.resolve({
          ...chart,
          assetId: input.assetId,
          broker: input.broker as MultiExchangeMarketChart["broker"],
          range: input.range as MultiExchangeMarketChart["range"],
        });
      },
    } as unknown as MultiExchangeMarketDataAdapter;

    const service = new BacktestingService({
      engine: new BacktestEngine(),
      marketDataAdapter: countingAdapter,
    });

    const result = await service.compareForAsset({
      asset: "bitcoin",
      strategies: [
        { strategy: "ema_crossover" },
        { strategy: "rsi_mean_reversion" },
        { strategy: "smc_confluence" },
      ],
    });

    assert.equal(fetchCount, 1, "deve buscar chart apenas UMA vez");
    assert.equal(result.results.length, 3);
    assert.equal(result.results[0]!.strategy, "ema_crossover");
    assert.equal(result.results[1]!.strategy, "rsi_mean_reversion");
    assert.equal(result.results[2]!.strategy, "smc_confluence");
    assert.equal(result.candleCount, 60);
    assert.equal(result.asset, "bitcoin");
  });

  void it("compareForAsset rejeita strategies vazio", async () => {
    const adapter = buildFakeAdapter(buildChart([100, 100]));
    const service = new BacktestingService({
      engine: new BacktestEngine(),
      marketDataAdapter: adapter,
    });
    await assert.rejects(() =>
      service.compareForAsset({ asset: "bitcoin", strategies: [] }),
    );
  });

  void it("compareForAsset propaga commission/slippage para todas as estrategias", async () => {
    const closes: number[] = [];
    for (let i = 0; i < 25; i += 1) closes.push(100);
    for (let i = 0; i < 35; i += 1) closes.push(100 + (i + 1) * 1.5);
    const adapter = buildFakeAdapter(buildChart(closes));
    const service = new BacktestingService({
      engine: new BacktestEngine(),
      marketDataAdapter: adapter,
    });

    const baseline = await service.compareForAsset({
      asset: "bitcoin",
      strategies: [{ strategy: "ema_crossover" }],
    });
    const withFees = await service.compareForAsset({
      asset: "bitcoin",
      strategies: [{ strategy: "ema_crossover" }],
      commissionPercent: 0.5,
    });

    const a = baseline.results[0]!;
    const b = withFees.results[0]!;
    assert.equal(a.trades.length, b.trades.length);
    if (a.trades.length > 0) {
      assert.ok(b.trades[0]!.pnlPercent < a.trades[0]!.pnlPercent);
    }
  });

  void it("compareForAsset persiste rodada no historyStore (Wave 21)", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "bt-history-"));
    const store = new JsonlBacktestRunStore(join(tmpDir, "history.jsonl"));

    const closes: number[] = [];
    for (let i = 0; i < 25; i += 1) closes.push(100);
    for (let i = 0; i < 35; i += 1) closes.push(100 + (i + 1) * 1.5);
    const adapter = buildFakeAdapter(buildChart(closes));
    const service = new BacktestingService({
      engine: new BacktestEngine(),
      marketDataAdapter: adapter,
      historyStore: store,
      clock: () => 1_700_000_000_000,
    });

    assert.equal(store.size(), 0);
    await service.compareForAsset({
      asset: "bitcoin",
      strategies: [
        { strategy: "ema_crossover" },
        { strategy: "rsi_mean_reversion" },
      ],
    });

    assert.equal(store.size(), 1);
    const items = service.listHistory();
    assert.equal(items.length, 1);
    const first = items[0];
    if (first === undefined) {
      assert.fail("primeiro item ausente");
    }
    assert.equal(first.asset, "bitcoin");
    assert.equal(first.results.length, 2);
    assert.equal(first.ranAtMs, 1_700_000_000_000);
  });

  void it("computeLeaderboard agrega medias por (asset, strategy) (Wave 21)", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "bt-leaderboard-"));
    const store = new JsonlBacktestRunStore(join(tmpDir, "history.jsonl"));

    const closes: number[] = [];
    for (let i = 0; i < 25; i += 1) closes.push(100);
    for (let i = 0; i < 35; i += 1) closes.push(100 + (i + 1) * 1.5);
    const adapter = buildFakeAdapter(buildChart(closes));
    let nowMs = 1_700_000_000_000;
    const service = new BacktestingService({
      engine: new BacktestEngine(),
      marketDataAdapter: adapter,
      historyStore: store,
      clock: () => {
        nowMs += 60_000;
        return nowMs;
      },
    });

    await service.compareForAsset({
      asset: "bitcoin",
      strategies: [{ strategy: "ema_crossover" }],
    });
    await service.compareForAsset({
      asset: "bitcoin",
      strategies: [{ strategy: "ema_crossover" }],
    });
    await service.compareForAsset({
      asset: "ethereum",
      strategies: [{ strategy: "rsi_mean_reversion" }],
    });

    const leaderboard = service.computeLeaderboard();
    assert.equal(leaderboard.length, 2);
    const btc = leaderboard.find(
      (e) => e.asset === "bitcoin" && e.strategy === "ema_crossover",
    );
    const eth = leaderboard.find(
      (e) => e.asset === "ethereum" && e.strategy === "rsi_mean_reversion",
    );
    if (btc === undefined || eth === undefined) {
      assert.fail("buckets esperados ausentes do leaderboard");
    }
    assert.equal(btc.roundsCount, 2);
    assert.equal(eth.roundsCount, 1);
    // eth rodou depois de btc (clock incrementa a cada call)
    assert.ok(eth.lastRanAtMs > btc.lastRanAtMs);
  });

  void it("listHistory e computeLeaderboard retornam vazio sem historyStore (Wave 21)", () => {
    const adapter = buildFakeAdapter(buildChart([100, 100, 100]));
    const service = new BacktestingService({
      engine: new BacktestEngine(),
      marketDataAdapter: adapter,
    });
    assert.deepEqual(service.listHistory(), []);
    assert.deepEqual(service.computeLeaderboard(), []);
  });

  void it("computeRegimeAlerts emite warning quando recente cai >= threshold (Wave 22)", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "bt-alerts-"));
    const store = new JsonlBacktestRunStore(join(tmpDir, "history.jsonl"));
    const adapter = buildFakeAdapter(buildChart([100, 100, 100]));
    const service = new BacktestingService({
      engine: new BacktestEngine(),
      marketDataAdapter: adapter,
      historyStore: store,
    });

    // 6 rodadas: 3 baseline (PnL 10) + 3 recentes (PnL 2). Delta = -8.
    let nowMs = 1_700_000_000_000;
    const baselinePnls = [10, 10, 10, 2, 2, 2];
    for (const pnl of baselinePnls) {
      nowMs += 60_000;
      store.append({
        id: `id-${nowMs}`,
        ranAtMs: nowMs,
        asset: "bitcoin",
        broker: "bybit",
        range: "30d",
        candleCount: 60,
        cooldownCandles: 1,
        commissionPercent: 0,
        slippagePercent: 0,
        results: [
          {
            strategy: "ema_crossover",
            totalTrades: 5,
            winRatePercent: 50,
            profitFactor: 1.5,
            totalPnlPercent: pnl,
            maxDrawdownPercent: 1,
          },
        ],
      });
    }

    const alerts = service.computeRegimeAlerts({
      recentWindow: 3,
      warningThresholdPercent: 5,
    });
    assert.equal(alerts.length, 1);
    const alert = alerts[0];
    if (alert === undefined) assert.fail("alerta esperado ausente");
    assert.equal(alert.asset, "bitcoin");
    assert.equal(alert.strategy, "ema_crossover");
    assert.equal(alert.severity, "warning");
    assert.equal(alert.baselineRoundsCount, 3);
    assert.equal(alert.recentRoundsCount, 3);
    assert.ok(alert.deltaPnlPercent < -5);
  });

  void it("computeRegimeAlerts emite critical quando queda >= 2x threshold (Wave 22)", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "bt-alerts-"));
    const store = new JsonlBacktestRunStore(join(tmpDir, "history.jsonl"));
    const adapter = buildFakeAdapter(buildChart([100, 100, 100]));
    const service = new BacktestingService({
      engine: new BacktestEngine(),
      marketDataAdapter: adapter,
      historyStore: store,
    });

    let nowMs = 1_700_000_000_000;
    const pnls = [20, 20, 20, -5, -5, -5];
    for (const pnl of pnls) {
      nowMs += 60_000;
      store.append({
        id: `id-${nowMs}`,
        ranAtMs: nowMs,
        asset: "ethereum",
        broker: "bybit",
        range: "30d",
        candleCount: 60,
        cooldownCandles: 1,
        commissionPercent: 0,
        slippagePercent: 0,
        results: [
          {
            strategy: "rsi_mean_reversion",
            totalTrades: 5,
            winRatePercent: 50,
            profitFactor: 1.5,
            totalPnlPercent: pnl,
            maxDrawdownPercent: 1,
          },
        ],
      });
    }

    const alerts = service.computeRegimeAlerts({
      recentWindow: 3,
      warningThresholdPercent: 5,
    });
    assert.equal(alerts.length, 1);
    const alert = alerts[0];
    if (alert === undefined) assert.fail("alerta esperado ausente");
    assert.equal(alert.severity, "critical");
  });

  void it("computeRegimeAlerts ignora buckets com poucas rodadas (Wave 22)", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "bt-alerts-"));
    const store = new JsonlBacktestRunStore(join(tmpDir, "history.jsonl"));
    const adapter = buildFakeAdapter(buildChart([100, 100, 100]));
    const service = new BacktestingService({
      engine: new BacktestEngine(),
      marketDataAdapter: adapter,
      historyStore: store,
    });

    // Apenas 4 rodadas — abaixo do minTotalRounds default (6 = 3+3).
    let nowMs = 1_700_000_000_000;
    for (const pnl of [50, 50, -50, -50]) {
      nowMs += 60_000;
      store.append({
        id: `id-${nowMs}`,
        ranAtMs: nowMs,
        asset: "bitcoin",
        broker: "bybit",
        range: "30d",
        candleCount: 60,
        cooldownCandles: 1,
        commissionPercent: 0,
        slippagePercent: 0,
        results: [
          {
            strategy: "ema_crossover",
            totalTrades: 5,
            winRatePercent: 50,
            profitFactor: 1.5,
            totalPnlPercent: pnl,
            maxDrawdownPercent: 1,
          },
        ],
      });
    }

    const alerts = service.computeRegimeAlerts();
    assert.equal(alerts.length, 0);
  });

  void it("computeRegimeAlerts persiste apenas critical no alertsHistoryStore (Wave 23)", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "bt-ah-"));
    const histStore = new JsonlBacktestRunStore(join(tmpDir, "h.jsonl"));
    const alertsStore = new JsonlRegimeAlertsHistoryStore(
      join(tmpDir, "a.jsonl"),
    );
    const adapter = buildFakeAdapter(buildChart([100, 100, 100]));
    const nowMs = 1_700_000_000_000;
    const service = new BacktestingService({
      engine: new BacktestEngine(),
      marketDataAdapter: adapter,
      historyStore: histStore,
      alertsHistoryStore: alertsStore,
      clock: () => nowMs,
    });

    // Bucket A: warning (delta -8) — NAO persiste
    let ts = 1_700_000_000_000;    for (const pnl of [10, 10, 10, 2, 2, 2]) {
      ts += 60_000;
      histStore.append({
        id: `a-${ts}`,
        ranAtMs: ts,
        asset: "bitcoin",
        broker: "bybit",
        range: "30d",
        candleCount: 60,
        cooldownCandles: 1,
        commissionPercent: 0,
        slippagePercent: 0,
        results: [
          {
            strategy: "ema_crossover",
            totalTrades: 5,
            winRatePercent: 50,
            profitFactor: 1.5,
            totalPnlPercent: pnl,
            maxDrawdownPercent: 1,
          },
        ],
      });
    }

    // Bucket B: critical (delta -25) — persiste
    for (const pnl of [20, 20, 20, -5, -5, -5]) {
      ts += 60_000;
      histStore.append({
        id: `b-${ts}`,
        ranAtMs: ts,
        asset: "ethereum",
        broker: "bybit",
        range: "30d",
        candleCount: 60,
        cooldownCandles: 1,
        commissionPercent: 0,
        slippagePercent: 0,
        results: [
          {
            strategy: "rsi_mean_reversion",
            totalTrades: 5,
            winRatePercent: 50,
            profitFactor: 1.5,
            totalPnlPercent: pnl,
            maxDrawdownPercent: 1,
          },
        ],
      });
    }

    const alerts = service.computeRegimeAlerts({
      recentWindow: 3,
      warningThresholdPercent: 5,
    });
    assert.equal(alerts.length, 2);
    const persisted = service.listRegimeAlertsHistory();
    assert.equal(persisted.length, 1);
    const first = persisted[0];
    if (first === undefined) assert.fail("entry esperada ausente");
    assert.equal(first.severity, "critical");
    assert.equal(first.asset, "ethereum");
    assert.equal(first.recordedAtMs, nowMs);
  });

  void it("computeRegimeAlerts escala warning para critical apos recurrenceEscalationCount (Wave 23)", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "bt-rec-"));
    const histStore = new JsonlBacktestRunStore(join(tmpDir, "h.jsonl"));
    const alertsStore = new JsonlRegimeAlertsHistoryStore(
      join(tmpDir, "a.jsonl"),
    );
    const adapter = buildFakeAdapter(buildChart([100, 100, 100]));
    const nowMs = 1_700_000_000_000;
    const service = new BacktestingService({
      engine: new BacktestEngine(),
      marketDataAdapter: adapter,
      historyStore: histStore,
      alertsHistoryStore: alertsStore,
      clock: () => nowMs,
    });

    let ts = 1_700_000_000_000;
    for (const pnl of [10, 10, 10, 2, 2, 2]) {
      ts += 60_000;
      histStore.append({
        id: `w-${ts}`,
        ranAtMs: ts,
        asset: "bitcoin",
        broker: "bybit",
        range: "30d",
        candleCount: 60,
        cooldownCandles: 1,
        commissionPercent: 0,
        slippagePercent: 0,
        results: [
          {
            strategy: "ema_crossover",
            totalTrades: 5,
            winRatePercent: 50,
            profitFactor: 1.5,
            totalPnlPercent: pnl,
            maxDrawdownPercent: 1,
          },
        ],
      });
    }

    // Pre-popula 3 alertas critical recentes para o mesmo bucket
    for (let i = 0; i < 3; i++) {
      alertsStore.append({
        id: `seed-${i}`,
        recordedAtMs: nowMs - 60_000 * (i + 1),
        asset: "bitcoin",
        strategy: "ema_crossover",
        baselineAvgPnlPercent: 10,
        recentAvgPnlPercent: -10,
        deltaPnlPercent: -20,
        baselineRoundsCount: 3,
        recentRoundsCount: 3,
        severity: "critical",
        lastRanAtMs: nowMs - 60_000 * (i + 1),
      });
    }

    const alerts = service.computeRegimeAlerts({
      recentWindow: 3,
      warningThresholdPercent: 5,
      recurrenceEscalationCount: 3,
    });
    assert.equal(alerts.length, 1);
    const alert = alerts[0];
    if (alert === undefined) assert.fail("alerta esperado ausente");
    // Delta -8 normalmente seria warning, mas escalado por recorrencia
    assert.equal(alert.severity, "critical");
    assert.equal(alert.escalatedByRecurrence, true);
    assert.equal(alert.recurrenceCount, 3);
  });

  void it("listRegimeAlertsHistory retorna vazio sem alertsHistoryStore (Wave 23)", () => {
    const adapter = buildFakeAdapter(buildChart([100, 100, 100]));
    const service = new BacktestingService({
      engine: new BacktestEngine(),
      marketDataAdapter: adapter,
    });
    assert.deepEqual(service.listRegimeAlertsHistory(), []);
  });

  void it("notifier recebe broadcast quando critical novo aparece (Wave 24)", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "bt-notify-"));
    const histStore = new JsonlBacktestRunStore(join(tmpDir, "h.jsonl"));
    const alertsStore = new JsonlRegimeAlertsHistoryStore(
      join(tmpDir, "a.jsonl"),
    );
    const adapter = buildFakeAdapter(buildChart([100, 100, 100]));
    const broadcasts: Array<{ title: string; body: string; tag?: string }> = [];
    const notifier = {
      isEnabled: (): boolean => true,
      broadcast: (payload: {
        readonly title: string;
        readonly body: string;
        readonly tag?: string;
      }): Promise<unknown> => {
        broadcasts.push({
          title: payload.title,
          body: payload.body,
          tag: payload.tag,
        });
        return Promise.resolve({ delivered: 1 });
      },
    };
    const service = new BacktestingService({
      engine: new BacktestEngine(),
      marketDataAdapter: adapter,
      historyStore: histStore,
      alertsHistoryStore: alertsStore,
      notifier,
      notificationCooldownMs: 60 * 60 * 1000,
      clock: () => 1_700_000_000_000,
    });

    let ts = 1_700_000_000_000;
    for (const pnl of [20, 20, 20, -5, -5, -5]) {
      ts += 60_000;
      histStore.append({
        id: `n-${ts}`,
        ranAtMs: ts,
        asset: "ethereum",
        broker: "bybit",
        range: "30d",
        candleCount: 60,
        cooldownCandles: 1,
        commissionPercent: 0,
        slippagePercent: 0,
        results: [
          {
            strategy: "rsi_mean_reversion",
            totalTrades: 5,
            winRatePercent: 50,
            profitFactor: 1.5,
            totalPnlPercent: pnl,
            maxDrawdownPercent: 1,
          },
        ],
      });
    }

    service.computeRegimeAlerts({
      recentWindow: 3,
      warningThresholdPercent: 5,
    });
    // Aguarda o microtask do void this.notifier.broadcast(...)
    await Promise.resolve();
    assert.equal(broadcasts.length, 1);
    const sent = broadcasts[0];
    if (sent === undefined) assert.fail("broadcast esperado ausente");
    assert.match(sent.title, /ethereum/);
    assert.match(sent.body, /rsi_mean_reversion/);
    assert.equal(sent.tag, "regime-alert:ethereum:rsi_mean_reversion");
  });

  void it("notifier respeita cooldown anti-spam para mesmo bucket (Wave 24)", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "bt-cool-"));
    const histStore = new JsonlBacktestRunStore(join(tmpDir, "h.jsonl"));
    const alertsStore = new JsonlRegimeAlertsHistoryStore(
      join(tmpDir, "a.jsonl"),
    );
    const adapter = buildFakeAdapter(buildChart([100, 100, 100]));
    let broadcastCount = 0;
    const notifier = {
      isEnabled: (): boolean => true,
      broadcast: (): Promise<unknown> => {
        broadcastCount += 1;
        return Promise.resolve({ delivered: 1 });
      },
    };
    const nowMs = 1_700_000_000_000;
    const service = new BacktestingService({
      engine: new BacktestEngine(),
      marketDataAdapter: adapter,
      historyStore: histStore,
      alertsHistoryStore: alertsStore,
      notifier,
      notificationCooldownMs: 60 * 60 * 1000,
      clock: () => nowMs,
    });

    // Pre-popula 1 alerta critical RECENTE (dentro do cooldown)
    alertsStore.append({
      id: "seed-cooldown",
      recordedAtMs: nowMs - 10 * 60 * 1000, // 10 min atras
      asset: "bitcoin",
      strategy: "ema_crossover",
      baselineAvgPnlPercent: 10,
      recentAvgPnlPercent: -10,
      deltaPnlPercent: -20,
      baselineRoundsCount: 3,
      recentRoundsCount: 3,
      severity: "critical",
      lastRanAtMs: nowMs - 10 * 60 * 1000,
    });

    let ts = 1_700_000_000_000;
    for (const pnl of [20, 20, 20, -5, -5, -5]) {
      ts += 60_000;
      histStore.append({
        id: `c-${ts}`,
        ranAtMs: ts,
        asset: "bitcoin",
        broker: "bybit",
        range: "30d",
        candleCount: 60,
        cooldownCandles: 1,
        commissionPercent: 0,
        slippagePercent: 0,
        results: [
          {
            strategy: "ema_crossover",
            totalTrades: 5,
            winRatePercent: 50,
            profitFactor: 1.5,
            totalPnlPercent: pnl,
            maxDrawdownPercent: 1,
          },
        ],
      });
    }

    service.computeRegimeAlerts({
      recentWindow: 3,
      warningThresholdPercent: 5,
    });
    await Promise.resolve();
    // Cooldown bloqueou: zero broadcasts mesmo sendo critical novo
    assert.equal(broadcastCount, 0);
    // Mas persistiu o alerta atual (timeline auditavel)
    assert.equal(service.listRegimeAlertsHistory().length, 2);
  });

  void it("notifier desabilitado nao dispara broadcast (Wave 24)", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "bt-disabled-"));
    const histStore = new JsonlBacktestRunStore(join(tmpDir, "h.jsonl"));
    const alertsStore = new JsonlRegimeAlertsHistoryStore(
      join(tmpDir, "a.jsonl"),
    );
    const adapter = buildFakeAdapter(buildChart([100, 100, 100]));
    let broadcastCount = 0;
    const notifier = {
      isEnabled: (): boolean => false,
      broadcast: (): Promise<unknown> => {
        broadcastCount += 1;
        return Promise.resolve({ delivered: 1 });
      },
    };
    const service = new BacktestingService({
      engine: new BacktestEngine(),
      marketDataAdapter: adapter,
      historyStore: histStore,
      alertsHistoryStore: alertsStore,
      notifier,
      clock: () => 1_700_000_000_000,
    });

    let ts = 1_700_000_000_000;
    for (const pnl of [20, 20, 20, -5, -5, -5]) {
      ts += 60_000;
      histStore.append({
        id: `d-${ts}`,
        ranAtMs: ts,
        asset: "solana",
        broker: "bybit",
        range: "30d",
        candleCount: 60,
        cooldownCandles: 1,
        commissionPercent: 0,
        slippagePercent: 0,
        results: [
          {
            strategy: "ema_crossover",
            totalTrades: 5,
            winRatePercent: 50,
            profitFactor: 1.5,
            totalPnlPercent: pnl,
            maxDrawdownPercent: 1,
          },
        ],
      });
    }

    service.computeRegimeAlerts();
    assert.equal(broadcastCount, 0);
  });
});
