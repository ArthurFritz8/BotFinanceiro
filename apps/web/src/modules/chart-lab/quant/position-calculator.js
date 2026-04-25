const POSITION_CALC_STORAGE_KEY = "botfinanceiro:position-calc:v1";

export const POSITION_CALC_PROFILES = [
  { id: "conservative", label: "Conservador", riskMin: 0.5, riskMax: 1.0, default: 0.75 },
  { id: "moderate", label: "Moderado", riskMin: 1.0, riskMax: 2.0, default: 1.5 },
  { id: "aggressive", label: "Agressivo", riskMin: 2.0, riskMax: 3.0, default: 2.5 },
];

function clampNumber(value, minimum, maximum) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

function toFiniteNumber(value, fallback = 0) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return value;
}

function roundNumber(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function classifyPositionAssetSpec(assetId, currency) {
  const id = String(assetId ?? "").toLowerCase();
  const forexPairs = ["eurusd", "gbpusd", "usdjpy", "audusd", "usdcad", "usdchf", "nzdusd"];
  if (forexPairs.some((pair) => id.includes(pair))) {
    const isJpy = id.includes("jpy");
    return {
      kind: "forex",
      label: id.toUpperCase(),
      pipSize: isJpy ? 0.01 : 0.0001,
      contractSize: 100000,
      lotMin: 0.01,
      lotStep: 0.01,
      defaultSpreadPips: 0.8,
      unitLabel: "lote",
      pipLabel: "pips",
    };
  }

  return {
    kind: "crypto",
    label: id.toUpperCase() || "ATIVO",
    pipSize: null,
    contractSize: 1,
    lotMin: 0.0001,
    lotStep: 0.0001,
    defaultSpreadPips: 0,
    unitLabel: "unidades",
    pipLabel: "ticks",
    currency,
  };
}

export function loadPositionCalcState(defaults) {
  try {
    const raw = globalThis.window?.localStorage?.getItem(POSITION_CALC_STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...defaults };
    return {
      capital: Number.isFinite(parsed.capital) ? parsed.capital : defaults.capital,
      profile: typeof parsed.profile === "string" ? parsed.profile : defaults.profile,
      spreadPips: Number.isFinite(parsed.spreadPips) ? parsed.spreadPips : defaults.spreadPips,
    };
  } catch (_error) {
    return { ...defaults };
  }
}

export function persistPositionCalcState(state) {
  try {
    globalThis.window?.localStorage?.setItem(POSITION_CALC_STORAGE_KEY, JSON.stringify(state));
  } catch (_error) {
    /* noop */
  }
}

export function computePositionCalc({ capital, riskPct, signal, spec, spreadPips }) {
  const safeCapital = Math.max(0, toFiniteNumber(capital, 0));
  const safeRiskPct = clampNumber(toFiniteNumber(riskPct, 1), 0.05, 25);
  const entry = toFiniteNumber(signal?.entryLow, Number.NaN);
  const stop = toFiniteNumber(signal?.stopLoss, Number.NaN);
  const tp1 = toFiniteNumber(signal?.takeProfit1, Number.NaN);
  const tp2 = toFiniteNumber(signal?.takeProfit2, Number.NaN);
  const tp3 = toFiniteNumber(signal?.takeProfit3 ?? signal?.takeProfit2, Number.NaN);
  const ready = safeCapital > 0 && Number.isFinite(entry) && Number.isFinite(stop) && entry !== stop;
  if (!ready) {
    return { ready: false, capital: safeCapital, riskPct: safeRiskPct };
  }
  const riskBudget = safeCapital * (safeRiskPct / 100);
  const stopDistanceAbs = Math.abs(entry - stop);
  const isLong = entry > stop;

  const pipSize = spec.pipSize;
  const stopDistancePips = pipSize ? stopDistanceAbs / pipSize : null;
  let suggestedLot;
  let pipValuePerLot;
  if (spec.kind === "forex") {
    pipValuePerLot = spec.contractSize * pipSize;
    const riskPerLot = stopDistancePips * pipValuePerLot;
    suggestedLot = riskPerLot > 0 ? riskBudget / riskPerLot : 0;
  } else {
    pipValuePerLot = entry;
    suggestedLot = stopDistanceAbs > 0 ? riskBudget / stopDistanceAbs : 0;
  }

  const lotStep = spec.lotStep;
  const lotMin = spec.lotMin;
  let recommendedLot = Math.floor(suggestedLot / lotStep) * lotStep;
  if (recommendedLot < lotMin) recommendedLot = lotMin;
  recommendedLot = roundNumber(recommendedLot, 4);

  const actualRisk = spec.kind === "forex"
    ? recommendedLot * stopDistancePips * pipValuePerLot
    : recommendedLot * stopDistanceAbs;
  const actualRiskPct = safeCapital > 0 ? (actualRisk / safeCapital) * 100 : 0;
  const exceedsRisk = actualRiskPct > safeRiskPct * 1.05;

  const safeSpreadPips = clampNumber(toFiniteNumber(spreadPips, spec.defaultSpreadPips), 0, 50);
  const spreadCost = spec.kind === "forex"
    ? recommendedLot * safeSpreadPips * pipValuePerLot
    : recommendedLot * (safeSpreadPips * (pipSize ?? entry * 0.0001));

  const tps = [tp1, tp2, tp3].map((tpPrice, index) => {
    if (!Number.isFinite(tpPrice)) return null;
    const distAbs = Math.abs(tpPrice - entry);
    const distPips = pipSize ? distAbs / pipSize : null;
    const profit = spec.kind === "forex"
      ? recommendedLot * (distPips ?? 0) * pipValuePerLot
      : recommendedLot * distAbs;
    const gainPct = safeCapital > 0 ? (profit / safeCapital) * 100 : 0;
    const rr = stopDistanceAbs > 0 ? distAbs / stopDistanceAbs : 0;
    return {
      label: `TP${index + 1}`,
      price: tpPrice,
      profit,
      gainPct,
      distPips,
      distAbs,
      riskReward: rr,
      direction: isLong ? "long" : "short",
    };
  });

  const scenarios = POSITION_CALC_PROFILES.map((profile) => {
    const profileRisk = safeCapital * (profile.default / 100);
    let lot = spec.kind === "forex"
      ? profileRisk / Math.max(stopDistancePips * pipValuePerLot, 1e-9)
      : profileRisk / Math.max(stopDistanceAbs, 1e-9);
    lot = Math.floor(lot / lotStep) * lotStep;
    if (lot < lotMin) lot = lotMin;
    lot = roundNumber(lot, 4);
    const realRisk = spec.kind === "forex"
      ? lot * stopDistancePips * pipValuePerLot
      : lot * stopDistanceAbs;
    const realRiskPct = safeCapital > 0 ? (realRisk / safeCapital) * 100 : 0;
    const tp1Profit = Number.isFinite(tp1)
      ? spec.kind === "forex"
        ? lot * (Math.abs(tp1 - entry) / pipSize) * pipValuePerLot
        : lot * Math.abs(tp1 - entry)
      : 0;
    return {
      id: profile.id,
      label: profile.label,
      lot,
      risk: realRisk,
      riskPct: realRiskPct,
      tp1Profit,
    };
  });

  return {
    ready: true,
    capital: safeCapital,
    riskPct: safeRiskPct,
    riskBudget,
    entry,
    stop,
    isLong,
    stopDistanceAbs,
    stopDistancePips,
    recommendedLot,
    actualRisk,
    actualRiskPct,
    exceedsRisk,
    spreadPips: safeSpreadPips,
    spreadCost,
    pipValuePerLot,
    tps,
    scenarios,
    spec,
  };
}

export function formatPositionLot(value, spec) {
  if (!Number.isFinite(value)) return "—";
  const decimals = spec.kind === "forex" ? 2 : 4;
  return `${value.toFixed(decimals)} ${spec.unitLabel}`;
}
