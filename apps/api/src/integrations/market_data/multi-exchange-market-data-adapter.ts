import { z } from "zod";

import { AppError } from "../../shared/errors/app-error.js";
import { retryWithExponentialBackoff } from "../../shared/resilience/retry-with-backoff.js";

const exchangeBrokerSchema = z.enum(["bybit", "coinbase", "kraken", "okx"]);
const chartRangeSchema = z.enum(["24h", "7d", "30d", "90d", "1y"]);

const tickerInputSchema = z.object({
  assetId: z.string().trim().min(1).transform((value) => value.toLowerCase()),
  broker: exchangeBrokerSchema,
});

const marketChartInputSchema = z.object({
  assetId: z.string().trim().min(1).transform((value) => value.toLowerCase()),
  broker: exchangeBrokerSchema,
  range: chartRangeSchema.default("24h"),
});

export type ExchangeBroker = z.infer<typeof exchangeBrokerSchema>;
export type ExchangeChartRange = z.infer<typeof chartRangeSchema>;

interface ExchangePairConfig {
  bybit: string;
  coinbase: string;
  kraken: string;
  okx: string;
}

interface ExchangeRangeConfig {
  bybit: {
    interval: string;
    limit: number;
  };
  coinbase: {
    granularitySeconds: number;
    windowMs: number;
  };
  kraken: {
    intervalMinutes: number;
    windowMs: number;
  };
  okx: {
    bar: string;
    limit: number;
  };
}

const assetPairMap = new Map<string, ExchangePairConfig>([
  ["aave", { bybit: "AAVEUSDT", coinbase: "AAVE-USD", kraken: "AAVEUSD", okx: "AAVE-USDT" }],
  ["avalanche-2", { bybit: "AVAXUSDT", coinbase: "AVAX-USD", kraken: "AVAXUSD", okx: "AVAX-USDT" }],
  ["binancecoin", { bybit: "BNBUSDT", coinbase: "BNB-USD", kraken: "BNBUSD", okx: "BNB-USDT" }],
  ["bitcoin", { bybit: "BTCUSDT", coinbase: "BTC-USD", kraken: "XBTUSD", okx: "BTC-USDT" }],
  ["cardano", { bybit: "ADAUSDT", coinbase: "ADA-USD", kraken: "ADAUSD", okx: "ADA-USDT" }],
  ["chainlink", { bybit: "LINKUSDT", coinbase: "LINK-USD", kraken: "LINKUSD", okx: "LINK-USDT" }],
  ["dogecoin", { bybit: "DOGEUSDT", coinbase: "DOGE-USD", kraken: "DOGEUSD", okx: "DOGE-USDT" }],
  ["ethereum", { bybit: "ETHUSDT", coinbase: "ETH-USD", kraken: "ETHUSD", okx: "ETH-USDT" }],
  ["litecoin", { bybit: "LTCUSDT", coinbase: "LTC-USD", kraken: "LTCUSD", okx: "LTC-USDT" }],
  ["polkadot", { bybit: "DOTUSDT", coinbase: "DOT-USD", kraken: "DOTUSD", okx: "DOT-USDT" }],
  ["solana", { bybit: "SOLUSDT", coinbase: "SOL-USD", kraken: "SOLUSD", okx: "SOL-USDT" }],
  ["tron", { bybit: "TRXUSDT", coinbase: "TRX-USD", kraken: "TRXUSD", okx: "TRX-USDT" }],
  ["uniswap", { bybit: "UNIUSDT", coinbase: "UNI-USD", kraken: "UNIUSD", okx: "UNI-USDT" }],
  ["xrp", { bybit: "XRPUSDT", coinbase: "XRP-USD", kraken: "XRPUSD", okx: "XRP-USDT" }],
]);

const EXCHANGE_TIMEOUT_MS = 7000;

