import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Candle } from "../domain/backtest-types.js";
import {
  computeSmcScore,
  computeStructureSnapshot,
  detectSwingPoints,
} from "../domain/smc-analyzer.js";
import { smcConfluenceStrategy } from "../domain/strategies.js";
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

function buildBumpCandles(closes: ReadonlyArray<number>, bumpIndex: number, bumpHigh: number): Candle[] {
  // Cria um swing high evidente em bumpIndex (com vizinhos mais baixos).
  const candles = buildCandles(closes);
  const c = candles[bumpIndex]!;
  candles[bumpIndex] = {
    ...c,
    high: bumpHigh,
    low: Math.min(c.open, c.close) * 0.995,
  };
  return candles;
}

void describe("smc-analyzer", () => {
  void it("detectSwingPoints identifica high evidente entre vizinhos menores", () => {
    const closes = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
    const candles = buildBumpCandles(closes, 5, 110);
    const swings = detectSwingPoints(candles, 9, 2);
    assert.ok(swings.some((s) => s.index === 5 && s.kind === "high"));
  });

  void it("computeStructureSnapshot detecta BOS bullish quando close > swing high", () => {
    // Lateral 100, swing high em idx 5 (high=110), depois rampa que rompe.
    const closes: number[] = [];
    for (let i = 0; i < 15; i += 1) closes.push(100);
    closes.push(120); // candle de break — close >> 110 * 1.0008
    const candles = buildBumpCandles(closes, 5, 110);
    const snapshot = computeStructureSnapshot(candles, 15, 2);
    assert.equal(snapshot.bias, "bullish");
    assert.equal(snapshot.bosBullish, true);
    assert.ok(snapshot.lastSwingHigh !== null);
  });

  void it("computeSmcScore retorna 0 para bias neutral", () => {
    const snap = {
      bias: "neutral" as const,
      lastSwingHigh: null,
      lastSwingLow: null,
      bosBullish: false,
      bosBearish: false,
    };
    assert.equal(computeSmcScore(snap, 100), 0);
  });

  void it("smcConfluenceStrategy emite signal long em BOS bullish forte", () => {
    const closes: number[] = [];
    for (let i = 0; i < 15; i += 1) closes.push(100);
    closes.push(120);
    const candles = buildBumpCandles(closes, 5, 110);
    // Garantir um swing low confirmado: bump down em idx 10.
    const c10 = candles[10]!;
    candles[10] = { ...c10, low: 95 };
    const sig = smcConfluenceStrategy(candles, 15, {
      lookAround: 2,
      minScore: 50,
      stopBufferPercent: 0.2,
      riskRewardRatio: 2,
    });
    assert.ok(sig !== null, "deve emitir signal");
    if (sig === null) return;
    assert.equal(sig.side, "long");
    assert.ok(sig.stopPrice < sig.entryPrice);
    assert.ok(sig.targetPrice > sig.entryPrice);
  });

  void it("smcConfluenceStrategy descarta sinal se score < minScore", () => {
    const closes: number[] = [];
    for (let i = 0; i < 15; i += 1) closes.push(100);
    closes.push(120);
    const candles = buildBumpCandles(closes, 5, 110);
    const sig = smcConfluenceStrategy(candles, 15, {
      lookAround: 2,
      minScore: 99,
      stopBufferPercent: 0.2,
      riskRewardRatio: 2,
    });
    assert.equal(sig, null);
  });

  void it("BacktestEngine roda smc_confluence end-to-end sem crash", () => {
    const closes: number[] = [];
    for (let i = 0; i < 15; i += 1) closes.push(100);
    closes.push(120);
    for (let i = 0; i < 20; i += 1) closes.push(122 + i * 0.3);
    const candles = buildBumpCandles(closes, 5, 110);
    const c10 = candles[10]!;
    candles[10] = { ...c10, low: 95 };
    const engine = new BacktestEngine();
    const result = engine.run({
      asset: "synthetic",
      candles,
      strategy: "smc_confluence",
      smcParams: {
        lookAround: 2,
        minScore: 50,
        stopBufferPercent: 0.2,
        riskRewardRatio: 2,
      },
    });
    assert.equal(result.candleCount, candles.length);
    assert.equal(result.strategy, "smc_confluence");
    assert.equal(result.stats.openTrades, 0);
  });
});
