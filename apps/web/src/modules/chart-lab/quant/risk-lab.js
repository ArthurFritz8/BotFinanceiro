const RISK_LAB_STORAGE_KEY = "botfinanceiro:risk-lab:v1";

export const RISK_LAB_STRATEGY_OPTIONS = [
  { id: "fixed", label: "Mao Fixa (institucional)", description: "Stake constante = capital * risco%. Recomendado para qualquer banca." },
  { id: "soros1", label: "Soros Nivel 1", description: "Apos 1 win consecutivo dobra o stake. Reset apos win 2 ou loss." },
  { id: "soros2", label: "Soros Nivel 2", description: "Mantem soros ate 2 wins consecutivos (cap 4x). Reset apos." },
  { id: "limited_recovery", label: "Recuperacao com Limite", description: "Apos loss aumenta stake em 2x ate no maximo 2 niveis (cap 4x). Reset no win. NAO usar como Martingale puro." },
];

function clampNumber(value, minimum, maximum) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

export function loadRiskLabState(defaults) {
  try {
    const raw = globalThis.window?.localStorage?.getItem(RISK_LAB_STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...defaults };
    return {
      capital: Number.isFinite(parsed.capital) ? parsed.capital : defaults.capital,
      riskPct: Number.isFinite(parsed.riskPct) ? parsed.riskPct : defaults.riskPct,
      payoutOrRR: Number.isFinite(parsed.payoutOrRR) ? parsed.payoutOrRR : defaults.payoutOrRR,
      winRatePct: Number.isFinite(parsed.winRatePct) ? parsed.winRatePct : defaults.winRatePct,
      strategy: typeof parsed.strategy === "string" ? parsed.strategy : defaults.strategy,
    };
  } catch (_error) {
    return { ...defaults };
  }
}

export function persistRiskLabState(state) {
  try {
    globalThis.window?.localStorage?.setItem(RISK_LAB_STORAGE_KEY, JSON.stringify(state));
  } catch (_error) {
    /* noop */
  }
}

export function nextRiskLabStake({ baseStake, strategy, winStreak, lossStreak }) {
  if (strategy === "soros1") {
    return winStreak === 1 ? baseStake * 2 : baseStake;
  }
  if (strategy === "soros2") {
    if (winStreak === 1) return baseStake * 2;
    if (winStreak === 2) return baseStake * 4;
    return baseStake;
  }
  if (strategy === "limited_recovery") {
    if (lossStreak === 1) return baseStake * 2;
    if (lossStreak >= 2) return baseStake * 4;
    return baseStake;
  }
  return baseStake;
}

export function runMonteCarloRiskSimulation({
  capital,
  riskPct,
  payoutOrRR,
  winRatePct,
  strategy,
  mode,
  trials = 2000,
  tradesPerTrial = 100,
  random = Math.random,
}) {
  const safeCapital = Math.max(1, Number(capital) || 0);
  const safeRiskPct = clampNumber(Number(riskPct) || 0, 0.05, 25);
  const safeWinRate = clampNumber(Number(winRatePct) || 50, 5, 95) / 100;
  const baseStake = safeCapital * (safeRiskPct / 100);
  const isBinary = mode === "binary";
  const payoutFraction = isBinary
    ? clampNumber(Number(payoutOrRR) || 80, 10, 99) / 100
    : Math.max(0.1, Number(payoutOrRR) || 1);
  const randomSource = typeof random === "function" ? random : Math.random;

  const finalEquities = [];
  let ruinedCount = 0;
  let drawdownSum = 0;

  for (let t = 0; t < trials; t += 1) {
    let equity = safeCapital;
    let peak = safeCapital;
    let maxDdPct = 0;
    let winStreak = 0;
    let lossStreak = 0;
    let ruined = false;
    for (let i = 0; i < tradesPerTrial; i += 1) {
      const stake = Math.min(
        equity,
        nextRiskLabStake({ baseStake, strategy, winStreak, lossStreak }),
      );
      const isWin = randomSource() < safeWinRate;
      if (isWin) {
        equity += isBinary ? stake * payoutFraction : stake * payoutFraction;
        winStreak += 1;
        lossStreak = 0;
      } else {
        equity -= stake;
        lossStreak += 1;
        winStreak = 0;
      }
      if (equity > peak) peak = equity;
      const ddPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
      if (ddPct > maxDdPct) maxDdPct = ddPct;
      if (equity <= safeCapital * 0.5) {
        ruined = true;
        break;
      }
    }
    if (ruined) ruinedCount += 1;
    drawdownSum += maxDdPct;
    finalEquities.push(equity);
  }

  finalEquities.sort((left, right) => left - right);
  const pickPercentile = (p) => {
    const idx = Math.min(finalEquities.length - 1, Math.max(0, Math.floor(finalEquities.length * p)));
    return finalEquities[idx] ?? safeCapital;
  };

  return {
    p10: pickPercentile(0.1),
    p50: pickPercentile(0.5),
    p90: pickPercentile(0.9),
    avgMaxDrawdownPct: drawdownSum / Math.max(1, trials),
    ruinPct: (ruinedCount / Math.max(1, trials)) * 100,
    baseStake,
    capital: safeCapital,
    trials,
    tradesPerTrial,
  };
}

export function classifyRiskLabRuinTone(ruinPct, riskPct) {
  if (riskPct > 5 || ruinPct >= 35) return { tone: "danger", label: "RISCO DE RUINA ELEVADO — over-leverage detectado" };
  if (riskPct > 2 || ruinPct >= 12) return { tone: "warning", label: "Risco moderado — monitorar drawdown" };
  return { tone: "ok", label: "Risco institucional saudavel" };
}
