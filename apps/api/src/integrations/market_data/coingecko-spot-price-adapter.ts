import { z } from "zod";

import { env } from "../../shared/config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { logger } from "../../shared/logger/logger.js";
import {
  CircuitBreaker,
  type CircuitBreakerSnapshot,
} from "../../shared/resilience/circuit-breaker.js";
import { retryWithExponentialBackoff } from "../../shared/resilience/retry-with-backoff.js";

const spotPriceRequestSchema = z.object({
  assetId: z.string().trim().min(1).transform((value) => value.toLowerCase()),
  currency: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .transform((value) => value.toLowerCase()),
});

const coinGeckoSimplePriceSchema = z.record(z.string(), z.record(z.string(), z.number()));
const coinGeckoCircuitBreaker = new CircuitBreaker(
  env.COINGECKO_CIRCUIT_FAILURE_THRESHOLD,
  env.COINGECKO_CIRCUIT_COOLDOWN_MS,
);

type SpotPriceRequest = z.infer<typeof spotPriceRequestSchema>;

interface RetryableErrorDetails {
  retryable: boolean;
}

function hasRetryableFlag(details: unknown): details is RetryableErrorDetails {
  if (typeof details !== "object" || details === null) {
    return false;
  }

  const detailsRecord = details as Record<string, unknown>;
  return typeof detailsRecord.retryable === "boolean";
}

function isRetryableProviderError(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return true;
  }

  if (!hasRetryableFlag(error.details)) {
    return false;
  }

  return error.details.retryable;
}

function isRateLimitedProviderError(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return false;
  }

  if (error.code !== "COINGECKO_BAD_STATUS") {
    return false;
  }

  if (typeof error.details !== "object" || error.details === null) {
    return false;
  }

  const responseStatus = (error.details as Record<string, unknown>).responseStatus;
  return responseStatus === 429;
}

function isRetryableStatusCode(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

export interface SpotPriceData {
  assetId: string;
  currency: string;
  fetchedAt: string;
  price: number;
  provider: "coingecko";
}

export function getCoinGeckoCircuitSnapshot(): CircuitBreakerSnapshot {
  return coinGeckoCircuitBreaker.getSnapshot();
}

export class CoinGeckoSpotPriceAdapter {
  public async getSpotPrice(input: { assetId: string; currency: string }): Promise<SpotPriceData> {
    const parsedInput = spotPriceRequestSchema.parse(input);

    if (!coinGeckoCircuitBreaker.canRequest()) {
      throw new AppError({
        code: "COINGECKO_CIRCUIT_OPEN",
        details: {
          assetId: parsedInput.assetId,
          circuit: coinGeckoCircuitBreaker.getSnapshot(),
          currency: parsedInput.currency,
          retryable: true,
        },
        message: "CoinGecko circuit breaker is open",
        statusCode: 503,
      });
    }

    try {
      const spotPrice = await retryWithExponentialBackoff(
        async () => this.requestSpotPrice(parsedInput),
        {
          attempts: env.COINGECKO_RETRY_ATTEMPTS,
          baseDelayMs: env.COINGECKO_RETRY_BASE_DELAY_MS,
          jitterPercent: env.COINGECKO_RETRY_JITTER_PERCENT,
          shouldRetry: isRetryableProviderError,
        },
      );

      coinGeckoCircuitBreaker.onSuccess();
      return spotPrice;
    } catch (error) {
      if (isRetryableProviderError(error)) {
        coinGeckoCircuitBreaker.onFailure();

        if (isRateLimitedProviderError(error)) {
          logger.info(
            {
              assetId: parsedInput.assetId,
              circuit: coinGeckoCircuitBreaker.getSnapshot(),
              currency: parsedInput.currency,
              responseStatus: 429,
            },
            "CoinGecko rate limit detected by circuit breaker",
          );

          throw error;
        }

        logger.warn(
          {
            assetId: parsedInput.assetId,
            circuit: coinGeckoCircuitBreaker.getSnapshot(),
            currency: parsedInput.currency,
            err: error,
          },
          "CoinGecko failure counted by circuit breaker",
        );
      }

      throw error;
    }
  }

  private async requestSpotPrice(input: SpotPriceRequest): Promise<SpotPriceData> {
    const query = new URLSearchParams({
      ids: input.assetId,
      vs_currencies: input.currency,
    });

    const requestUrl = `${env.COINGECKO_API_BASE_URL}/simple/price?${query.toString()}`;

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
          assetId: input.assetId,
          cause: error,
          currency: input.currency,
          retryable: true,
        },
        message: "CoinGecko request failed",
        statusCode: 503,
      });
    }

    if (!response.ok) {
      const retryableStatus = isRetryableStatusCode(response.status);

      throw new AppError({
        code: "COINGECKO_BAD_STATUS",
        details: {
          assetId: input.assetId,
          currency: input.currency,
          responseStatus: response.status,
          retryable: retryableStatus,
        },
        message: "CoinGecko returned a non-success status",
        statusCode: retryableStatus ? 503 : 502,
      });
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new AppError({
        code: "COINGECKO_INVALID_JSON",
        details: {
          assetId: input.assetId,
          currency: input.currency,
          retryable: true,
        },
        message: "CoinGecko returned invalid JSON",
        statusCode: 502,
      });
    }

    const parsedPayload = coinGeckoSimplePriceSchema.safeParse(payload);

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

    const assetPayload = parsedPayload.data[input.assetId];
    const assetPrice = assetPayload?.[input.currency];

    if (typeof assetPrice !== "number" || Number.isNaN(assetPrice)) {
      throw new AppError({
        code: "COINGECKO_PRICE_NOT_FOUND",
        details: {
          assetId: input.assetId,
          currency: input.currency,
          retryable: false,
        },
        message: "Price not found in CoinGecko payload",
        statusCode: 502,
      });
    }

    return {
      assetId: input.assetId,
      currency: input.currency,
      fetchedAt: new Date().toISOString(),
      price: assetPrice,
      provider: "coingecko",
    };
  }
}