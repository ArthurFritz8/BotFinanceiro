import {
  CoinGeckoSpotPriceAdapter,
  type SpotPriceData,
} from "../../../integrations/market_data/coingecko-spot-price-adapter.js";
import { CoinCapMarketDataAdapter } from "../../../integrations/market_data/coincap-market-data-adapter.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { env } from "../../../shared/config/env.js";
import { logger } from "../../../shared/logger/logger.js";
import { memoryCache } from "../../../shared/cache/memory-cache.js";

export type SpotPriceCacheState = "fresh" | "miss" | "refreshed" | "stale";

export interface SpotPriceResponse {
  assetId: string;
  cache: {
    state: SpotPriceCacheState;
    stale: boolean;
  };
  currency: string;
  fetchedAt: string;
  price: number;
  provider: "coingecko" | "coincap";
}

export interface SpotPriceBatchError {
  code: string;
  message: string;
}

export interface SpotPriceBatchItem {
  assetId: string;
  error: SpotPriceBatchError | null;
  quote: SpotPriceResponse | null;
  status: "error" | "ok";
}

export interface SpotPriceBatchResponse {
  currency: string;
  fetchedAt: string;
  quotes: SpotPriceBatchItem[];
  requestedAssets: string[];
  summary: {
    failed: number;
    ok: number;
    successRatePercent: number;
    total: number;
  };
}

interface CoinCapSpotPriceData {
  assetId: string;
  currency: string;
  fetchedAt: string;
  price: number;
  provider: "coincap";
}

type UnifiedSpotPriceData = SpotPriceData | CoinCapSpotPriceData;

interface RetryableErrorDetails {
  responseStatus?: number;
  retryable?: boolean;
}

function hasRetryableFlag(details: unknown): details is RetryableErrorDetails {
  if (typeof details !== "object" || details === null) {
    return false;
  }

  const detailsRecord = details as Record<string, unknown>;
  const hasRetryable = typeof detailsRecord.retryable === "boolean";
  const hasResponseStatus =
    detailsRecord.responseStatus === undefined || typeof detailsRecord.responseStatus === "number";

  return hasRetryable || hasResponseStatus;
}

function extractResponseStatus(error: AppError): number | undefined {
  if (!hasRetryableFlag(error.details)) {
    return undefined;
  }

  return error.details.responseStatus;
}

function buildCacheKey(assetId: string, currency: string): string {
  return `crypto:spot-price:${assetId}:${currency}`;
}

function normalizeInput(input: { assetId: string; currency: string }): {
  assetId: string;
  currency: string;
} {
  return {
    assetId: input.assetId.toLowerCase(),
    currency: input.currency.toLowerCase(),
  };
}

function normalizeAssetIds(assetIds: string[]): string[] {
  const normalizedAssetIds = assetIds
    .map((assetId) => assetId.trim().toLowerCase())
    .filter((assetId) => assetId.length > 0);

  return [...new Set(normalizedAssetIds)];
}

function toResponse(
  payload: UnifiedSpotPriceData,
  cacheState: SpotPriceCacheState,
  stale: boolean,
): SpotPriceResponse {
  return {
    assetId: payload.assetId,
    cache: {
      stale,
      state: cacheState,
    },
    currency: payload.currency,
    fetchedAt: payload.fetchedAt,
    price: payload.price,
    provider: payload.provider,
  };
}

export class CryptoSpotPriceService {
  private readonly adapter = new CoinGeckoSpotPriceAdapter();
  private readonly coinCapAdapter = new CoinCapMarketDataAdapter();

  public async refreshSpotPrice(input: {
    assetId: string;
    currency: string;
  }): Promise<SpotPriceResponse> {
    const normalizedInput = normalizeInput(input);
    const cacheKey = buildCacheKey(normalizedInput.assetId, normalizedInput.currency);
    const livePrice = await this.fetchSpotPriceWithFallback(normalizedInput);

    memoryCache.set(cacheKey, livePrice, env.CACHE_DEFAULT_TTL_SECONDS, env.CACHE_STALE_SECONDS);
    return toResponse(livePrice, "refreshed", false);
  }

