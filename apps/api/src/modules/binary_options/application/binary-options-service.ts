import { z } from "zod";

import {
  resolveBinanceSymbol,
} from "../../../integrations/market_data/binance-market-data-adapter.js";
import { env } from "../../../shared/config/env.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { retryWithExponentialBackoff } from "../../../shared/resilience/retry-with-backoff.js";

const supportedRangeSchema = z.enum(["24h", "7d", "30d", "90d", "1y"]);
const supportedModeSchema = z.enum(["delayed", "live"]);
const supportedExchangeSchema = z.enum(["auto", "binance", "bybit", "coinbase", "kraken", "okx"]);
const supportedResolutionSchema = z.enum([
  "1T",
  "10T",
  "100T",
  "1000T",
  "10R",
  "100R",
  "1000R",
  "1S",
  "5S",
  "10S",
  "15S",
  "30S",
  "45S",
  "1",
  "2",
  "3",
  "5",
  "10",
  "15",
  "30",
  "45",
  "60",
  "120",
  "180",
  "240",
  "D",
  "W",
  "M",
]);

const strategyInputSchema = z.object({
  assetId: z.string().trim().min(1).transform((value) => value.toLowerCase()),
  exchange: supportedExchangeSchema.default("binance"),
  mode: supportedModeSchema.default("delayed"),
  range: supportedRangeSchema.default("24h"),
  resolution: supportedResolutionSchema.default("1S"),
});

const tickerSchema = z.object({
  lastPrice: z.string(),
  priceChangePercent: z.string().optional(),
  symbol: z.string().trim().min(1),
  volume: z.string().optional(),
});

const oneSecondMs = 1000;
const oneMinuteMs = 60 * oneSecondMs;
const oneHourMs = 60 * oneMinuteMs;
const oneDayMs = 24 * oneHourMs;

const klinePlanByResolution = {
  "1": {
    sourceInterval: "1m",
    sourceIntervalMs: oneMinuteMs,
    targetIntervalMs: oneMinuteMs,
  },
  "10": {
    sourceInterval: "5m",
    sourceIntervalMs: 5 * oneMinuteMs,
    targetIntervalMs: 10 * oneMinuteMs,
  },
  "120": {
    sourceInterval: "2h",
    sourceIntervalMs: 2 * oneHourMs,
    targetIntervalMs: 2 * oneHourMs,
  },
  "15": {
    sourceInterval: "15m",
    sourceIntervalMs: 15 * oneMinuteMs,
    targetIntervalMs: 15 * oneMinuteMs,
  },
  "180": {
    sourceInterval: "1h",
    sourceIntervalMs: oneHourMs,
    targetIntervalMs: 3 * oneHourMs,
  },
  "2": {
    sourceInterval: "1m",
    sourceIntervalMs: oneMinuteMs,
    targetIntervalMs: 2 * oneMinuteMs,
  },
  "240": {
    sourceInterval: "4h",
    sourceIntervalMs: 4 * oneHourMs,
    targetIntervalMs: 4 * oneHourMs,
  },
  "3": {
    sourceInterval: "3m",
    sourceIntervalMs: 3 * oneMinuteMs,
    targetIntervalMs: 3 * oneMinuteMs,
  },
  "30": {
    sourceInterval: "30m",
    sourceIntervalMs: 30 * oneMinuteMs,
    targetIntervalMs: 30 * oneMinuteMs,
  },
  "45": {
    sourceInterval: "15m",
    sourceIntervalMs: 15 * oneMinuteMs,
    targetIntervalMs: 45 * oneMinuteMs,
  },
  "5": {
    sourceInterval: "5m",
    sourceIntervalMs: 5 * oneMinuteMs,
    targetIntervalMs: 5 * oneMinuteMs,
  },
  "60": {
    sourceInterval: "1h",
    sourceIntervalMs: oneHourMs,
    targetIntervalMs: oneHourMs,
  },
  D: {
    sourceInterval: "1d",
    sourceIntervalMs: oneDayMs,
    targetIntervalMs: oneDayMs,
  },
  M: {
    sourceInterval: "1M",
    sourceIntervalMs: 30 * oneDayMs,
    targetIntervalMs: 30 * oneDayMs,
  },
  W: {
    sourceInterval: "1w",
    sourceIntervalMs: 7 * oneDayMs,
    targetIntervalMs: 7 * oneDayMs,
  },
} as const;

type BinaryOptionsRange = z.infer<typeof supportedRangeSchema>;
type BinaryOptionsMode = z.infer<typeof supportedModeSchema>;
export type BinaryOptionsResolution = z.infer<typeof supportedResolutionSchema>;
type BinaryOptionsExchange = z.infer<typeof supportedExchangeSchema>;
type BinaryOptionsKlineResolution = keyof typeof klinePlanByResolution;

type BinaryTrend = "bearish" | "bullish" | "sideways";
type BinaryTradeAction = "buy" | "sell" | "wait";
type BinaryMarketStructureSignal = "bearish" | "bullish" | "none";
type BinaryMarketStructureBias = "bearish" | "bullish" | "neutral";
type BinaryMarketSessionLabel = "asia" | "london" | "new_york" | "off_session" | "overlap";
type BinaryMarketLiquidityHeat = "high" | "low" | "medium";
type BinarySmcConfluenceTier = "high" | "low" | "medium";
type BinaryCandlePatternSignal = "bearish" | "bullish" | "neutral";
type BinaryCandlePattern =
  | "bearish_engulfing"
  | "bearish_pinbar"
  | "bullish_engulfing"
  | "bullish_pinbar"
  | "none";
type BinaryRejectionSignal = "bearish" | "bullish" | "none";
type BinaryBollingerTouch = "inside" | "lower" | "upper";
type BinaryInstitutionalPoiTag = "cluster" | "midnight_open" | "none" | "previous_high" | "previous_low";
type BinaryKineticExhaustionState = "cooling" | "explosive" | "neutral";

interface RetryableErrorDetails {
  retryable?: boolean;
}

interface BinaryAggTrade {
  price: number;
  quantity: number;
  timestampMs: number;
}

interface BinaryTickerSnapshot {
  changePercent24h: number | null;
  lastPrice: number | null;
  symbol: string;
  volume24h: number | null;
}

interface TickResolutionPlan {
  kind: "tick";
  tickSize: number;
}

interface TimeResolutionPlan {
  intervalMs: number;
  kind: "time";
  source: "agg_trades" | "klines";
  sourceInterval?: string;
  sourceIntervalMs?: number;
}

type ResolutionPlan = TickResolutionPlan | TimeResolutionPlan;

interface BollingerBandsSnapshot {
  bandwidthPercent: number;
  lower: number;
  middle: number;
  upper: number;
}

interface CandlePatternSnapshot {
  pattern: BinaryCandlePattern;
  signal: BinaryCandlePatternSignal;
  strength: number;
}

interface KineticExhaustionSnapshot {
  accelerationPercentPerSecond2: number;
  decelerationStrength: number;
  explosiveAgainstBand: boolean;
  isAbruptDeceleration: boolean;
  state: BinaryKineticExhaustionState;
  velocityNow: number;
}

interface InstitutionalPoiContext {
  hit: boolean;
  sideBias: BinaryMarketStructureSignal;
  tag: BinaryInstitutionalPoiTag;
}

export interface BinaryOptionsChartPoint {
  close: number;
  high: number;
  low: number;
  open: number;
  timestamp: string;
  volume: number | null;
}

export interface BinaryOptionsTradeLevels {
  entryZoneHigh: number;
  entryZoneLow: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
}

export interface BinaryOptionsMarketStructure {
  bias: BinaryMarketStructureBias;
  bosSignal: BinaryMarketStructureSignal;
  chochSignal: BinaryMarketStructureSignal;
  lastSwingHigh: number;
  lastSwingLow: number;
  previousSwingHigh: number | null;
  previousSwingLow: number | null;
  swingRangePercent: number;
}

