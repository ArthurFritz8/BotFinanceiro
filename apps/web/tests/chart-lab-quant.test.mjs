import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyPositionAssetSpec,
  computePositionCalc,
} from "../src/modules/chart-lab/quant/position-calculator.js";
import {
  computeProbabilisticHistoricalStats,
  computeProbabilisticReturnsSeries,
  runProbabilisticMonteCarloProjection,
} from "../src/modules/chart-lab/quant/probabilistic.js";
import {
  classifyRiskLabRuinTone,
  nextRiskLabStake,
  runMonteCarloRiskSimulation,
} from "../src/modules/chart-lab/quant/risk-lab.js";
import {
  deriveSmcConfluence,
  normalizeSmcCandles,
} from "../src/modules/chart-lab/quant/smc-derivations.js";

function buildPoints(count, start = 100) {
  return Array.from({ length: count }, (_, index) => {
    const open = start + index;
    const close = open + 1;
    return {
      close,
      high: close + 0.5,
      low: open - 0.5,
      open,
      timestamp: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      volume: 1000 + index,
    };
  });
}

test("Risk Lab calcula stake escalonado com teto de recuperacao", () => {
  assert.equal(nextRiskLabStake({ baseStake: 20, strategy: "fixed", winStreak: 3, lossStreak: 3 }), 20);
  assert.equal(nextRiskLabStake({ baseStake: 20, strategy: "soros2", winStreak: 2, lossStreak: 0 }), 80);
  assert.equal(nextRiskLabStake({ baseStake: 20, strategy: "limited_recovery", winStreak: 0, lossStreak: 3 }), 80);
});

test("Risk Lab aceita random injetavel para simulacao deterministica", () => {
  const sim = runMonteCarloRiskSimulation({
    capital: 1000,
    riskPct: 1,
    payoutOrRR: 2,
    winRatePct: 60,
    strategy: "fixed",
    mode: "spot",
    trials: 2,
    tradesPerTrial: 3,
    random: () => 0.1,
  });

  assert.equal(sim.baseStake, 10);
  assert.equal(sim.ruinPct, 0);
  assert.equal(sim.p10, 1060);
  assert.equal(sim.p50, 1060);
  assert.equal(sim.p90, 1060);
  assert.equal(classifyRiskLabRuinTone(sim.ruinPct, 1).tone, "ok");
});

test("Calculadora de posicao calcula lote forex e cenarios por perfil", () => {
  const spec = classifyPositionAssetSpec("eurusd", "usd");
  const result = computePositionCalc({
    capital: 10000,
    riskPct: 1,
    spreadPips: 1,
    spec,
    signal: {
      entryLow: 1.1,
      stopLoss: 1.09,
      takeProfit1: 1.12,
      takeProfit2: 1.13,
    },
  });

  assert.equal(spec.kind, "forex");
  assert.equal(result.ready, true);
  assert.equal(result.recommendedLot, 0.09);
  assert.ok(Math.abs(result.actualRisk - 90) < 1e-9);
  assert.equal(result.exceedsRisk, false);
  assert.equal(result.tps[0].riskReward, 2);
  assert.equal(result.scenarios.length, 3);
});

test("Probabilistico deriva retornos, stats e Monte Carlo deterministicos", () => {
  const points = buildPoints(40, 100);
  const returns = computeProbabilisticReturnsSeries(points);
  const stats = computeProbabilisticHistoricalStats(returns);
  const monteCarlo = runProbabilisticMonteCarloProjection({
    lastClose: 140,
    returns,
    simulations: 4,
    horizonOverride: 2,
    random: () => 0,
  });

  assert.equal(returns.length, 39);
  assert.equal(stats.ready, true);
  assert.equal(stats.sample, 39);
  assert.equal(monteCarlo.ready, true);
  assert.equal(monteCarlo.simulations, 4);
  assert.equal(monteCarlo.horizon, 2);
  assert.ok(monteCarlo.bearPrice > 140);
  assert.equal(monteCarlo.bearPrice, monteCarlo.basePrice);
  assert.equal(monteCarlo.basePrice, monteCarlo.bullPrice);
});

test("SMC derivations detecta sweep bullish e rejeicao por wick real", () => {
  const points = [
    { open: 100, high: 102, low: 99, close: 101 },
    { open: 101, high: 103, low: 100, close: 102 },
    { open: 102, high: 104, low: 101, close: 103 },
    { open: 103, high: 104, low: 98, close: 102 },
  ];
  const smc = deriveSmcConfluence({
    analysis: {
      context: { rangeHigh: 104, rangeLow: 98, trend: "Alta" },
      fearGreed: { score: 50 },
      signal: { tone: "buy" },
    },
    points,
  });

  assert.equal(normalizeSmcCandles(points).length, 4);
  assert.equal(smc.sweep.direction, "bullish");
  assert.equal(smc.checks.sweepConfirmed, true);
  assert.equal(smc.rejection.direction, "bullish");
  assert.equal(smc.checks.rejectionAligned, true);
});

test("SMC derivations detecta FVG bullish mitigado e alinhado", () => {
  const points = [
    { open: 100, high: 101, low: 99, close: 100.5 },
    { open: 100.5, high: 102, low: 100, close: 101.5 },
    { open: 104, high: 106, low: 103, close: 105 },
    { open: 105, high: 105.5, low: 102.5, close: 104 },
  ];
  const smc = deriveSmcConfluence({
    analysis: {
      context: { rangeHigh: 106, rangeLow: 99, trend: "Alta" },
      fearGreed: { score: 55 },
      signal: { tone: "buy" },
    },
    points,
  });

  assert.equal(smc.fvg.active, true);
  assert.equal(smc.fvg.bias, "bullish");
  assert.equal(smc.fvg.mitigated, true);
  assert.equal(smc.checks.fvgAligned, true);
});