  public async getSpotPrice(input: { assetId: string; currency: string }): Promise<SpotPriceResponse> {
    const normalizedInput = normalizeInput(input);
    const cacheKey = buildCacheKey(normalizedInput.assetId, normalizedInput.currency);
    const cachedPrice = memoryCache.get<SpotPriceData>(cacheKey);

    if (cachedPrice.state === "fresh") {
      return toResponse(cachedPrice.value, "fresh", false);
    }

    if (cachedPrice.state === "stale") {
      try {
        return await this.refreshSpotPrice(normalizedInput);
      } catch (error) {
        logger.warn(
          {
            assetId: normalizedInput.assetId,
            cacheState: cachedPrice.state,
            currency: normalizedInput.currency,
            err: error,
          },
          "Using stale crypto spot price due provider failure",
        );

        return toResponse(cachedPrice.value, "stale", true);
      }
    }

    const livePrice = await this.fetchSpotPriceWithFallback(normalizedInput);
    memoryCache.set(cacheKey, livePrice, env.CACHE_DEFAULT_TTL_SECONDS, env.CACHE_STALE_SECONDS);
    return toResponse(livePrice, "miss", false);
  }

  public async getSpotPriceBatch(input: {
    assetIds: string[];
    currency: string;
  }): Promise<SpotPriceBatchResponse> {
    const normalizedCurrency = input.currency.trim().toLowerCase();
    const requestedAssets = normalizeAssetIds(input.assetIds);
    const quotes = await Promise.all(
      requestedAssets.map(async (assetId) => {
        try {
          const quote = await this.getSpotPrice({
            assetId,
            currency: normalizedCurrency,
          });

          return {
            assetId,
            error: null,
            quote,
            status: "ok" as const,
          };
        } catch (error) {
          return {
            assetId,
            error: this.toBatchError(error),
            quote: null,
            status: "error" as const,
          };
        }
      }),
    );
    const ok = quotes.filter((item) => item.status === "ok").length;
    const failed = quotes.length - ok;
    const total = quotes.length;

    return {
      currency: normalizedCurrency,
      fetchedAt: new Date().toISOString(),
      quotes,
      requestedAssets,
      summary: {
        failed,
        ok,
        successRatePercent: total === 0 ? 0 : Number(((ok / total) * 100).toFixed(1)),
        total,
      },
    };
  }

  private async fetchSpotPriceWithFallback(input: {
    assetId: string;
    currency: string;
  }): Promise<UnifiedSpotPriceData> {
    try {
      return await this.adapter.getSpotPrice(input);
    } catch (error) {
      if (!this.shouldFallbackToCoinCap(error, input.currency)) {
        throw error;
      }

      if (this.shouldLogFallbackAsInfo(error)) {
        logger.info(
          {
            assetId: input.assetId,
            currency: input.currency,
            sourceErrorCode: error instanceof AppError ? error.code : "UNKNOWN",
            sourceResponseStatus: error instanceof AppError ? extractResponseStatus(error) : undefined,
          },
          "CoinGecko transient failure, attempting CoinCap fallback",
        );
      } else {
        logger.warn(
          {
            assetId: input.assetId,
            currency: input.currency,
            err: error,
          },
          "CoinGecko failed, attempting CoinCap fallback",
        );
      }

      const coinCapSpot = await this.coinCapAdapter.getSpotPriceUsd({
        assetId: input.assetId,
      });

      return {
        assetId: input.assetId,
        currency: "usd",
        fetchedAt: coinCapSpot.fetchedAt,
        price: coinCapSpot.price,
        provider: "coincap",
      };
    }
  }

  private shouldFallbackToCoinCap(error: unknown, currency: string): boolean {
    if (currency !== "usd") {
      return false;
    }

    if (!(error instanceof AppError)) {
      return true;
    }

    return error.code.startsWith("COINGECKO_");
  }

  private shouldLogFallbackAsInfo(error: unknown): boolean {
    if (!(error instanceof AppError)) {
      return false;
    }

    if (error.code === "COINGECKO_CIRCUIT_OPEN") {
      return true;
    }

    if (error.code === "COINGECKO_BAD_STATUS" && extractResponseStatus(error) === 429) {
      return true;
    }

    if (hasRetryableFlag(error.details)) {
      return error.details.retryable === true;
    }

    return false;
  }

  private toBatchError(error: unknown): SpotPriceBatchError {
    if (error instanceof AppError) {
      return {
        code: error.code,
        message: error.message,
      };
    }

    if (error instanceof Error) {
      return {
        code: "SPOT_PRICE_ERROR",
        message: error.message,
      };
    }

    return {
      code: "SPOT_PRICE_ERROR",
      message: "Failed to load spot price",
    };
  }
}