export interface BinaryOptionsMarketSession {
  liquidityHeat: BinaryMarketLiquidityHeat;
  session: BinaryMarketSessionLabel;
  utcHour: number;
  utcWindow: string;
}

export interface BinaryOptionsSmcConfluence {
  components: {
    marketStructure: number;
    sessionLiquidity: number;
    volatilityRegime: number;
  };
  score: number;
  tier: BinarySmcConfluenceTier;
}

export interface BinaryOptionsChartInsights {
  atrPercent: number;
  bollingerBandwidthPercent: number;
  bollingerLower: number;
  bollingerMiddle: number;
  bollingerTouch: BinaryBollingerTouch;
  bollingerUpper: number;
  candlePattern: BinaryCandlePattern;
  candlePatternSignal: BinaryCandlePatternSignal;
  candlePatternStrength: number;
  changePercent: number;
  confidenceScore: number;
  currentPrice: number;
  emaFast: number;
  emaSlow: number;
  highPrice: number;
  institutionalPoiHit: boolean;
  institutionalPoiTag: BinaryInstitutionalPoiTag;
  kineticAccelerationPercentPerSecond2: number;
  kineticDecelerationStrength: number;
  kineticExhaustionState: BinaryKineticExhaustionState;
  longMovingAverage: number;
  lowPrice: number;
  macdHistogram: number;
  marketSession: BinaryOptionsMarketSession;
  marketStructure: BinaryOptionsMarketStructure;
  momentumPercent: number;
  momentumVelocityPercentPerSecond: number;
  rejectionSignal: BinaryRejectionSignal;
  resistanceLevel: number;
  rsi14: number | null;
  shortMovingAverage: number;
  smcConfluence: BinaryOptionsSmcConfluence;
  supportLevel: number;
  tradeAction: BinaryTradeAction;
  tradeLevels: BinaryOptionsTradeLevels;
  trend: BinaryTrend;
  volatilityPercent: number;
}

export interface BinaryOptionsLiveSnapshot {
  changePercent24h: number | null;
  source: "binance";
  symbol: string;
  volume24h: number | null;
}

export interface BinaryOptionsStrategySnapshot {
  assetId: string;
  cache: {
    stale: false;
    state: "refreshed";
  };
  currency: "usd";
  exchange: {
    fallbackActive: boolean;
    requested: BinaryOptionsExchange;
    resolved: "binance";
  };
  fallbackReason: string;
  fetchedAt: string;
  insights: BinaryOptionsChartInsights;
  live: BinaryOptionsLiveSnapshot | null;
  mode: BinaryOptionsMode;
  points: BinaryOptionsChartPoint[];
  provider: "binance";
  range: BinaryOptionsRange;
  resolution: BinaryOptionsResolution;
  strategy: "binary_options";
  symbol: string;
}

function hasRetryableFlag(details: unknown): details is RetryableErrorDetails {
  if (typeof details !== "object" || details === null) {
    return false;
  }

  const detailsRecord = details as Record<string, unknown>;
  return typeof detailsRecord.retryable === "boolean";
}

function isRetryableStatusCode(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

function shouldRetryBinanceRequest(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return true;
  }

  if (error.code === "BINARY_OPTIONS_BINANCE_UNAVAILABLE") {
    return true;
  }

  if (error.code === "BINARY_OPTIONS_BINANCE_BAD_STATUS" && hasRetryableFlag(error.details)) {
    return error.details.retryable === true;
  }

  return false;
}

function parseNumericString(value: string | undefined): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function roundPrice(value: number): number {
  if (value >= 1000) {
    return Number(value.toFixed(2));
  }

  if (value >= 1) {
    return Number(value.toFixed(4));
  }

  return Number(value.toFixed(8));
}

function roundPercent(value: number): number {
  return Number(value.toFixed(2));
}

function roundMicroPercent(value: number): number {
  return Number(value.toFixed(5));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function computeAverage(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sum = values.reduce((accumulator, value) => accumulator + value, 0);
  return sum / values.length;
}

function computeSimpleMovingAverage(values: number[], period: number): number {
  if (values.length === 0) {
    return 0;
  }

  const windowValues = values.slice(-period);
  return computeAverage(windowValues);
}

function computeStandardDeviation(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }

  const average = computeAverage(values);
  const variance = computeAverage(values.map((value) => (value - average) ** 2));

  return Math.sqrt(variance);
}

function computeReturns(prices: number[]): number[] {
  const returns: number[] = [];

  for (let index = 1; index < prices.length; index += 1) {
    const previousPrice = prices[index - 1] ?? 0;
    const currentPrice = prices[index] ?? 0;

    if (previousPrice <= 0) {
      continue;
    }

    returns.push((currentPrice - previousPrice) / previousPrice);
  }

  return returns;
}

function computeEma(values: number[], period: number): number {
  if (values.length === 0) {
    return 0;
  }

  const smoothing = 2 / (period + 1);
  let ema = values[0] ?? 0;

  for (let index = 1; index < values.length; index += 1) {
    const value = values[index] ?? ema;
    ema = value * smoothing + ema * (1 - smoothing);
  }

  return ema;
}

function computeEmaSeries(values: number[], period: number): number[] {
  if (values.length === 0) {
    return [];
  }

  const smoothing = 2 / (period + 1);
  const series: number[] = [];
  let ema = values[0] ?? 0;
  series.push(ema);

  for (let index = 1; index < values.length; index += 1) {
    const value = values[index] ?? ema;
    ema = value * smoothing + ema * (1 - smoothing);
    series.push(ema);
  }

  return series;
}

function computeRsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) {
    return null;
  }

  let gains = 0;
  let losses = 0;

  for (let index = values.length - period; index < values.length; index += 1) {
    const currentPrice = values[index] ?? 0;
    const previousPrice = values[index - 1] ?? currentPrice;
    const delta = currentPrice - previousPrice;

    if (delta > 0) {
      gains += delta;
    } else {
      losses += Math.abs(delta);
    }
  }

  if (losses === 0) {
    return 100;
  }

  const relativeStrength = gains / losses;
  const rsi = 100 - 100 / (1 + relativeStrength);
  return Number.isFinite(rsi) ? roundPercent(rsi) : null;
}

function computeAtrPercent(points: BinaryOptionsChartPoint[], period = 14): number {
  if (points.length < 2) {
    return 0;
  }

  const recentPoints = points.slice(-(period + 1));
  const trueRanges: number[] = [];

  for (let index = 1; index < recentPoints.length; index += 1) {
    const currentPoint = recentPoints[index];
    const previousPoint = recentPoints[index - 1];

    if (!currentPoint || !previousPoint) {
      continue;
    }

    const highLow = currentPoint.high - currentPoint.low;
    const highClose = Math.abs(currentPoint.high - previousPoint.close);
    const lowClose = Math.abs(currentPoint.low - previousPoint.close);
    trueRanges.push(Math.max(highLow, highClose, lowClose));
  }

  const atr = computeAverage(trueRanges);
  const lastPoint = recentPoints[recentPoints.length - 1];

  if (!lastPoint || lastPoint.close <= 0) {
    return 0;
  }

  return roundPercent((atr / lastPoint.close) * 100);
}

