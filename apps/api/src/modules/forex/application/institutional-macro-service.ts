import { z } from "zod";

import { env } from "../../../shared/config/env.js";
import { logger } from "../../../shared/logger/logger.js";

const supportedRangeSchema = z.enum(["24h", "7d", "30d", "90d", "1y"]);
const supportedModeSchema = z.enum(["delayed", "live"]);
const supportedResolutionSchema = z.enum([
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
  "1S",
  "5S",
  "10S",
  "15S",
  "30S",
  "45S",
  "D",
  "W",
  "M",
]);

const strategyInputSchema = z.object({
  mode: supportedModeSchema.default("delayed"),
  module: z.string().trim().min(1).max(32).default("forex"),
  range: supportedRangeSchema.default("7d"),
  resolution: supportedResolutionSchema.optional(),
  symbol: z.string().trim().min(2).max(32)
    .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .refine((value) => value.length >= 2, {
      message: "symbol must contain at least 2 alphanumeric characters",
    }),
  timezone: z.string().trim().min(2).max(64).optional(),
});

export type InstitutionalMacroRange = z.infer<typeof supportedRangeSchema>;
export type InstitutionalMacroMode = z.infer<typeof supportedModeSchema>;
export type InstitutionalMacroResolution = z.infer<typeof supportedResolutionSchema>;

type InstitutionalBias = "bullish" | "bearish" | "neutral";

type PowerOfThreePhase = "accumulation" | "manipulation" | "distribution" | "transition";

type MacroAlertLevel = "green" | "yellow" | "red";
type InstitutionalMarketDataSource = "yahoo_finance" | "synthetic";

interface MacroRadarEvent {
  hoursToEvent: number;
  impact: "high" | "medium";
  name: string;
}

const macroCalendarEventSchema = z.object({
  country: z.string().trim().optional(),
  date: z.union([z.number(), z.string()]).optional(),
  datetime: z.union([z.number(), z.string()]).optional(),
  event: z.string().trim().optional(),
  impact: z.union([z.number(), z.string()]).optional(),
  importance: z.union([z.number(), z.string()]).optional(),
  name: z.string().trim().optional(),
  timestamp: z.union([z.number(), z.string()]).optional(),
  title: z.string().trim().optional(),
});

export interface InstitutionalMacroPoint {
  close: number;
  high: number;
  low: number;
  open: number;
  timestamp: string;
  volume: number | null;
}

export interface InstitutionalMacroInsights {
  atrPercent: number;
  changePercent: number;
  confidenceScore: number;
  currentPrice: number;
  emaFast: number;
  emaSlow: number;
  highPrice: number;
  lowPrice: number;
  macdHistogram: number;
  momentumPercent: number;
  resistanceLevel: number;
  rsi14: number;
  supportLevel: number;
  tradeAction: "buy" | "sell" | "wait";
  tradeLevels: {
    entryZoneHigh: number;
    entryZoneLow: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2: number;
  };
  trend: InstitutionalBias;
  volatilityPercent: number;
}

export interface InstitutionalMacroResponse {
  assetId: string;
  cache: {
    stale: boolean;
    state: "fresh" | "miss" | "refreshed" | "stale";
  };
  currency: "usd";
  fetchedAt: string;
  marketDataSource: InstitutionalMarketDataSource;
  marketDataSymbol: string | null;
  insights: InstitutionalMacroInsights;
  institutional: {
    killzones: {
      narrative: string;
      phase: PowerOfThreePhase;
      session: "asia" | "london" | "new_york" | "off_session";
      utcHour: number;
    };
    macroRadar: {
      alertLevel: MacroAlertLevel;
      blockDirectionalRisk: boolean;
      message: string;
      safeHavenBias: "xauusd_bullish" | "neutral";
      upcomingEvents: Array<{
        hoursToEvent: number;
        impact: "high" | "medium";
        name: string;
      }>;
    };
    topDown: {
      daily: {
        bias: InstitutionalBias;
        pdl: number;
        pdh: number;
        summary: string;
      };
      h4: {
        bias: InstitutionalBias;
        crt: "active" | "inactive";
        erl: number;
        fvgCount: number;
        irl: number;
      };
      m5: {
        bias: InstitutionalBias;
        bos: "bullish" | "bearish" | "none";
        mss: "bullish" | "bearish" | "none";
        trigger: string;
      };
      vote: {
        bearish: number;
        bullish: number;
        confluence: "aligned" | "mixed";
        neutral: number;
      };
    };
  };
  live: null;
  mode: InstitutionalMacroMode;
  points: InstitutionalMacroPoint[];
  provider: "institutional_macro";
  range: InstitutionalMacroRange;
  strategy: "institutional_macro";
  symbol: string;
}

