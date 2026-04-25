function toFiniteNumber(value, fallback = Number.NaN) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeCandle(point) {
  const close = toFiniteNumber(point?.close, toFiniteNumber(point?.price));
  const open = toFiniteNumber(point?.open, close);
  const high = toFiniteNumber(point?.high, Math.max(open, close));
  const low = toFiniteNumber(point?.low, Math.min(open, close));

  if (![open, high, low, close].every(Number.isFinite)) {
    return null;
  }

  return {
    close,
    high: Math.max(high, open, close),
    low: Math.min(low, open, close),
    open,
    volume: toFiniteNumber(point?.volume, 0),
  };
}

export function normalizeSmcCandles(points) {
  if (!Array.isArray(points)) {
    return [];
  }

  return points.map(normalizeCandle).filter((point) => point !== null);
}

function roundNumber(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function readTrend(input = {}) {
  const trend = String(input.analysis?.context?.trend ?? input.snapshot?.insights?.trend ?? "").toLowerCase();

  if (trend.includes("alta") || trend.includes("bull")) {
    return "bullish";
  }

  if (trend.includes("baixa") || trend.includes("bear")) {
    return "bearish";
  }

  return "neutral";
}

function readSignalTone(input = {}) {
  const tone = String(input.analysis?.signal?.tone ?? input.snapshot?.insights?.tradeAction ?? "neutral").toLowerCase();

  if (tone === "buy" || tone === "call" || tone === "bullish") {
    return "buy";
  }

  if (tone === "sell" || tone === "put" || tone === "bearish") {
    return "sell";
  }

  return "neutral";
}

function computeCandleRejection(candle) {
  if (!candle) {
    return {
      direction: "none",
      ok: false,
      wickRatio: 0,
    };
  }

  const range = Math.max(candle.high - candle.low, 1e-9);
  const body = Math.abs(candle.close - candle.open);
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const upperRatio = upperWick / range;
  const lowerRatio = lowerWick / range;
  const bodyRatio = body / range;

  if (lowerRatio >= 0.45 && lowerRatio >= upperRatio * 1.4 && bodyRatio <= 0.45) {
    return {
      direction: "bullish",
      ok: true,
      wickRatio: roundNumber(lowerRatio, 3),
    };
  }

  if (upperRatio >= 0.45 && upperRatio >= lowerRatio * 1.4 && bodyRatio <= 0.45) {
    return {
      direction: "bearish",
      ok: true,
      wickRatio: roundNumber(upperRatio, 3),
    };
  }

  return {
    direction: "none",
    ok: false,
    wickRatio: roundNumber(Math.max(upperRatio, lowerRatio), 3),
  };
}

function findRecentLiquiditySweep(candles, lookback = 20, recentWindow = 6) {
  if (candles.length < 4) {
    return {
      direction: "none",
      ok: false,
      referenceLevel: null,
      sweptAtIndex: -1,
    };
  }

  const startIndex = Math.max(1, candles.length - recentWindow);

  for (let index = candles.length - 1; index >= startIndex; index -= 1) {
    const previous = candles.slice(Math.max(0, index - lookback), index);

    if (previous.length < 3) {
      continue;
    }

    const referenceHigh = Math.max(...previous.map((candle) => candle.high));
    const referenceLow = Math.min(...previous.map((candle) => candle.low));
    const candle = candles[index];

    if (candle.high > referenceHigh && candle.close < referenceHigh) {
      return {
        direction: "bearish",
        ok: true,
        referenceLevel: referenceHigh,
        sweptAtIndex: index,
      };
    }

    if (candle.low < referenceLow && candle.close > referenceLow) {
      return {
        direction: "bullish",
        ok: true,
        referenceLevel: referenceLow,
        sweptAtIndex: index,
      };
    }
  }

  return {
    direction: "none",
    ok: false,
    referenceLevel: null,
    sweptAtIndex: -1,
  };
}

function findLatestFairValueGap(candles, lookback = 60) {
  if (candles.length < 3) {
    return {
      active: false,
      bias: "none",
      lower: null,
      mitigated: false,
      upper: null,
    };
  }

  const startIndex = Math.max(2, candles.length - lookback);
  let latestCandidate = null;

  for (let index = candles.length - 1; index >= startIndex; index -= 1) {
    const left = candles[index - 2];
    const right = candles[index];

    if (left.high < right.low) {
      const lower = left.high;
      const upper = right.low;
      const later = candles.slice(index + 1);
      const candidate = {
        active: true,
        bias: "bullish",
        lower,
        mitigated: later.some((candle) => candle.low <= upper),
        upper,
      };

      latestCandidate ??= candidate;

      if (candidate.mitigated) {
        return candidate;
      }
    }

    if (left.low > right.high) {
      const lower = right.high;
      const upper = left.low;
      const later = candles.slice(index + 1);
      const candidate = {
        active: true,
        bias: "bearish",
        lower,
        mitigated: later.some((candle) => candle.high >= lower),
        upper,
      };

      latestCandidate ??= candidate;

      if (candidate.mitigated) {
        return candidate;
      }
    }
  }

  return latestCandidate ?? {
    active: false,
    bias: "none",
    lower: null,
    mitigated: false,
    upper: null,
  };
}

export function deriveSmcConfluence(input = {}) {
  const points = Array.isArray(input.points) ? input.points : input.snapshot?.points;
  const candles = normalizeSmcCandles(points);
  const latestCandle = candles[candles.length - 1] ?? null;
  const signalTone = readSignalTone(input);
  const trendDirection = readTrend(input);
  const sweep = findRecentLiquiditySweep(candles);
  const fvg = findLatestFairValueGap(candles);
  const rejection = computeCandleRejection(latestCandle);
  const sweepAligned = sweep.ok && (
    signalTone === "neutral"
    || (signalTone === "buy" && sweep.direction === "bullish")
    || (signalTone === "sell" && sweep.direction === "bearish")
  );
  const fvgAligned = fvg.active && fvg.mitigated && (
    signalTone === "neutral"
    || (signalTone === "buy" && fvg.bias === "bullish")
    || (signalTone === "sell" && fvg.bias === "bearish")
  );
  const trendAligned = (signalTone === "buy" && trendDirection === "bullish")
    || (signalTone === "sell" && trendDirection === "bearish")
    || signalTone === "neutral";
  const fearGreedScore = toFiniteNumber(input.analysis?.fearGreed?.score, 50);
  const fearGreedOk = fearGreedScore > 15 && fearGreedScore < 85;
  const rangeLow = toFiniteNumber(input.analysis?.context?.rangeLow, Number.NaN);
  const rangeHigh = toFiniteNumber(input.analysis?.context?.rangeHigh, Number.NaN);
  const rangePct = rangeLow > 0 && rangeHigh > rangeLow
    ? ((rangeHigh - rangeLow) / rangeLow) * 100
    : 0;
  const volatilityOk = rangePct >= 0.5 && rangePct <= 15;
  const rejectionAligned = rejection.ok && (
    signalTone === "neutral"
    || (signalTone === "buy" && rejection.direction === "bullish")
    || (signalTone === "sell" && rejection.direction === "bearish")
  );

  return {
    candlesSample: candles.length,
    checks: {
      fearGreedOk,
      fvgAligned,
      rejectionAligned,
      sweepConfirmed: sweepAligned,
      trendAligned,
      volatilityOk,
    },
    fvg,
    rangePct: roundNumber(rangePct, 3),
    rejection,
    signalTone,
    sweep,
    trendDirection,
  };
}