function computeMomentumVelocityPercentPerSecond(
  points: BinaryOptionsChartPoint[],
  sampleSize = 14,
): number {
  if (points.length < 2) {
    return 0;
  }

  const boundedSize = Math.max(2, sampleSize);
  const recentPoints = points.slice(-boundedSize);
  const firstPoint = recentPoints[0];
  const lastPoint = recentPoints[recentPoints.length - 1];

  if (!firstPoint || !lastPoint || firstPoint.close <= 0) {
    return 0;
  }

  const firstTimestampMs = Date.parse(firstPoint.timestamp);
  const lastTimestampMs = Date.parse(lastPoint.timestamp);
  const elapsedSeconds =
    Number.isFinite(firstTimestampMs)
    && Number.isFinite(lastTimestampMs)
    && lastTimestampMs > firstTimestampMs
      ? (lastTimestampMs - firstTimestampMs) / 1000
      : Math.max(1, recentPoints.length - 1);

  if (elapsedSeconds <= 0) {
    return 0;
  }

  const variationPercent = ((lastPoint.close - firstPoint.close) / firstPoint.close) * 100;
  return roundMicroPercent(variationPercent / elapsedSeconds);
}

function resolveUtcMidnightOpen(points: BinaryOptionsChartPoint[]): number | null {
  if (points.length === 0) {
    return null;
  }

  const lastPoint = points[points.length - 1];

  if (!lastPoint) {
    return null;
  }

  const parsedDate = new Date(lastPoint.timestamp);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  const dayStartMs = Date.UTC(
    parsedDate.getUTCFullYear(),
    parsedDate.getUTCMonth(),
    parsedDate.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  const dayEndMs = dayStartMs + oneDayMs;

  for (const point of points) {
    const timestampMs = Date.parse(point.timestamp);

    if (!Number.isFinite(timestampMs)) {
      continue;
    }

    if (timestampMs >= dayStartMs && timestampMs < dayEndMs) {
      return point.open;
    }
  }

  return null;
}

function computeKineticExhaustionSnapshot(
  points: BinaryOptionsChartPoint[],
): KineticExhaustionSnapshot {
  if (points.length < 8) {
    return {
      accelerationPercentPerSecond2: 0,
      decelerationStrength: 0,
      explosiveAgainstBand: false,
      isAbruptDeceleration: false,
      state: "neutral",
      velocityNow: 0,
    };
  }

  const windowPoints = points.slice(-12);
  const splitIndex = Math.max(4, Math.floor(windowPoints.length / 2));
  const previousWindow = windowPoints.slice(0, splitIndex + 1);
  const currentWindow = windowPoints.slice(splitIndex);
  const previousVelocity = computeMomentumVelocityPercentPerSecond(previousWindow, previousWindow.length);
  const currentVelocity = computeMomentumVelocityPercentPerSecond(currentWindow, currentWindow.length);
  const previousTimestampMs = Date.parse(previousWindow[previousWindow.length - 1]?.timestamp ?? "");
  const currentTimestampMs = Date.parse(currentWindow[currentWindow.length - 1]?.timestamp ?? "");
  const elapsedSeconds =
    Number.isFinite(previousTimestampMs)
    && Number.isFinite(currentTimestampMs)
    && currentTimestampMs > previousTimestampMs
      ? (currentTimestampMs - previousTimestampMs) / 1000
      : Math.max(1, currentWindow.length - 1);

  const accelerationPercentPerSecond2 = roundMicroPercent(
    (currentVelocity - previousVelocity) / Math.max(elapsedSeconds, 1e-6),
  );
  const speedDrop = Math.max(0, Math.abs(previousVelocity) - Math.abs(currentVelocity));
  const decelerationStrength = clamp(roundPercent(speedDrop * 150000), 0, 100);
  const explosiveAgainstBand =
    Math.abs(previousVelocity) >= 0.0018
    && Math.abs(currentVelocity) >= 0.0012;
  const isAbruptDeceleration =
    Math.abs(previousVelocity) >= 0.0012
    && Math.abs(currentVelocity) <= Math.abs(previousVelocity) * 0.62
    && Math.sign(previousVelocity) === Math.sign(currentVelocity);

  const state: BinaryKineticExhaustionState = explosiveAgainstBand && !isAbruptDeceleration
    ? "explosive"
    : isAbruptDeceleration
      ? "cooling"
      : "neutral";

  return {
    accelerationPercentPerSecond2,
    decelerationStrength,
    explosiveAgainstBand,
    isAbruptDeceleration,
    state,
    velocityNow: currentVelocity,
  };
}

function isPriceNearLevel(currentPrice: number, level: number, tolerancePercent: number): boolean {
  if (!Number.isFinite(level) || level <= 0) {
    return false;
  }

  return Math.abs(((currentPrice - level) / level) * 100) <= tolerancePercent;
}

function resolveInstitutionalPoiContext(input: {
  atrPercent: number;
  currentPrice: number;
  marketStructure: BinaryOptionsMarketStructure;
  points: BinaryOptionsChartPoint[];
}): InstitutionalPoiContext {
  const tolerancePercent = clamp(Math.max(input.atrPercent * 0.18, 0.05), 0.05, 0.35);
  const nearPreviousLow =
    input.marketStructure.previousSwingLow !== null
    && isPriceNearLevel(input.currentPrice, input.marketStructure.previousSwingLow, tolerancePercent);
  const nearPreviousHigh =
    input.marketStructure.previousSwingHigh !== null
    && isPriceNearLevel(input.currentPrice, input.marketStructure.previousSwingHigh, tolerancePercent);
  const midnightOpen = resolveUtcMidnightOpen(input.points);
  const nearMidnightOpen = midnightOpen !== null && isPriceNearLevel(input.currentPrice, midnightOpen, tolerancePercent);

  if (nearPreviousLow && nearPreviousHigh) {
    return {
      hit: true,
      sideBias: "none",
      tag: "cluster",
    };
  }

  if ((nearPreviousLow && nearMidnightOpen) || (nearPreviousHigh && nearMidnightOpen)) {
    return {
      hit: true,
      sideBias: nearPreviousLow ? "bullish" : "bearish",
      tag: "cluster",
    };
  }

  if (nearPreviousLow) {
    return {
      hit: true,
      sideBias: "bullish",
      tag: "previous_low",
    };
  }

  if (nearPreviousHigh) {
    return {
      hit: true,
      sideBias: "bearish",
      tag: "previous_high",
    };
  }

  if (nearMidnightOpen) {
    return {
      hit: true,
      sideBias: midnightOpen !== null && input.currentPrice <= midnightOpen ? "bullish" : "bearish",
      tag: "midnight_open",
    };
  }

  return {
    hit: false,
    sideBias: "none",
    tag: "none",
  };
}

function computeBollingerBands(
  values: number[],
  period = 20,
  deviationMultiplier = 2,
): BollingerBandsSnapshot {
  if (values.length === 0) {
    return {
      bandwidthPercent: 0,
      lower: 0,
      middle: 0,
      upper: 0,
    };
  }

  const boundedPeriod = Math.max(2, period);
  const windowValues = values.slice(-boundedPeriod);
  const middle = computeAverage(windowValues);
  const deviation = computeStandardDeviation(windowValues);
  const upper = middle + deviation * deviationMultiplier;
  const lower = middle - deviation * deviationMultiplier;
  const bandwidthPercent = middle <= 0 ? 0 : ((upper - lower) / middle) * 100;

  return {
    bandwidthPercent,
    lower,
    middle,
    upper,
  };
}

function resolveBollingerTouch(
  currentPrice: number,
  bands: BollingerBandsSnapshot,
): BinaryBollingerTouch {
  if (bands.lower > 0 && currentPrice <= bands.lower * 1.0008) {
    return "lower";
  }

  if (bands.upper > 0 && currentPrice >= bands.upper * 0.9992) {
    return "upper";
  }

  return "inside";
}

function detectCandlePattern(points: BinaryOptionsChartPoint[]): CandlePatternSnapshot {
  if (points.length < 2) {
    return {
      pattern: "none",
      signal: "neutral",
      strength: 0,
    };
  }

  const previousPoint = points[points.length - 2];
  const currentPoint = points[points.length - 1];

  if (!previousPoint || !currentPoint) {
    return {
      pattern: "none",
      signal: "neutral",
      strength: 0,
    };
  }

  const previousBody = Math.abs(previousPoint.close - previousPoint.open);
  const currentBody = Math.abs(currentPoint.close - currentPoint.open);
  const currentRange = Math.max(1e-8, currentPoint.high - currentPoint.low);
  const upperWick = Math.max(0, currentPoint.high - Math.max(currentPoint.open, currentPoint.close));
  const lowerWick = Math.max(0, Math.min(currentPoint.open, currentPoint.close) - currentPoint.low);
  const bodyRatio = currentBody / currentRange;

  const bullishEngulfing =
    previousPoint.close < previousPoint.open
    && currentPoint.close > currentPoint.open
    && currentPoint.open <= previousPoint.close
    && currentPoint.close >= previousPoint.open
    && currentBody >= previousBody * 0.9;

  if (bullishEngulfing) {
    return {
      pattern: "bullish_engulfing",
      signal: "bullish",
      strength: 1,
    };
  }

  const bearishEngulfing =
    previousPoint.close > previousPoint.open
    && currentPoint.close < currentPoint.open
    && currentPoint.open >= previousPoint.close
    && currentPoint.close <= previousPoint.open
    && currentBody >= previousBody * 0.9;

  if (bearishEngulfing) {
    return {
      pattern: "bearish_engulfing",
      signal: "bearish",
      strength: 1,
    };
  }

  const bullishPinbar =
    bodyRatio <= 0.42
    && lowerWick >= currentBody * 2.4
    && upperWick <= currentBody * 1.1
    && currentPoint.close >= currentPoint.open;

  if (bullishPinbar) {
    return {
      pattern: "bullish_pinbar",
      signal: "bullish",
      strength: 0.78,
    };
  }

  const bearishPinbar =
    bodyRatio <= 0.42
    && upperWick >= currentBody * 2.4
    && lowerWick <= currentBody * 1.1
    && currentPoint.close <= currentPoint.open;

  if (bearishPinbar) {
    return {
      pattern: "bearish_pinbar",
      signal: "bearish",
      strength: 0.78,
    };
  }

  return {
    pattern: "none",
    signal: "neutral",
    strength: 0,
  };
}

function percentile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const safeRatio = clamp(ratio, 0, 1);
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.floor((sortedValues.length - 1) * safeRatio)),
  );

  return sortedValues[index] ?? sortedValues[0] ?? 0;
}