const rangeToPointCount: Record<InstitutionalMacroRange, number> = {
  "1y": 365,
  "24h": 96,
  "30d": 180,
  "7d": 168,
  "90d": 180,
};

const oneMinuteMs = 60 * 1000;
const oneDayMs = 24 * 60 * oneMinuteMs;

const yahooChartQuoteSeriesSchema = z.object({
  close: z.array(z.number().nullable()).optional(),
  high: z.array(z.number().nullable()).optional(),
  low: z.array(z.number().nullable()).optional(),
  open: z.array(z.number().nullable()).optional(),
  volume: z.array(z.number().nullable()).optional(),
});

const yahooChartResponseSchema = z.object({
  chart: z.object({
    result: z.array(z.object({
      indicators: z
        .object({
          quote: z.array(yahooChartQuoteSeriesSchema).optional(),
        })
        .optional(),
      timestamp: z.array(z.number().int()).optional(),
    })).nullable().optional(),
  }),
});

type YahooChartQuoteSeries = z.infer<typeof yahooChartQuoteSeriesSchema>;
type YahooChartResponse = z.infer<typeof yahooChartResponseSchema>;

const yahooChartSymbolAliasMap: Record<string, string> = {
  DAX40: "^GDAXI",
  DJI: "^DJI",
  GER40: "^GDAXI",
  HK50: "^HSI",
  JP225: "^N225",
  NAS100: "^NDX",
  SPX500: "^GSPC",
  UK100: "^FTSE",
  US100: "^NDX",
  US30: "^DJI",
  US500: "^GSPC",
  XAGUSD: "SI=F",
  XAUUSD: "GC=F",
};

