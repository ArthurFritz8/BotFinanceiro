import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyPositionAssetSpec,
  computePositionCalc,
  describePositionAssetSpec,
} from "../src/modules/chart-lab/quant/position-calculator.js";
import { buildExecutionGateSnapshot } from "../src/modules/chart-lab/quant/execution-gate.js";
import { buildExecutionPlanSnapshot } from "../src/modules/chart-lab/quant/execution-plan.js";
import { buildExecutionQualitySnapshot } from "../src/modules/chart-lab/quant/execution-quality.js";
import {
  appendExecutionJournalEntry,
  createExecutionJournalEntry,
  createExecutionJournalState,
  settleExecutionJournalEntries,
  summarizeExecutionJournal,
} from "../src/modules/chart-lab/quant/execution-journal.js";
import {
  buildLiquidityHeatmapSnapshot,
  normalizeLiquidityHeatmapCandles,
} from "../src/modules/chart-lab/quant/liquidity-heatmap.js";
import {
  buildMarketRegimeSnapshot,
  normalizeMarketRegimeCandles,
} from "../src/modules/chart-lab/quant/market-regime.js";
import {
  buildTimingOrderFlowSnapshot,
  computeCumulativeVolumeDelta,
} from "../src/modules/chart-lab/quant/order-flow.js";
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
import { buildVisualIntelligenceEvidence } from "../src/modules/chart-lab/quant/visual-intelligence.js";

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