function resolveMarketSession(timestampIso: string): BinaryOptionsMarketSession {
  const parsedDate = new Date(timestampIso);
  const referenceDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const utcHour = referenceDate.getUTCHours();

  if (utcHour >= 0 && utcHour < 7) {
    return {
      liquidityHeat: "medium",
      session: "asia",
      utcHour,
      utcWindow: "00:00-06:59 UTC",
    };
  }

  if (utcHour >= 7 && utcHour < 12) {
    return {
      liquidityHeat: "medium",
      session: "london",
      utcHour,
      utcWindow: "07:00-11:59 UTC",
    };
  }

  if (utcHour >= 12 && utcHour < 16) {
    return {
      liquidityHeat: "high",
      session: "overlap",
      utcHour,
      utcWindow: "12:00-15:59 UTC",
    };
  }

  if (utcHour >= 16 && utcHour < 21) {
    return {
      liquidityHeat: "medium",
      session: "new_york",
      utcHour,
      utcWindow: "16:00-20:59 UTC",
    };
  }

  return {
    liquidityHeat: "low",
    session: "off_session",
    utcHour,
    utcWindow: "21:00-23:59 UTC",
  };
}

function computeTradeLevels(input: {
  atrPercent: number;
  currentPrice: number;
  resistanceLevel: number;
  supportLevel: number;
  tradeAction: BinaryTradeAction;
}): BinaryOptionsTradeLevels {
  const atrFactor = Math.max(0.0022, (input.atrPercent / 100) * 1.2);
  const entryBand = Math.max(0.0012, atrFactor * 0.45);
  const trendBand = Math.max(0.0032, atrFactor * 1.4);
  const extensionBand = Math.max(0.0055, atrFactor * 2.2);

  if (input.tradeAction === "buy") {
    const entryZoneLow = input.currentPrice * (1 - entryBand);
    const entryZoneHigh = input.currentPrice * (1 + entryBand * 0.7);

    return {
      entryZoneHigh: roundPrice(Math.max(entryZoneHigh, input.supportLevel)),
      entryZoneLow: roundPrice(Math.min(entryZoneLow, input.currentPrice)),
      stopLoss: roundPrice(Math.min(input.supportLevel * 0.998, input.currentPrice * (1 - trendBand))),
      takeProfit1: roundPrice(Math.max(input.resistanceLevel * 1.001, input.currentPrice * (1 + trendBand))),
      takeProfit2: roundPrice(Math.max(input.resistanceLevel * 1.003, input.currentPrice * (1 + extensionBand))),
    };
  }

  if (input.tradeAction === "sell") {
    const entryZoneLow = input.currentPrice * (1 - entryBand * 0.7);
    const entryZoneHigh = input.currentPrice * (1 + entryBand);

    return {
      entryZoneHigh: roundPrice(Math.max(entryZoneHigh, input.currentPrice)),
      entryZoneLow: roundPrice(Math.min(entryZoneLow, input.resistanceLevel)),
      stopLoss: roundPrice(Math.max(input.resistanceLevel * 1.002, input.currentPrice * (1 + trendBand))),
      takeProfit1: roundPrice(Math.min(input.supportLevel * 0.999, input.currentPrice * (1 - trendBand))),
      takeProfit2: roundPrice(Math.min(input.supportLevel * 0.996, input.currentPrice * (1 - extensionBand))),
    };
  }

  return {
    entryZoneHigh: roundPrice(input.currentPrice * (1 + entryBand)),
    entryZoneLow: roundPrice(input.currentPrice * (1 - entryBand)),
    stopLoss: roundPrice(input.currentPrice * (1 - trendBand)),
    takeProfit1: roundPrice(input.currentPrice * (1 + trendBand)),
    takeProfit2: roundPrice(input.currentPrice * (1 + extensionBand)),
  };
}

function computeMarketStructure(input: {
  currentPrice: number;
  points: BinaryOptionsChartPoint[];
  trend: BinaryTrend;
}): BinaryOptionsMarketStructure {
  const recentWindow = input.points.slice(-60);
  const currentWindow = recentWindow.slice(-25);
  const previousWindow = recentWindow.slice(-50, -25);
  const currentHighs = currentWindow.map((point) => point.high).sort((left, right) => left - right);
  const currentLows = currentWindow.map((point) => point.low).sort((left, right) => left - right);
  const previousHighs = previousWindow.map((point) => point.high).sort((left, right) => left - right);
  const previousLows = previousWindow.map((point) => point.low).sort((left, right) => left - right);

  const lastSwingHigh = percentile(currentHighs, 0.85);
  const lastSwingLow = percentile(currentLows, 0.15);
  const previousSwingHigh = previousHighs.length > 0 ? percentile(previousHighs, 0.8) : null;
  const previousSwingLow = previousLows.length > 0 ? percentile(previousLows, 0.2) : null;

  let bias: BinaryMarketStructureBias = "neutral";

  if (previousSwingHigh !== null && previousSwingLow !== null) {
    if (lastSwingHigh > previousSwingHigh && lastSwingLow > previousSwingLow) {
      bias = "bullish";
    } else if (lastSwingHigh < previousSwingHigh && lastSwingLow < previousSwingLow) {
      bias = "bearish";
    }
  } else if (input.trend === "bullish") {
    bias = "bullish";
  } else if (input.trend === "bearish") {
    bias = "bearish";
  }

  const bullishBreak = input.currentPrice > lastSwingHigh * 1.0007;
  const bearishBreak = input.currentPrice < lastSwingLow * 0.9993;
  const bosSignal: BinaryMarketStructureSignal = bullishBreak ? "bullish" : bearishBreak ? "bearish" : "none";

  let chochSignal: BinaryMarketStructureSignal = "none";

  if (bias === "bullish" && bearishBreak) {
    chochSignal = "bearish";
  } else if (bias === "bearish" && bullishBreak) {
    chochSignal = "bullish";
  }

  const swingRangePercent = lastSwingLow <= 0
    ? 0
    : roundPercent(((lastSwingHigh - lastSwingLow) / lastSwingLow) * 100);

  return {
    bias,
    bosSignal,
    chochSignal,
    lastSwingHigh: roundPrice(lastSwingHigh),
    lastSwingLow: roundPrice(lastSwingLow),
    previousSwingHigh: previousSwingHigh === null ? null : roundPrice(previousSwingHigh),
    previousSwingLow: previousSwingLow === null ? null : roundPrice(previousSwingLow),
    swingRangePercent,
  };
}

