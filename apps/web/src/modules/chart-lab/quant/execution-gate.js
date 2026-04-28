function toFiniteNumber(value, fallback = Number.NaN) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}


function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function roundNumber(value, precision = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function normalizeSignalTone(value) {
  const tone = String(value ?? "neutral").toLowerCase();
  if (tone === "buy" || tone === "bull" || tone === "bullish" || tone === "call") return "buy";
  if (tone === "sell" || tone === "bear" || tone === "bearish" || tone === "put") return "sell";
  return "neutral";
}

function normalizeFlowTone(orderFlow) {
  const tone = String(orderFlow?.cvd?.tone ?? orderFlow?.cvd?.direction ?? "neutral").toLowerCase();
  if (tone === "bull" || tone === "accumulation") return "bull";
  if (tone === "bear" || tone === "distribution") return "bear";
  return "neutral";
}

function flowAlignsWithSignal(flowTone, signalTone) {
  if (signalTone === "buy") return flowTone === "bull";
  if (signalTone === "sell") return flowTone === "bear";
  return false;
}

function flowConflictsWithSignal(flowTone, signalTone) {
  if (signalTone === "buy") return flowTone === "bear";
  if (signalTone === "sell") return flowTone === "bull";
  return true;
}

function regimeAlignsWithSignal(marketRegime, signalTone) {
  const direction = String(marketRegime?.direction ?? "neutral").toLowerCase();
  const key = String(marketRegime?.key ?? "warming").toLowerCase();
  if (key !== "trend" || direction === "neutral") {
    return true;
  }

  return (signalTone === "buy" && direction === "bullish") || (signalTone === "sell" && direction === "bearish");
}

function liquidityTargetForSignal(liquidityHeatmap, signalTone) {
  if (signalTone === "buy") return liquidityHeatmap?.nearestBelow ?? null;
  if (signalTone === "sell") return liquidityHeatmap?.nearestAbove ?? null;
  return null;
}

function createCheck({ blocking = false, detail, id, label, ok, weight }) {
  return {
    blocking,
    detail,
    id,
    label,
    ok: Boolean(ok),
    weight,
  };
}

function resolveStatus({ hardBlocked, macroBlocked, score, signalTone }) {
  if (macroBlocked) {
    return {
      label: "MACRO BLACKOUT",
      status: "blocked",
      tone: "danger",
    };
  }

  if (hardBlocked || score < 52) {
    return {
      label: "BLOQUEADO",
      status: "blocked",
      tone: "danger",
    };
  }

  if (score < 76) {
    return {
      label: "AGUARDAR",
      status: "watch",
      tone: "warn",
    };
  }

  return {
    label: "ARMADO",
    status: "armed",
    tone: signalTone === "sell" ? "bear" : "bull",
  };
}

function guidanceForStatus(status, signalTone, macroBlocked) {
  if (macroBlocked) {
    return "Macro blackout: evento de alto impacto iminente bloqueia novas entradas direcionais.";
  }

  if (status === "armed") {
    return signalTone === "sell"
      ? "Gate armado para venda: executar apenas no gatilho e manter invalidacao curta."
      : "Gate armado para compra: executar apenas no gatilho e manter invalidacao curta.";
  }

  if (status === "watch") {
    return "Setup em observacao: aguarde confirmacao adicional antes de aumentar exposicao.";
  }

  return "Execucao bloqueada: algum fator critico invalida o clique neste ciclo.";
}

export function buildExecutionGateSnapshot(input = {}) {
  const analysis = input.analysis ?? {};
  const signal = input.signal ?? analysis.signal ?? {};
  const marketRegime = input.marketRegime ?? analysis.marketRegime ?? {};
  const orderFlow = input.orderFlow ?? {};
  const liquidityHeatmap = input.liquidityHeatmap ?? {};
  const signalTone = normalizeSignalTone(signal.tone ?? signal.action);
  const minConfidence = toFiniteNumber(input.minConfidence, 55);
  const minRiskReward = toFiniteNumber(input.minRiskReward, 1.2);
  const maxLiquidityDistancePercent = toFiniteNumber(input.maxLiquidityDistancePercent, 6);
  const confidence = toFiniteNumber(signal.confidence, 0);
  const riskReward = toFiniteNumber(signal.riskReward, Number.NaN);
  const regimeKey = String(marketRegime?.key ?? "warming").toLowerCase();
  const regimeReady = marketRegime?.ready === true;
  const regimeRiskMultiplier = toFiniteNumber(marketRegime?.riskMultiplier, 0);
  const flowTone = normalizeFlowTone(orderFlow);
  const cvdReady = orderFlow?.cvd?.ready === true;
  const volumeReady = orderFlow?.volume?.ready === true;
  const volumeAnomaly = orderFlow?.volume?.anomaly === true;
  const volumeTone = String(orderFlow?.volume?.tone ?? "neutral").toLowerCase();
  const volumeAligned = !volumeAnomaly
    || (signalTone === "buy" && volumeTone === "bull")
    || (signalTone === "sell" && volumeTone === "bear");
  const liquidityTarget = liquidityTargetForSignal(liquidityHeatmap, signalTone);
  const liquidityDistance = toFiniteNumber(liquidityTarget?.distancePercent, Number.NaN);
  const liquidityReady = liquidityHeatmap?.ready === true;
  const liquidityOk = liquidityReady && liquidityTarget !== null && Math.abs(liquidityDistance) <= maxLiquidityDistancePercent;
  const signalOk = signalTone !== "neutral" && confidence >= minConfidence;
  const regimeOk = regimeReady && regimeKey !== "warming" && regimeKey !== "stress" && regimeRiskMultiplier > 0;
  const flowOk = cvdReady && flowAlignsWithSignal(flowTone, signalTone);
  const trendOk = regimeAlignsWithSignal(marketRegime, signalTone);
  const riskRewardOk = Number.isFinite(riskReward) && riskReward >= minRiskReward;
  const flowConflict = cvdReady && flowConflictsWithSignal(flowTone, signalTone);
  const macroGate = input.macroGate ?? null;
  const macroProvided = macroGate !== null && typeof macroGate === "object";
  const macroBlocked = macroProvided && macroGate.blockDirectionalRisk === true;
  const hardBlocked = !signalOk || !regimeOk || !trendOk || flowConflict || !riskRewardOk || macroBlocked;
  const checks = [
    createCheck({
      blocking: true,
      detail: `Tone ${signalTone}; confianca ${roundNumber(confidence, 1)}%`,
      id: "signal",
      label: "Sinal acionavel",
      ok: signalOk,
      weight: 22,
    }),
    createCheck({
      blocking: true,
      detail: `Regime ${marketRegime?.label ?? regimeKey}; risco ${roundNumber(regimeRiskMultiplier * 100, 0)}%`,
      id: "regime",
      label: "Regime permite execucao",
      ok: regimeOk,
      weight: 18,
    }),
    createCheck({
      blocking: true,
      detail: `Direcao ${marketRegime?.direction ?? "neutral"}`,
      id: "trend",
      label: "Direcao maior alinhada",
      ok: trendOk,
      weight: 12,
    }),
    createCheck({
      blocking: true,
      detail: `CVD ${flowTone}`,
      id: "flow",
      label: "CVD confirma sinal",
      ok: flowOk,
      weight: 16,
    }),
    createCheck({
      detail: `Volume ${orderFlow?.volume?.label ?? "n/d"}`,
      id: "volume",
      label: "Volume sem choque contrario",
      ok: volumeReady && volumeAligned,
      weight: 10,
    }),
    createCheck({
      detail: liquidityTarget
        ? `Zona ${liquidityTarget.label ?? "liq"} a ${roundNumber(Math.abs(liquidityDistance), 2)}%`
        : "Sem zona no lado do setup",
      id: "liquidity",
      label: "Liquidez proxima mapeada",
      ok: liquidityOk,
      weight: 10,
    }),
    createCheck({
      blocking: true,
      detail: Number.isFinite(riskReward) ? `R:R ${roundNumber(riskReward, 2)}` : "R:R indisponivel",
      id: "risk-reward",
      label: "Assimetria minima",
      ok: riskRewardOk,
      weight: 12,
    }),
  ];
  if (macroProvided) {
    const macroDetail = macroGate.nextEvent
      ? `${macroGate.nextEvent.name ?? "evento"} em ${macroGate.nextEvent.minutesToEvent ?? "?"}min (${macroGate.alertLevel ?? "n/d"})`
      : `Calendario macro ${macroGate.alertLevel ?? "n/d"}`;
    checks.push(createCheck({
      blocking: true,
      detail: macroDetail,
      id: "macro-gate",
      label: "Janela macro liberada",
      ok: !macroBlocked,
      weight: 14,
    }));
  }
  const totalWeight = checks.reduce((acc, check) => acc + check.weight, 0);
  const passedWeight = checks.reduce((acc, check) => acc + (check.ok ? check.weight : 0), 0);
  const score = roundNumber((passedWeight / Math.max(totalWeight, 1)) * 100, 1);
  const status = resolveStatus({ hardBlocked, macroBlocked, score, signalTone });
  const riskScale = status.status === "blocked"
    ? 0
    : clampNumber(regimeRiskMultiplier * (score / 100), 0.1, 1);

  return {
    checks,
    guidance: guidanceForStatus(status.status, signalTone, macroBlocked),
    hardBlocked,
    label: status.label,
    metrics: {
      confidence: roundNumber(confidence, 1),
      liquidityDistancePercent: roundNumber(liquidityDistance, 3),
      regimeRiskMultiplier: roundNumber(regimeRiskMultiplier, 3),
      riskReward: roundNumber(riskReward, 3),
    },
    ready: checks.length > 0,
    riskScale: roundNumber(riskScale, 3),
    score,
    signalTone,
    status: status.status,
    tone: status.tone,
  };
}