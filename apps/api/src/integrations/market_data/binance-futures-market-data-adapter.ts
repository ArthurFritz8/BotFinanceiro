import { z } from "zod";

import { env } from "../../shared/config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { retryWithExponentialBackoff } from "../../shared/resilience/retry-with-backoff.js";

const symbolSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
  .refine((value) => value.length >= 4 && value.length <= 20, {
    message: "symbol must contain between 4 and 20 alphanumeric characters",
  });

const tickerSchema = z.object({
  highPrice: z.string().optional(),
  lastPrice: z.string(),
  lowPrice: z.string().optional(),
  openPrice: z.string().optional(),
  priceChangePercent: z.string().optional(),
  quoteVolume: z.string().optional(),
  symbol: z.string().trim().min(1),
  volume: z.string().optional(),
});

const premiumIndexSchema = z.object({
  indexPrice: z.string().optional(),
  lastFundingRate: z.string().optional(),
  markPrice: z.string().optional(),
  nextFundingTime: z.coerce.number().int().nullable().optional(),
  symbol: z.string().trim().min(1),
});

const openInterestSchema = z.object({
  openInterest: z.string().optional(),
  symbol: z.string().trim().min(1),
  time: z.coerce.number().int().nullable().optional(),
});

function normalizeNumeric(value: string | undefined): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundNumber(value: number): number {
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

function shouldRetryFuturesRequest(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return true;
  }

  if (error.code === "BINANCE_FUTURES_UNAVAILABLE") {
    return true;
  }

  if (error.code === "BINANCE_FUTURES_BAD_STATUS" && hasRetryableFlag(error.details)) {
    return error.details.retryable === true;
  }

  return false;
}

export interface BinanceFuturesContractSnapshot {
  derivatives: {
    indexPrice: number | null;
    lastFundingRate: number | null;
    markPrice: number | null;
    nextFundingTime: string | null;
    openInterest: number | null;
  };
  fetchedAt: string;
  market: {
    changePercent24h: number | null;
    high24h: number | null;
    lastPrice: number;
    low24h: number | null;
    quoteVolume24h: number | null;
    volume24h: number | null;
  };
  symbol: string;
  venue: "binance_futures";
}

export class BinanceFuturesMarketDataAdapter {
  public async getContractSnapshot(input: {
    symbol: string;
  }): Promise<BinanceFuturesContractSnapshot> {
    const symbol = symbolSchema.parse(input.symbol);
    const query = new URLSearchParams({
      symbol,
    }).toString();

    const [tickerPayload, premiumPayload, openInterestPayload] = await Promise.all([
      retryWithExponentialBackoff(
        () => this.requestJson(`/fapi/v1/ticker/24hr?${query}`),
        {
          attempts: 3,
          baseDelayMs: 200,
          jitterPercent: 20,
          shouldRetry: shouldRetryFuturesRequest,
        },
      ),
      retryWithExponentialBackoff(
        () => this.requestJson(`/fapi/v1/premiumIndex?${query}`),
        {
          attempts: 3,
          baseDelayMs: 200,
          jitterPercent: 20,
          shouldRetry: shouldRetryFuturesRequest,
        },
      ),
      retryWithExponentialBackoff(
        () => this.requestJson(`/fapi/v1/openInterest?${query}`),
        {
          attempts: 3,
          baseDelayMs: 200,
          jitterPercent: 20,
          shouldRetry: shouldRetryFuturesRequest,
        },
      ),
    ]);

    const parsedTicker = tickerSchema.safeParse(tickerPayload);
    const parsedPremium = premiumIndexSchema.safeParse(premiumPayload);
    const parsedOpenInterest = openInterestSchema.safeParse(openInterestPayload);

    if (!parsedTicker.success || !parsedPremium.success || !parsedOpenInterest.success) {
      throw new AppError({
        code: "BINANCE_FUTURES_SCHEMA_MISMATCH",
        details: {
          openInterestIssues: parsedOpenInterest.success ? [] : parsedOpenInterest.error.issues,
          premiumIssues: parsedPremium.success ? [] : parsedPremium.error.issues,
          tickerIssues: parsedTicker.success ? [] : parsedTicker.error.issues,
        },
        message: "Binance futures payload schema mismatch",
        statusCode: 502,
      });
    }

    const lastPrice = normalizeNumeric(parsedTicker.data.lastPrice);

    if (lastPrice === null) {
      throw new AppError({
        code: "BINANCE_FUTURES_PRICE_NOT_FOUND",
        details: {
          symbol,
        },
        message: "Binance futures ticker price is unavailable",
        statusCode: 503,
      });
    }

    const nextFundingTimeMs = parsedPremium.data.nextFundingTime;

    return {
      derivatives: {
        indexPrice: normalizeNumeric(parsedPremium.data.indexPrice),
        lastFundingRate: normalizeNumeric(parsedPremium.data.lastFundingRate),
        markPrice: normalizeNumeric(parsedPremium.data.markPrice),
        nextFundingTime:
          typeof nextFundingTimeMs === "number" && Number.isFinite(nextFundingTimeMs) && nextFundingTimeMs > 0
            ? new Date(nextFundingTimeMs).toISOString()
            : null,
        openInterest: normalizeNumeric(parsedOpenInterest.data.openInterest),
      },
      fetchedAt: new Date().toISOString(),
      market: {
        changePercent24h: normalizeNumeric(parsedTicker.data.priceChangePercent),
        high24h: normalizeNumeric(parsedTicker.data.highPrice),
        lastPrice: roundNumber(lastPrice),
        low24h: normalizeNumeric(parsedTicker.data.lowPrice),
        quoteVolume24h: normalizeNumeric(parsedTicker.data.quoteVolume),
        volume24h: normalizeNumeric(parsedTicker.data.volume),
      },
      symbol,
      venue: "binance_futures",
    };
  }

  private async requestJson(path: string): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(`${env.BINANCE_FUTURES_API_BASE_URL}${path}`, {
        method: "GET",
        signal: AbortSignal.timeout(env.BINANCE_FUTURES_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppError({
        code: "BINANCE_FUTURES_UNAVAILABLE",
        details: {
          cause: error,
          retryable: true,
        },
        message: "Binance futures request failed",
        statusCode: 503,
      });
    }

    if (!response.ok) {
      const responseBody = await response.text();
      const retryable = isRetryableStatusCode(response.status);

      throw new AppError({
        code: "BINANCE_FUTURES_BAD_STATUS",
        details: {
          path,
          responseBody: responseBody.slice(0, 1000),
          responseStatus: response.status,
          retryable,
        },
        message: "Binance futures returned a non-success status",
        statusCode: retryable ? 503 : 502,
      });
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      throw new AppError({
        code: "BINANCE_FUTURES_INVALID_JSON",
        details: {
          path,
          retryable: true,
        },
        message: "Binance futures returned invalid JSON",
        statusCode: 502,
      });
    }
  }
}