function resolveSmcConfluenceTier(score: number): BinarySmcConfluenceTier {
  if (score >= 72) {
    return "high";
  }

  if (score >= 48) {
    return "medium";
  }

  return "low";
}

function computeSmcConfluence(input: {
  atrPercent: number;
  marketSession: BinaryOptionsMarketSession;
  marketStructure: BinaryOptionsMarketStructure;
  trend: BinaryTrend;
  volatilityPercent: number;
}): BinaryOptionsSmcConfluence {
  let structureComponent = 16;

  if (input.marketStructure.bias !== "neutral") {
    structureComponent += 9;
  }

  if (input.marketStructure.bosSignal !== "none") {
    structureComponent += 8;
  }

  if (
    (input.trend === "bullish" && input.marketStructure.bias === "bullish")
    || (input.trend === "bearish" && input.marketStructure.bias === "bearish")
  ) {
    structureComponent += 7;
  }

  if (input.marketStructure.chochSignal !== "none") {
    structureComponent -= 5;
  }

  structureComponent = clamp(Math.round(structureComponent), 4, 45);

  const sessionComponent = input.marketSession.liquidityHeat === "high"
    ? 30
    : input.marketSession.liquidityHeat === "medium"
      ? 21
      : 10;

  let volatilityComponent = 11;

  if (input.atrPercent >= 0.2 && input.atrPercent <= 4.2) {
    volatilityComponent += 6;
  } else if (input.atrPercent > 6.8) {
    volatilityComponent -= 3;
  }

  if (input.volatilityPercent >= 0.3 && input.volatilityPercent <= 5.5) {
    volatilityComponent += 5;
  } else if (input.volatilityPercent > 7.8) {
    volatilityComponent -= 3;
  }

  volatilityComponent = clamp(Math.round(volatilityComponent), 3, 25);

  const score = clamp(
    Math.round(structureComponent + sessionComponent + volatilityComponent),
    5,
    95,
  );

  return {
    components: {
      marketStructure: structureComponent,
      sessionLiquidity: sessionComponent,
      volatilityRegime: volatilityComponent,
    },
    score,
    tier: resolveSmcConfluenceTier(score),
  };
}

function resolveRangePointTarget(range: BinaryOptionsRange, resolution: BinaryOptionsResolution): number {
  const baseTargetByRange: Record<BinaryOptionsRange, number> = {
    "1y": 320,
    "24h": 160,
    "30d": 240,
    "7d": 200,
    "90d": 280,
  };

  const baseTarget = baseTargetByRange[range] ?? 180;

  if (resolution.endsWith("T") || resolution.endsWith("R")) {
    return clamp(baseTarget, 80, 220);
  }

  if (resolution.endsWith("S")) {
    return clamp(baseTarget + 40, 120, 260);
  }

  if (resolution === "1" || resolution === "2" || resolution === "3" || resolution === "5") {
    return clamp(baseTarget + 20, 100, 260);
  }

  return clamp(baseTarget, 80, 240);
}

function normalizeResolutionToken(resolution: BinaryOptionsResolution): BinaryOptionsResolution {
  if (resolution === "10R") {
    return "10T";
  }

  if (resolution === "100R") {
    return "100T";
  }

  if (resolution === "1000R") {
    return "1000T";
  }

  return resolution;
}

function resolveResolutionPlan(resolution: BinaryOptionsResolution): ResolutionPlan {
  const normalizedResolution = normalizeResolutionToken(resolution);

  if (normalizedResolution === "1T") {
    return {
      kind: "tick",
      tickSize: 1,
    };
  }

  if (normalizedResolution === "10T") {
    return {
      kind: "tick",
      tickSize: 10,
    };
  }

  if (normalizedResolution === "100T") {
    return {
      kind: "tick",
      tickSize: 100,
    };
  }

  if (normalizedResolution === "1000T") {
    return {
      kind: "tick",
      tickSize: 1000,
    };
  }

  if (normalizedResolution === "1S") {
    return {
      intervalMs: oneSecondMs,
      kind: "time",
      source: "agg_trades",
    };
  }

  if (normalizedResolution === "5S") {
    return {
      intervalMs: 5 * oneSecondMs,
      kind: "time",
      source: "agg_trades",
    };
  }

  if (normalizedResolution === "10S") {
    return {
      intervalMs: 10 * oneSecondMs,
      kind: "time",
      source: "agg_trades",
    };
  }

  if (normalizedResolution === "15S") {
    return {
      intervalMs: 15 * oneSecondMs,
      kind: "time",
      source: "agg_trades",
    };
  }

  if (normalizedResolution === "30S") {
    return {
      intervalMs: 30 * oneSecondMs,
      kind: "time",
      source: "agg_trades",
    };
  }

  if (normalizedResolution === "45S") {
    return {
      intervalMs: 45 * oneSecondMs,
      kind: "time",
      source: "agg_trades",
    };
  }

  const klinePlan = klinePlanByResolution[normalizedResolution as BinaryOptionsKlineResolution];

  if (!klinePlan) {
    throw new AppError({
      code: "BINARY_OPTIONS_RESOLUTION_UNSUPPORTED",
      details: {
        resolution,
      },
      message: "Binary options resolution is not supported",
      statusCode: 400,
    });
  }

  return {
    intervalMs: klinePlan.targetIntervalMs,
    kind: "time",
    source: "klines",
    sourceInterval: klinePlan.sourceInterval,
    sourceIntervalMs: klinePlan.sourceIntervalMs,
  };
}

function toChartPointFromKline(value: unknown): BinaryOptionsChartPoint | null {
  if (!Array.isArray(value) || value.length < 6) {
    return null;
  }

  const timestampMs = typeof value[0] === "number" ? value[0] : Number(value[0]);
  const open = parseNumericString(typeof value[1] === "string" ? value[1] : undefined);
  const high = parseNumericString(typeof value[2] === "string" ? value[2] : undefined);
  const low = parseNumericString(typeof value[3] === "string" ? value[3] : undefined);
  const close = parseNumericString(typeof value[4] === "string" ? value[4] : undefined);
  const volume = parseNumericString(typeof value[5] === "string" ? value[5] : undefined);

  if (
    !Number.isFinite(timestampMs)
    || open === null
    || high === null
    || low === null
    || close === null
    || volume === null
  ) {
    return null;
  }

  return {
    close: roundPrice(close),
    high: roundPrice(Math.max(open, high, close)),
    low: roundPrice(Math.min(open, low, close)),
    open: roundPrice(open),
    timestamp: new Date(timestampMs).toISOString(),
    volume: Number(volume.toFixed(4)),
  };
}