const resolutionToMsMap: Record<Exclude<InstitutionalMacroResolution, "1S" | "5S" | "10S" | "15S" | "30S" | "45S">, number> = {
  "1": oneMinuteMs,
  "10": 10 * oneMinuteMs,
  "120": 120 * oneMinuteMs,
  "15": 15 * oneMinuteMs,
  "180": 180 * oneMinuteMs,
  "2": 2 * oneMinuteMs,
  "240": 240 * oneMinuteMs,
  "3": 3 * oneMinuteMs,
  "30": 30 * oneMinuteMs,
  "45": 45 * oneMinuteMs,
  "5": 5 * oneMinuteMs,
  "60": 60 * oneMinuteMs,
  D: oneDayMs,
  M: 30 * oneDayMs,
  W: 7 * oneDayMs,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function hashCode(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function estimateBasePrice(symbol: string): number {
  if (symbol.startsWith("XAU")) {
    return 2300;
  }

  if (symbol.startsWith("XAG")) {
    return 30;
  }

  if (/^(NAS|NDX|US100|SPX|US500|DJI|DAX|NIK)/.test(symbol)) {
    return 12000 + (hashCode(symbol) % 9000);
  }

  if (/^[A-Z]{6}$/.test(symbol)) {
    const spread = (hashCode(symbol) % 2500) / 10000;
    return 0.8 + spread;
  }

  return 100 + (hashCode(symbol) % 900);
}

function resolveBiasFromSeed(seed: number): InstitutionalBias {
  const bucket = seed % 3;

  if (bucket === 0) {
    return "bullish";
  }

  if (bucket === 1) {
    return "bearish";
  }

  return "neutral";
}

function deriveSession(utcHour: number): "asia" | "london" | "new_york" | "off_session" {
  if (utcHour >= 0 && utcHour < 7) {
    return "asia";
  }

  if (utcHour >= 7 && utcHour < 12) {
    return "london";
  }

  if (utcHour >= 12 && utcHour < 21) {
    return "new_york";
  }

  return "off_session";
}

function derivePowerOfThreePhase(session: "asia" | "london" | "new_york" | "off_session"): PowerOfThreePhase {
  if (session === "asia") {
    return "accumulation";
  }

  if (session === "london") {
    return "manipulation";
  }

  if (session === "new_york") {
    return "distribution";
  }

  return "transition";
}

function resolveYahooChartSymbol(symbol: string): string | null {
  if (typeof symbol !== "string" || symbol.length < 2) {
    return null;
  }

  if (symbol in yahooChartSymbolAliasMap) {
    return yahooChartSymbolAliasMap[symbol] ?? null;
  }

  if (/^[A-Z]{6}$/.test(symbol)) {
    return `${symbol}=X`;
  }

  return null;
}

function resolveYahooRangeConfig(range: InstitutionalMacroRange): {
  interval: "1d" | "1h" | "5m";
  range: "1d" | "7d" | "1mo" | "3mo" | "1y";
} {
  if (range === "24h") {
    return {
      interval: "5m",
      range: "1d",
    };
  }

  if (range === "7d") {
    return {
      interval: "1h",
      range: "7d",
    };
  }

  if (range === "30d") {
    return {
      interval: "1h",
      range: "1mo",
    };
  }

  if (range === "90d") {
    return {
      interval: "1d",
      range: "3mo",
    };
  }

  return {
    interval: "1d",
    range: "1y",
  };
}

function roundByMagnitude(value: number): number {
  return round(value, Math.abs(value) >= 50 ? 2 : 6);
}

function toFiniteNumberOrNull(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

async function loadMarketBackedSeries(
  symbol: string,
  range: InstitutionalMacroRange,
): Promise<{
  points: InstitutionalMacroPoint[];
  source: InstitutionalMarketDataSource;
  symbolResolved: string | null;
} | null> {
  if (
    process.env.NODE_ENV === "test"
    && process.env.FOREX_INSTITUTIONAL_REAL_SERIES_TEST !== "true"
  ) {
    return null;
  }

  const yahooSymbol = resolveYahooChartSymbol(symbol);

  if (!yahooSymbol) {
    return null;
  }

  const rangeConfig = resolveYahooRangeConfig(range);
  let requestUrl: URL;

  try {
    requestUrl = new URL(
      `/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`,
      env.YAHOO_FINANCE_API_BASE_URL,
    );
  } catch {
    return null;
  }

  requestUrl.searchParams.set("interval", rangeConfig.interval);
  requestUrl.searchParams.set("range", rangeConfig.range);

  let response: Response;

  try {
    response = await fetch(requestUrl.toString(), {
      headers: {
        accept: "application/json",
      },
      signal: AbortSignal.timeout(env.YAHOO_FINANCE_TIMEOUT_MS),
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    logger.warn(
      {
        responseStatus: response.status,
        symbol,
        yahooSymbol,
      },
      "Institutional macro yahoo chart unavailable",
    );
    return null;
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return null;
  }

  const parsedPayload = yahooChartResponseSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return null;
  }

  const chartPayload: YahooChartResponse = parsedPayload.data;
  const chartResult = chartPayload.chart.result?.[0] ?? null;
  const timestamps: number[] = Array.isArray(chartResult?.timestamp)
    ? chartResult.timestamp
    : [];
  const quote: YahooChartQuoteSeries | null = chartResult?.indicators?.quote?.[0] ?? null;

  if (!quote || timestamps.length === 0) {
    return null;
  }

  const points: InstitutionalMacroPoint[] = [];
  let previousClose: number | null = null;

  for (let index = 0; index < timestamps.length; index += 1) {
    const timestampSeconds = timestamps[index];

    if (typeof timestampSeconds !== "number" || !Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
      continue;
    }

    const openRaw = toFiniteNumberOrNull(quote.open?.[index]);
    const highRaw = toFiniteNumberOrNull(quote.high?.[index]);
    const lowRaw = toFiniteNumberOrNull(quote.low?.[index]);
    const closeRaw = toFiniteNumberOrNull(quote.close?.[index]);

    const close: number | null = closeRaw ?? openRaw ?? previousClose;

    if (close === null || close <= 0) {
      continue;
    }

    const normalizedClose: number = close;
    const open: number = openRaw ?? previousClose ?? normalizedClose;
    const high: number = Math.max(highRaw ?? normalizedClose, open, normalizedClose);
    const low: number = Math.min(lowRaw ?? normalizedClose, open, normalizedClose);
    const volumeRaw = toFiniteNumberOrNull(quote.volume?.[index]);
    const volume = volumeRaw !== null ? Math.max(0, volumeRaw) : null;

    points.push({
      close: roundByMagnitude(normalizedClose),
      high: roundByMagnitude(high),
      low: roundByMagnitude(low),
      open: roundByMagnitude(open),
      timestamp: new Date(timestampSeconds * 1000).toISOString(),
      volume,
    });

    previousClose = normalizedClose;
  }

  if (points.length < 12) {
    return null;
  }

  return {
    points,
    source: "yahoo_finance",
    symbolResolved: yahooSymbol,
  };
}

function buildSyntheticSeries(symbol: string, range: InstitutionalMacroRange): InstitutionalMacroPoint[] {
  const seed = hashCode(symbol);
  const totalPoints = rangeToPointCount[range];
  const nowMs = Date.now();
  const spacingMinutes = range === "24h" ? 15 : range === "7d" ? 60 : 240;
  const spacingMs = spacingMinutes * 60 * 1000;
  const basePrice = estimateBasePrice(symbol);
  const trendDirection = (seed % 5) - 2;
  const volatilityFactor = 0.0025 + ((seed % 17) / 10000);

  const points: InstitutionalMacroPoint[] = [];
  let previousClose = basePrice;

  for (let index = 0; index < totalPoints; index += 1) {
    const timestampMs = nowMs - (totalPoints - 1 - index) * spacingMs;
    const wave = Math.sin((index + (seed % 29)) / 8) * volatilityFactor;
    const drift = (trendDirection / 10000) * (1 + index / totalPoints);
    const noise = (((seed + index * 13) % 100) - 50) / 50000;
    const returnFactor = wave + drift + noise;
    const close = previousClose * (1 + returnFactor);
    const open = previousClose;
    const spread = Math.max(0.0001, Math.abs(close - open) * 0.8 + close * volatilityFactor * 0.5);
    const high = Math.max(open, close) + spread;
    const low = Math.min(open, close) - spread;

    points.push({
      close: round(close, close >= 50 ? 2 : 6),
      high: round(high, high >= 50 ? 2 : 6),
      low: round(low, low >= 50 ? 2 : 6),
      open: round(open, open >= 50 ? 2 : 6),
      timestamp: new Date(timestampMs).toISOString(),
      volume: null,
    });

    previousClose = close;
  }

  return points;
}

function normalizeRequestedResolution(
  resolution?: InstitutionalMacroResolution,
): Exclude<InstitutionalMacroResolution, "1S" | "5S" | "10S" | "15S" | "30S" | "45S"> | null {
  if (typeof resolution !== "string" || resolution.length === 0) {
    return null;
  }

  if (
    resolution === "1S"
    || resolution === "5S"
    || resolution === "10S"
    || resolution === "15S"
    || resolution === "30S"
    || resolution === "45S"
  ) {
    return "1";
  }

  return resolution;
}

function estimateSeriesSpacingMs(points: InstitutionalMacroPoint[]): number {
  if (points.length < 2) {
    return oneMinuteMs;
  }

  const diffs: number[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const previousTimestamp = Date.parse(points[index - 1]?.timestamp ?? "");
    const currentTimestamp = Date.parse(points[index]?.timestamp ?? "");

    if (!Number.isFinite(previousTimestamp) || !Number.isFinite(currentTimestamp)) {
      continue;
    }

    const diff = Math.round(currentTimestamp - previousTimestamp);

    if (diff > 0) {
      diffs.push(diff);
    }
  }

  if (diffs.length === 0) {
    return oneMinuteMs;
  }

  const sortedDiffs = diffs.sort((left, right) => left - right);
  return sortedDiffs[Math.floor(sortedDiffs.length / 2)] ?? oneMinuteMs;
}

function aggregateSeriesByInterval(
  points: InstitutionalMacroPoint[],
  targetIntervalMs: number,
): InstitutionalMacroPoint[] {
  if (points.length < 2 || targetIntervalMs <= 0) {
    return points;
  }

  const sortedPoints = points
    .slice()
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  const groupedPoints = new Map<number, InstitutionalMacroPoint>();

  for (const point of sortedPoints) {
    const parsedTimestamp = Date.parse(point.timestamp);

    if (!Number.isFinite(parsedTimestamp)) {
      continue;
    }

    const bucketTimestampMs = Math.floor(parsedTimestamp / targetIntervalMs) * targetIntervalMs;
    const currentBucket = groupedPoints.get(bucketTimestampMs);

    if (!currentBucket) {
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

    currentBucket.close = point.close;
    currentBucket.high = Math.max(currentBucket.high, point.high);
    currentBucket.low = Math.min(currentBucket.low, point.low);

    if (typeof point.volume === "number") {
      currentBucket.volume = (currentBucket.volume ?? 0) + point.volume;
    }
  }

  return [...groupedPoints.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, point]) => point);
}

function applyResolutionToSeries(
  points: InstitutionalMacroPoint[],
  resolution?: InstitutionalMacroResolution,
): InstitutionalMacroPoint[] {
  const normalizedResolution = normalizeRequestedResolution(resolution);

  if (!normalizedResolution) {
    return points;
  }

  const targetIntervalMs = resolutionToMsMap[normalizedResolution];

  if (!Number.isFinite(targetIntervalMs) || targetIntervalMs <= 0) {
    return points;
  }

  const sourceSpacingMs = estimateSeriesSpacingMs(points);

  if (targetIntervalMs <= sourceSpacingMs) {
    return points;
  }

  const resampledPoints = aggregateSeriesByInterval(points, targetIntervalMs);
  return resampledPoints.length > 0 ? resampledPoints : points;
}

function computeInsights(points: InstitutionalMacroPoint[]): InstitutionalMacroInsights {
  const first = points[0];
  const last = points[points.length - 1];

  if (!first || !last) {
    throw new Error("Institutional macro series requires at least one point");
  }

  const momentumAnchor = points.length > 4 ? points[points.length - 4] : null;
  const highs = points.map((point) => point.high);
  const lows = points.map((point) => point.low);
  const highPrice = Math.max(...highs);
  const lowPrice = Math.min(...lows);
  const currentPrice = last.close;
  const changePercent = ((currentPrice - first.open) / Math.max(first.open, 0.000001)) * 100;
  const momentumPercent = momentumAnchor
    ? ((currentPrice - momentumAnchor.close) / Math.max(momentumAnchor.close, 0.000001)) * 100
    : changePercent;
  const trend: InstitutionalBias =
    changePercent > 0.25 ? "bullish" : changePercent < -0.25 ? "bearish" : "neutral";
  const rsi14 = clamp(50 + momentumPercent * 4, 8, 92);
  const emaFast = currentPrice * (trend === "bullish" ? 1.0012 : trend === "bearish" ? 0.9988 : 1);
  const emaSlow = currentPrice * (trend === "bullish" ? 0.9992 : trend === "bearish" ? 1.0008 : 1);
  const volatilityPercent = clamp(((highPrice - lowPrice) / Math.max(currentPrice, 0.000001)) * 100, 0.15, 12);
  const atrPercent = clamp(volatilityPercent * 0.38, 0.08, 6);
  const macdHistogram = clamp(momentumPercent * 0.35, -4, 4);
  const supportLevel = lowPrice + (highPrice - lowPrice) * 0.22;
  const resistanceLevel = lowPrice + (highPrice - lowPrice) * 0.78;
  const direction = trend === "bullish" ? 1 : trend === "bearish" ? -1 : 0;
  const tacticalBandPercent = clamp(Math.max(atrPercent * 0.75, 0.2), 0.2, 2.4);
  const entryZoneLow = currentPrice * (1 - tacticalBandPercent / 100 * Math.max(direction, 0));
  const entryZoneHigh = currentPrice * (1 + tacticalBandPercent / 100 * Math.max(-direction, 0));
  const stopLoss =
    trend === "bullish"
      ? Math.min(supportLevel, currentPrice * (1 - tacticalBandPercent * 1.3 / 100))
      : trend === "bearish"
        ? Math.max(resistanceLevel, currentPrice * (1 + tacticalBandPercent * 1.3 / 100))
        : currentPrice * (1 - tacticalBandPercent / 100);
  const takeProfit1 =
    trend === "bullish"
      ? Math.max(resistanceLevel, currentPrice * (1 + tacticalBandPercent * 1.6 / 100))
      : trend === "bearish"
        ? Math.min(supportLevel, currentPrice * (1 - tacticalBandPercent * 1.6 / 100))
        : currentPrice * (1 + tacticalBandPercent / 100);
  const takeProfit2 =
    trend === "bullish"
      ? currentPrice * (1 + tacticalBandPercent * 2.4 / 100)
      : trend === "bearish"
        ? currentPrice * (1 - tacticalBandPercent * 2.4 / 100)
        : currentPrice * (1 + tacticalBandPercent * 1.4 / 100);
  const confidenceScore = clamp(50 + Math.abs(changePercent) * 4 + Math.abs(momentumPercent) * 3 - volatilityPercent * 2, 12, 93);

  return {
    atrPercent: round(atrPercent, 2),
    changePercent: round(changePercent, 2),
    confidenceScore: round(confidenceScore, 1),
    currentPrice: round(currentPrice, currentPrice >= 50 ? 2 : 6),
    emaFast: round(emaFast, emaFast >= 50 ? 2 : 6),
    emaSlow: round(emaSlow, emaSlow >= 50 ? 2 : 6),
    highPrice: round(highPrice, highPrice >= 50 ? 2 : 6),
    lowPrice: round(lowPrice, lowPrice >= 50 ? 2 : 6),
    macdHistogram: round(macdHistogram, 2),
    momentumPercent: round(momentumPercent, 2),
    resistanceLevel: round(resistanceLevel, resistanceLevel >= 50 ? 2 : 6),
    rsi14: round(rsi14, 2),
    supportLevel: round(supportLevel, supportLevel >= 50 ? 2 : 6),
    tradeAction: trend === "bullish" ? "buy" : trend === "bearish" ? "sell" : "wait",
    tradeLevels: {
      entryZoneHigh: round(entryZoneHigh, entryZoneHigh >= 50 ? 2 : 6),
      entryZoneLow: round(entryZoneLow, entryZoneLow >= 50 ? 2 : 6),
      stopLoss: round(stopLoss, stopLoss >= 50 ? 2 : 6),
      takeProfit1: round(takeProfit1, takeProfit1 >= 50 ? 2 : 6),
      takeProfit2: round(takeProfit2, takeProfit2 >= 50 ? 2 : 6),
    },
    trend,
    volatilityPercent: round(volatilityPercent, 2),
  };
}

function computeNextEventHours(now: Date, weekdayUtc: number, hourUtc: number): number {
  const anchor = new Date(now);
  const currentWeekday = anchor.getUTCDay();
  const dayOffsetRaw = weekdayUtc - currentWeekday;
  const dayOffset = dayOffsetRaw >= 0 ? dayOffsetRaw : dayOffsetRaw + 7;

  anchor.setUTCDate(anchor.getUTCDate() + dayOffset);
  anchor.setUTCHours(hourUtc, 0, 0, 0);

  if (anchor.getTime() <= now.getTime()) {
    anchor.setUTCDate(anchor.getUTCDate() + 7);
  }

  return Math.max(0, Math.round((anchor.getTime() - now.getTime()) / (1000 * 60 * 60)));
}

function normalizeMacroImpactLevel(value: unknown): "high" | "medium" | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 3) {
      return "high";
    }

    if (value >= 2) {
      return "medium";
    }
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toLowerCase().trim();

  if (normalized.length === 0) {
    return null;
  }

  if (/(high|alto|red|major|critical|3)/.test(normalized)) {
    return "high";
  }

  if (/(medium|moderate|medio|amarelo|yellow|2)/.test(normalized)) {
    return "medium";
  }

  return null;
}

function parseMacroEventTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1_000_000_000_000) {
      return value;
    }

    if (value > 1_000_000_000) {
      return value * 1000;
    }

    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  const numeric = Number.parseFloat(normalized);

  if (Number.isFinite(numeric)) {
    return parseMacroEventTimestamp(numeric);
  }

  const parsedDate = Date.parse(normalized);
  return Number.isFinite(parsedDate) ? parsedDate : null;
}

