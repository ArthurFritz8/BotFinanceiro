import { z } from "zod";

import { env } from "../../shared/config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { retryWithExponentialBackoff } from "../../shared/resilience/retry-with-backoff.js";
import { findBrokerPair } from "./asset-catalog.js";

export const supportedRangeSchema = z.enum(["24h", "7d", "30d", "90d", "1y"]);

const chartInputSchema = z.object({
  assetId: z.string().trim().min(1).transform((value) => value.toLowerCase()),
  range: supportedRangeSchema.default("7d"),
});

const tickerSchema = z.object({
  lastPrice: z.string(),
  priceChangePercent: z.string().optional(),
  symbol: z.string(),
  volume: z.string().optional(),
});

export type BinanceSupportedRange = z.infer<typeof supportedRangeSchema>;
type SupportedRange = BinanceSupportedRange;

interface RetryableErrorDetails {
  retryable?: boolean;
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

  if (error.code === "BINANCE_UNAVAILABLE") {
    return true;
  }

  if (error.code === "BINANCE_BAD_STATUS" && hasRetryableFlag(error.details)) {
    return error.details.retryable === true;
  }

  return false;
}

function parseNumericString(value: string | undefined): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const numericValue = Number.parseFloat(value);
  return Number.isFinite(numericValue) ? numericValue : null;
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

export function mapRangeToKlineConfig(range: SupportedRange): { interval: string; limit: number } {
  if (range === "24h") {
    return {
      interval: "5m",
      limit: 288,
    };
  }

  if (range === "7d") {
    return {
      interval: "1h",
      limit: 168,
    };
  }

  if (range === "30d") {
    return {
      interval: "4h",
      limit: 180,
    };
  }

  if (range === "90d") {
    return {
      interval: "12h",
      limit: 180,
    };
  }

  return {
    interval: "1d",
    limit: 365,
  };
}

// Mapeamento legado preservado para compatibilidade com aliases historicos
// (ex.: "polygon", "matic-network", "bnb"). Para o catalogo canonico, ver
// `asset-catalog.ts` — quando ambos respondem, o canonico tem prioridade.
const assetIdToBinanceSymbol = new Map<string, string>([
  ["aave", "AAVEUSDT"],
  ["avalanche-2", "AVAXUSDT"],
  ["binancecoin", "BNBUSDT"],
  ["bitcoin", "BTCUSDT"],
  ["bnb", "BNBUSDT"],
  ["cardano", "ADAUSDT"],
  ["chainlink", "LINKUSDT"],
  ["dogecoin", "DOGEUSDT"],
  ["ethereum", "ETHUSDT"],
  ["maker", "MKRUSDT"],
  ["matic-network", "MATICUSDT"],
  ["polygon", "MATICUSDT"],
  ["polygon-pos", "MATICUSDT"],
  ["solana", "SOLUSDT"],
  ["uniswap", "UNIUSDT"],
  ["xrp", "XRPUSDT"],
]);

export function resolveBinanceSymbol(assetId: string): string {
  const fromCatalog = findBrokerPair(assetId, "binance");

  if (fromCatalog) {
    return fromCatalog;
  }

  return (
    assetIdToBinanceSymbol.get(assetId)
    ?? `${assetId.replace(/[^a-z0-9]/g, "").toUpperCase()}USDT`
  );
}

export interface BinanceChartPoint {
  close: number;
  high: number;
  low: number;
  open: number;
  timestamp: string;
  volume: number;
}

export interface BinanceMarketChart {
  assetId: string;
  fetchedAt: string;
  points: BinanceChartPoint[];
  provider: "binance";
  range: SupportedRange;
  symbol: string;
}

export interface BinanceTickerSnapshot {
  assetId: string;
  changePercent24h: number | null;
  fetchedAt: string;
  lastPrice: number;
  provider: "binance";
  symbol: string;
  volume24h: number | null;
}

