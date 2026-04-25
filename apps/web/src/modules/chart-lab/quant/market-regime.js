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

function normalizeCandle(point) {
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

export function normalizeMarketRegimeCandles(points) {
  if (!Array.isArray(points)) {
    return [];
  }

  return points.map(normalizeCandle).filter((point) => point !== null);
}

function mean(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function stdDev(values, average) {
  if (!Array.isArray(values) || values.length < 2) {
    return 0;
  }

  const variance = values.reduce((acc, value) => acc + ((value - average) ** 2), 0) / Math.max(values.length - 1, 1);
  return Math.sqrt(variance);
}

function computeEfficiencyRatio(candles) {
  if (!Array.isArray(candles) || candles.length < 2) {
    return 0;
  }

  const firstClose = candles[0]?.close;
  const lastClose = candles[candles.length - 1]?.close;
  if (!Number.isFinite(firstClose) || !Number.isFinite(lastClose)) {
    return 0;
  }

  let path = 0;
  for (let index = 1; index < candles.length; index += 1) {
    path += Math.abs(candles[index].close - candles[index - 1].close);
  }

  return path > 0 ? clampNumber(Math.abs(lastClose - firstClose) / path, 0, 1) : 0;
}

function computeTrueRanges(candles) {
  return candles.map((candle, index) => {
    const previousClose = index > 0 ? candles[index - 1].close : candle.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });
}

function normalizeFlowTone(orderFlow) {
  const tone = String(orderFlow?.cvd?.tone ?? orderFlow?.cvd?.direction ?? "neutral").toLowerCase();
  if (tone === "bull" || tone === "accumulation") return "bull";
  if (tone === "bear" || tone === "distribution") return "bear";
  return "neutral";
}

function buildEmptySnapshot(sampleSize, minSample) {
  return {
    checks: [],
    direction: "neutral",
    executionMode: "Aguardar dados",
    guidance: "Aguardando OHLCV suficiente para classificar o regime com honestidade.",
    key: "warming",
    label: "Aquecendo",
    metrics: {
      avgTrueRangePercent: 0,
      efficiencyRatio: 0,
      trendSlopePercent: 0,
      volumeZScore: 0,
    },
    ready: false,
    riskMultiplier: 0,
    sampleSize,
    score: 0,
    tone: "neutral",
    warmupTarget: minSample,
  };
}

function resolveRegime({ absSlope, efficiencyRatio, volatilityPercent, volumeZScore }) {
  const stressActive = volatilityPercent >= 5 || (volatilityPercent >= 3.2 && volumeZScore >= 1.8);
  if (stressActive) {
    return {
      executionMode: "Defensivo",
      guidance: "Reducao de tamanho e confirmacao extra antes de executar.",
      key: "stress",
      label: "Stress / Expansao",
      riskMultiplier: 0.35,
      tone: "danger",
    };
  }

  if (efficiencyRatio >= 0.48 && absSlope >= 0.75) {
    return {
      executionMode: "Seguir fluxo",
      guidance: "Priorize pullbacks rasos e evite operar contra a direcao dominante.",
      key: "trend",
      label: "Tendencia Institucional",
      riskMultiplier: 0.85,
      tone: "neutral",
    };
  }

  if (volatilityPercent <= 1.15 && efficiencyRatio <= 0.36) {
    return {
      executionMode: "Aguardar ruptura",
      guidance: "Compressao ativa: espere rompimento confirmado ou sweep em extremo.",
      key: "squeeze",
      label: "Squeeze / Compressao",
      riskMultiplier: 0.5,
      tone: "cool",
    };
  }

  return {
    executionMode: "Operar extremos",
    guidance: "Range predominante: prefira liquidez de topo/fundo e rejeicao clara.",
    key: "range",
    label: "Range / Mean Reversion",
    riskMultiplier: 0.65,
    tone: "neutral",
  };
}

export function buildMarketRegimeSnapshot(input = {}) {
  const snapshot = input.snapshot ?? {};
  const points = Array.isArray(input.points) ? input.points : snapshot.points;
  const candles = normalizeMarketRegimeCandles(points);
  const sampleSize = candles.length;
  const minSample = Number.isInteger(input.minSample) && input.minSample >= 8 ? input.minSample : 12;

  if (sampleSize < minSample) {
    return buildEmptySnapshot(sampleSize, minSample);
  }

  const lookback = clampNumber(Number.isInteger(input.lookback) ? input.lookback : 28, minSample, 64);
  const recentCandles = candles.slice(-lookback);
  const firstClose = recentCandles[0].close;
  const lastClose = recentCandles[recentCandles.length - 1].close;
  const currentPrice = toFiniteNumber(input.currentPrice, toFiniteNumber(snapshot?.insights?.currentPrice, lastClose));
  const trendSlopePercent = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0;
  const absSlope = Math.abs(trendSlopePercent);
  const efficiencyRatio = computeEfficiencyRatio(recentCandles);
  const trueRanges = computeTrueRanges(recentCandles);
  const avgTrueRangePercent = currentPrice > 0 ? (mean(trueRanges) / currentPrice) * 100 : 0;
  const insightsVolatilityPercent = toFiniteNumber(input.volatilityPercent, toFiniteNumber(snapshot?.insights?.volatilityPercent, 0));
  const volatilityPercent = Math.max(avgTrueRangePercent, insightsVolatilityPercent);
  const volumes = recentCandles.map((candle) => candle.volume).filter((volume) => volume > 0);
  const latestVolume = volumes[volumes.length - 1] ?? 0;
  const volumeBaseline = volumes.slice(0, -1);
  const volumeMean = mean(volumeBaseline);
  const volumeStdDev = stdDev(volumeBaseline, volumeMean);
  const volumeReady = volumeBaseline.length >= 10 && volumeMean > 0 && volumeStdDev > 0;
  const volumeZScore = volumeReady ? (latestVolume - volumeMean) / volumeStdDev : 0;
  const direction = trendSlopePercent >= 0.35 ? "bullish" : trendSlopePercent <= -0.35 ? "bearish" : "neutral";
  const flowTone = normalizeFlowTone(input.orderFlow);
  const flowAligned = direction === "neutral"
    ? flowTone === "neutral"
    : (direction === "bullish" && flowTone === "bull") || (direction === "bearish" && flowTone === "bear");
  const regime = resolveRegime({ absSlope, efficiencyRatio, volatilityPercent, volumeZScore });
  const directionalTone = regime.key === "trend"
    ? direction === "bearish" ? "bear" : "bull"
    : regime.tone;
  const trendScore = clampNumber((efficiencyRatio * 70) + Math.min(absSlope * 8, 30), 0, 100);
  const stressScore = clampNumber((volatilityPercent * 11) + Math.max(volumeZScore, 0) * 10, 0, 100);
  const squeezeScore = clampNumber((1 - efficiencyRatio) * 62 + Math.max(0, 1.2 - volatilityPercent) * 20, 0, 100);
  const rangeScore = clampNumber((1 - efficiencyRatio) * 68 + Math.max(0, 1.8 - volatilityPercent) * 8, 0, 100);
  const score = regime.key === "stress"
    ? stressScore
    : regime.key === "trend"
      ? trendScore
      : regime.key === "squeeze"
        ? squeezeScore
        : rangeScore;

  return {
    checks: [
      {
        detail: `ER ${roundNumber(efficiencyRatio, 3)} / slope ${roundNumber(trendSlopePercent, 2)}%`,
        id: "directionality",
        label: "Direcionalidade",
        ok: trendScore >= 55,
      },
      {
        detail: `ATR proxy ${roundNumber(volatilityPercent, 2)}%`,
        id: "volatility",
        label: "Volatilidade operavel",
        ok: regime.key !== "stress",
      },
      {
        detail: `CVD ${flowTone}`,
        id: "flow",
        label: "Fluxo confirma",
        ok: flowAligned,
      },
      {
        detail: `Volume z ${roundNumber(volumeZScore, 2)}σ`,
        id: "volume",
        label: "Volume sem choque",
        ok: Math.abs(volumeZScore) < 2,
      },
    ],
    direction,
    executionMode: regime.executionMode,
    guidance: regime.guidance,
    key: regime.key,
    label: regime.label,
    metrics: {
      avgTrueRangePercent: roundNumber(avgTrueRangePercent, 3),
      efficiencyRatio: roundNumber(efficiencyRatio, 3),
      trendSlopePercent: roundNumber(trendSlopePercent, 3),
      volatilityPercent: roundNumber(volatilityPercent, 3),
      volumeZScore: roundNumber(volumeZScore, 3),
    },
    ready: true,
    riskMultiplier: regime.riskMultiplier,
    sampleSize,
    score: roundNumber(score, 1),
    tone: directionalTone,
    warmupTarget: minSample,
  };
}