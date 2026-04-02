import {
  CoinGeckoMarketChartAdapter,
  type CoinGeckoChartPoint,
} from "../../../integrations/market_data/coingecko-market-chart-adapter.js";
import { env } from "../../../shared/config/env.js";
import { memoryCache } from "../../../shared/cache/memory-cache.js";

export type CryptoChartRange = "24h" | "7d" | "30d" | "90d" | "1y";
export type CryptoTrend = "bearish" | "bullish" | "sideways";

interface CachedChartPayload {
  assetId: string;
  currency: string;
  fetchedAt: string;
  insights: CryptoChartInsights;
  points: CoinGeckoChartPoint[];
  provider: "coingecko";
  range: CryptoChartRange;
}

export interface CryptoChartInsights {
  changePercent: number;
  currentPrice: number;
  highPrice: number;
  lowPrice: number;
  momentumPercent: number;
  resistanceLevel: number;
  shortMovingAverage: number;
  supportLevel: number;
  trend: CryptoTrend;
  volatilityPercent: number;
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
  points: CoinGeckoChartPoint[];
  provider: "coingecko";
  range: CryptoChartRange;
}

function buildCacheKey(assetId: string, currency: string, range: CryptoChartRange): string {
  return `crypto:chart:${assetId}:${currency}:${range}`;
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

function percentile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const safeRatio = Math.min(1, Math.max(0, ratio));
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor((sortedValues.length - 1) * safeRatio)));

  return sortedValues[index] ?? sortedValues[0] ?? 0;
}

function computeInsights(points: CoinGeckoChartPoint[]): CryptoChartInsights {
  const prices = points.map((point) => point.price);
  const firstPrice = prices[0] ?? 0;
  const lastPrice = prices[prices.length - 1] ?? 0;
  const highPrice = Math.max(...prices);
  const lowPrice = Math.min(...prices);
  const shortWindowSize = Math.max(5, Math.floor(prices.length * 0.12));
  const longWindowSize = Math.max(shortWindowSize + 3, Math.floor(prices.length * 0.28));
  const shortMovingAverage = computeAverage(prices.slice(-shortWindowSize));
  const longMovingAverage = computeAverage(prices.slice(-longWindowSize));
  const returns = computeReturns(prices);
  const volatilityPercent = computeStandardDeviation(returns) * 100;
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

  return {
    changePercent: roundPercent(computePercentVariation(lastPrice, firstPrice)),
    currentPrice: roundPrice(lastPrice),
    highPrice: roundPrice(highPrice),
    lowPrice: roundPrice(lowPrice),
    momentumPercent: roundPercent(momentumPercent),
    resistanceLevel: roundPrice(resistanceLevel),
    shortMovingAverage: roundPrice(shortMovingAverage),
    supportLevel: roundPrice(supportLevel),
    trend,
    volatilityPercent: roundPercent(volatilityPercent),
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
    points: payload.points,
    provider: payload.provider,
    range: payload.range,
  };
}

export class CryptoChartService {
  private readonly marketChartAdapter = new CoinGeckoMarketChartAdapter();

  public async refreshChart(input: {
    assetId: string;
    currency: string;
    range: CryptoChartRange;
  }): Promise<CryptoChartResponse> {
    const normalizedInput = normalizeInput(input);
    const chartPayload = await this.marketChartAdapter.getMarketChart(normalizedInput);
    const payload: CachedChartPayload = {
      assetId: chartPayload.assetId,
      currency: chartPayload.currency,
      fetchedAt: chartPayload.fetchedAt,
      insights: computeInsights(chartPayload.points),
      points: chartPayload.points,
      provider: chartPayload.provider,
      range: chartPayload.range,
    };
    const cacheKey = buildCacheKey(payload.assetId, payload.currency, payload.range);

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

    const chartPayload = await this.marketChartAdapter.getMarketChart(normalizedInput);
    const payload: CachedChartPayload = {
      assetId: chartPayload.assetId,
      currency: chartPayload.currency,
      fetchedAt: chartPayload.fetchedAt,
      insights: computeInsights(chartPayload.points),
      points: chartPayload.points,
      provider: chartPayload.provider,
      range: chartPayload.range,
    };

    memoryCache.set(cacheKey, payload, env.CACHE_DEFAULT_TTL_SECONDS, env.CACHE_STALE_SECONDS);

    return toResponse(payload, "miss", false);
  }
}