function toTrade(value: unknown): BinaryAggTrade | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const trade = value as Record<string, unknown>;
  const price = parseNumericString(typeof trade.p === "string" ? trade.p : undefined);
  const quantity = parseNumericString(typeof trade.q === "string" ? trade.q : undefined);
  const timestampRaw = trade.T;
  const timestampMs = typeof timestampRaw === "number"
    ? timestampRaw
    : typeof timestampRaw === "string"
      ? Number.parseInt(timestampRaw, 10)
      : Number.NaN;

  if (
    price === null
    || quantity === null
    || !Number.isFinite(timestampMs)
    || timestampMs <= 0
  ) {
    return null;
  }

  return {
    price,
    quantity,
    timestampMs,
  };
}

function aggregatePointsByInterval(
  points: BinaryOptionsChartPoint[],
  targetIntervalMs: number,
): BinaryOptionsChartPoint[] {
  if (points.length < 2 || targetIntervalMs <= 0) {
    return points;
  }

  const groupedPoints = new Map<number, BinaryOptionsChartPoint>();

  for (const point of points) {
    const parsedTimestamp = Date.parse(point.timestamp);

    if (!Number.isFinite(parsedTimestamp)) {
      continue;
    }

    const bucketTimestampMs = Math.floor(parsedTimestamp / targetIntervalMs) * targetIntervalMs;
    const existingPoint = groupedPoints.get(bucketTimestampMs);

    if (!existingPoint) {
      groupedPoints.set(bucketTimestampMs, {
        close: point.close,
        high: point.high,
        low: point.low,
        open: point.open,
        timestamp: new Date(bucketTimestampMs).toISOString(),
        volume: point.volume,
      });
      continue;
    }

    existingPoint.close = point.close;
    existingPoint.high = Math.max(existingPoint.high, point.high);
    existingPoint.low = Math.min(existingPoint.low, point.low);

    if (typeof point.volume === "number") {
      existingPoint.volume = (existingPoint.volume ?? 0) + point.volume;
    }
  }

  return [...groupedPoints.entries()]
    .sort((left, right) => left[0] - right[0])
    .map((entry) => entry[1]);
}

function aggregateTradesByInterval(
  trades: BinaryAggTrade[],
  intervalMs: number,
): BinaryOptionsChartPoint[] {
  if (trades.length === 0 || intervalMs <= 0) {
    return [];
  }

  const sortedTrades = trades
    .slice()
    .sort((left, right) => left.timestampMs - right.timestampMs);
  const groupedPoints = new Map<number, BinaryOptionsChartPoint>();

  for (const trade of sortedTrades) {
    const bucketTimestampMs = Math.floor(trade.timestampMs / intervalMs) * intervalMs;
    const existingPoint = groupedPoints.get(bucketTimestampMs);

    if (!existingPoint) {
      groupedPoints.set(bucketTimestampMs, {
        close: roundPrice(trade.price),
        high: roundPrice(trade.price),
        low: roundPrice(trade.price),
        open: roundPrice(trade.price),
        timestamp: new Date(bucketTimestampMs).toISOString(),
        volume: Number(trade.quantity.toFixed(6)),
      });
      continue;
    }

    existingPoint.close = roundPrice(trade.price);
    existingPoint.high = roundPrice(Math.max(existingPoint.high, trade.price));
    existingPoint.low = roundPrice(Math.min(existingPoint.low, trade.price));
    existingPoint.volume = Number(((existingPoint.volume ?? 0) + trade.quantity).toFixed(6));
  }

  return [...groupedPoints.entries()]
    .sort((left, right) => left[0] - right[0])
    .map((entry) => entry[1]);
}

function aggregateTradesByTickCount(
  trades: BinaryAggTrade[],
  tickSize: number,
): BinaryOptionsChartPoint[] {
  if (trades.length === 0 || tickSize <= 0) {
    return [];
  }

  const sortedTrades = trades
    .slice()
    .sort((left, right) => left.timestampMs - right.timestampMs);
  const points: BinaryOptionsChartPoint[] = [];

  for (let index = 0; index < sortedTrades.length; index += tickSize) {
    const slice = sortedTrades.slice(index, index + tickSize);
    const firstTrade = slice[0];
    const lastTrade = slice[slice.length - 1];

    if (!firstTrade || !lastTrade) {
      continue;
    }

    let high = firstTrade.price;
    let low = firstTrade.price;
    let totalQuantity = 0;

    for (const trade of slice) {
      high = Math.max(high, trade.price);
      low = Math.min(low, trade.price);
      totalQuantity += trade.quantity;
    }

    points.push({
      close: roundPrice(lastTrade.price),
      high: roundPrice(high),
      low: roundPrice(low),
      open: roundPrice(firstTrade.price),
      timestamp: new Date(lastTrade.timestampMs).toISOString(),
      volume: Number(totalQuantity.toFixed(6)),
    });
  }

  return points;
}

function tailPoints(points: BinaryOptionsChartPoint[], maxPoints: number): BinaryOptionsChartPoint[] {
  if (maxPoints <= 0 || points.length <= maxPoints) {
    return points;
  }

  return points.slice(points.length - maxPoints);
}

