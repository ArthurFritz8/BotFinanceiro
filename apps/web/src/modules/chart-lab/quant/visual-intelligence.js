import { detectProbabilisticCandlePatterns } from "./probabilistic.js";

function clampNumber(value, minimum, maximum) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}


function toFiniteNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeDirectionalBias(value) {
  const normalized = String(value ?? "").toLowerCase();

  if (normalized === "buy" || normalized === "call" || normalized === "bull" || normalized === "bullish") {
    return "bull";
  }

  if (normalized === "sell" || normalized === "put" || normalized === "bear" || normalized === "bearish") {
    return "bear";
  }

  return "neutral";
}

function selectPrimaryCandlePattern(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return null;
  }

  const ranked = patterns
    .map((pattern) => {
      const occurrences = toFiniteNumber(pattern?.occurrences, 0);
      const winRate = toFiniteNumber(pattern?.winRatePercent, 50);
      const ready = Boolean(pattern?.ready);
      const edge = ready ? Math.abs(winRate - 50) : 0;
      return {
        ...pattern,
        occurrences,
        winRatePercent: ready ? winRate : null,
        ready,
        rankScore: ready ? edge + Math.min(occurrences, 20) : occurrences * 0.1,
      };
    })
    .sort((left, right) => right.rankScore - left.rankScore);

  return ranked[0] ?? null;
}

function classifyToneFromScore(score) {
  if (score >= 75) {
    return "bull";
  }

  if (score >= 50) {
    return "neutral";
  }

  return "bear";
}

function classifyDirectionalAlignment(signalBias, candleBias, harmonicBias) {
  const activeBiases = [candleBias, harmonicBias].filter((bias) => bias !== "neutral");
  if (signalBias === "neutral" || activeBiases.length === 0) {
    return {
      label: "Neutro",
      ok: false,
      tone: "neutral",
    };
  }

  const alignedCount = activeBiases.filter((bias) => bias === signalBias).length;
  if (alignedCount === activeBiases.length) {
    return {
      label: "Alinhado",
      ok: true,
      tone: signalBias === "bull" ? "bull" : "bear",
    };
  }

  if (alignedCount > 0) {
    return {
      label: "Parcial",
      ok: false,
      tone: "neutral",
    };
  }

  return {
    label: "Divergente",
    ok: false,
    tone: "bear",
  };
}