function collectExternalCalendarRecords(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;

  if (Array.isArray(record.events)) {
    return record.events;
  }

  if (Array.isArray(record.data)) {
    return record.data;
  }

  if (Array.isArray(record.results)) {
    return record.results;
  }

  return [];
}

function extractExternalMacroEvents(payload: unknown, now: Date): MacroRadarEvent[] {
  const rawRecords = collectExternalCalendarRecords(payload);
  const nowMs = now.getTime();
  const dedupe = new Set<string>();
  const events: MacroRadarEvent[] = [];

  for (const rawRecord of rawRecords) {
    const parsedRecord = macroCalendarEventSchema.safeParse(rawRecord);

    if (!parsedRecord.success) {
      continue;
    }

    const eventNameBase = parsedRecord.data.event
      ?? parsedRecord.data.title
      ?? parsedRecord.data.name;

    if (!eventNameBase) {
      continue;
    }

    const eventTimestamp =
      parseMacroEventTimestamp(parsedRecord.data.timestamp)
      ?? parseMacroEventTimestamp(parsedRecord.data.datetime)
      ?? parseMacroEventTimestamp(parsedRecord.data.date);

    if (!eventTimestamp) {
      continue;
    }

    const hoursToEvent = Math.round((eventTimestamp - nowMs) / (1000 * 60 * 60));

    if (hoursToEvent < 0 || hoursToEvent > 72) {
      continue;
    }

    const impact = normalizeMacroImpactLevel(parsedRecord.data.impact ?? parsedRecord.data.importance);

    if (!impact) {
      continue;
    }

    const eventName = parsedRecord.data.country
      ? `${parsedRecord.data.country} ${eventNameBase}`
      : eventNameBase;
    const dedupeKey = `${eventName.toLowerCase()}::${hoursToEvent}::${impact}`;

    if (dedupe.has(dedupeKey)) {
      continue;
    }

    dedupe.add(dedupeKey);
    events.push({
      hoursToEvent,
      impact,
      name: eventName,
    });
  }

  return events
    .sort((left, right) => left.hoursToEvent - right.hoursToEvent)
    .slice(0, 4);
}

