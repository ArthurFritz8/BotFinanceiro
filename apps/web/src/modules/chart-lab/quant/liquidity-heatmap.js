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

export function normalizeLiquidityHeatmapCandles(points) {
  if (!Array.isArray(points)) {
    return [];
  }

  return points.map(normalizeCandle).filter((point) => point !== null);
}

function createBuckets(low, high, bucketCount) {
  const step = (high - low) / bucketCount;
  return Array.from({ length: bucketCount }, (_, index) => {
    const bottom = low + (step * index);
    const top = index === bucketCount - 1 ? high : bottom + step;
    return {
      bottom,
      center: (bottom + top) / 2,
      closeTouches: 0,
      highTouches: 0,
      index,
      lowTouches: 0,
      score: 0,
      top,
      touchCount: 0,
      volumeWeight: 0,
    };
  });
}

function bucketIndexForPrice(price, low, step, bucketCount) {
  if (!Number.isFinite(price) || step <= 0) {
    return -1;
  }

  return clampNumber(Math.floor((price - low) / step), 0, bucketCount - 1);
}

function addBucketTouch(bucket, key, weight) {
  bucket[key] += 1;
  bucket.touchCount += 1;
  bucket.score += weight;
  bucket.volumeWeight += weight;
}

function classifySide(center, currentPrice, step) {
  if (!Number.isFinite(currentPrice)) {
    return "neutral";
  }

  if (center > currentPrice + (step * 0.35)) {
    return "buy-side";
  }

  if (center < currentPrice - (step * 0.35)) {
    return "sell-side";
  }

  return "current";
}

function toneForSide(side) {
  if (side === "buy-side") return "bear";
  if (side === "sell-side") return "bull";
  return "neutral";
}

function labelForSide(side, strength) {
  const pct = Math.round(strength * 100);
  if (side === "buy-side") return `BSL ${pct}%`;
  if (side === "sell-side") return `SSL ${pct}%`;
  return `LIQ ${pct}%`;
}

function rgbaForTone(tone, alpha) {
  if (tone === "bull") return `rgba(16, 185, 129, ${alpha.toFixed(3)})`;
  if (tone === "bear") return `rgba(239, 68, 68, ${alpha.toFixed(3)})`;
  return `rgba(148, 163, 184, ${alpha.toFixed(3)})`;
}

function labelColorForTone(tone) {
  if (tone === "bull") return "#6ee7b7";
  if (tone === "bear") return "#fca5a5";
  return "#cbd5e1";
}

function densityLabel(strength) {
  if (strength >= 0.75) return "Alta";
  if (strength >= 0.5) return "Media";
  return "Baixa";
}

function selectTopBuckets(buckets, maxZones) {
  const ranked = buckets
    .filter((bucket) => bucket.score > 0 && bucket.touchCount >= 2)
    .sort((left, right) => right.score - left.score);
  const selected = [];

  for (const bucket of ranked) {
    if (selected.some((candidate) => Math.abs(candidate.index - bucket.index) <= 1)) {
      continue;
    }
    selected.push(bucket);
    if (selected.length >= maxZones) {
      break;
    }
  }

  return selected;
}