export function buildVisualIntelligenceEvidence(input = {}) {
  const points = Array.isArray(input.points) ? input.points : input.snapshot?.points;
  const candlePatterns = Array.isArray(input.candlePatterns)
    ? input.candlePatterns
    : detectProbabilisticCandlePatterns(points);
  const primaryCandle = selectPrimaryCandlePattern(candlePatterns);
  const harmonicScanner = input.harmonicScanner && typeof input.harmonicScanner === "object"
    ? input.harmonicScanner
    : null;
  const bestPattern = harmonicScanner?.bestPattern ?? null;
  const signalBias = normalizeDirectionalBias(input.analysis?.signal?.tone);
  const signalConfidence = clampNumber(toFiniteNumber(input.analysis?.signal?.confidence, 0), 0, 100);
  const signalRiskReward = toFiniteNumber(input.analysis?.signal?.riskReward, 0);
  const candleBias = primaryCandle?.ready ? normalizeDirectionalBias(primaryCandle.bias) : "neutral";
  const harmonicConfidence = clampNumber(toFiniteNumber(bestPattern?.confidence, 0), 0, 100);
  const harmonicBias = harmonicConfidence >= 60 ? normalizeDirectionalBias(harmonicScanner?.tone) : "neutral";
  const directional = classifyDirectionalAlignment(signalBias, candleBias, harmonicBias);
  const candleReady = Boolean(primaryCandle?.ready);
  const harmonicReady = harmonicConfidence >= 60;
  const signalReady = signalConfidence >= 50;
  const executionReady = directional.ok && signalReady && (signalRiskReward >= 1.2 || harmonicReady);

  const checks = [
    {
      id: "candle",
      label: "Candle estatistico pronto",
      ok: candleReady,
      detail: candleReady
        ? `${primaryCandle.label}: ${primaryCandle.occurrences} ocorrencias, win rate ${primaryCandle.winRatePercent}%`
        : `${primaryCandle?.label ?? "Padrao"}: ${primaryCandle?.occurrences ?? 0} ocorrencias, minimo 5`,
    },
    {
      id: "harmonic",
      label: "Geometria harmonica ativa",
      ok: harmonicReady,
      detail: bestPattern
        ? `${bestPattern.name}: ${harmonicConfidence}% (${bestPattern.state?.label ?? "n/d"})`
        : "Sem padrao harmonico ranqueado",
    },
    {
      id: "direction",
      label: "Bias visual alinhado ao sinal",
      ok: directional.ok,
      detail: `sinal=${signalBias}; candle=${candleBias}; harmonico=${harmonicBias}`,
    },
    {
      id: "signal",
      label: "Confianca operacional suficiente",
      ok: signalReady,
      detail: `confianca=${signalConfidence.toFixed(0)}%; R:R=${signalRiskReward > 0 ? signalRiskReward.toFixed(2) : "n/d"}`,
    },
  ];

  const score = Math.round((checks.filter((check) => check.ok).length / checks.length) * 100);
  const tone = classifyToneFromScore(score);
  const verdict = score >= 75
    ? { label: "Setup visual ativo", tone, detail: "Candle, geometria e sinal operam na mesma direcao." }
    : score >= 50
      ? { label: "Confluencia visual parcial", tone, detail: "Ha evidencia tecnica, mas falta confirmacao completa." }
      : { label: "Aguardar leitura visual", tone, detail: "Evidencia insuficiente para validar gatilho visual." };

  return {
    cards: [
      {
        id: "candle",
        label: "Candle estatistico",
        value: candleReady ? `${primaryCandle.winRatePercent}%` : `${primaryCandle?.occurrences ?? 0}x`,
        tone: candleReady ? (candleBias === "bull" ? "bull" : candleBias === "bear" ? "bear" : "neutral") : "empty",
        detail: candleReady
          ? `${primaryCandle.label} com ${primaryCandle.occurrences} ocorrencias historicas`
          : `${primaryCandle?.label ?? "Sem padrao"} ainda sem amostra minima`,
        audit: candleReady ? `bias=${candleBias}; ready=true` : "ready=false; minimo=5 ocorrencias",
      },
      {
        id: "harmonic",
        label: "Geometria XABCD",
        value: bestPattern ? `${harmonicConfidence}%` : "n/d",
        tone: harmonicReady ? "bull" : bestPattern ? "neutral" : "empty",
        detail: bestPattern ? `${bestPattern.name} - ${bestPattern.state?.label ?? "n/d"}` : "Sem geometria ranqueada",
        audit: bestPattern ? `XD=${bestPattern.ratiosValidation?.XD?.status ?? "pending"}; confluencia=${harmonicScanner?.confluenceCount ?? 0}` : "scanner vazio",
      },
      {
        id: "direction",
        label: "Alinhamento visual",
        value: directional.label,
        tone: directional.tone,
        detail: `Sinal ${signalBias}; candle ${candleBias}; harmonico ${harmonicBias}`,
        audit: directional.ok ? "sem divergencia direcional" : "aguardando alinhamento total",
      },
      {
        id: "execution",
        label: "Gatilho visual",
        value: executionReady ? "Validado" : "Aguardar",
        tone: executionReady ? directional.tone : "neutral",
        detail: executionReady ? "Confianca e risco/recompensa suficientes" : "Sem confirmacao visual completa",
        audit: `score=${score}; signalConfidence=${signalConfidence.toFixed(0)}; rr=${signalRiskReward > 0 ? signalRiskReward.toFixed(2) : "n/d"}`,
      },
    ],
    checks,
    harmonic: {
      bias: harmonicBias,
      confidence: harmonicConfidence,
      pattern: bestPattern?.name ?? "n/d",
    },
    primaryCandle,
    sampleSize: Array.isArray(points) ? points.length : 0,
    score,
    signal: {
      bias: signalBias,
      confidence: signalConfidence,
      riskReward: signalRiskReward,
    },
    verdict,
  };
}