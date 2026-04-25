export const PROBABILISTIC_MIN_RETURNS_FOR_STATS = 30;
const PROBABILISTIC_TRADING_DAYS_PER_YEAR = 252;
const PROBABILISTIC_MONTE_CARLO_SIMULATIONS = 10000;
const PROBABILISTIC_MONTE_CARLO_CONFIDENCE = 0.9;
const PROBABILISTIC_MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];
export const PROBABILISTIC_WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const PROBABILISTIC_RECENT_DAYS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

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

export function computeProbabilisticReturnsSeries(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return [];
  }
  const returns = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = toFiniteNumber(points[index - 1]?.close, Number.NaN);
    const current = toFiniteNumber(points[index]?.close, Number.NaN);
    if (!Number.isFinite(previous) || !Number.isFinite(current) || previous <= 0 || current <= 0) {
      continue;
    }
    returns.push(Math.log(current / previous));
  }
  return returns;
}

export function computeProbabilisticHistoricalStats(returns) {
  if (!Array.isArray(returns) || returns.length < PROBABILISTIC_MIN_RETURNS_FOR_STATS) {
    return {
      sample: returns?.length ?? 0,
      ready: false,
      cumulativeReturnPercent: null,
      annualizedVolatilityPercent: null,
      sharpeRatio: null,
      maxDrawdownPercent: null,
    };
  }
  const sumReturns = returns.reduce((acc, value) => acc + value, 0);
  const meanReturn = sumReturns / returns.length;
  const variance = returns.reduce((acc, value) => acc + (value - meanReturn) ** 2, 0) / Math.max(returns.length - 1, 1);
  const stdDev = Math.sqrt(variance);
  const annualizedVolatility = stdDev * Math.sqrt(PROBABILISTIC_TRADING_DAYS_PER_YEAR);
  const annualizedReturn = meanReturn * PROBABILISTIC_TRADING_DAYS_PER_YEAR;
  const sharpe = annualizedVolatility > 0 ? annualizedReturn / annualizedVolatility : 0;

  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const value of returns) {
    equity *= Math.exp(value);
    if (equity > peak) {
      peak = equity;
    }
    const drawdown = (equity - peak) / peak;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return {
    sample: returns.length,
    ready: true,
    cumulativeReturnPercent: roundNumber((Math.exp(sumReturns) - 1) * 100, 2),
    annualizedVolatilityPercent: roundNumber(annualizedVolatility * 100, 2),
    sharpeRatio: roundNumber(sharpe, 2),
    maxDrawdownPercent: roundNumber(maxDrawdown * 100, 2),
  };
}

export function computeProbabilisticEmpiricalPercentile(sortedValues, percentile) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
    return null;
  }
  const clamped = clampNumber(percentile, 0, 1);
  const rank = clamped * (sortedValues.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const weight = rank - lowerIndex;
  return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight;
}

export function computeProbabilisticRiskMetrics(returns, _snapshot) {
  if (!Array.isArray(returns) || returns.length < PROBABILISTIC_MIN_RETURNS_FOR_STATS) {
    return {
      ready: false,
      varPercent: null,
      expectedShortfallPercent: null,
      betaLabel: "n/d",
      correlationLabel: "n/d",
      benchmarkAvailable: false,
    };
  }
  const sorted = [...returns].sort((left, right) => left - right);
  const varValue = computeProbabilisticEmpiricalPercentile(sorted, 0.05);
  const tail = sorted.filter((value) => value <= varValue);
  const expectedShortfall = tail.length > 0
    ? tail.reduce((acc, value) => acc + value, 0) / tail.length
    : varValue;
  const benchmarkAvailable = false;

  return {
    ready: true,
    varPercent: roundNumber(varValue * 100, 2),
    expectedShortfallPercent: roundNumber(expectedShortfall * 100, 2),
    betaLabel: benchmarkAvailable ? "—" : "n/d",
    correlationLabel: benchmarkAvailable ? "—" : "n/d",
    benchmarkAvailable,
  };
}

