import {
  BinanceMarketDataAdapter,
  type BinanceChartPoint,
} from "../../../integrations/market_data/binance-market-data-adapter.js";
import {
  CoinGeckoMarketChartAdapter,
  type CoinGeckoChartPoint,
} from "../../../integrations/market_data/coingecko-market-chart-adapter.js";
import {
  MultiExchangeMarketDataAdapter,
  type MultiExchangeChartPoint,
  type ExchangeBroker,
} from "../../../integrations/market_data/multi-exchange-market-data-adapter.js";
import { env } from "../../../shared/config/env.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { memoryCache } from "../../../shared/cache/memory-cache.js";
import { cryptoLiveChartMetricsStore } from "../../../shared/observability/crypto-live-chart-metrics-store.js";

export type CryptoChartRange = "24h" | "7d" | "30d" | "90d" | "1y";
export type CryptoTrend = "bearish" | "bullish" | "sideways";
export type TradeAction = "buy" | "sell" | "wait";
export type LiveChartBroker = "binance" | ExchangeBroker;
export type CryptoChartProvider = "coingecko" | LiveChartBroker;
export type MarketStructureSignal = "bearish" | "bullish" | "none";
export type MarketStructureBias = "bearish" | "bullish" | "neutral";
export type MarketSessionLabel = "asia" | "london" | "new_york" | "off_session" | "overlap";
export type MarketLiquidityHeat = "high" | "low" | "medium";
export type SmcConfluenceTier = "high" | "low" | "medium";

interface CachedChartPayload {
  assetId: string;
  currency: string;
  fetchedAt: string;
  insights: CryptoChartInsights;
  live: CryptoLiveSnapshot | null;
  mode: "delayed" | "live";
  points: CryptoChartPoint[];
  provider: CryptoChartProvider;
  range: CryptoChartRange;
}

interface NormalizedChartPayload {
  assetId: string;
  currency: string;
  fetchedAt: string;
  points: CryptoChartPoint[];
  provider: "binance" | "coingecko";
  range: CryptoChartRange;
}

export interface CryptoChartPoint {
  close: number;
  high: number;
  low: number;
  open: number;
  timestamp: string;
  volume: number | null;
}

export interface CryptoTradeLevels {
  entryZoneHigh: number;
  entryZoneLow: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
}

export interface CryptoMarketStructure {
  bias: MarketStructureBias;
  bosSignal: MarketStructureSignal;
  chochSignal: MarketStructureSignal;
  lastSwingHigh: number;
  lastSwingLow: number;
  previousSwingHigh: number | null;
  previousSwingLow: number | null;
  swingRangePercent: number;
}

export interface CryptoMarketSession {
  liquidityHeat: MarketLiquidityHeat;
  session: MarketSessionLabel;
  utcHour: number;
  utcWindow: string;
}

export interface CryptoSmcConfluence {
  components: {
    marketStructure: number;
    sessionLiquidity: number;
    volatilityRegime: number;
  };
  score: number;
  tier: SmcConfluenceTier;
}

export interface CryptoChartInsights {
  atrPercent: number;
  changePercent: number;
  confidenceScore: number;
  currentPrice: number;
  emaFast: number;
  emaSlow: number;
  highPrice: number;
  longMovingAverage: number;
  lowPrice: number;
  macdHistogram: number;
  marketSession: CryptoMarketSession;
  marketStructure: CryptoMarketStructure;
  momentumPercent: number;
  smcConfluence: CryptoSmcConfluence;
  resistanceLevel: number;
  rsi14: number | null;
  shortMovingAverage: number;
  supportLevel: number;
  tradeAction: TradeAction;
  tradeLevels: CryptoTradeLevels;
  trend: CryptoTrend;
  volatilityPercent: number;
}

export interface CryptoLiveSnapshot {
  changePercent24h: number | null;
  source: LiveChartBroker;
  symbol: string;
  volume24h: number | null;
}

export interface CryptoChartResponse {
  assetId: string;
  cache: {
    state: "fresh" | "miss" | "refreshed" | "stale";
    stale: boolean;
  };
  currency: string;
  fetchedAt: string;
  insights: CryptoChartInsights;
  live: CryptoLiveSnapshot | null;
  mode: "delayed" | "live";
  points: CryptoChartPoint[];
  provider: CryptoChartProvider;
  range: CryptoChartRange;
}

