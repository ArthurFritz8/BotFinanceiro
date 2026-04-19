import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Candle } from "../domain/backtest-types.js";
import { BacktestEngine } from "./backtest-engine.js";

function buildCandles(closes: ReadonlyArray<number>): Candle[] {
  const candles: Candle[] = [];
  let prevClose = closes[0]!;
  for (let i = 0; i < closes.length; i += 1) {
    const close = closes[i]!;
    const open = i === 0 ? close : prevClose;
    const hi = Math.max(open, close) * 1.005;
    const lo = Math.min(open, close) * 0.995;
    candles.push({
      tMs: 1_700_000_000_000 + i * 60_000,
      open,
      high: hi,
      low: lo,
      close,
    });
    prevClose = close;
  }
  return candles;
}

void describe("BacktestEngine", () => {
  void it("rejeita request invalido (poucos candles)", () => {
    const engine = new BacktestEngine();
    assert.throws(() =>
      engine.run({ asset: "bitcoin", candles: [], strategy: "ema_crossover" }),
    );
  });

  void it("EMA crossover gera trade long quando fast cruza acima da slow", () => {
    const engine = new BacktestEngine();
    const closes: number[] = [];
    for (let i = 0; i < 25; i += 1) closes.push(100);
    for (let i = 0; i < 35; i += 1) closes.push(100 + (i + 1) * 1.5);
    const candles = buildCandles(closes);
    const result = engine.run({
      asset: "synthetic",
      candles,
      strategy: "ema_crossover",
      emaParams: {
        fastPeriod: 5,
        slowPeriod: 13,
        stopLossPercent: 1,
        takeProfitPercent: 2,
      },
    });
    assert.equal(result.candleCount, 60);
    assert.ok(result.trades.length >= 1, "deve abrir ao menos 1 trade no cross");
    assert.ok(result.trades.some((t) => t.side === "long"));
  });

  void it("EMA crossover gera trade short em rampa descendente apos lateral", () => {
    const engine = new BacktestEngine();
    const closes: number[] = [];
    for (let i = 0; i < 25; i += 1) closes.push(200);
    for (let i = 0; i < 35; i += 1) closes.push(200 - (i + 1) * 1.5);
    const candles = buildCandles(closes);
    const result = engine.run({
      asset: "synthetic",
      candles,
      strategy: "ema_crossover",
      emaParams: {
        fastPeriod: 5,
        slowPeriod: 13,
        stopLossPercent: 1,
        takeProfitPercent: 2,
      },
    });
    assert.ok(result.trades.length >= 1);
    assert.ok(result.trades.some((t) => t.side === "short"));
  });

  void it("RSI mean reversion produz resultado consistente sem crash", () => {
    const engine = new BacktestEngine();
    const closes: number[] = [];
    for (let i = 0; i < 30; i += 1) closes.push(100 - i * 1.5);
    for (let i = 0; i < 50; i += 1) closes.push(55 + i * 0.4);
    const candles = buildCandles(closes);
    const result = engine.run({
      asset: "synthetic",
      candles,
      strategy: "rsi_mean_reversion",
      rsiParams: {
        period: 14,
        oversold: 30,
        overbought: 70,
        stopLossPercent: 3,
        takeProfitPercent: 6,
      },
    });
    assert.equal(result.stats.totalTrades, result.trades.length);
    assert.equal(result.stats.openTrades, 0);
  });

  void it("stats reproduz shape PaperTradingStats", () => {
    const engine = new BacktestEngine();
    const closes: number[] = [];
    for (let i = 0; i < 25; i += 1) closes.push(100);
    for (let i = 0; i < 35; i += 1) closes.push(100 + (i + 1) * 1.5);
    const candles = buildCandles(closes);
    const result = engine.run({
      asset: "synthetic",
      candles,
      strategy: "ema_crossover",
      emaParams: {
        fastPeriod: 5,
        slowPeriod: 13,
        stopLossPercent: 1,
        takeProfitPercent: 2,
      },
    });
    assert.equal(typeof result.stats.winRatePercent, "number");
    assert.equal(typeof result.stats.profitFactor, "number");
    assert.equal(typeof result.stats.maxDrawdownPercent, "number");
    assert.equal(result.stats.openTrades, 0);
    assert.equal(result.stats.closedTrades, result.trades.length);
    assert.equal(result.stats.equityCurve.length, result.trades.length);
  });

  void it("cooldown maior reduz numero de trades", () => {
    const engine = new BacktestEngine();
    const closes: number[] = [];
    for (let i = 0; i < 25; i += 1) closes.push(100);
    for (let i = 0; i < 35; i += 1) closes.push(100 + (i + 1) * 1.5);
    const candles = buildCandles(closes);
    const baseline = engine.run({
      asset: "synthetic",
      candles,
      strategy: "ema_crossover",
      emaParams: {
        fastPeriod: 5,
        slowPeriod: 13,
        stopLossPercent: 1,
        takeProfitPercent: 2,
      },
    });
    const longCooldown = engine.run({
      asset: "synthetic",
      candles,
      strategy: "ema_crossover",
      emaParams: {
        fastPeriod: 5,
        slowPeriod: 13,
        stopLossPercent: 1,
        takeProfitPercent: 2,
      },
      cooldownCandles: 500,
    });
    assert.ok(longCooldown.trades.length <= baseline.trades.length);
  });

  void it("stop loss eh acionado quando low quebra o stopPrice", () => {
    const engine = new BacktestEngine();
    const closes: number[] = [];
    for (let i = 0; i < 25; i += 1) closes.push(100);
    closes.push(102, 104, 106);
    closes.push(70);
    closes.push(72);
    const candles = buildCandles(closes);
    const result = engine.run({
      asset: "synthetic",
      candles,
      strategy: "ema_crossover",
      emaParams: {
        fastPeriod: 5,
        slowPeriod: 13,
        stopLossPercent: 2,
        takeProfitPercent: 50,
      },
    });
    if (result.trades.length > 0) {
      const first = result.trades[0]!;
      assert.equal(first.outcome, "loss");
      assert.ok(first.pnlPercent < 0);
    }
  });

  void it("commissionPercent reduz pnl em ~2x o valor configurado (Wave 18)", () => {
    const engine = new BacktestEngine();
    const closes: number[] = [];
    for (let i = 0; i < 25; i += 1) closes.push(100);
    for (let i = 0; i < 35; i += 1) closes.push(100 + (i + 1) * 1.5);
    const candles = buildCandles(closes);
    const baseline = engine.run({
      asset: "synthetic",
      candles,
      strategy: "ema_crossover",
      emaParams: {
        fastPeriod: 5,
        slowPeriod: 13,
        stopLossPercent: 1,
        takeProfitPercent: 2,
      },
    });
    const withCommission = engine.run({
      asset: "synthetic",
      candles,
      strategy: "ema_crossover",
      emaParams: {
        fastPeriod: 5,
        slowPeriod: 13,
        stopLossPercent: 1,
        takeProfitPercent: 2,
      },
      commissionPercent: 0.5,
    });
    assert.equal(baseline.trades.length, withCommission.trades.length);
    for (let i = 0; i < baseline.trades.length; i += 1) {
      const base = baseline.trades[i]!;
      const fee = withCommission.trades[i]!;
      const delta = base.pnlPercent - fee.pnlPercent;
      assert.ok(
        Math.abs(delta - 1.0) < 1e-6,
        `trade ${i}: esperado delta ~1.0, recebido ${delta}`,
      );
    }
  });

  void it("slippagePercent piora entry e exit (Wave 18)", () => {
    const engine = new BacktestEngine();
    const closes: number[] = [];
    for (let i = 0; i < 25; i += 1) closes.push(100);
    for (let i = 0; i < 35; i += 1) closes.push(100 + (i + 1) * 1.5);
    const candles = buildCandles(closes);
    const baseline = engine.run({
      asset: "synthetic",
      candles,
      strategy: "ema_crossover",
      emaParams: {
        fastPeriod: 5,
        slowPeriod: 13,
        stopLossPercent: 1,
        takeProfitPercent: 2,
      },
    });
    const withSlippage = engine.run({
      asset: "synthetic",
      candles,
      strategy: "ema_crossover",
      emaParams: {
        fastPeriod: 5,
        slowPeriod: 13,
        stopLossPercent: 1,
        takeProfitPercent: 2,
      },
      slippagePercent: 0.5,
    });
    assert.equal(baseline.trades.length, withSlippage.trades.length);
    const longBaseline = baseline.trades.find((t) => t.side === "long");
    const longSlip = withSlippage.trades.find((t) => t.side === "long");
    if (longBaseline && longSlip) {
      // entry pior (mais alto) e exit pior (mais baixo) -> pnl menor
      assert.ok(longSlip.entryPrice > longBaseline.entryPrice);
      assert.ok(longSlip.exitPrice < longBaseline.exitPrice);
      assert.ok(longSlip.pnlPercent < longBaseline.pnlPercent);
    }
  });
});
