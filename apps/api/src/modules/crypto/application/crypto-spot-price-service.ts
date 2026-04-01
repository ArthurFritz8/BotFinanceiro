import {
  CoinGeckoSpotPriceAdapter,
  type SpotPriceData,
} from "../../../integrations/market_data/coingecko-spot-price-adapter.js";
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
  provider: "coingecko";
}

function buildCacheKey(assetId: string, currency: string): string {
  return `crypto:spot-price:${assetId}:${currency}`;
}

function toResponse(
  payload: SpotPriceData,
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

  public async getSpotPrice(input: { assetId: string; currency: string }): Promise<SpotPriceResponse> {
    const normalizedAssetId = input.assetId.toLowerCase();
    const normalizedCurrency = input.currency.toLowerCase();
    const cacheKey = buildCacheKey(normalizedAssetId, normalizedCurrency);
    const cachedPrice = memoryCache.get<SpotPriceData>(cacheKey);

    if (cachedPrice.state === "fresh") {
      return toResponse(cachedPrice.value, "fresh", false);
    }

    if (cachedPrice.state === "stale") {
      try {
        const refreshedPrice = await this.adapter.getSpotPrice({
          assetId: normalizedAssetId,
          currency: normalizedCurrency,
        });

        memoryCache.set(
          cacheKey,
          refreshedPrice,
          env.CACHE_DEFAULT_TTL_SECONDS,
          env.CACHE_STALE_SECONDS,
        );

        return toResponse(refreshedPrice, "refreshed", false);
      } catch (error) {
        logger.warn(
          {
            assetId: normalizedAssetId,
            cacheState: cachedPrice.state,
            currency: normalizedCurrency,
            err: error,
          },
          "Using stale crypto spot price due provider failure",
        );

        return toResponse(cachedPrice.value, "stale", true);
      }
    }

    const livePrice = await this.adapter.getSpotPrice({
      assetId: normalizedAssetId,
      currency: normalizedCurrency,
    });

    memoryCache.set(cacheKey, livePrice, env.CACHE_DEFAULT_TTL_SECONDS, env.CACHE_STALE_SECONDS);
    return toResponse(livePrice, "miss", false);
  }
}