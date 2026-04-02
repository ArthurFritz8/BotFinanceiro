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

interface CoinCapSpotPriceData {
  assetId: string;
  currency: string;
  fetchedAt: string;
  price: number;
  provider: "coincap";
}

type UnifiedSpotPriceData = SpotPriceData | CoinCapSpotPriceData;

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

      logger.warn(
        {
          assetId: input.assetId,
          currency: input.currency,
          err: error,
        },
        "CoinGecko failed, attempting CoinCap fallback",
      );

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
}