function buildInsights(points: BinaryOptionsChartPoint[]): BinaryOptionsChartInsights {
  const prices = points.map((point) => point.close);
  const lastPoint = points[points.length - 1];
  const previousPoint = points[points.length - 2] ?? lastPoint;

  if (!lastPoint || !previousPoint) {
    throw new AppError({
      code: "BINARY_OPTIONS_EMPTY_CHART",
      details: {
        points: points.length,
      },
      message: "Insufficient chart points to build binary options insights",
      statusCode: 503,
    });
  }

  const currentPrice = lastPoint.close;
  const previousPrice = previousPoint.close;
  const changePercent = previousPrice <= 0 ? 0 : ((currentPrice - previousPrice) / previousPrice) * 100;
  const momentumPercent = changePercent;
  const highPrice = Math.max(...points.map((point) => point.high));
  const lowPrice = Math.min(...points.map((point) => point.low));
  const highs = points.map((point) => point.high).sort((left, right) => left - right);
  const lows = points.map((point) => point.low).sort((left, right) => left - right);
  const supportLevel = percentile(lows, 0.2);
  const resistanceLevel = percentile(highs, 0.8);

  const emaFast = computeEma(prices, 9);
  const emaSlow = computeEma(prices, 21);
  const shortMovingAverage = computeSimpleMovingAverage(prices, 20);
  const longMovingAverage = computeSimpleMovingAverage(prices, 50);
  const rsi14 = computeRsi(prices, 14);
  const atrPercent = computeAtrPercent(points, 14);
  const returns = computeReturns(prices);
  const volatilityPercent = roundPercent(computeStandardDeviation(returns) * 100);

  const ema12Series = computeEmaSeries(prices, 12);
  const ema26Series = computeEmaSeries(prices, 26);
  const macdSeries = ema12Series.map((value, index) => value - (ema26Series[index] ?? value));
  const macdSignalSeries = computeEmaSeries(macdSeries, 9);
  const macd = macdSeries[macdSeries.length - 1] ?? 0;
  const macdSignal = macdSignalSeries[macdSignalSeries.length - 1] ?? 0;
  const macdHistogram = macd - macdSignal;
  const momentumVelocityPercentPerSecond = computeMomentumVelocityPercentPerSecond(points);
  const bollingerBands = computeBollingerBands(prices, 20, 2);
  const bollingerTouch = resolveBollingerTouch(currentPrice, bollingerBands);
  const candlePattern = detectCandlePattern(points);

  const trend = emaFast > emaSlow * 1.0002
    ? "bullish"
    : emaFast < emaSlow * 0.9998
      ? "bearish"
      : "sideways";
  const marketSession = resolveMarketSession(lastPoint.timestamp);
  const marketStructure = computeMarketStructure({
    currentPrice,
    points,
    trend,
  });
  const smcConfluence = computeSmcConfluence({
    atrPercent,
    marketSession,
    marketStructure,
    trend,
    volatilityPercent,
  });
  const kineticExhaustion = computeKineticExhaustionSnapshot(points);
  const institutionalPoi = resolveInstitutionalPoiContext({
    atrPercent,
    currentPrice,
    marketStructure,
    points,
  });
  const hasKineticPoiAlignment = kineticExhaustion.isAbruptDeceleration && institutionalPoi.hit;
  const shouldAbortForKineticNoise = kineticExhaustion.explosiveAgainstBand && !hasKineticPoiAlignment;
  const hasLowerBandHotTrigger =
    bollingerTouch === "lower"
    && kineticExhaustion.isAbruptDeceleration
    && kineticExhaustion.velocityNow <= -0.0002
    && kineticExhaustion.accelerationPercentPerSecond2 >= 0;
  const hasUpperBandHotTrigger =
    bollingerTouch === "upper"
    && kineticExhaustion.isAbruptDeceleration
    && kineticExhaustion.velocityNow >= 0.0002
    && kineticExhaustion.accelerationPercentPerSecond2 <= 0;
  const hasKineticHotTrigger = hasLowerBandHotTrigger || hasUpperBandHotTrigger;
  const touchedBandWithoutHotTrigger =
    (bollingerTouch === "lower" || bollingerTouch === "upper") && !hasKineticHotTrigger;

  const bullishRejectionSignal =
    !shouldAbortForKineticNoise
    && hasLowerBandHotTrigger
    && institutionalPoi.sideBias !== "bearish" &&
    rsi14 !== null
    && rsi14 <= 37
    && (candlePattern.signal === "bullish" || momentumVelocityPercentPerSecond >= 0.0011);
  const bearishRejectionSignal =
    !shouldAbortForKineticNoise
    && hasUpperBandHotTrigger
    && institutionalPoi.sideBias !== "bullish" &&
    rsi14 !== null
    && rsi14 >= 63
    && (candlePattern.signal === "bearish" || momentumVelocityPercentPerSecond <= -0.0011);
  const rejectionSignal: BinaryRejectionSignal = bullishRejectionSignal
    ? "bullish"
    : bearishRejectionSignal
      ? "bearish"
      : "none";

  const tradeAction: BinaryTradeAction = (() => {
    if (shouldAbortForKineticNoise) {
      return "wait";
    }

    if (touchedBandWithoutHotTrigger) {
      return "wait";
    }

    if (rejectionSignal === "bullish") {
      return hasKineticPoiAlignment || institutionalPoi.sideBias !== "bearish" ? "buy" : "wait";
    }

    if (rejectionSignal === "bearish") {
      return hasKineticPoiAlignment || institutionalPoi.sideBias !== "bullish" ? "sell" : "wait";
    }

    if (
      candlePattern.signal === "bullish"
      && momentumVelocityPercentPerSecond > 0.0008
      && (rsi14 === null || rsi14 < 60)
    ) {
      return "buy";
    }

    if (
      candlePattern.signal === "bearish"
      && momentumVelocityPercentPerSecond < -0.0008
      && (rsi14 === null || rsi14 > 40)
    ) {
      return "sell";
    }

    if (trend === "bullish" && momentumPercent > -0.08 && (rsi14 === null || rsi14 < 70)) {
      return "buy";
    }

    if (trend === "bearish" && momentumPercent < 0.08 && (rsi14 === null || rsi14 > 30)) {
      return "sell";
    }

    return "wait";
  })();

  const tradeLevels = computeTradeLevels({
    atrPercent,
    currentPrice,
    resistanceLevel,
    supportLevel,
    tradeAction,
  });

  const velocityComponent = clamp(Math.abs(momentumVelocityPercentPerSecond) * 9000, 0, 22);
  const rejectionComponent = rejectionSignal === "none" ? 0 : 16;
  const candleComponent = candlePattern.signal === "neutral" ? 0 : 10 * candlePattern.strength;
  const rsiExtremaComponent = rsi14 !== null && (rsi14 <= 35 || rsi14 >= 65) ? 6 : 0;
  const trendComponent = trend === "sideways" ? -2 : 3;
  const bollingerCompressionComponent = bollingerBands.bandwidthPercent <= 1.4
    ? 5
    : bollingerBands.bandwidthPercent >= 4.8
      ? -4
      : 1;
  const smcComponent = (smcConfluence.score - 50) * 0.12;
  const macdComponent = clamp(Math.abs(macdHistogram) * 24, 0, 14);
  const volatilityPenalty = Math.max(0, volatilityPercent - 5) * 2.6;
  const kineticHotComponent = hasKineticHotTrigger
    ? 14 + kineticExhaustion.decelerationStrength * 0.14
    : kineticExhaustion.state === "cooling"
      ? 2
      : 0;
  const institutionalPoiComponent = institutionalPoi.hit ? 6 : -2;
  const kineticDecelerationPenalty = touchedBandWithoutHotTrigger ? 16 : 0;
  const kineticNoisePenalty = shouldAbortForKineticNoise ? 18 : 0;

  const confidenceScore = clamp(
    Math.round(
      42
      + Math.abs(momentumPercent) * 3.2
      + velocityComponent
      + macdComponent
      + rejectionComponent
      + candleComponent
      + rsiExtremaComponent
      + trendComponent
      + bollingerCompressionComponent
      + smcComponent
      + kineticHotComponent
      + institutionalPoiComponent
      - kineticDecelerationPenalty
      - kineticNoisePenalty
      - volatilityPenalty,
    ),
    5,
    95,
  );

  return {
    atrPercent: roundPercent(atrPercent),
    bollingerBandwidthPercent: roundPercent(bollingerBands.bandwidthPercent),
    bollingerLower: roundPrice(bollingerBands.lower),
    bollingerMiddle: roundPrice(bollingerBands.middle),
    bollingerTouch,
    bollingerUpper: roundPrice(bollingerBands.upper),
    candlePattern: candlePattern.pattern,
    candlePatternSignal: candlePattern.signal,
    candlePatternStrength: roundPercent(candlePattern.strength),
    changePercent: roundPercent(changePercent),
    confidenceScore,
    currentPrice: roundPrice(currentPrice),
    emaFast: roundPrice(emaFast),
    emaSlow: roundPrice(emaSlow),
    highPrice: roundPrice(highPrice),
    institutionalPoiHit: institutionalPoi.hit,
    institutionalPoiTag: institutionalPoi.tag,
    kineticAccelerationPercentPerSecond2: kineticExhaustion.accelerationPercentPerSecond2,
    kineticDecelerationStrength: kineticExhaustion.decelerationStrength,
    kineticExhaustionState: kineticExhaustion.state,
    longMovingAverage: roundPrice(longMovingAverage),
    lowPrice: roundPrice(lowPrice),
    macdHistogram: roundPercent(macdHistogram),
    marketSession,
    marketStructure,
    momentumPercent: roundPercent(momentumPercent),
    momentumVelocityPercentPerSecond,
    rejectionSignal,
    resistanceLevel: roundPrice(resistanceLevel),
    rsi14,
    shortMovingAverage: roundPrice(shortMovingAverage),
    smcConfluence,
    supportLevel: roundPrice(supportLevel),
    tradeAction,
    tradeLevels,
    trend,
    volatilityPercent,
  };
}