function parseFloatSafe(value: string | number | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function isRetryableStatusCode(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

function normalizeBaseSymbol(assetId: string): string {
  return assetId.replace(/[^a-z0-9]/g, "").toUpperCase();
}

function resolvePair(assetId: string, broker: ExchangeBroker): string {
  const mapped = assetPairMap.get(assetId)?.[broker];

  if (mapped) {
    return mapped;
  }

  const baseSymbol = normalizeBaseSymbol(assetId);

  if (broker === "coinbase") {
    return `${baseSymbol}-USD`;
  }

  if (broker === "okx") {
    return `${baseSymbol}-USDT`;
  }

  if (broker === "kraken") {
    return `${baseSymbol}USD`;
  }

  return `${baseSymbol}USDT`;
}

function normalizeBrokerSymbol(pair: string): string {
  return pair.replace(/-/g, "").toUpperCase();
}

function computeChangePercent(lastPrice: number | null, openPrice: number | null): number | null {
  if (lastPrice === null || openPrice === null || openPrice <= 0) {
    return null;
  }

  return Number((((lastPrice - openPrice) / openPrice) * 100).toFixed(4));
}

function resolveRangeConfig(range: ExchangeChartRange): ExchangeRangeConfig {
  if (range === "24h") {
    return {
      bybit: {
        interval: "5",
        limit: 288,
      },
      coinbase: {
        granularitySeconds: 300,
        windowMs: 86_400_000,
      },
      kraken: {
        intervalMinutes: 5,
        windowMs: 86_400_000,
      },
      okx: {
        bar: "5m",
        limit: 288,
      },
    };
  }

  if (range === "7d") {
    return {
      bybit: {
        interval: "60",
        limit: 168,
      },
      coinbase: {
        granularitySeconds: 3600,
        windowMs: 604_800_000,
      },
      kraken: {
        intervalMinutes: 60,
        windowMs: 604_800_000,
      },
      okx: {
        bar: "1H",
        limit: 168,
      },
    };
  }

  if (range === "30d") {
    return {
      bybit: {
        interval: "240",
        limit: 180,
      },
      coinbase: {
        granularitySeconds: 21_600,
        windowMs: 2_592_000_000,
      },
      kraken: {
        intervalMinutes: 240,
        windowMs: 2_592_000_000,
      },
      okx: {
        bar: "4H",
        limit: 180,
      },
    };
  }

  if (range === "90d") {
    return {
      bybit: {
        interval: "720",
        limit: 180,
      },
      coinbase: {
        granularitySeconds: 21_600,
        windowMs: 7_776_000_000,
      },
      kraken: {
        intervalMinutes: 240,
        windowMs: 7_776_000_000,
      },
      okx: {
        bar: "12H",
        limit: 180,
      },
    };
  }

  return {
    bybit: {
      interval: "D",
      limit: 365,
    },
    coinbase: {
      granularitySeconds: 86_400,
      windowMs: 31_536_000_000,
    },
    kraken: {
      intervalMinutes: 1_440,
      windowMs: 31_536_000_000,
    },
    okx: {
      bar: "1D",
      limit: 300,
    },
  };
}

function toIsoTimestamp(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

function buildChartPoint(
  timestampMs: number,
  open: number | null,
  high: number | null,
  low: number | null,
  close: number | null,
  volume: number | null,
): MultiExchangeChartPoint | null {
  if (
    open === null
    || high === null
    || low === null
    || close === null
    || !Number.isFinite(timestampMs)
  ) {
    return null;
  }

  const normalizedHigh = Math.max(high, open, close);
  const normalizedLow = Math.min(low, open, close);

  return {
    close: roundPrice(close),
    high: roundPrice(normalizedHigh),
    low: roundPrice(normalizedLow),
    open: roundPrice(open),
    timestamp: toIsoTimestamp(timestampMs),
    volume: volume === null || Number.isNaN(volume) ? null : roundPrice(volume),
  };
}

function assertSufficientChartPoints(
  points: MultiExchangeChartPoint[],
  broker: ExchangeBroker,
  assetId: string,
): void {
  if (points.length >= 5) {
    return;
  }

  throw new AppError({
    code: "BROKER_NATIVE_EMPTY_CHART",
    details: {
      assetId,
      broker,
      points: points.length,
      retryable: true,
    },
    message: "Native broker returned insufficient chart points",
    statusCode: 503,
  });
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new AppError({
      code: "BROKER_NATIVE_INVALID_JSON",
      message: "Native broker returned an invalid JSON payload",
      statusCode: 502,
    });
  }
}

export interface MultiExchangeChartPoint {
  close: number;
  high: number;
  low: number;
  open: number;
  timestamp: string;
  volume: number | null;
}

export interface MultiExchangeMarketChart {
  assetId: string;
  broker: ExchangeBroker;
  fetchedAt: string;
  points: MultiExchangeChartPoint[];
  range: ExchangeChartRange;
  symbol: string;
}

export interface MultiExchangeTickerSnapshot {
  assetId: string;
  broker: ExchangeBroker;
  changePercent24h: number | null;
  fetchedAt: string;
  lastPrice: number;
  symbol: string;
  volume24h: number | null;
}

export class MultiExchangeMarketDataAdapter {
  public async getTickerSnapshot(input: {
    assetId: string;
    broker: ExchangeBroker;
  }): Promise<MultiExchangeTickerSnapshot> {
    const parsedInput = tickerInputSchema.parse(input);

    return retryWithExponentialBackoff(
      async () => {
        if (parsedInput.broker === "bybit") {
          return this.getBybitTicker(parsedInput.assetId);
        }

        if (parsedInput.broker === "okx") {
          return this.getOkxTicker(parsedInput.assetId);
        }

        if (parsedInput.broker === "coinbase") {
          return this.getCoinbaseTicker(parsedInput.assetId);
        }

        return this.getKrakenTicker(parsedInput.assetId);
      },
      {
        attempts: 3,
        baseDelayMs: 220,
        jitterPercent: 24,
        shouldRetry: (error) => {
          if (!(error instanceof AppError)) {
            return true;
          }

          if (error.code === "BROKER_NATIVE_UNAVAILABLE") {
            return true;
          }

          if (error.code === "BROKER_NATIVE_BAD_STATUS") {
            const details = error.details;
            return typeof details === "object"
              && details !== null
              && (details as { retryable?: boolean }).retryable === true;
          }

          if (error.code === "BROKER_NATIVE_EMPTY_CHART") {
            return true;
          }

          return false;
        },
      },
    );
  }

  public async getMarketChart(input: {
    assetId: string;
    broker: ExchangeBroker;
    range: ExchangeChartRange;
  }): Promise<MultiExchangeMarketChart> {
    const parsedInput = marketChartInputSchema.parse(input);

    return retryWithExponentialBackoff(
      async () => {
        if (parsedInput.broker === "bybit") {
          return this.getBybitMarketChart(parsedInput.assetId, parsedInput.range);
        }

        if (parsedInput.broker === "okx") {
          return this.getOkxMarketChart(parsedInput.assetId, parsedInput.range);
        }

        if (parsedInput.broker === "coinbase") {
          return this.getCoinbaseMarketChart(parsedInput.assetId, parsedInput.range);
        }

        return this.getKrakenMarketChart(parsedInput.assetId, parsedInput.range);
      },
      {
        attempts: 3,
        baseDelayMs: 240,
        jitterPercent: 24,
        shouldRetry: (error) => {
          if (!(error instanceof AppError)) {
            return true;
          }

          if (error.code === "BROKER_NATIVE_UNAVAILABLE") {
            return true;
          }

          if (error.code === "BROKER_NATIVE_BAD_STATUS") {
            const details = error.details;
            return typeof details === "object"
              && details !== null
              && (details as { retryable?: boolean }).retryable === true;
          }

          if (error.code === "BROKER_NATIVE_EMPTY_CHART") {
            return true;
          }

          return false;
        },
      },
    );
  }

  private async requestJson(url: string): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
      });
    } catch (cause) {
      throw new AppError({
        code: "BROKER_NATIVE_UNAVAILABLE",
        details: {
          cause,
          retryable: true,
        },
        message: "Native broker request failed",
        statusCode: 503,
      });
    }

    if (!response.ok) {
      const responseBody = await response.text();
      const retryable = isRetryableStatusCode(response.status);

      throw new AppError({
        code: "BROKER_NATIVE_BAD_STATUS",
        details: {
          responseBody: responseBody.slice(0, 1000),
          responseStatus: response.status,
          retryable,
        },
        message: "Native broker returned a non-success status",
        statusCode: retryable ? 503 : 502,
      });
    }

    return safeJson(response);
  }

  private async getBybitTicker(assetId: string): Promise<MultiExchangeTickerSnapshot> {
    const symbol = resolvePair(assetId, "bybit");
    const payload = await this.requestJson(
      `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${encodeURIComponent(symbol)}`,
    );

    const list =
      typeof payload === "object"
      && payload !== null
      && "result" in payload
      && typeof payload.result === "object"
      && payload.result !== null
      && "list" in payload.result
      && Array.isArray(payload.result.list)
        ? payload.result.list
        : [];
    const first = list[0] as Record<string, unknown> | undefined;

    const price = parseFloatSafe(typeof first?.lastPrice === "string" ? first.lastPrice : undefined);

    if (price === null) {
      throw new AppError({
        code: "BROKER_NATIVE_SCHEMA_MISMATCH",
        message: "Bybit ticker payload schema mismatch",
        statusCode: 502,
      });
    }

    const changePercentFraction = parseFloatSafe(
      typeof first?.price24hPcnt === "string" ? first.price24hPcnt : undefined,
    );

    return {
      assetId,
      broker: "bybit",
      changePercent24h:
        changePercentFraction === null ? null : Number((changePercentFraction * 100).toFixed(4)),
      fetchedAt: new Date().toISOString(),
      lastPrice: roundPrice(price),
      symbol: normalizeBrokerSymbol(symbol),
      volume24h: parseFloatSafe(typeof first?.turnover24h === "string" ? first.turnover24h : undefined),
    };
  }

  private async getBybitMarketChart(assetId: string, range: ExchangeChartRange): Promise<MultiExchangeMarketChart> {
    const pair = resolvePair(assetId, "bybit");
    const rangeConfig = resolveRangeConfig(range);
    const payload = await this.requestJson(
      `https://api.bybit.com/v5/market/kline?category=spot&symbol=${encodeURIComponent(pair)}&interval=${encodeURIComponent(rangeConfig.bybit.interval)}&limit=${rangeConfig.bybit.limit}`,
    );

    const list =
      typeof payload === "object"
      && payload !== null
      && "result" in payload
      && typeof payload.result === "object"
      && payload.result !== null
      && "list" in payload.result
      && Array.isArray(payload.result.list)
        ? payload.result.list
        : [];

    const points = list
      .map((item) => {
        const row = Array.isArray(item) ? item : [];

        return buildChartPoint(
          Number.parseInt(String(row[0] ?? ""), 10),
          parseFloatSafe(typeof row[1] === "string" ? row[1] : undefined),
          parseFloatSafe(typeof row[2] === "string" ? row[2] : undefined),
          parseFloatSafe(typeof row[3] === "string" ? row[3] : undefined),
          parseFloatSafe(typeof row[4] === "string" ? row[4] : undefined),
          parseFloatSafe(typeof row[5] === "string" ? row[5] : undefined),
        );
      })
      .filter((point): point is MultiExchangeChartPoint => point !== null)
      .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));

    assertSufficientChartPoints(points, "bybit", assetId);

    return {
      assetId,
      broker: "bybit",
      fetchedAt: new Date().toISOString(),
      points,
      range,
      symbol: normalizeBrokerSymbol(pair),
    };
  }

  private async getOkxTicker(assetId: string): Promise<MultiExchangeTickerSnapshot> {
    const pair = resolvePair(assetId, "okx");
    const payload = await this.requestJson(
      `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(pair)}`,
    );

    const data =
      typeof payload === "object"
      && payload !== null
      && "data" in payload
      && Array.isArray(payload.data)
        ? payload.data
        : [];
    const first = data[0] as Record<string, unknown> | undefined;

    const lastPrice = parseFloatSafe(typeof first?.last === "string" ? first.last : undefined);

    if (lastPrice === null) {
      throw new AppError({
        code: "BROKER_NATIVE_SCHEMA_MISMATCH",
        message: "OKX ticker payload schema mismatch",
        statusCode: 502,
      });
    }

    const openPrice = parseFloatSafe(typeof first?.open24h === "string" ? first.open24h : undefined);

    return {
      assetId,
      broker: "okx",
      changePercent24h: computeChangePercent(lastPrice, openPrice),
      fetchedAt: new Date().toISOString(),
      lastPrice: roundPrice(lastPrice),
      symbol: normalizeBrokerSymbol(pair),
      volume24h: parseFloatSafe(typeof first?.volCcy24h === "string" ? first.volCcy24h : undefined),
    };
  }

  private async getOkxMarketChart(assetId: string, range: ExchangeChartRange): Promise<MultiExchangeMarketChart> {
    const pair = resolvePair(assetId, "okx");
    const rangeConfig = resolveRangeConfig(range);
    const payload = await this.requestJson(
      `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(pair)}&bar=${encodeURIComponent(rangeConfig.okx.bar)}&limit=${rangeConfig.okx.limit}`,
    );

    const data =
      typeof payload === "object"
      && payload !== null
      && "data" in payload
      && Array.isArray(payload.data)
        ? payload.data
        : [];

    const points = data
      .map((item) => {
        const row = Array.isArray(item) ? item : [];

        return buildChartPoint(
          Number.parseInt(String(row[0] ?? ""), 10),
          parseFloatSafe(typeof row[1] === "string" ? row[1] : undefined),
          parseFloatSafe(typeof row[2] === "string" ? row[2] : undefined),
          parseFloatSafe(typeof row[3] === "string" ? row[3] : undefined),
          parseFloatSafe(typeof row[4] === "string" ? row[4] : undefined),
          parseFloatSafe(typeof row[5] === "string" ? row[5] : undefined),
        );
      })
      .filter((point): point is MultiExchangeChartPoint => point !== null)
      .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));

    assertSufficientChartPoints(points, "okx", assetId);

    return {
      assetId,
      broker: "okx",
      fetchedAt: new Date().toISOString(),
      points,
      range,
      symbol: normalizeBrokerSymbol(pair),
    };
  }

  private async getCoinbaseTicker(assetId: string): Promise<MultiExchangeTickerSnapshot> {
    const pair = resolvePair(assetId, "coinbase");
    const tickerEndpoint = `https://api.exchange.coinbase.com/products/${encodeURIComponent(pair)}/ticker`;
    const statsEndpoint = `https://api.exchange.coinbase.com/products/${encodeURIComponent(pair)}/stats`;

    const [tickerPayload, statsPayloadResult] = await Promise.all([
      this.requestJson(tickerEndpoint),
      this.requestJson(statsEndpoint).catch(() => null),
    ]);

    const ticker = tickerPayload as Record<string, unknown>;
    const lastPrice = parseFloatSafe(typeof ticker.price === "string" ? ticker.price : undefined);

    if (lastPrice === null) {
      throw new AppError({
        code: "BROKER_NATIVE_SCHEMA_MISMATCH",
        message: "Coinbase ticker payload schema mismatch",
        statusCode: 502,
      });
    }

    const stats =
      statsPayloadResult !== null && typeof statsPayloadResult === "object"
        ? (statsPayloadResult as Record<string, unknown>)
        : null;

    const openPrice =
      parseFloatSafe(typeof stats?.open === "string" ? stats.open : undefined)
      ?? parseFloatSafe(typeof ticker.open === "string" ? ticker.open : undefined);

    const volumeFromStats = parseFloatSafe(typeof stats?.volume === "string" ? stats.volume : undefined);
    const volumeFromTicker = parseFloatSafe(typeof ticker.volume === "string" ? ticker.volume : undefined);

    return {
      assetId,
      broker: "coinbase",
      changePercent24h: computeChangePercent(lastPrice, openPrice),
      fetchedAt: new Date().toISOString(),
      lastPrice: roundPrice(lastPrice),
      symbol: normalizeBrokerSymbol(pair),
      volume24h: volumeFromStats ?? volumeFromTicker,
    };
  }

  private async getCoinbaseMarketChart(assetId: string, range: ExchangeChartRange): Promise<MultiExchangeMarketChart> {
    const pair = resolvePair(assetId, "coinbase");
    const rangeConfig = resolveRangeConfig(range);
    const end = new Date();
    const start = new Date(end.getTime() - rangeConfig.coinbase.windowMs);
    const payload = await this.requestJson(
      `https://api.exchange.coinbase.com/products/${encodeURIComponent(pair)}/candles?granularity=${rangeConfig.coinbase.granularitySeconds}&start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`,
    );

    const rows = Array.isArray(payload) ? payload : [];

    const points = rows
      .map((item) => {
        const row = Array.isArray(item) ? item : [];

        return buildChartPoint(
          Number.parseInt(String(row[0] ?? ""), 10) * 1000,
          parseFloatSafe(typeof row[3] === "number" || typeof row[3] === "string" ? row[3] : undefined),
          parseFloatSafe(typeof row[2] === "number" || typeof row[2] === "string" ? row[2] : undefined),
          parseFloatSafe(typeof row[1] === "number" || typeof row[1] === "string" ? row[1] : undefined),
          parseFloatSafe(typeof row[4] === "number" || typeof row[4] === "string" ? row[4] : undefined),
          parseFloatSafe(typeof row[5] === "number" || typeof row[5] === "string" ? row[5] : undefined),
        );
      })
      .filter((point): point is MultiExchangeChartPoint => point !== null)
      .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));

    assertSufficientChartPoints(points, "coinbase", assetId);

    return {
      assetId,
      broker: "coinbase",
      fetchedAt: new Date().toISOString(),
      points,
      range,
      symbol: normalizeBrokerSymbol(pair),
    };
  }

  private async getKrakenTicker(assetId: string): Promise<MultiExchangeTickerSnapshot> {
    const pair = resolvePair(assetId, "kraken");
    const payload = await this.requestJson(
      `https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pair)}`,
    );

    const result =
      typeof payload === "object"
      && payload !== null
      && "result" in payload
      && typeof payload.result === "object"
      && payload.result !== null
        ? payload.result as Record<string, unknown>
        : {};

    const firstKey = Object.keys(result)[0];

    if (!firstKey) {
      throw new AppError({
        code: "BROKER_NATIVE_SCHEMA_MISMATCH",
        message: "Kraken ticker payload schema mismatch",
        statusCode: 502,
      });
    }

    const ticker = result[firstKey] as Record<string, unknown>;
    const closeValues = Array.isArray(ticker?.c) ? ticker.c : [];
    const openValues = Array.isArray(ticker?.o) ? ticker.o : [];
    const volumeValues = Array.isArray(ticker?.v) ? ticker.v : [];

    const lastPrice = parseFloatSafe(typeof closeValues[0] === "string" ? closeValues[0] : undefined);

    if (lastPrice === null) {
      throw new AppError({
        code: "BROKER_NATIVE_SCHEMA_MISMATCH",
        message: "Kraken ticker payload schema mismatch",
        statusCode: 502,
      });
    }

    const openPrice = parseFloatSafe(typeof openValues[1] === "string" ? openValues[1] : undefined)
      ?? parseFloatSafe(typeof openValues[0] === "string" ? openValues[0] : undefined);

    return {
      assetId,
      broker: "kraken",
      changePercent24h: computeChangePercent(lastPrice, openPrice),
      fetchedAt: new Date().toISOString(),
      lastPrice: roundPrice(lastPrice),
      symbol: normalizeBrokerSymbol(pair === "XBTUSD" ? "BTCUSD" : pair),
      volume24h: parseFloatSafe(typeof volumeValues[1] === "string" ? volumeValues[1] : undefined),
    };
  }

  private async getKrakenMarketChart(assetId: string, range: ExchangeChartRange): Promise<MultiExchangeMarketChart> {
    const pair = resolvePair(assetId, "kraken");
    const rangeConfig = resolveRangeConfig(range);
    const sinceSeconds = Math.floor((Date.now() - rangeConfig.kraken.windowMs) / 1000);
    const payload = await this.requestJson(
      `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair)}&interval=${rangeConfig.kraken.intervalMinutes}&since=${sinceSeconds}`,
    );

    const result =
      typeof payload === "object"
      && payload !== null
      && "result" in payload
      && typeof payload.result === "object"
      && payload.result !== null
        ? payload.result as Record<string, unknown>
        : {};
    const seriesKey = Object.keys(result).find((key) => key !== "last") ?? "";

    if (seriesKey.length === 0 || !Array.isArray(result[seriesKey])) {
      throw new AppError({
        code: "BROKER_NATIVE_SCHEMA_MISMATCH",
        message: "Kraken OHLC payload schema mismatch",
        statusCode: 502,
      });
    }

    const rows = result[seriesKey] as unknown[];

    const points = rows
      .map((item) => {
        const row = Array.isArray(item) ? item : [];

        return buildChartPoint(
          Number.parseInt(String(row[0] ?? ""), 10) * 1000,
          parseFloatSafe(typeof row[1] === "string" ? row[1] : undefined),
          parseFloatSafe(typeof row[2] === "string" ? row[2] : undefined),
          parseFloatSafe(typeof row[3] === "string" ? row[3] : undefined),
          parseFloatSafe(typeof row[4] === "string" ? row[4] : undefined),
          parseFloatSafe(typeof row[6] === "string" ? row[6] : undefined),
        );
      })
      .filter((point): point is MultiExchangeChartPoint => point !== null)
      .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));

    assertSufficientChartPoints(points, "kraken", assetId);

    return {
      assetId,
      broker: "kraken",
      fetchedAt: new Date().toISOString(),
      points,
      range,
      symbol: normalizeBrokerSymbol(pair === "XBTUSD" ? "BTCUSD" : pair),
    };
  }
}