function buildFallbackMacroEvents(now: Date): MacroRadarEvent[] {
  const fallbackEvents: MacroRadarEvent[] = [
    {
      hoursToEvent: computeNextEventHours(now, 3, 12),
      impact: "high",
      name: "US CPI",
    },
    {
      hoursToEvent: computeNextEventHours(now, 5, 12),
      impact: "high",
      name: "US Non-Farm Payrolls",
    },
    {
      hoursToEvent: computeNextEventHours(now, 4, 18),
      impact: "medium",
      name: "FOMC Minutes",
    },
  ];

  return fallbackEvents.sort((left, right) => left.hoursToEvent - right.hoursToEvent);
}

async function loadExternalMacroEvents(now: Date): Promise<MacroRadarEvent[] | null> {
  const configuredUrl = process.env.FOREX_MACRO_CALENDAR_URL?.trim() ?? "";
  const configuredApiKey = process.env.FOREX_MACRO_CALENDAR_API_KEY?.trim() ?? "";
  const providerUrl = configuredUrl.length > 0
    ? configuredUrl
    : configuredApiKey.length > 0
      ? "https://financialmodelingprep.com/api/v3/economic_calendar"
      : "";

  if (providerUrl.length === 0) {
    return null;
  }

  let requestUrl: URL;

  try {
    requestUrl = new URL(providerUrl);
  } catch {
    return null;
  }

  const fromDate = new Date(now);
  fromDate.setUTCDate(fromDate.getUTCDate() - 1);
  const toDate = new Date(now);
  toDate.setUTCDate(toDate.getUTCDate() + 7);

  if (!requestUrl.searchParams.has("from")) {
    requestUrl.searchParams.set("from", fromDate.toISOString().slice(0, 10));
  }

  if (!requestUrl.searchParams.has("to")) {
    requestUrl.searchParams.set("to", toDate.toISOString().slice(0, 10));
  }

  if (
    configuredApiKey.length > 0
    && !requestUrl.searchParams.has("apikey")
    && !requestUrl.searchParams.has("apiKey")
  ) {
    requestUrl.searchParams.set("apikey", configuredApiKey);
  }

  let response: Response;

  try {
    response = await fetch(requestUrl.toString(), {
      headers: {
        accept: "application/json",
      },
      signal: AbortSignal.timeout(1800),
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return null;
  }

  const events = extractExternalMacroEvents(payload, now);
  return events.length > 0 ? events : null;
}

function buildMacroRadarMessage(
  alertLevel: MacroAlertLevel,
  nextEvent: MacroRadarEvent,
  source: "external" | "fallback",
): string {
  const sourceLabel = source === "external"
    ? "Agenda macro em tempo real ativa."
    : "Agenda macro em fallback sintetico.";

  if (alertLevel === "red") {
    return `${sourceLabel} Alerta vermelho: ${nextEvent.name} em ~${nextEvent.hoursToEvent}h. Evite risco direcional excessivo.`;
  }

  if (alertLevel === "yellow") {
    return `${sourceLabel} Alerta amarelo: ${nextEvent.name} em ~${nextEvent.hoursToEvent}h. Reduza tamanho e aguarde confirmacao estrutural.`;
  }

  return `${sourceLabel} Sem choque macro iminente. Proximo evento relevante: ${nextEvent.name} em ~${nextEvent.hoursToEvent}h.`;
}

export class InstitutionalMacroService {
  public async getStrategySnapshot(input: {
    mode?: InstitutionalMacroMode;
    module?: string;
    range?: InstitutionalMacroRange;
    resolution?: InstitutionalMacroResolution;
    symbol: string;
    timezone?: string;
  }): Promise<InstitutionalMacroResponse> {
    const parsedInput = strategyInputSchema.parse(input);
    const now = new Date();
    const utcHour = now.getUTCHours();
    const seed = hashCode(`${parsedInput.module}:${parsedInput.symbol}:${parsedInput.range}`);
    const marketSeries = await loadMarketBackedSeries(parsedInput.symbol, parsedInput.range);
    const marketDataSource: InstitutionalMarketDataSource = marketSeries?.source ?? "synthetic";
    const marketDataSymbol = marketSeries?.symbolResolved ?? null;
    const sourceSeries = marketSeries?.points
      ?? buildSyntheticSeries(parsedInput.symbol, parsedInput.range);
    const points = applyResolutionToSeries(
      sourceSeries,
      parsedInput.resolution,
    );
    const insights = computeInsights(points);

    const dailyBias = resolveBiasFromSeed(seed);
    const h4Bias = resolveBiasFromSeed(seed + 7);
    const m5Bias = resolveBiasFromSeed(seed + 13);

    const vote = {
      bearish: [dailyBias, h4Bias, m5Bias].filter((item) => item === "bearish").length,
      bullish: [dailyBias, h4Bias, m5Bias].filter((item) => item === "bullish").length,
      neutral: [dailyBias, h4Bias, m5Bias].filter((item) => item === "neutral").length,
    };

    const session = deriveSession(utcHour);
    const phase = derivePowerOfThreePhase(session);
    const fallbackEvents = buildFallbackMacroEvents(now);
    const externalEvents = await loadExternalMacroEvents(now);
    const upcomingEvents = (externalEvents ?? fallbackEvents).slice(0, 3);
    const nextEvent =
      upcomingEvents[0]
      ?? fallbackEvents[0]
      ?? {
        hoursToEvent: 24,
        impact: "medium",
        name: "Macro Window",
      };
    const minHoursToImpact = upcomingEvents.reduce(
      (currentMin, eventItem) => Math.min(currentMin, eventItem.hoursToEvent),
      Number.POSITIVE_INFINITY,
    );
    const safeHoursToImpact = Number.isFinite(minHoursToImpact)
      ? minHoursToImpact
      : nextEvent.hoursToEvent;
    const alertLevel: MacroAlertLevel =
      safeHoursToImpact <= 3 ? "red" : safeHoursToImpact <= 8 ? "yellow" : "green";
    const macroSource = externalEvents ? "external" : "fallback";
    const macroMessage = buildMacroRadarMessage(alertLevel, nextEvent, macroSource);

    return {
      assetId: parsedInput.symbol.toLowerCase(),
      cache: {
        stale: false,
        state: "refreshed",
      },
      currency: "usd",
      fetchedAt: now.toISOString(),
      marketDataSource,
      marketDataSymbol,
      insights,
      institutional: {
        killzones: {
          narrative:
            phase === "distribution"
              ? "Asia acumulou, Londres manipulou e NY tende a distribuicao. Priorize confirmacao de fluxo antes de entrar."
              : phase === "manipulation"
                ? "Londres em fase de manipulacao de liquidez. Evite perseguir rompimentos sem MSS/BOS."
                : phase === "accumulation"
                  ? "Sessao asiatica com acumulacao. Mantenha foco em niveis de liquidez para a abertura de Londres."
                  : "Fora de killzone principal. Reduza agressividade e prefira setups com maior confluencia.",
          phase,
          session,
          utcHour,
        },
        macroRadar: {
          alertLevel,
          blockDirectionalRisk: alertLevel === "red",
          message: macroMessage,
          safeHavenBias: alertLevel === "red" ? "xauusd_bullish" : "neutral",
          upcomingEvents,
        },
        topDown: {
          daily: {
            bias: dailyBias,
            pdl: round(insights.lowPrice * 0.998, insights.lowPrice >= 50 ? 2 : 6),
            pdh: round(insights.highPrice * 1.002, insights.highPrice >= 50 ? 2 : 6),
            summary: "D1 mapeado com PDH/PDL e viés estrutural para filtro de direcao.",
          },
          h4: {
            bias: h4Bias,
            crt: seed % 2 === 0 ? "active" : "inactive",
            erl: round(insights.resistanceLevel * 1.0015, insights.resistanceLevel >= 50 ? 2 : 6),
            fvgCount: 1 + (seed % 4),
            irl: round(insights.supportLevel * 0.9985, insights.supportLevel >= 50 ? 2 : 6),
          },
          m5: {
            bias: m5Bias,
            bos: m5Bias === "bullish" ? "bullish" : m5Bias === "bearish" ? "bearish" : "none",
            mss: vote.bullish === vote.bearish ? "none" : vote.bullish > vote.bearish ? "bullish" : "bearish",
            trigger: "Aguardar gatilho MSS/BOS alinhado ao viés D1+H4 antes da execucao.",
          },
          vote: {
            bearish: vote.bearish,
            bullish: vote.bullish,
            confluence: Math.max(vote.bullish, vote.bearish) >= 2 ? "aligned" : "mixed",
            neutral: vote.neutral,
          },
        },
      },
      live: null,
      mode: parsedInput.mode,
      points,
      provider: "institutional_macro",
      range: parsedInput.range,
      strategy: "institutional_macro",
      symbol: parsedInput.symbol,
    };
  }
}