export function runProbabilisticMonteCarloProjection({
  lastClose,
  returns,
  simulations = PROBABILISTIC_MONTE_CARLO_SIMULATIONS,
  horizonOverride = null,
  random = Math.random,
}) {
  const safeLastClose = toFiniteNumber(lastClose, Number.NaN);
  if (!Number.isFinite(safeLastClose) || safeLastClose <= 0 || !Array.isArray(returns) || returns.length < PROBABILISTIC_MIN_RETURNS_FOR_STATS) {
    return {
      ready: false,
      simulations: 0,
      horizon: 0,
      lastClose: Number.isFinite(safeLastClose) ? safeLastClose : null,
      bullPrice: null,
      basePrice: null,
      bearPrice: null,
      confidenceLevel: PROBABILISTIC_MONTE_CARLO_CONFIDENCE,
    };
  }
  const horizon = Number.isFinite(horizonOverride) && horizonOverride > 0
    ? Math.floor(horizonOverride)
    : Math.max(8, Math.floor(returns.length * 0.25));
  const finalPrices = new Array(simulations);
  const returnsLength = returns.length;
  const randomSource = typeof random === "function" ? random : Math.random;
  for (let index = 0; index < simulations; index += 1) {
    let price = safeLastClose;
    for (let step = 0; step < horizon; step += 1) {
      const sampledReturn = returns[Math.floor(randomSource() * returnsLength)];
      price *= Math.exp(sampledReturn);
    }
    finalPrices[index] = price;
  }
  finalPrices.sort((left, right) => left - right);
  return {
    ready: true,
    simulations,
    horizon,
    lastClose: safeLastClose,
    bearPrice: roundNumber(computeProbabilisticEmpiricalPercentile(finalPrices, 0.05), 5),
    basePrice: roundNumber(computeProbabilisticEmpiricalPercentile(finalPrices, 0.5), 5),
    bullPrice: roundNumber(computeProbabilisticEmpiricalPercentile(finalPrices, 0.95), 5),
    confidenceLevel: PROBABILISTIC_MONTE_CARLO_CONFIDENCE,
  };
}

export function computeProbabilisticMonthlySeasonality(points) {
  const buckets = Array.from({ length: 12 }, () => ({ returns: [], wins: 0, total: 0 }));
  if (!Array.isArray(points) || points.length === 0) {
    return {
      months: PROBABILISTIC_MONTH_LABELS.map((label, index) => ({
        label,
        index,
        ready: false,
        medianReturnPercent: null,
        winRatePercent: null,
        sample: 0,
      })),
      currentMonthIndex: new Date().getMonth(),
    };
  }
  for (const point of points) {
    const open = toFiniteNumber(point?.open, Number.NaN);
    const close = toFiniteNumber(point?.close, Number.NaN);
    const timestamp = typeof point?.timestamp === "string" ? Date.parse(point.timestamp) : Number.NaN;
    if (!Number.isFinite(open) || !Number.isFinite(close) || open <= 0 || close <= 0 || !Number.isFinite(timestamp)) {
      continue;
    }
    const monthIndex = new Date(timestamp).getUTCMonth();
    const change = (close - open) / open;
    buckets[monthIndex].returns.push(change);
    buckets[monthIndex].total += 1;
    if (change > 0) {
      buckets[monthIndex].wins += 1;
    }
  }
  return {
    months: buckets.map((bucket, index) => {
      const sorted = [...bucket.returns].sort((left, right) => left - right);
      const median = sorted.length === 0
        ? null
        : sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];
      return {
        label: PROBABILISTIC_MONTH_LABELS[index],
        index,
        ready: bucket.total > 0,
        medianReturnPercent: median === null ? null : roundNumber(median * 100, 2),
        winRatePercent: bucket.total > 0 ? roundNumber((bucket.wins / bucket.total) * 100, 0) : null,
        sample: bucket.total,
      };
    }),
    currentMonthIndex: new Date().getUTCMonth(),
  };
}

