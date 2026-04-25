function toFiniteNumber(value, fallback = Number.NaN) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}


function roundNumber(value, precision = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function normalizeOhlcvPoint(point) {
  const close = toFiniteNumber(point?.close, toFiniteNumber(point?.price));
  const open = toFiniteNumber(point?.open, close);
  const high = toFiniteNumber(point?.high, Math.max(open, close));
  const low = toFiniteNumber(point?.low, Math.min(open, close));
  const volume = toFiniteNumber(point?.volume, 0);

  if (![open, high, low, close, volume].every(Number.isFinite)) {
    return null;
  }

  return {
    close,
    high: Math.max(high, open, close),
    low: Math.min(low, open, close),
    open,
    volume: Math.max(0, volume),
  };
}

export function normalizeOrderFlowPoints(points) {
  if (!Array.isArray(points)) {
    return [];
  }

  return points.map(normalizeOhlcvPoint).filter((point) => point !== null);
}

export function computeCumulativeVolumeDelta(points) {
  const candles = normalizeOrderFlowPoints(points);
  let cumulative = 0;

  return candles.map((candle, index) => {
    const direction = candle.close > candle.open ? 1 : candle.close < candle.open ? -1 : 0;
    const delta = direction * candle.volume;
    cumulative += delta;

    return {
      close: candle.close,
      delta,
      direction,
      index,
      open: candle.open,
      value: cumulative,
      volume: candle.volume,
    };
  });
}

function computeMean(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function computeStdDev(values, mean) {
  if (!Array.isArray(values) || values.length < 2) {
    return 0;
  }

  const variance = values.reduce((acc, value) => acc + ((value - mean) ** 2), 0) / Math.max(values.length - 1, 1);
  return Math.sqrt(variance);
}

function buildSparkline(series, limit = 24) {
  const slice = series.slice(-limit);
  if (slice.length === 0) {
    return [];
  }

  const values = slice.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1e-9);

  return slice.map((point) => ({
    delta: roundNumber(point.delta, 2),
    heightPercent: roundNumber(18 + (((point.value - min) / range) * 72), 1),
    tone: point.delta > 0 ? "bull" : point.delta < 0 ? "bear" : "neutral",
    value: roundNumber(point.value, 2),
  }));
}

export function buildTimingOrderFlowSnapshot(input = {}) {
  const points = Array.isArray(input.points) ? input.points : input.snapshot?.points;
  const lookback = Number.isInteger(input.lookback) && input.lookback > 5 ? input.lookback : 30;
  const series = computeCumulativeVolumeDelta(points);
  const candles = normalizeOrderFlowPoints(points);
  const sampleSize = candles.length;
  const latest = series[series.length - 1] ?? null;
  const deltas = series.map((point) => point.delta);
  const deltaMean = computeMean(deltas);
  const deltaStdDev = computeStdDev(deltas, deltaMean);
  const cvdChange = latest?.value ?? 0;
  const totalVolume = candles.reduce((acc, candle) => acc + candle.volume, 0);
  const cvdAbsorptionRatio = totalVolume > 0 ? Math.abs(cvdChange) / totalVolume : 0;
  const cvdDirection = cvdChange > deltaStdDev
    ? "accumulation"
    : cvdChange < -deltaStdDev
      ? "distribution"
      : "balanced";
  const cvdTone = cvdDirection === "accumulation" ? "bull" : cvdDirection === "distribution" ? "bear" : "neutral";
  const cvdLabel = cvdDirection === "accumulation"
    ? "Acumulacao"
    : cvdDirection === "distribution"
      ? "Distribuicao"
      : "Equilibrado";
  const volumes = candles.map((candle) => candle.volume).filter((volume) => volume > 0);
  const latestVolume = volumes[volumes.length - 1] ?? 0;
  const baseline = volumes.slice(Math.max(0, volumes.length - lookback - 1), Math.max(0, volumes.length - 1));
  const volumeMean = computeMean(baseline);
  const volumeStdDev = computeStdDev(baseline, volumeMean);
  const volumeReady = baseline.length >= 10 && volumeMean > 0 && volumeStdDev > 0;
  const volumeZScore = volumeReady ? (latestVolume - volumeMean) / volumeStdDev : 0;
  const volumeAnomaly = volumeReady && Math.abs(volumeZScore) >= 2;
  const volumeTone = !volumeReady
    ? "neutral"
    : volumeZScore >= 2
      ? "bull"
      : volumeZScore <= -2
        ? "bear"
        : "neutral";
  const volumeLabel = !volumeReady
    ? "Aquecendo"
    : volumeAnomaly
      ? volumeZScore > 0 ? "Anomalia positiva" : "Volume seco"
      : "Normal";

  return {
    cvd: {
      absorptionRatio: roundNumber(cvdAbsorptionRatio, 4),
      bandOneSigma: roundNumber(deltaStdDev, 2),
      change: roundNumber(cvdChange, 2),
      direction: cvdDirection,
      label: cvdLabel,
      latest: roundNumber(latest?.value ?? 0, 2),
      ready: sampleSize >= 3 && totalVolume > 0,
      sparkline: buildSparkline(series),
      tone: cvdTone,
    },
    sampleSize,
    totalVolume: roundNumber(totalVolume, 2),
    volume: {
      anomaly: volumeAnomaly,
      baselineSample: baseline.length,
      label: volumeLabel,
      latest: roundNumber(latestVolume, 2),
      mean: roundNumber(volumeMean, 2),
      ready: volumeReady,
      tone: volumeTone,
      zScore: roundNumber(volumeZScore, 2),
    },
  };
}