export class BinanceMarketDataAdapter {
  public async getMarketChart(input: {
    assetId: string;
    range?: SupportedRange;
  }): Promise<BinanceMarketChart> {
    const parsedInput = chartInputSchema.parse(input);
    const symbol = resolveBinanceSymbol(parsedInput.assetId);
    const klineConfig = mapRangeToKlineConfig(parsedInput.range);
    const query = new URLSearchParams({
      interval: klineConfig.interval,
      limit: String(klineConfig.limit),
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
        code: "BINANCE_SCHEMA_MISMATCH",
        details: {
          retryable: false,
        },
        message: "Binance kline payload schema mismatch",
        statusCode: 502,
      });
    }

    const points = payload
      .map((item) => this.toChartPoint(item))
      .filter((item): item is BinanceChartPoint => item !== null);

    if (points.length < 5) {
      throw new AppError({
        code: "BINANCE_EMPTY_CHART",
        details: {
          assetId: parsedInput.assetId,
          retryable: true,
          symbol,
        },
        message: "Binance returned insufficient chart points",
        statusCode: 503,
      });
    }

    return {
      assetId: parsedInput.assetId,
      fetchedAt: new Date().toISOString(),
      points,
      provider: "binance",
      range: parsedInput.range,
      symbol,
    };
  }

  public async getTickerSnapshot(input: { assetId: string }): Promise<BinanceTickerSnapshot> {
    const parsedInput = chartInputSchema.pick({ assetId: true }).parse(input);
    const symbol = resolveBinanceSymbol(parsedInput.assetId);
    const query = new URLSearchParams({
      symbol,
    });
    const payload = await retryWithExponentialBackoff(
      () => this.requestJson(`/api/v3/ticker/24hr?${query.toString()}`),
      {
        attempts: 3,
        baseDelayMs: 180,
        jitterPercent: 20,
        shouldRetry: shouldRetryBinanceRequest,
      },
    );
    const parsedPayload = tickerSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new AppError({
        code: "BINANCE_SCHEMA_MISMATCH",
        details: {
          issues: parsedPayload.error.issues,
          retryable: false,
        },
        message: "Binance ticker payload schema mismatch",
        statusCode: 502,
      });
    }

    const lastPrice = parseNumericString(parsedPayload.data.lastPrice);

    if (lastPrice === null) {
      throw new AppError({
        code: "BINANCE_PRICE_NOT_FOUND",
        details: {
          assetId: parsedInput.assetId,
          retryable: true,
          symbol,
        },
        message: "Binance ticker price is unavailable",
        statusCode: 503,
      });
    }

    return {
      assetId: parsedInput.assetId,
      changePercent24h: parseNumericString(parsedPayload.data.priceChangePercent),
      fetchedAt: new Date().toISOString(),
      lastPrice: roundPrice(lastPrice),
      provider: "binance",
      symbol,
      volume24h: parseNumericString(parsedPayload.data.volume),
    };
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
        code: "BINANCE_UNAVAILABLE",
        details: {
          cause: error,
          retryable: true,
        },
        message: "Binance request failed",
        statusCode: 503,
      });
    }

    if (!response.ok) {
      const responseBody = await response.text();
      const retryable = isRetryableStatusCode(response.status);

      throw new AppError({
        code: "BINANCE_BAD_STATUS",
        details: {
          path,
          responseBody: responseBody.slice(0, 1000),
          responseStatus: response.status,
          retryable,
        },
        message: "Binance returned a non-success status",
        statusCode: retryable ? 503 : 502,
      });
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      throw new AppError({
        code: "BINANCE_INVALID_JSON",
        details: {
          path,
          retryable: true,
        },
        message: "Binance returned invalid JSON",
        statusCode: 502,
      });
    }
  }

  private toChartPoint(value: unknown): BinanceChartPoint | null {
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
      !Number.isFinite(timestampMs) ||
      open === null ||
      high === null ||
      low === null ||
      close === null ||
      volume === null
    ) {
      return null;
    }

    return {
      close: roundPrice(close),
      high: roundPrice(high),
      low: roundPrice(low),
      open: roundPrice(open),
      timestamp: new Date(timestampMs).toISOString(),
      volume: Number(volume.toFixed(2)),
    };
  }
}