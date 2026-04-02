import { z } from "zod";

import { env } from "../../shared/config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { retryWithExponentialBackoff } from "../../shared/resilience/retry-with-backoff.js";

const chartInputSchema = z.object({
  assetId: z.string().trim().min(1).transform((value) => value.toLowerCase()),
  currency: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .transform((value) => value.toLowerCase()),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("7d"),
});

const coingeckoMarketChartSchema = z.object({
  prices: z.array(z.tuple([z.number(), z.number()])),
});

type ChartRange = z.infer<typeof chartInputSchema>["range"];

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

function shouldRetryCoinGeckoChartRequest(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return true;
  }

  if (error.code === "COINGECKO_UNAVAILABLE") {
    return true;
  }

  if (error.code === "COINGECKO_BAD_STATUS" && hasRetryableFlag(error.details)) {
    return error.details.retryable === true;
  }

  return false;
}

function mapRangeToDays(range: ChartRange): string {
  switch (range) {
    case "24h":
      return "1";
    case "7d":
      return "7";
    case "30d":
      return "30";
    case "90d":
      return "90";
    case "1y":
      return "365";
    default:
      return "7";
  }
}

function mapRangeToInterval(range: ChartRange): "hourly" | "daily" {
  return range === "1y" ? "daily" : "hourly";
}

function normalizePrice(price: number): number {
  if (!Number.isFinite(price)) {
    return 0;
  }

  if (price >= 1000) {
    return Number(price.toFixed(2));
  }

  if (price >= 1) {
    return Number(price.toFixed(4));
  }

  return Number(price.toFixed(8));
}

export interface CoinGeckoChartPoint {
  price: number;
  timestamp: string;
}

export interface CoinGeckoMarketChart {
  assetId: string;
  currency: string;
  fetchedAt: string;
  points: CoinGeckoChartPoint[];
  provider: "coingecko";
  range: ChartRange;
}

export class CoinGeckoMarketChartAdapter {
  public async getMarketChart(input: {
    assetId: string;
    currency: string;
    range?: ChartRange;
  }): Promise<CoinGeckoMarketChart> {
    const parsedInput = chartInputSchema.parse(input);
    const days = mapRangeToDays(parsedInput.range);
    const interval = mapRangeToInterval(parsedInput.range);
    const query = new URLSearchParams({
      days,
      interval,
      vs_currency: parsedInput.currency,
    });
    const payload = await retryWithExponentialBackoff(
      () => this.requestMarketChart(parsedInput.assetId, query),
      {
        attempts: env.COINGECKO_RETRY_ATTEMPTS,
        baseDelayMs: env.COINGECKO_RETRY_BASE_DELAY_MS,
        jitterPercent: env.COINGECKO_RETRY_JITTER_PERCENT,
        shouldRetry: shouldRetryCoinGeckoChartRequest,
      },
    );
    const parsedPayload = coingeckoMarketChartSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new AppError({
        code: "COINGECKO_SCHEMA_MISMATCH",
        details: {
          issues: parsedPayload.error.issues,
          retryable: false,
        },
        message: "CoinGecko payload schema mismatch",
        statusCode: 502,
      });
    }

    const points = parsedPayload.data.prices
      .map(([timestampMs, price]) => ({
        price: normalizePrice(price),
        timestamp: new Date(timestampMs).toISOString(),
      }))
      .filter((point) => Number.isFinite(point.price) && point.price > 0);

    if (points.length < 2) {
      throw new AppError({
        code: "COINGECKO_EMPTY_CHART",
        details: {
          assetId: parsedInput.assetId,
          currency: parsedInput.currency,
          range: parsedInput.range,
          retryable: true,
        },
        message: "CoinGecko returned insufficient chart points",
        statusCode: 503,
      });
    }

    return {
      assetId: parsedInput.assetId,
      currency: parsedInput.currency,
      fetchedAt: new Date().toISOString(),
      points,
      provider: "coingecko",
      range: parsedInput.range,
    };
  }

  private async requestMarketChart(assetId: string, query: URLSearchParams): Promise<unknown> {
    const requestUrl = `${env.COINGECKO_API_BASE_URL}/coins/${encodeURIComponent(assetId)}/market_chart?${query.toString()}`;

    let response: Response;

    try {
      response = await fetch(requestUrl, {
        method: "GET",
        signal: AbortSignal.timeout(env.COINGECKO_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppError({
        code: "COINGECKO_UNAVAILABLE",
        details: {
          assetId,
          cause: error,
          retryable: true,
        },
        message: "CoinGecko request failed",
        statusCode: 503,
      });
    }

    if (!response.ok) {
      const retryable = isRetryableStatusCode(response.status);
      const responseBody = await response.text();

      throw new AppError({
        code: "COINGECKO_BAD_STATUS",
        details: {
          assetId,
          responseBody: responseBody.slice(0, 1000),
          responseStatus: response.status,
          retryable,
        },
        message: "CoinGecko returned a non-success status",
        statusCode: retryable ? 503 : 502,
      });
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      throw new AppError({
        code: "COINGECKO_INVALID_JSON",
        details: {
          assetId,
          retryable: true,
        },
        message: "CoinGecko returned invalid JSON",
        statusCode: 502,
      });
    }
  }
}