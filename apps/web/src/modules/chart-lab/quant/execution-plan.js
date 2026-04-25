const DEFAULT_BASE_RISK_PERCENT = 1;

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

function normalizeGateStatus(value) {
  const status = String(value ?? "watch").toLowerCase();
  if (status === "armed" || status === "blocked" || status === "watch") {
    return status;
  }

  return "watch";
}

function resolveEntryBand(signal) {
  const entryLow = toFiniteNumber(signal?.entryLow, Number.NaN);
  const entryHigh = toFiniteNumber(signal?.entryHigh, Number.NaN);

  if (!Number.isFinite(entryLow) || !Number.isFinite(entryHigh)) {
    return null;
  }

  const low = Math.min(entryLow, entryHigh);
  const high = Math.max(entryLow, entryHigh);
  const midpoint = (low + high) / 2;
  const widthPercent = midpoint === 0 ? Number.NaN : ((high - low) / Math.abs(midpoint)) * 100;

  return {
    high: roundNumber(high, 8),
    low: roundNumber(low, 8),
    midpoint: roundNumber(midpoint, 8),
    widthPercent: roundNumber(widthPercent, 3),
  };
}

function percentDistance(fromValue, toValue) {
  if (!Number.isFinite(fromValue) || !Number.isFinite(toValue) || Math.abs(fromValue) < 1e-9) {
    return null;
  }

  return roundNumber(((toValue - fromValue) / Math.abs(fromValue)) * 100, 3);
}

function absolutePercentDistance(fromValue, toValue) {
  const distance = percentDistance(fromValue, toValue);
  return distance === null ? null : roundNumber(Math.abs(distance), 3);
}

function distanceToEntryBand(currentPrice, entryBand) {
  if (!Number.isFinite(currentPrice) || entryBand === null) {
    return { distancePercent: null, inside: false };
  }

  if (currentPrice >= entryBand.low && currentPrice <= entryBand.high) {
    return { distancePercent: 0, inside: true };
  }

  const nearestBoundary = currentPrice < entryBand.low ? entryBand.low : entryBand.high;
  return {
    distancePercent: absolutePercentDistance(currentPrice, nearestBoundary),
    inside: false,
  };
}

function computeTargetRiskReward({ entryMidpoint, side, stopLoss, target }) {
  const risk = side === "buy" ? entryMidpoint - stopLoss : stopLoss - entryMidpoint;
  const reward = side === "buy" ? target - entryMidpoint : entryMidpoint - target;

  if (risk <= 0 || reward <= 0) {
    return null;
  }

  return roundNumber(reward / risk, 2);
}

function geometryIsValid({ entryBand, side, stopLoss, takeProfit1, takeProfit2 }) {
  if (side !== "buy" && side !== "sell") {
    return false;
  }

  if (entryBand === null || !Number.isFinite(stopLoss) || !Number.isFinite(takeProfit1) || !Number.isFinite(takeProfit2)) {
    return false;
  }

  if (side === "buy") {
    return stopLoss < entryBand.low && takeProfit1 > entryBand.high && takeProfit2 > entryBand.high;
  }

  return stopLoss > entryBand.high && takeProfit1 < entryBand.low && takeProfit2 < entryBand.low;
}

function resolvePlanState({ entryBand, gateStatus, geometryOk, side, currentPrice }) {
  if (!geometryOk) {
    return {
      label: "PLANO INCOMPLETO",
      state: "incomplete",
      tone: "danger",
    };
  }

  if (gateStatus === "blocked") {
    return {
      label: "BLOQUEADO",
      state: "blocked",
      tone: "danger",
    };
  }

  if (gateStatus === "watch") {
    return {
      label: "AGUARDAR",
      state: "watch",
      tone: "warn",
    };
  }

  const entryDistance = distanceToEntryBand(currentPrice, entryBand);
  if (entryDistance.inside) {
    return {
      label: "GATILHO",
      state: "trigger",
      tone: side === "sell" ? "bear" : "bull",
    };
  }

  return {
    label: "AGUARDAR PRECO",
    state: "waiting",
    tone: side === "sell" ? "bear" : "bull",
  };
}