export class BinaryOptionsService {
  public async getStrategySnapshot(input: {
    assetId: string;
    exchange?: BinaryOptionsExchange;
    mode?: BinaryOptionsMode;
    range?: BinaryOptionsRange;
    resolution?: BinaryOptionsResolution;
  }): Promise<BinaryOptionsStrategySnapshot> {
    const parsedInput = strategyInputSchema.parse(input);
    const normalizedResolution = normalizeResolutionToken(parsedInput.resolution);
    const symbol = resolveBinanceSymbol(parsedInput.assetId);
    const points = await this.loadMarketPoints({
      range: parsedInput.range,
      resolution: normalizedResolution,
      symbol,
    });

    if (points.length < 5) {
      throw new AppError({
        code: "BINARY_OPTIONS_EMPTY_CHART",
        details: {
          points: points.length,
          resolution: normalizedResolution,
          symbol,
        },
        message: "Insufficient binary options chart points",
        statusCode: 503,
      });
    }

    const [ticker, insights] = await Promise.all([
      this.loadTickerSnapshot(symbol),
      Promise.resolve(buildInsights(points)),
    ]);

    const exchangeFallbackActive = parsedInput.exchange !== "auto" && parsedInput.exchange !== "binance";

    return {
      assetId: parsedInput.assetId,
      cache: {
        stale: false,
        state: "refreshed",
      },
      currency: "usd",
      exchange: {
        fallbackActive: exchangeFallbackActive,
        requested: parsedInput.exchange,
        resolved: "binance",
      },
      fallbackReason: exchangeFallbackActive
        ? `exchange ${parsedInput.exchange} indisponivel no pipeline binario; executando em binance`
        : "",
      fetchedAt: new Date().toISOString(),
      insights,
      live: parsedInput.mode === "live"
        ? {
          changePercent24h: ticker.changePercent24h,
          source: "binance",
          symbol: ticker.symbol,
          volume24h: ticker.volume24h,
        }
        : null,
      mode: parsedInput.mode,
      points,
      provider: "binance",
      range: parsedInput.range,
      resolution: normalizedResolution,
      strategy: "binary_options",
      symbol,
    };
  }

  private async loadMarketPoints(input: {
    range: BinaryOptionsRange;
    resolution: BinaryOptionsResolution;
    symbol: string;
  }): Promise<BinaryOptionsChartPoint[]> {
    const plan = resolveResolutionPlan(input.resolution);
    const maxPoints = resolveRangePointTarget(input.range, input.resolution);

    if (plan.kind === "tick") {
      const trades = await this.loadRecentAggTrades(input.symbol, 1000);
      const points = aggregateTradesByTickCount(trades, plan.tickSize);
      return tailPoints(points, maxPoints);
    }

    if (plan.source === "agg_trades") {
      const trades = await this.loadRecentAggTrades(input.symbol, 1000);
      const points = aggregateTradesByInterval(trades, plan.intervalMs);
      return tailPoints(points, maxPoints);
    }

    const sourceInterval = plan.sourceInterval;
    const sourceIntervalMs = plan.sourceIntervalMs;

    if (!sourceInterval || !sourceIntervalMs) {
      throw new AppError({
        code: "BINARY_OPTIONS_RESOLUTION_PLAN_INVALID",
        details: {
          plan,
        },
        message: "Binary options resolution plan is invalid",
        statusCode: 500,
      });
    }

    const sourceMultiplier = Math.max(1, Math.ceil(plan.intervalMs / sourceIntervalMs));
    const sourceLimit = clamp(maxPoints * sourceMultiplier + 20, 80, 1000);
    const klinePoints = await this.loadKlinePoints(input.symbol, sourceInterval, sourceLimit);

    if (plan.intervalMs <= sourceIntervalMs) {
      return tailPoints(klinePoints, maxPoints);
    }

    const aggregatedPoints = aggregatePointsByInterval(klinePoints, plan.intervalMs);
    return tailPoints(aggregatedPoints, maxPoints);
  }

  private async loadRecentAggTrades(symbol: string, limit: number): Promise<BinaryAggTrade[]> {
    const query = new URLSearchParams({
      limit: String(clamp(limit, 50, 1000)),
      symbol,
    });
    const payload = await retryWithExponentialBackoff(
      () => this.requestJson(`/api/v3/aggTrades?${query.toString()}`),
      {
        attempts: 3,
        baseDelayMs: 180,
        jitterPercent: 20,
        shouldRetry: shouldRetryBinanceRequest,
      },
    );

    if (!Array.isArray(payload)) {
      throw new AppError({
        code: "BINARY_OPTIONS_SCHEMA_MISMATCH",
        details: {
          endpoint: "aggTrades",
          symbol,
        },
        message: "Binary options aggTrades payload schema mismatch",
        statusCode: 502,
      });
    }

    return payload
      .map((entry) => toTrade(entry))
      .filter((entry): entry is BinaryAggTrade => entry !== null);
  }

  private async loadKlinePoints(
    symbol: string,
    interval: string,
    limit: number,
  ): Promise<BinaryOptionsChartPoint[]> {
    const query = new URLSearchParams({
      interval,
      limit: String(clamp(limit, 5, 1000)),
      symbol,
    });
    const payload = await retryWithExponentialBackoff(
      () => this.requestJson(`/api/v3/klines?${query.toString()}`),
      {
        attempts: 3,
        baseDelayMs: 220,
        jitterPercent: 20,
        shouldRetry: shouldRetryBinanceRequest,
      },
    );

    if (!Array.isArray(payload)) {
      throw new AppError({
        code: "BINARY_OPTIONS_SCHEMA_MISMATCH",
        details: {
          endpoint: "klines",
          interval,
          symbol,
        },
        message: "Binary options kline payload schema mismatch",
        statusCode: 502,
      });
    }

    return payload
      .map((entry) => toChartPointFromKline(entry))
      .filter((entry): entry is BinaryOptionsChartPoint => entry !== null);
  }

  private async loadTickerSnapshot(symbol: string): Promise<BinaryTickerSnapshot> {
    const query = new URLSearchParams({
      symbol,
    });

    try {
      const payload = await retryWithExponentialBackoff(
        () => this.requestJson(`/api/v3/ticker/24hr?${query.toString()}`),
        {
          attempts: 2,
          baseDelayMs: 160,
          jitterPercent: 20,
          shouldRetry: shouldRetryBinanceRequest,
        },
      );
      const parsedPayload = tickerSchema.safeParse(payload);

      if (!parsedPayload.success) {
        return {
          changePercent24h: null,
          lastPrice: null,
          symbol,
          volume24h: null,
        };
      }

      return {
        changePercent24h: parseNumericString(parsedPayload.data.priceChangePercent),
        lastPrice: parseNumericString(parsedPayload.data.lastPrice),
        symbol: parsedPayload.data.symbol,
        volume24h: parseNumericString(parsedPayload.data.volume),
      };
    } catch {
      return {
        changePercent24h: null,
        lastPrice: null,
        symbol,
        volume24h: null,
      };
    }
  }

  private async requestJson(path: string): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(`${env.BINANCE_API_BASE_URL}${path}`, {
        method: "GET",
        signal: AbortSignal.timeout(env.BINANCE_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppError({
        code: "BINARY_OPTIONS_BINANCE_UNAVAILABLE",
        details: {
          cause: error,
          retryable: true,
        },
        message: "Binary options Binance request failed",
        statusCode: 503,
      });
    }

    if (!response.ok) {
      const responseBody = await response.text();
      const retryable = isRetryableStatusCode(response.status);

      throw new AppError({
        code: "BINARY_OPTIONS_BINANCE_BAD_STATUS",
        details: {
          path,
          responseBody: responseBody.slice(0, 1000),
          responseStatus: response.status,
          retryable,
        },
        message: "Binary options Binance returned a non-success status",
        statusCode: retryable ? 503 : 502,
      });
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      throw new AppError({
        code: "BINARY_OPTIONS_BINANCE_INVALID_JSON",
        details: {
          path,
          retryable: true,
        },
        message: "Binary options Binance returned invalid JSON",
        statusCode: 502,
      });
    }
  }
}