const liveChartFreshTtlSeconds = 8;
const liveChartStaleSeconds = 20;

function buildCacheKey(
  mode: "delayed" | "live",
  assetId: string,
  currency: string,
  range: CryptoChartRange,
  broker?: LiveChartBroker,
): string {
  if (mode === "live") {
    return `crypto:chart:${mode}:${assetId}:${currency}:${range}:${broker ?? "binance"}`;
  }

  return `crypto:chart:${mode}:${assetId}:${currency}:${range}`;
}

function normalizeInput(input: {
  assetId: string;
  currency: string;
  range: CryptoChartRange;
}): {
  assetId: string;
  currency: string;
  range: CryptoChartRange;
} {
  return {
    assetId: input.assetId.toLowerCase(),
    currency: input.currency.toLowerCase(),
    range: input.range,
  };
}

function computeAverage(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function computePercentVariation(currentValue: number, previousValue: number): number {
  if (previousValue <= 0) {
    return 0;
  }

  return ((currentValue - previousValue) / previousValue) * 100;
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

interface SwingPoint {
  index: number;
  price: number;
  timestamp: string;
}

function detectSwingPoints(points: CryptoChartPoint[], lookAround = 2): {
  highs: SwingPoint[];
  lows: SwingPoint[];
} {
  if (points.length < lookAround * 2 + 1) {
    return {
      highs: [],
      lows: [],
    };
  }

  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];

  for (let index = lookAround; index < points.length - lookAround; index += 1) {
    const currentPoint = points[index];

    if (!currentPoint) {
      continue;
    }

    let isSwingHigh = true;
    let isSwingLow = true;

    for (let offset = 1; offset <= lookAround; offset += 1) {
      const previousPoint = points[index - offset];
      const nextPoint = points[index + offset];

      if (!previousPoint || !nextPoint) {
        continue;
      }

      if (currentPoint.high <= previousPoint.high || currentPoint.high <= nextPoint.high) {
        isSwingHigh = false;
      }

      if (currentPoint.low >= previousPoint.low || currentPoint.low >= nextPoint.low) {
        isSwingLow = false;
      }

      if (!isSwingHigh && !isSwingLow) {
        break;
      }
    }

    if (isSwingHigh) {
      highs.push({
        index,
        price: currentPoint.high,
        timestamp: currentPoint.timestamp,
      });
    }

    if (isSwingLow) {
      lows.push({
        index,
        price: currentPoint.low,
        timestamp: currentPoint.timestamp,
      });
    }
  }

  return {
    highs,
    lows,
  };
}

function computeSwingRangePercent(lastSwingHigh: number, lastSwingLow: number): number {
  if (lastSwingLow <= 0) {
    return 0;
  }

  return roundPercent(((lastSwingHigh - lastSwingLow) / lastSwingLow) * 100);
}

function computeMarketStructure(
  points: CryptoChartPoint[],
  currentPrice: number,
  trend: CryptoTrend,
  supportLevel: number,
  resistanceLevel: number,
): CryptoMarketStructure {
  const { highs, lows } = detectSwingPoints(points, 2);
  const lastSwingHighPoint = highs[highs.length - 1] ?? null;
  const previousSwingHighPoint = highs[highs.length - 2] ?? null;
  const lastSwingLowPoint = lows[lows.length - 1] ?? null;
  const previousSwingLowPoint = lows[lows.length - 2] ?? null;

  const lastSwingHigh = lastSwingHighPoint?.price ?? resistanceLevel;
  const lastSwingLow = lastSwingLowPoint?.price ?? supportLevel;
  const previousSwingHigh = previousSwingHighPoint?.price ?? null;
  const previousSwingLow = previousSwingLowPoint?.price ?? null;

  let bias: MarketStructureBias = "neutral";

  if (previousSwingHigh !== null && previousSwingLow !== null) {
    if (lastSwingHigh > previousSwingHigh && lastSwingLow > previousSwingLow) {
      bias = "bullish";
    } else if (lastSwingHigh < previousSwingHigh && lastSwingLow < previousSwingLow) {
      bias = "bearish";
    }
  } else if (trend === "bullish") {
    bias = "bullish";
  } else if (trend === "bearish") {
    bias = "bearish";
  }

  const bullishBreak = currentPrice > lastSwingHigh * 1.0008;
  const bearishBreak = currentPrice < lastSwingLow * 0.9992;
  const bosSignal: MarketStructureSignal = bullishBreak ? "bullish" : bearishBreak ? "bearish" : "none";

  let chochSignal: MarketStructureSignal = "none";

  if (bias === "bullish" && bearishBreak) {
    chochSignal = "bearish";
  } else if (bias === "bearish" && bullishBreak) {
    chochSignal = "bullish";
  }

  return {
    bias,
    bosSignal,
    chochSignal,
    lastSwingHigh: roundPrice(lastSwingHigh),
    lastSwingLow: roundPrice(lastSwingLow),
    previousSwingHigh: previousSwingHigh === null ? null : roundPrice(previousSwingHigh),
    previousSwingLow: previousSwingLow === null ? null : roundPrice(previousSwingLow),
    swingRangePercent: computeSwingRangePercent(lastSwingHigh, lastSwingLow),
  };
}

function resolveMarketSession(timestampIso: string): CryptoMarketSession {
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

function clampScore(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function resolveSmcConfluenceTier(score: number): SmcConfluenceTier {
  if (score >= 72) {
    return "high";
  }

  if (score >= 48) {
    return "medium";
  }

  return "low";
}

function computeSmcStructureComponent(marketStructure: CryptoMarketStructure, trend: CryptoTrend): number {
  let component = 18;

  if (marketStructure.bias !== "neutral") {
    component += 9;
  }

  if (marketStructure.bosSignal !== "none") {
    component += 8;
  }

  if (marketStructure.chochSignal !== "none") {
    component -= 6;
  }

  if (trend !== "sideways") {
    const isTrendAligned =
      (trend === "bullish" && marketStructure.bias === "bullish") ||
      (trend === "bearish" && marketStructure.bias === "bearish");

    if (isTrendAligned) {
      component += 8;
    } else if (marketStructure.bias !== "neutral") {
      component -= 4;
    }
  }

  return clampScore(component, 4, 45);
}

function computeSmcSessionComponent(marketSession: CryptoMarketSession): number {
  let component = 10;

  if (marketSession.liquidityHeat === "high") {
    component = 30;
  } else if (marketSession.liquidityHeat === "medium") {
    component = 21;
  } else if (marketSession.session !== "off_session") {
    component = 13;
  }

  if (marketSession.session === "overlap") {
    component += 2;
  }

  return clampScore(component, 6, 30);
}

function computeSmcVolatilityComponent(atrPercent: number, volatilityPercent: number): number {
  let component = 10;

  if (atrPercent >= 0.4 && atrPercent <= 4.5) {
    component += 8;
  } else if (atrPercent > 6.5) {
    component -= 3;
  } else {
    component += 4;
  }

  if (volatilityPercent >= 0.35 && volatilityPercent <= 4.5) {
    component += 7;
  } else if (volatilityPercent > 7) {
    component -= 2;
  } else {
    component += 4;
  }

  return clampScore(component, 3, 25);
}

function computeSmcConfluence(input: {
  atrPercent: number;
  marketSession: CryptoMarketSession;
  marketStructure: CryptoMarketStructure;
  trend: CryptoTrend;
  volatilityPercent: number;
}): CryptoSmcConfluence {
  const structureComponent = computeSmcStructureComponent(input.marketStructure, input.trend);
  const sessionComponent = computeSmcSessionComponent(input.marketSession);
  const volatilityComponent = computeSmcVolatilityComponent(input.atrPercent, input.volatilityPercent);
  const score = clampScore(Math.round(structureComponent + sessionComponent + volatilityComponent), 5, 95);

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

function percentile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const safeRatio = Math.min(1, Math.max(0, ratio));
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.floor((sortedValues.length - 1) * safeRatio)),
  );

  return sortedValues[index] ?? sortedValues[0] ?? 0;
}

function computeEma(prices: number[], period: number): number {
  if (prices.length === 0) {
    return 0;
  }

  const smoothing = 2 / (period + 1);
  let ema = prices[0] ?? 0;

  for (let index = 1; index < prices.length; index += 1) {
    const price = prices[index] ?? ema;
    ema = price * smoothing + ema * (1 - smoothing);
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

function computeRsi(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) {
    return null;
  }

  let gains = 0;
  let losses = 0;

  for (let index = prices.length - period; index < prices.length; index += 1) {
    const currentPrice = prices[index] ?? 0;
    const previousPrice = prices[index - 1] ?? currentPrice;
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

function computeAtrPercent(points: CryptoChartPoint[], period = 14): number {
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

function computeTradePlan(
  currentPrice: number,
  supportLevel: number,
  resistanceLevel: number,
  trend: CryptoTrend,
  rsi14: number | null,
  macdHistogram: number,
  volatilityPercent: number,
  atrPercent: number,
  emaFast: number,
  emaSlow: number,
): {
  confidenceScore: number;
  tradeAction: TradeAction;
  tradeLevels: CryptoTradeLevels;
} {
  let score = 0;

  if (trend === "bullish") {
    score += 2;
  } else if (trend === "bearish") {
    score -= 2;
  }

  if (rsi14 !== null) {
    if (rsi14 <= 38) {
      score += 1;
    }

    if (rsi14 >= 62) {
      score -= 1;
    }
  }

  if (macdHistogram > 0) {
    score += 1;
  } else if (macdHistogram < 0) {
    score -= 1;
  }

  if (emaFast > emaSlow) {
    score += 1;
  } else if (emaFast < emaSlow) {
    score -= 1;
  }

  if (volatilityPercent >= 4.5 || atrPercent >= 4) {
    score -= 1;
  }

  let tradeAction: TradeAction = "wait";

  if (score >= 2) {
    tradeAction = "buy";
  } else if (score <= -2) {
    tradeAction = "sell";
  }

  const rawConfidence = 52 + Math.abs(score) * 11;
  const confidenceScore = Math.min(92, Math.max(42, rawConfidence));
  const riskBandPercent = Math.max(
    0.8,
    Math.min(8, atrPercent > 0 ? atrPercent * 1.25 : volatilityPercent * 0.9),
  );
  const directionalBandPercent = riskBandPercent / 100;
  const entryZoneLow =
    tradeAction === "buy"
      ? currentPrice * (1 - directionalBandPercent * 0.3)
      : currentPrice * (1 - directionalBandPercent * 0.15);
  const entryZoneHigh =
    tradeAction === "sell"
      ? currentPrice * (1 + directionalBandPercent * 0.3)
      : currentPrice * (1 + directionalBandPercent * 0.15);
  const stopLoss =
    tradeAction === "buy"
      ? Math.min(supportLevel, currentPrice * (1 - directionalBandPercent))
      : tradeAction === "sell"
        ? Math.max(resistanceLevel, currentPrice * (1 + directionalBandPercent))
        : currentPrice * (1 - directionalBandPercent * 0.9);
  const takeProfit1 =
    tradeAction === "buy"
      ? Math.max(resistanceLevel, currentPrice * (1 + directionalBandPercent * 1.35))
      : tradeAction === "sell"
        ? Math.min(supportLevel, currentPrice * (1 - directionalBandPercent * 1.35))
        : currentPrice * (1 + directionalBandPercent * 0.8);
  const takeProfit2 =
    tradeAction === "buy"
      ? currentPrice * (1 + directionalBandPercent * 2.2)
      : tradeAction === "sell"
        ? currentPrice * (1 - directionalBandPercent * 2.2)
        : currentPrice * (1 + directionalBandPercent * 1.2);

  return {
    confidenceScore,
    tradeAction,
    tradeLevels: {
      entryZoneHigh: roundPrice(entryZoneHigh),
      entryZoneLow: roundPrice(entryZoneLow),
      stopLoss: roundPrice(stopLoss),
      takeProfit1: roundPrice(takeProfit1),
      takeProfit2: roundPrice(takeProfit2),
    },
  };
}

function computeInsights(points: CryptoChartPoint[]): CryptoChartInsights {
  const prices = points.map((point) => point.close);
  const firstPrice = prices[0] ?? 0;
  const lastPrice = prices[prices.length - 1] ?? 0;
  const highs = points.map((point) => point.high);
  const lows = points.map((point) => point.low);
  const highPrice = Math.max(...highs);
  const lowPrice = Math.min(...lows);
  const shortWindowSize = Math.max(5, Math.floor(prices.length * 0.12));
  const longWindowSize = Math.max(shortWindowSize + 3, Math.floor(prices.length * 0.28));
  const shortMovingAverage = computeAverage(prices.slice(-shortWindowSize));
  const longMovingAverage = computeAverage(prices.slice(-longWindowSize));
  const emaFast = computeEma(prices, 9);
  const emaSlow = computeEma(prices, 21);
  const ema12Series = computeEmaSeries(prices, 12);
  const ema26Series = computeEmaSeries(prices, 26);
  const macdSeries = ema12Series.map((ema12, index) => ema12 - (ema26Series[index] ?? ema12));
  const signalSeries = computeEmaSeries(macdSeries, 9);
  const macdHistogramRaw =
    (macdSeries[macdSeries.length - 1] ?? 0) - (signalSeries[signalSeries.length - 1] ?? 0);
  const returns = computeReturns(prices);
  const volatilityPercent = computeStandardDeviation(returns) * 100;
  const atrPercent = computeAtrPercent(points);
  const momentumBaseIndex = Math.max(0, prices.length - 4);
  const momentumBase = prices[momentumBaseIndex] ?? firstPrice;
  const momentumPercent = computePercentVariation(lastPrice, momentumBase);
  const sortedPrices = [...prices].sort((left, right) => left - right);
  const supportLevel = percentile(sortedPrices, 0.2);
  const resistanceLevel = percentile(sortedPrices, 0.8);
  const movingAverageGapPercent = computePercentVariation(shortMovingAverage, longMovingAverage);

  let trend: CryptoTrend = "sideways";

  if (movingAverageGapPercent >= 0.45 && momentumPercent >= 0) {
    trend = "bullish";
  } else if (movingAverageGapPercent <= -0.45 && momentumPercent <= 0) {
    trend = "bearish";
  }

  const rsi14 = computeRsi(prices, 14);
  const tradePlan = computeTradePlan(
    lastPrice,
    supportLevel,
    resistanceLevel,
    trend,
    rsi14,
    macdHistogramRaw,
    volatilityPercent,
    atrPercent,
    emaFast,
    emaSlow,
  );
  const marketStructure = computeMarketStructure(
    points,
    lastPrice,
    trend,
    supportLevel,
    resistanceLevel,
  );
  const latestTimestamp = points[points.length - 1]?.timestamp ?? new Date().toISOString();
  const marketSession = resolveMarketSession(latestTimestamp);
  const smcConfluence = computeSmcConfluence({
    atrPercent,
    marketSession,
    marketStructure,
    trend,
    volatilityPercent,
  });

  return {
    atrPercent: roundPercent(atrPercent),
    changePercent: roundPercent(computePercentVariation(lastPrice, firstPrice)),
    confidenceScore: tradePlan.confidenceScore,
    currentPrice: roundPrice(lastPrice),
    emaFast: roundPrice(emaFast),
    emaSlow: roundPrice(emaSlow),
    highPrice: roundPrice(highPrice),
    longMovingAverage: roundPrice(longMovingAverage),
    lowPrice: roundPrice(lowPrice),
    macdHistogram: roundPercent(macdHistogramRaw),
    marketSession,
    marketStructure,
    momentumPercent: roundPercent(momentumPercent),
    smcConfluence,
    resistanceLevel: roundPrice(resistanceLevel),
    rsi14,
    shortMovingAverage: roundPrice(shortMovingAverage),
    supportLevel: roundPrice(supportLevel),
    tradeAction: tradePlan.tradeAction,
    tradeLevels: tradePlan.tradeLevels,
    trend,
    volatilityPercent: roundPercent(volatilityPercent),
  };
}

function normalizeCoinGeckoPoint(point: CoinGeckoChartPoint): CryptoChartPoint {
  return {
    close: point.price,
    high: point.price,
    low: point.price,
    open: point.price,
    timestamp: point.timestamp,
    volume: null,
  };
}

function normalizeBinancePoint(point: BinanceChartPoint): CryptoChartPoint {
  return {
    close: point.close,
    high: point.high,
    low: point.low,
    open: point.open,
    timestamp: point.timestamp,
    volume: point.volume,
  };
}

function normalizeMultiExchangePoint(point: MultiExchangeChartPoint): CryptoChartPoint {
  return {
    close: point.close,
    high: point.high,
    low: point.low,
    open: point.open,
    timestamp: point.timestamp,
    volume: point.volume,
  };
}

function toResponse(
  payload: CachedChartPayload,
  cacheState: "fresh" | "miss" | "refreshed" | "stale",
  stale: boolean,
): CryptoChartResponse {
  return {
    assetId: payload.assetId,
    cache: {
      stale,
      state: cacheState,
    },
    currency: payload.currency,
    fetchedAt: payload.fetchedAt,
    insights: payload.insights,
    live: payload.live,
    mode: payload.mode,
    points: payload.points,
    provider: payload.provider,
    range: payload.range,
  };
}

export class CryptoChartService {
  private readonly coinGeckoAdapter = new CoinGeckoMarketChartAdapter();
  private readonly binanceAdapter = new BinanceMarketDataAdapter();
  private readonly multiExchangeAdapter = new MultiExchangeMarketDataAdapter();

  public async refreshChart(input: {
    assetId: string;
    currency: string;
    range: CryptoChartRange;
  }): Promise<CryptoChartResponse> {
    const normalizedInput = normalizeInput(input);
    const chartPayload = await this.fetchDelayedChartWithFallback(normalizedInput);
    const payload: CachedChartPayload = {
      assetId: chartPayload.assetId,
      currency: chartPayload.currency,
      fetchedAt: chartPayload.fetchedAt,
      insights: computeInsights(chartPayload.points),
      live: null,
      mode: "delayed",
      points: chartPayload.points,
      provider: chartPayload.provider,
      range: chartPayload.range,
    };
    const cacheKey = buildCacheKey(
      payload.mode,
      payload.assetId,
      payload.currency,
      payload.range,
    );

    memoryCache.set(cacheKey, payload, env.CACHE_DEFAULT_TTL_SECONDS, env.CACHE_STALE_SECONDS);

    return toResponse(payload, "refreshed", false);
  }

  public async getChart(input: {
    assetId: string;
    currency: string;
    range: CryptoChartRange;
  }): Promise<CryptoChartResponse> {
    const normalizedInput = normalizeInput(input);
    const cacheKey = buildCacheKey(
      "delayed",
      normalizedInput.assetId,
      normalizedInput.currency,
      normalizedInput.range,
    );
    const cachedPayload = memoryCache.get<CachedChartPayload>(cacheKey);

    if (cachedPayload.state === "fresh") {
      return toResponse(cachedPayload.value, "fresh", false);
    }

    if (cachedPayload.state === "stale") {
      try {
        return await this.refreshChart(normalizedInput);
      } catch {
        return toResponse(cachedPayload.value, "stale", true);
      }
    }

    return this.refreshChart(normalizedInput);
  }

  public async getLiveChart(input: {
    assetId: string;
    range: CryptoChartRange;
    broker?: LiveChartBroker;
  }): Promise<CryptoChartResponse> {
    const liveBroker = input.broker ?? "binance";
    const normalizedInput = {
      assetId: input.assetId.toLowerCase(),
      broker: liveBroker,
      currency: "usd",
      range: input.range,
    };
    const cacheKey = buildCacheKey(
      "live",
      normalizedInput.assetId,
      normalizedInput.currency,
      normalizedInput.range,
      normalizedInput.broker,
    );
    const cachedPayload = memoryCache.get<CachedChartPayload>(cacheKey);

    if (cachedPayload.state === "fresh") {
      return toResponse(cachedPayload.value, "fresh", false);
    }

    if (cachedPayload.state === "stale") {
      try {
        return await this.refreshLiveChart(normalizedInput);
      } catch {
        return toResponse(cachedPayload.value, "stale", true);
      }
    }

    return this.refreshLiveChart(normalizedInput);
  }

  private async refreshLiveChart(input: {
    assetId: string;
    broker: LiveChartBroker;
    currency: string;
    range: CryptoChartRange;
  }): Promise<CryptoChartResponse> {
    const startedAtMs = Date.now();

    try {
      let normalizedPayload: CachedChartPayload;

      if (input.broker === "binance") {
        const [chartPayload, tickerSnapshot] = await Promise.all([
          this.binanceAdapter.getMarketChart({
            assetId: input.assetId,
            range: input.range,
          }),
          this.binanceAdapter.getTickerSnapshot({
            assetId: input.assetId,
          }),
        ]);
        const points = chartPayload.points.map((point) => normalizeBinancePoint(point));

        normalizedPayload = {
          assetId: chartPayload.assetId,
          currency: "usd",
          fetchedAt: chartPayload.fetchedAt,
          insights: computeInsights(points),
          live: {
            changePercent24h: tickerSnapshot.changePercent24h,
            source: "binance",
            symbol: tickerSnapshot.symbol,
            volume24h: tickerSnapshot.volume24h,
          },
          mode: "live",
          points,
          provider: "binance",
          range: chartPayload.range,
        };
      } else {
        const [chartPayload, tickerSnapshot] = await Promise.all([
          this.multiExchangeAdapter.getMarketChart({
            assetId: input.assetId,
            broker: input.broker,
            range: input.range,
          }),
          this.multiExchangeAdapter.getTickerSnapshot({
            assetId: input.assetId,
            broker: input.broker,
          }),
        ]);
        const points = chartPayload.points.map((point) => normalizeMultiExchangePoint(point));

        normalizedPayload = {
          assetId: chartPayload.assetId,
          currency: "usd",
          fetchedAt: chartPayload.fetchedAt,
          insights: computeInsights(points),
          live: {
            changePercent24h: tickerSnapshot.changePercent24h,
            source: tickerSnapshot.broker,
            symbol: tickerSnapshot.symbol,
            volume24h: tickerSnapshot.volume24h,
          },
          mode: "live",
          points,
          provider: chartPayload.broker,
          range: chartPayload.range,
        };
      }

      const cacheKey = buildCacheKey(
        normalizedPayload.mode,
        normalizedPayload.assetId,
        normalizedPayload.currency,
        normalizedPayload.range,
        input.broker,
      );

      memoryCache.set(cacheKey, normalizedPayload, liveChartFreshTtlSeconds, liveChartStaleSeconds);
      cryptoLiveChartMetricsStore.onRefreshSuccess({
        broker: input.broker,
        latencyMs: Date.now() - startedAtMs,
      });

      return toResponse(normalizedPayload, "refreshed", false);
    } catch (error) {
      cryptoLiveChartMetricsStore.onRefreshError({
        broker: input.broker,
        latencyMs: Date.now() - startedAtMs,
        message: error instanceof Error ? error.message : "live-chart refresh failed",
      });

      throw error;
    }
  }

  private async fetchDelayedChartWithFallback(input: {
    assetId: string;
    currency: string;
    range: CryptoChartRange;
  }): Promise<NormalizedChartPayload> {
    try {
      const chartPayload = await this.coinGeckoAdapter.getMarketChart(input);

      return {
        assetId: chartPayload.assetId,
        currency: chartPayload.currency,
        fetchedAt: chartPayload.fetchedAt,
        points: chartPayload.points.map((point) => normalizeCoinGeckoPoint(point)),
        provider: "coingecko",
        range: chartPayload.range,
      };
    } catch (error) {
      if (!this.shouldFallbackToBinance(error, input.currency)) {
        throw error;
      }

      const binanceChart = await this.binanceAdapter.getMarketChart({
        assetId: input.assetId,
        range: input.range,
      });

      return {
        assetId: binanceChart.assetId,
        currency: "usd",
        fetchedAt: binanceChart.fetchedAt,
        points: binanceChart.points.map((point) => normalizeBinancePoint(point)),
        provider: "binance",
        range: binanceChart.range,
      };
    }
  }

  private shouldFallbackToBinance(error: unknown, currency: string): boolean {
    if (currency !== "usd") {
      return false;
    }

    if (!(error instanceof AppError)) {
      return true;
    }

    return error.code.startsWith("COINGECKO_");
  }
}