function buildHammerTrainingPoints(count = 6) {
  const points = [];
  for (let index = 0; index < count; index += 1) {
    const base = 100 + index;
    points.push({ open: base, high: base + 0.6, low: base - 0.2, close: base - 0.1 });
    points.push({ open: base, high: base + 0.25, low: base - 1, close: base + 0.2 });
    points.push({ open: base + 0.2, high: base + 1.2, low: base + 0.1, close: base + 1 });
  }
  return points;
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

test("Calculadora de posicao cobre indices com valor por ponto honesto", () => {
  const spec = classifyPositionAssetSpec("NAS100", "usd");
  const result = computePositionCalc({
    capital: 10000,
    riskPct: 1,
    spreadPips: spec.defaultSpreadPips,
    spec,
    signal: {
      entryLow: 18000,
      stopLoss: 17950,
      takeProfit1: 18100,
      takeProfit2: 18150,
    },
  });

  assert.equal(spec.kind, "index");
  assert.equal(spec.pipSize, 1);
  assert.equal(spec.contractSize, 1);
  assert.equal(result.stopDistancePips, 50);
  assert.equal(result.recommendedLot, 2);
  assert.equal(result.actualRisk, 100);
  assert.equal(result.spreadCost, 3);
});

test("Calculadora de posicao cobre ouro com contrato e tick de commodity", () => {
  const spec = classifyPositionAssetSpec("XAUUSD", "usd");
  const result = computePositionCalc({
    capital: 10000,
    riskPct: 1,
    spreadPips: spec.defaultSpreadPips,
    spec,
    signal: {
      entryLow: 2000,
      stopLoss: 1990,
      takeProfit1: 2020,
      takeProfit2: 2030,
    },
  });

  assert.equal(spec.kind, "commodity");
  assert.equal(spec.pipSize, 0.01);
  assert.equal(spec.contractSize, 100);
  assert.equal(result.stopDistancePips, 1000);
  assert.equal(result.pipValuePerLot, 1);
  assert.equal(result.recommendedLot, 0.1);
  assert.equal(result.actualRisk, 100);
  assert.equal(result.spreadCost, 3);
});

test("Calculadora de posicao explicita fallback para ativo sem especificacao", () => {
  const cryptoSpec = classifyPositionAssetSpec("bitcoin", "usd");
  const spec = classifyPositionAssetSpec("ativo-exotico", "usd");
  const description = describePositionAssetSpec(spec);

  assert.equal(cryptoSpec.kind, "crypto");
  assert.equal(cryptoSpec.isFallback, false);
  assert.equal(spec.kind, "generic");
  assert.equal(spec.isFallback, true);
  assert.match(description, /Sem especificacao cadastrada/);
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

test("Visual IA deriva evidencia real de candle estatistico e harmonico alinhado", () => {
  const evidence = buildVisualIntelligenceEvidence({
    analysis: {
      signal: {
        confidence: 72,
        riskReward: 1.8,
        tone: "buy",
      },
    },
    harmonicScanner: {
      bestPattern: {
        confidence: 82,
        name: "Gartley",
        ratiosValidation: { XD: { status: "ok" } },
        state: { label: "Formado", tone: "ok" },
      },
      confluenceCount: 1,
      tone: "buy",
    },
    points: buildHammerTrainingPoints(6),
  });

  assert.equal(evidence.primaryCandle.id, "hammer");
  assert.equal(evidence.primaryCandle.ready, true);
  assert.equal(evidence.primaryCandle.winRatePercent, 100);
  assert.equal(evidence.harmonic.pattern, "Gartley");
  assert.equal(evidence.score, 100);
  assert.equal(evidence.verdict.label, "Setup visual ativo");
  assert.equal(evidence.cards.find((card) => card.id === "execution").value, "Validado");
});

test("Visual IA degrada sem amostra minima de candle", () => {
  const evidence = buildVisualIntelligenceEvidence({
    analysis: {
      signal: {
        confidence: 40,
        tone: "neutral",
      },
    },
    points: buildPoints(3),
  });

  assert.equal(evidence.score, 0);
  assert.equal(evidence.verdict.label, "Aguardar leitura visual");
  assert.equal(evidence.cards.find((card) => card.id === "candle").tone, "empty");
});

test("Order flow calcula CVD por candle e detecta anomalia de volume", () => {
  const points = [
    { open: 100, close: 101, high: 101.5, low: 99.5, volume: 90 },
    { open: 101, close: 102, high: 102.5, low: 100.5, volume: 95 },
    { open: 102, close: 101.5, high: 102.3, low: 101.2, volume: 100 },
    { open: 101.5, close: 102.2, high: 102.5, low: 101, volume: 105 },
    { open: 102.2, close: 103, high: 103.2, low: 102, volume: 110 },
    { open: 103, close: 102.7, high: 103.1, low: 102.4, volume: 95 },
    { open: 102.7, close: 103.4, high: 103.8, low: 102.5, volume: 100 },
    { open: 103.4, close: 104.1, high: 104.3, low: 103.1, volume: 105 },
    { open: 104.1, close: 104.9, high: 105.1, low: 103.9, volume: 110 },
    { open: 104.9, close: 105.3, high: 105.5, low: 104.6, volume: 115 },
    { open: 105.3, close: 105.1, high: 105.4, low: 104.9, volume: 100 },
    { open: 105.1, close: 106.2, high: 106.5, low: 104.8, volume: 180 },
  ];
  const cvd = computeCumulativeVolumeDelta(points);
  const flow = buildTimingOrderFlowSnapshot({ points, lookback: 30 });

  assert.equal(cvd[0].delta, 90);
  assert.equal(cvd[2].delta, -100);
  assert.equal(cvd.at(-1).value, 715);
  assert.equal(flow.cvd.ready, true);
  assert.equal(flow.cvd.change, 715);
  assert.equal(flow.cvd.label, "Acumulacao");
  assert.equal(flow.volume.ready, true);
  assert.equal(flow.volume.anomaly, true);
  assert.equal(flow.volume.tone, "bull");
  assert.ok(flow.volume.zScore >= 2);
});

test("Order flow degrada volume z-score sem base estatistica", () => {
  const flow = buildTimingOrderFlowSnapshot({ points: buildPoints(4, 100) });

  assert.equal(flow.cvd.ready, true);
  assert.equal(flow.volume.ready, false);
  assert.equal(flow.volume.label, "Aquecendo");
  assert.equal(flow.volume.zScore, 0);
});

test("Liquidity heatmap clusteriza BSL e SSL por toques e volume", () => {
  const points = Array.from({ length: 14 }, (_, index) => ({
    close: 100 + ((index % 3) - 1) * 0.1,
    high: 106 + ((index % 2) * 0.08),
    low: 94 - ((index % 2) * 0.08),
    open: 100 - ((index % 2) * 0.05),
    volume: 900 + (index * 15),
  }));
  const heatmap = buildLiquidityHeatmapSnapshot({
    bucketCount: 12,
    currentPrice: 100,
    maxZones: 4,
    points,
  });

  assert.equal(normalizeLiquidityHeatmapCandles(points).length, 14);
  assert.equal(heatmap.ready, true);
  assert.ok(heatmap.zones.some((zone) => zone.side === "buy-side"));
  assert.ok(heatmap.zones.some((zone) => zone.side === "sell-side"));
  assert.match(heatmap.nearestAbove.label, /^BSL/);
  assert.match(heatmap.nearestBelow.label, /^SSL/);
  assert.ok(heatmap.nearestAbove.center > heatmap.currentPrice);
  assert.ok(heatmap.nearestBelow.center < heatmap.currentPrice);
});

test("Liquidity heatmap degrada sem amostra minima", () => {
  const heatmap = buildLiquidityHeatmapSnapshot({ points: buildPoints(3, 100) });

  assert.equal(heatmap.ready, false);
  assert.equal(heatmap.zones.length, 0);
  assert.equal(heatmap.nearestAbove, null);
  assert.equal(heatmap.nearestBelow, null);
});

test("Market regime classifica tendencia institucional com fluxo alinhado", () => {
  const points = Array.from({ length: 24 }, (_, index) => {
    const open = 100 + (index * 0.82);
    const close = open + 0.55;
    return {
      close,
      high: close + 0.22,
      low: open - 0.18,
      open,
      volume: 1000 + (index * 6),
    };
  });
  const regime = buildMarketRegimeSnapshot({
    orderFlow: { cvd: { tone: "bull" } },
    points,
  });

  assert.equal(normalizeMarketRegimeCandles(points).length, 24);
  assert.equal(regime.ready, true);
  assert.equal(regime.key, "trend");
  assert.equal(regime.direction, "bullish");
  assert.equal(regime.tone, "bull");
  assert.ok(regime.riskMultiplier > 0.8);
  assert.equal(regime.checks.find((check) => check.id === "flow").ok, true);
});

test("Market regime detecta squeeze com baixa direcionalidade", () => {
  const points = Array.from({ length: 18 }, (_, index) => {
    const drift = index % 2 === 0 ? 0.08 : -0.08;
    const open = 100 + drift;
    const close = 100 - drift;
    return {
      close,
      high: 100.18,
      low: 99.82,
      open,
      volume: 900 + (index % 3),
    };
  });
  const regime = buildMarketRegimeSnapshot({ points });

  assert.equal(regime.ready, true);
  assert.equal(regime.key, "squeeze");
  assert.equal(regime.tone, "cool");
  assert.ok(regime.score > 50);
});

test("Market regime degrada sem amostra minima", () => {
  const regime = buildMarketRegimeSnapshot({ points: buildPoints(5, 100) });

  assert.equal(regime.ready, false);
  assert.equal(regime.key, "warming");
  assert.equal(regime.sampleSize, 5);
  assert.equal(regime.riskMultiplier, 0);
});

test("Execution gate arma setup quando sinal, regime, fluxo e liquidez alinham", () => {
  const gate = buildExecutionGateSnapshot({
    liquidityHeatmap: {
      nearestBelow: { distancePercent: -1.4, label: "SSL 92%" },
      ready: true,
    },
    marketRegime: {
      direction: "bullish",
      key: "trend",
      label: "Tendencia Institucional",
      ready: true,
      riskMultiplier: 0.85,
    },
    orderFlow: {
      cvd: { ready: true, tone: "bull" },
      volume: { anomaly: false, label: "Normal", ready: true, tone: "neutral" },
    },
    signal: {
      confidence: 82,
      riskReward: 1.9,
      tone: "buy",
    },
  });

  assert.equal(gate.status, "armed");
  assert.equal(gate.tone, "bull");
  assert.equal(gate.hardBlocked, false);
  assert.equal(gate.checks.every((check) => check.ok), true);
  assert.ok(gate.riskScale > 0.8);
});

test("Execution gate bloqueia stress mesmo com sinal direcional", () => {
  const gate = buildExecutionGateSnapshot({
    liquidityHeatmap: {
      nearestBelow: { distancePercent: -1.2, label: "SSL 88%" },
      ready: true,
    },
    marketRegime: {
      direction: "bullish",
      key: "stress",
      label: "Stress / Expansao",
      ready: true,
      riskMultiplier: 0.35,
    },
    orderFlow: {
      cvd: { ready: true, tone: "bull" },
      volume: { anomaly: false, label: "Normal", ready: true, tone: "neutral" },
    },
    signal: {
      confidence: 86,
      riskReward: 2.1,
      tone: "buy",
    },
  });

  assert.equal(gate.status, "blocked");
  assert.equal(gate.tone, "danger");
  assert.equal(gate.riskScale, 0);
  assert.equal(gate.checks.find((check) => check.id === "regime").ok, false);
});

test("Execution gate aguarda quando CVD ainda nao confirma", () => {
  const gate = buildExecutionGateSnapshot({
    liquidityHeatmap: {
      nearestAbove: { distancePercent: 9.2, label: "BSL 80%" },
      ready: true,
    },
    marketRegime: {
      direction: "neutral",
      key: "range",
      label: "Range / Mean Reversion",
      ready: true,
      riskMultiplier: 0.65,
    },
    orderFlow: {
      cvd: { ready: true, tone: "neutral" },
      volume: { anomaly: false, label: "Normal", ready: true, tone: "neutral" },
    },
    signal: {
      confidence: 72,
      riskReward: 1.5,
      tone: "sell",
    },
  });

  assert.equal(gate.status, "watch");
  assert.equal(gate.hardBlocked, false);
  assert.equal(gate.checks.find((check) => check.id === "flow").ok, false);
  assert.ok(gate.score >= 60 && gate.score < 76);
});

test("Execution plan libera gatilho quando preco esta na zona armada", () => {
  const plan = buildExecutionPlanSnapshot({
    currentPrice: 100.6,
    executionGate: {
      riskScale: 0.82,
      status: "armed",
    },
    signal: {
      entryHigh: 101,
      entryLow: 100,
      riskReward: 2.2,
      stopLoss: 98,
      takeProfit1: 103,
      takeProfit2: 106,
      tone: "buy",
    },
  });

  assert.equal(plan.ready, true);
  assert.equal(plan.state, "trigger");
  assert.equal(plan.tone, "bull");
  assert.equal(plan.entry.inside, true);
  assert.equal(plan.risk.suggestedRiskPercent, 0.82);
  assert.equal(plan.targets.find((target) => target.id === "tp2").riskReward, 2.2);
});

test("Execution plan preserva venda armada mas veta perseguir preco fora da zona", () => {
  const plan = buildExecutionPlanSnapshot({
    currentPrice: 94,
    executionGate: {
      riskScale: 0.7,
      status: "armed",
    },
    signal: {
      entryHigh: 101,
      entryLow: 100,
      riskReward: 2,
      stopLoss: 103,
      takeProfit1: 98,
      takeProfit2: 95,
      tone: "sell",
    },
  });

  assert.equal(plan.ready, true);
  assert.equal(plan.state, "waiting");
  assert.equal(plan.tone, "bear");
  assert.equal(plan.entry.inside, false);
  assert.match(plan.guidance, /nao perseguir/);
  assert.equal(plan.risk.suggestedRiskPercent, 0.7);
});

test("Execution plan bloqueia risco quando geometria esta incompleta", () => {
  const plan = buildExecutionPlanSnapshot({
    currentPrice: 100,
    executionGate: {
      riskScale: 0.9,
      status: "armed",
    },
    signal: {
      entryHigh: 101,
      entryLow: 100,
      stopLoss: 102,
      takeProfit1: 103,
      takeProfit2: 106,
      tone: "buy",
    },
  });

  assert.equal(plan.ready, false);
  assert.equal(plan.state, "incomplete");
  assert.equal(plan.risk.riskScale, 0);
  assert.equal(plan.risk.suggestedRiskPercent, 0);
  assert.equal(plan.checks.find((check) => check.id === "geometry").ok, false);
});

test("Execution journal registra plano pronto e liquida TP2 em R positivo", () => {
  const plan = buildExecutionPlanSnapshot({
    currentPrice: 100.4,
    executionGate: { riskScale: 0.8, status: "armed" },
    signal: {
      entryHigh: 101,
      entryLow: 100,
      riskReward: 2.2,
      stopLoss: 98,
      takeProfit1: 103,
      takeProfit2: 106,
      tone: "buy",
    },
  });
  const entry = createExecutionJournalEntry({
    currentPrice: 100.4,
    executionGate: { score: 82, status: "armed" },
    executionPlan: plan,
    nowMs: 1000,
    snapshot: { assetId: "bitcoin", currency: "usd", mode: "live", range: "24h", resolution: "1" },
  });
  const appended = appendExecutionJournalEntry(createExecutionJournalState(1000), entry, { nowMs: 1000 });
  const settled = settleExecutionJournalEntries(appended.state, 106.2, 2000);
  const summary = summarizeExecutionJournal(settled.state);

  assert.equal(appended.appended, true);
  assert.equal(settled.state.entries[0].status, "target2");
  assert.equal(settled.state.entries[0].outcomeR, 2.2);
  assert.equal(summary.wins, 1);
  assert.equal(summary.averageR, 2.2);
  assert.equal(summary.sampleState, "Aquecendo");
});

test("Execution journal evita duplicidade aberta na mesma janela", () => {
  const plan = buildExecutionPlanSnapshot({
    currentPrice: 100.2,
    executionGate: { riskScale: 0.7, status: "armed" },
    signal: {
      entryHigh: 101,
      entryLow: 100,
      riskReward: 2,
      stopLoss: 98,
      takeProfit1: 103,
      takeProfit2: 105.5,
      tone: "buy",
    },
  });
  const state = createExecutionJournalState(1000);
  const firstEntry = createExecutionJournalEntry({ executionGate: { status: "armed" }, executionPlan: plan, nowMs: 1000, snapshot: { assetId: "ethereum" } });
  const secondEntry = createExecutionJournalEntry({ executionGate: { status: "armed" }, executionPlan: plan, nowMs: 1200, snapshot: { assetId: "ethereum" } });
  const first = appendExecutionJournalEntry(state, firstEntry, { nowMs: 1000 });
  const second = appendExecutionJournalEntry(first.state, secondEntry, { nowMs: 1200 });

  assert.equal(first.appended, true);
  assert.equal(second.appended, false);
  assert.equal(second.reason, "duplicate");
  assert.equal(second.state.entries.length, 1);
});

test("Execution journal zera score institucional antes de cinco planos fechados", () => {
  const state = {
    entries: [
      { outcomeR: 2, status: "target2" },
      { outcomeR: -1, status: "stopped" },
      { outcomeR: 1.5, status: "target2" },
      { outcomeR: -1, status: "stopped" },
    ],
  };
  const summary = summarizeExecutionJournal(state);

  assert.equal(summary.resolved, 4);
  assert.equal(summary.score, 0);
  assert.equal(summary.sampleState, "Aquecendo");
});

test("Execution quality classifica plano prime com journal validado", () => {
  const plan = buildExecutionPlanSnapshot({
    currentPrice: 100.5,
    executionGate: { riskScale: 0.85, status: "armed" },
    signal: {
      entryHigh: 101,
      entryLow: 100,
      riskReward: 2.2,
      stopLoss: 98,
      takeProfit1: 103,
      takeProfit2: 106,
      tone: "buy",
    },
  });
  const quality = buildExecutionQualitySnapshot({
    executionGate: { score: 92, status: "armed" },
    executionPlan: plan,
    journalSummary: { resolved: 8, sampleState: "Moderado", score: 76 },
  });

  assert.equal(quality.status, "prime");
  assert.equal(quality.grade, "A");
  assert.equal(quality.journalReady, true);
  assert.ok(quality.score >= 82);
});

test("Execution quality rejeita plano bloqueado mesmo com score parcial", () => {
  const plan = buildExecutionPlanSnapshot({
    currentPrice: 100,
    executionGate: { riskScale: 0, status: "blocked" },
    signal: {
      entryHigh: 101,
      entryLow: 100,
      riskReward: 2,
      stopLoss: 98,
      takeProfit1: 103,
      takeProfit2: 105,
      tone: "buy",
    },
  });
  const quality = buildExecutionQualitySnapshot({
    executionGate: { score: 70, status: "blocked" },
    executionPlan: plan,
    journalSummary: { resolved: 10, sampleState: "Moderado", score: 80 },
  });

  assert.equal(quality.status, "reject");
  assert.equal(quality.tone, "danger");
  assert.ok(quality.score <= 34);
});

test("Execution quality limita grade enquanto journal ainda aquece", () => {
  const plan = buildExecutionPlanSnapshot({
    currentPrice: 100.5,
    executionGate: { riskScale: 0.85, status: "armed" },
    signal: {
      entryHigh: 101,
      entryLow: 100,
      riskReward: 2.2,
      stopLoss: 98,
      takeProfit1: 103,
      takeProfit2: 106,
      tone: "buy",
    },
  });
  const quality = buildExecutionQualitySnapshot({
    executionGate: { score: 92, status: "armed" },
    executionPlan: plan,
    journalSummary: { resolved: 2, sampleState: "Aquecendo", score: 0 },
  });

  assert.equal(quality.status, "qualified");
  assert.equal(quality.grade, "B+");
  assert.equal(quality.sampleState, "Aquecendo");
  assert.equal(quality.journalReady, false);
  assert.equal(quality.score, 78);
});