function guidanceForPlan({ currentPrice, entryBand, gateStatus, geometryOk, side, state }) {
  if (!geometryOk) {
    return "Plano incompleto: entrada, stop e alvos precisam formar geometria valida.";
  }

  if (state === "blocked") {
    return "Gate bloqueado: preservar capital e esperar novo ciclo de confluencia.";
  }

  if (state === "watch" || gateStatus === "watch") {
    return "Plano em observacao: manter risco reduzido ate o gate confirmar fluxo e liquidez.";
  }

  if (state === "trigger") {
    return side === "sell"
      ? "Preco dentro da zona de venda: executar somente com rejeicao confirmada."
      : "Preco dentro da zona de compra: executar somente com continuidade confirmada.";
  }

  if (!Number.isFinite(currentPrice) || entryBand === null) {
    return "Aguardando preco atual para medir proximidade da zona.";
  }

  if (side === "buy" && currentPrice > entryBand.high) {
    return "Compra armada, mas preco acima da zona: nao perseguir, esperar pullback.";
  }

  if (side === "sell" && currentPrice < entryBand.low) {
    return "Venda armada, mas preco abaixo da zona: nao perseguir, esperar repique.";
  }

  return "Setup armado fora da zona: aguardar preco voltar ao range operacional.";
}

function createCheck({ detail, id, label, ok }) {
  return {
    detail,
    id,
    label,
    ok: Boolean(ok),
  };
}

export function buildExecutionPlanSnapshot(input = {}) {
  const analysis = input.analysis ?? {};
  const signal = input.signal ?? analysis.signal ?? {};
  const executionGate = input.executionGate ?? {};
  const side = normalizeSignalTone(signal.tone ?? signal.action);
  const gateStatus = normalizeGateStatus(executionGate.status);
  const gateRiskScale = toFiniteNumber(executionGate.riskScale, 0);
  const baseRiskPercent = toFiniteNumber(input.baseRiskPercent, DEFAULT_BASE_RISK_PERCENT);
  const currentPrice = toFiniteNumber(input.currentPrice, Number.NaN);
  const entryBand = resolveEntryBand(signal);
  const entryMidpoint = entryBand?.midpoint ?? Number.NaN;
  const stopLoss = toFiniteNumber(signal.stopLoss, Number.NaN);
  const takeProfit1 = toFiniteNumber(signal.takeProfit1, Number.NaN);
  const takeProfit2 = toFiniteNumber(signal.takeProfit2, Number.NaN);
  const geometryOk = geometryIsValid({ entryBand, side, stopLoss, takeProfit1, takeProfit2 });
  const entryDistance = distanceToEntryBand(currentPrice, entryBand);
  const state = resolvePlanState({ currentPrice, entryBand, gateStatus, geometryOk, side });
  const effectiveRiskScale = state.state === "blocked" || state.state === "incomplete"
    ? 0
    : clampNumber(gateRiskScale, 0, 1);
  const targets = [
    {
      distancePercent: absolutePercentDistance(entryMidpoint, takeProfit1),
      id: "tp1",
      label: "Parcial 1",
      price: roundNumber(takeProfit1, 8),
      riskReward: computeTargetRiskReward({ entryMidpoint, side, stopLoss, target: takeProfit1 }),
    },
    {
      distancePercent: absolutePercentDistance(entryMidpoint, takeProfit2),
      id: "tp2",
      label: "Alvo final",
      price: roundNumber(takeProfit2, 8),
      riskReward: computeTargetRiskReward({ entryMidpoint, side, stopLoss, target: takeProfit2 }),
    },
  ];
  const stopDistancePercent = absolutePercentDistance(entryMidpoint, stopLoss);

  return {
    checks: [
      createCheck({
        detail: side,
        id: "side",
        label: "Direcao definida",
        ok: side !== "neutral",
      }),
      createCheck({
        detail: geometryOk ? "Entrada, stop e alvos coerentes" : "Geometria invalida ou incompleta",
        id: "geometry",
        label: "Geometria valida",
        ok: geometryOk,
      }),
      createCheck({
        detail: gateStatus,
        id: "gate",
        label: "Gate nao bloqueia",
        ok: gateStatus !== "blocked",
      }),
      createCheck({
        detail: entryDistance.inside ? "Preco dentro da zona" : "Preco fora da zona",
        id: "entry-zone",
        label: "Preco na zona",
        ok: entryDistance.inside,
      }),
    ],
    entry: entryBand === null
      ? null
      : {
          ...entryBand,
          distancePercent: entryDistance.distancePercent,
          inside: entryDistance.inside,
        },
    guidance: guidanceForPlan({ currentPrice, entryBand, gateStatus, geometryOk, side, state: state.state }),
    invalidation: {
      distancePercent: stopDistancePercent,
      price: roundNumber(stopLoss, 8),
    },
    label: state.label,
    ready: geometryOk,
    risk: {
      baseRiskPercent: roundNumber(baseRiskPercent, 2),
      riskReward: roundNumber(toFiniteNumber(signal.riskReward, targets[1].riskReward ?? Number.NaN), 2),
      riskScale: roundNumber(effectiveRiskScale, 3),
      stopDistancePercent,
      suggestedRiskPercent: roundNumber(baseRiskPercent * effectiveRiskScale, 2),
    },
    side,
    state: state.state,
    targets,
    tone: state.tone,
  };
}