export function formatProbabilisticPercent(value, { signed = false, fractionDigits = 2 } = {}) {
  if (!Number.isFinite(value)) {
    return "—";
  }
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(fractionDigits)}%`;
}

export function classifyProbabilisticTone(value, { invert = false } = {}) {
  if (!Number.isFinite(value) || value === 0) {
    return "neutral";
  }
  const positive = invert ? value < 0 : value > 0;
  return positive ? "bull" : "bear";
}

export function computeProbabilisticSkewness(returns) {
  if (!Array.isArray(returns) || returns.length < PROBABILISTIC_MIN_RETURNS_FOR_STATS) {
    return { ready: false, value: null, bias: "n/d" };
  }
  const n = returns.length;
  const mean = returns.reduce((acc, value) => acc + value, 0) / n;
  const variance = returns.reduce((acc, value) => acc + (value - mean) ** 2, 0) / Math.max(n - 1, 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev <= 0) {
    return { ready: true, value: 0, bias: "Simetrica" };
  }
  const skew = returns.reduce((acc, value) => acc + ((value - mean) / stdDev) ** 3, 0) / n;
  const rounded = roundNumber(skew, 2);
  let bias = "Simetrica";
  if (rounded > 0.5) bias = "Cauda direita (bullish)";
  else if (rounded < -0.5) bias = "Cauda esquerda (bearish)";
  else if (rounded > 0.1) bias = "Levemente positiva";
  else if (rounded < -0.1) bias = "Levemente negativa";
  return { ready: true, value: rounded, bias };
}

export function computeProbabilisticKurtosis(returns) {
  if (!Array.isArray(returns) || returns.length < PROBABILISTIC_MIN_RETURNS_FOR_STATS) {
    return { ready: false, value: null, alert: "n/d", isFatTail: false };
  }
  const n = returns.length;
  const mean = returns.reduce((acc, value) => acc + value, 0) / n;
  const variance = returns.reduce((acc, value) => acc + (value - mean) ** 2, 0) / Math.max(n - 1, 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev <= 0) {
    return { ready: true, value: 0, alert: "Sem dispersao", isFatTail: false };
  }
  const kurt = returns.reduce((acc, value) => acc + ((value - mean) / stdDev) ** 4, 0) / n;
  const excess = kurt - 3;
  const rounded = roundNumber(excess, 2);
  let alert = "Distribuicao normal";
  let isFatTail = false;
  if (rounded > 3) { alert = "Caudas MUITO gordas (eventos extremos)"; isFatTail = true; }
  else if (rounded > 1) { alert = "Caudas gordas (cuidado com outliers)"; isFatTail = true; }
  else if (rounded < -1) { alert = "Caudas finas (estavel)"; }
  return { ready: true, value: rounded, alert, isFatTail };
}

export function computeProbabilisticHourlySeasonality(points, nowMs = Date.now()) {
  const buckets = Array.from({ length: 24 }, () => ({ wins: 0, total: 0, sumChange: 0 }));
  if (!Array.isArray(points) || points.length === 0) {
    return { hours: buckets.map((_, hour) => ({ hour, ready: false, winRatePercent: null, avgChangePercent: null, sample: 0 })), currentHour: new Date(nowMs).getUTCHours() };
  }
  const cutoff = nowMs - PROBABILISTIC_RECENT_DAYS_WINDOW_MS;
  for (const point of points) {
    const open = toFiniteNumber(point?.open, Number.NaN);
    const close = toFiniteNumber(point?.close, Number.NaN);
    const timestamp = typeof point?.timestamp === "string" ? Date.parse(point.timestamp) : Number.NaN;
    if (!Number.isFinite(open) || !Number.isFinite(close) || open <= 0 || close <= 0 || !Number.isFinite(timestamp)) continue;
    if (timestamp < cutoff) continue;
    const hour = new Date(timestamp).getUTCHours();
    const change = (close - open) / open;
    buckets[hour].total += 1;
    buckets[hour].sumChange += change;
    if (change > 0) buckets[hour].wins += 1;
  }
  return {
    hours: buckets.map((bucket, hour) => ({
      hour,
      ready: bucket.total >= 2,
      winRatePercent: bucket.total >= 2 ? roundNumber((bucket.wins / bucket.total) * 100, 0) : null,
      avgChangePercent: bucket.total >= 2 ? roundNumber((bucket.sumChange / bucket.total) * 100, 2) : null,
      sample: bucket.total,
    })),
    currentHour: new Date(nowMs).getUTCHours(),
  };
}

export function computeProbabilisticWeekdaySeasonality(points, nowMs = Date.now()) {
  const buckets = Array.from({ length: 7 }, () => ({ wins: 0, total: 0, sumChange: 0 }));
  if (!Array.isArray(points) || points.length === 0) {
    return { days: buckets.map((_, index) => ({ index, label: PROBABILISTIC_WEEKDAY_LABELS[index], ready: false, winRatePercent: null, avgChangePercent: null, sample: 0 })), currentWeekday: new Date(nowMs).getUTCDay() };
  }
  const cutoff = nowMs - PROBABILISTIC_RECENT_DAYS_WINDOW_MS;
  for (const point of points) {
    const open = toFiniteNumber(point?.open, Number.NaN);
    const close = toFiniteNumber(point?.close, Number.NaN);
    const timestamp = typeof point?.timestamp === "string" ? Date.parse(point.timestamp) : Number.NaN;
    if (!Number.isFinite(open) || !Number.isFinite(close) || open <= 0 || close <= 0 || !Number.isFinite(timestamp)) continue;
    if (timestamp < cutoff) continue;
    const weekday = new Date(timestamp).getUTCDay();
    const change = (close - open) / open;
    buckets[weekday].total += 1;
    buckets[weekday].sumChange += change;
    if (change > 0) buckets[weekday].wins += 1;
  }
  return {
    days: buckets.map((bucket, index) => ({
      index,
      label: PROBABILISTIC_WEEKDAY_LABELS[index],
      ready: bucket.total >= 2,
      winRatePercent: bucket.total >= 2 ? roundNumber((bucket.wins / bucket.total) * 100, 0) : null,
      avgChangePercent: bucket.total >= 2 ? roundNumber((bucket.sumChange / bucket.total) * 100, 2) : null,
      sample: bucket.total,
    })),
    currentWeekday: new Date(nowMs).getUTCDay(),
  };
}

export function detectProbabilisticCandlePatterns(points) {
  const PATTERN_DEFS = [
    { id: "hammer", label: "Martelo", bias: "bull" },
    { id: "engulfing-bull", label: "Engolfo de Alta", bias: "bull" },
    { id: "engulfing-bear", label: "Engolfo de Baixa", bias: "bear" },
    { id: "doji", label: "Doji", bias: "neutral" },
  ];
  const stats = Object.fromEntries(PATTERN_DEFS.map((def) => [def.id, { ...def, occurrences: 0, wins: 0 }]));
  if (!Array.isArray(points) || points.length < 3) {
    return PATTERN_DEFS.map((def) => ({ ...def, occurrences: 0, winRatePercent: null, ready: false }));
  }
  const isCandleValid = (candle) => {
    if (!candle) return false;
    const o = toFiniteNumber(candle.open, Number.NaN);
    const c = toFiniteNumber(candle.close, Number.NaN);
    const h = toFiniteNumber(candle.high, Number.NaN);
    const l = toFiniteNumber(candle.low, Number.NaN);
    return Number.isFinite(o) && Number.isFinite(c) && Number.isFinite(h) && Number.isFinite(l) && h >= Math.max(o, c) && l <= Math.min(o, c);
  };
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    if (!isCandleValid(prev) || !isCandleValid(curr) || !isCandleValid(next)) continue;
    const o = curr.open;
    const c = curr.close;
    const h = curr.high;
    const l = curr.low;
    const range = h - l;
    if (range <= 0) continue;
    const body = Math.abs(c - o);
    const lowerShadow = Math.min(o, c) - l;
    const upperShadow = h - Math.max(o, c);
    const nextChange = (next.close - next.open) / next.open;

    if (body / range < 0.1) {
      stats.doji.occurrences += 1;
      if (nextChange > 0) stats.doji.wins += 1;
    }
    if (body / range < 0.35 && lowerShadow >= 2 * body && upperShadow < body) {
      stats.hammer.occurrences += 1;
      if (nextChange > 0) stats.hammer.wins += 1;
    }
    const prevBody = Math.abs(prev.close - prev.open);
    if (prev.close < prev.open && c > o && o <= prev.close && c >= prev.open && body > prevBody) {
      stats["engulfing-bull"].occurrences += 1;
      if (nextChange > 0) stats["engulfing-bull"].wins += 1;
    }
    if (prev.close > prev.open && c < o && o >= prev.close && c <= prev.open && body > prevBody) {
      stats["engulfing-bear"].occurrences += 1;
      if (nextChange < 0) stats["engulfing-bear"].wins += 1;
    }
  }
  return PATTERN_DEFS.map((def) => {
    const bucket = stats[def.id];
    const ready = bucket.occurrences >= 5;
    return {
      ...def,
      occurrences: bucket.occurrences,
      winRatePercent: ready ? roundNumber((bucket.wins / bucket.occurrences) * 100, 0) : null,
      ready,
    };
  });
}