export function buildLiquidityHeatmapSnapshot(input = {}) {
  const points = Array.isArray(input.points) ? input.points : input.snapshot?.points;
  const candles = normalizeLiquidityHeatmapCandles(points);
  const sampleSize = candles.length;
  const bucketCount = Number.isInteger(input.bucketCount) && input.bucketCount >= 8 ? input.bucketCount : 18;
  const maxZones = Number.isInteger(input.maxZones) && input.maxZones > 0 ? input.maxZones : 5;
  const currentPrice = toFiniteNumber(
    input.currentPrice,
    toFiniteNumber(input.snapshot?.insights?.currentPrice, candles[candles.length - 1]?.close),
  );

  if (sampleSize < 8) {
    return {
      buckets: [],
      nearestAbove: null,
      nearestBelow: null,
      range: null,
      ready: false,
      sampleSize,
      zones: [],
    };
  }

  const rangeLow = Math.min(...candles.map((candle) => candle.low));
  const rangeHigh = Math.max(...candles.map((candle) => candle.high));
  const range = rangeHigh - rangeLow;

  if (!Number.isFinite(range) || range <= 0) {
    return {
      buckets: [],
      nearestAbove: null,
      nearestBelow: null,
      range: null,
      ready: false,
      sampleSize,
      zones: [],
    };
  }

  const buckets = createBuckets(rangeLow, rangeHigh, bucketCount);
  const step = range / bucketCount;
  const volumeMean = candles.reduce((acc, candle) => acc + candle.volume, 0) / sampleSize;

  for (const candle of candles) {
    const safeVolumeMean = volumeMean > 0 ? volumeMean : 1;
    const volumeWeight = 1 + (clampNumber(candle.volume / safeVolumeMean, 0, 4) * 0.22);
    const bodyHigh = Math.max(candle.open, candle.close);
    const bodyLow = Math.min(candle.open, candle.close);
    const rangeSize = Math.max(candle.high - candle.low, 1e-9);
    const upperWickRatio = (candle.high - bodyHigh) / rangeSize;
    const lowerWickRatio = (bodyLow - candle.low) / rangeSize;
    const highBucket = buckets[bucketIndexForPrice(candle.high, rangeLow, step, bucketCount)];
    const lowBucket = buckets[bucketIndexForPrice(candle.low, rangeLow, step, bucketCount)];
    const closeBucket = buckets[bucketIndexForPrice(candle.close, rangeLow, step, bucketCount)];

    if (highBucket) {
      addBucketTouch(highBucket, "highTouches", (1.2 + upperWickRatio) * volumeWeight);
    }
    if (lowBucket) {
      addBucketTouch(lowBucket, "lowTouches", (1.2 + lowerWickRatio) * volumeWeight);
    }
    if (closeBucket) {
      addBucketTouch(closeBucket, "closeTouches", 0.35 * volumeWeight);
    }
  }

  const maxScore = Math.max(...buckets.map((bucket) => bucket.score), 1);
  const selectedBuckets = selectTopBuckets(buckets, maxZones);
  const enrichedZones = selectedBuckets
    .map((bucket) => {
      const strength = clampNumber(bucket.score / maxScore, 0, 1);
      const side = classifySide(bucket.center, currentPrice, step);
      const tone = toneForSide(side);
      const fillAlpha = 0.065 + (strength * 0.17);
      const strokeAlpha = 0.28 + (strength * 0.36);

      return {
        bottom: roundNumber(bucket.bottom, 8),
        center: roundNumber(bucket.center, 8),
        density: densityLabel(strength),
        distancePercent: currentPrice > 0 ? roundNumber(((bucket.center - currentPrice) / currentPrice) * 100, 3) : null,
        fill: rgbaForTone(tone, fillAlpha),
        highTouches: bucket.highTouches,
        label: labelForSide(side, strength),
        labelColor: labelColorForTone(tone),
        lowTouches: bucket.lowTouches,
        side,
        strength: roundNumber(strength, 3),
        stroke: rgbaForTone(tone, strokeAlpha),
        tone,
        top: roundNumber(bucket.top, 8),
        touchCount: bucket.touchCount,
        volumeWeight: roundNumber(bucket.volumeWeight, 2),
      };
    })
    .sort((left, right) => right.strength - left.strength);

  const nearestAbove = enrichedZones
    .filter((zone) => zone.side === "buy-side")
    .sort((left, right) => Math.abs(left.distancePercent) - Math.abs(right.distancePercent))[0] ?? null;
  const nearestBelow = enrichedZones
    .filter((zone) => zone.side === "sell-side")
    .sort((left, right) => Math.abs(left.distancePercent) - Math.abs(right.distancePercent))[0] ?? null;

  return {
    buckets: buckets.map((bucket) => ({
      bottom: roundNumber(bucket.bottom, 8),
      center: roundNumber(bucket.center, 8),
      highTouches: bucket.highTouches,
      lowTouches: bucket.lowTouches,
      score: roundNumber(bucket.score, 3),
      strength: roundNumber(bucket.score / maxScore, 3),
      top: roundNumber(bucket.top, 8),
      touchCount: bucket.touchCount,
    })),
    currentPrice: roundNumber(currentPrice, 8),
    nearestAbove,
    nearestBelow,
    range: {
      high: roundNumber(rangeHigh, 8),
      low: roundNumber(rangeLow, 8),
      step: roundNumber(step, 8),
    },
    ready: enrichedZones.length > 0,
    sampleSize,
    zones: enrichedZones,
  };
}