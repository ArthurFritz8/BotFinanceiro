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
});
