import { z } from "zod";

import { env } from "../../../shared/config/env.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { logger } from "../../../shared/logger/logger.js";
import { retryWithExponentialBackoff } from "../../../shared/resilience/retry-with-backoff.js";
import {
  BinanceMarketDataAdapter,
} from "../../../integrations/market_data/binance-market-data-adapter.js";
import {
  CoinCapMarketDataAdapter,
  type CoinCapMarketAsset,
} from "../../../integrations/market_data/coincap-market-data-adapter.js";

const marketOverviewInputSchema = z.object({
  limit: z.number().int().min(3).max(25).default(10),
});

const coinGeckoMarketAssetSchema = z.object({
  current_price: z.number().nullable().optional(),
  id: z.string().trim().min(1),
  market_cap: z.number().nullable().optional(),
  market_cap_rank: z.number().nullable().optional(),
  name: z.string().trim().min(1),
  price_change_percentage_24h: z.number().nullable().optional(),
  symbol: z.string().trim().min(1),
  total_volume: z.number().nullable().optional(),
});

const coinGeckoMarketOverviewSchema = z.array(coinGeckoMarketAssetSchema);

const coinGeckoRequestHeaders = {
  Accept: "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (compatible; BotFinanceiro/1.0)",
};

const binanceFallbackAssets = [
  { assetId: "bitcoin", name: "Bitcoin" },
  { assetId: "ethereum", name: "Ethereum" },
  { assetId: "binancecoin", name: "BNB" },
  { assetId: "solana", name: "Solana" },
  { assetId: "xrp", name: "XRP" },
  { assetId: "dogecoin", name: "Dogecoin" },
  { assetId: "cardano", name: "Cardano" },
  { assetId: "chainlink", name: "Chainlink" },
  { assetId: "avalanche-2", name: "Avalanche" },
  { assetId: "aave", name: "Aave" },
  { assetId: "uniswap", name: "Uniswap" },
  { assetId: "maker", name: "Maker" },
] as const;

interface MarketLeader {
  assetId: string;
  changePercent24h: number;
  symbol: string;
}

export interface CryptoMarketOverviewAsset {
  assetId: string;
  changePercent24h: number | null;
  marketCapUsd: number | null;
  name: string;
  priceUsd: number;
  rank: number | null;
  symbol: string;
  volumeUsd24h: number | null;
}

export interface CryptoMarketOverviewSummary {
  advancers24h: number;
  assetsTracked: number;
  averageChangePercent24h: number | null;
  decliners24h: number;
  strongest24h: MarketLeader | null;
  topMarketCapUsd: number;
  topVolumeUsd24h: number;
  unchanged24h: number;
  weakest24h: MarketLeader | null;
}

export interface CryptoMarketOverviewResponse {
  assets: CryptoMarketOverviewAsset[];
  fetchedAt: string;
  limit: number;
  provider: "coincap" | "coingecko" | "binance";
  summary: CryptoMarketOverviewSummary;
}

function isFiniteNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roundPercent(value: number): number {
  return Number(value.toFixed(2));
}

function toLeader(asset: CoinCapMarketAsset | null): MarketLeader | null {
  if (!asset || !isFiniteNumber(asset.changePercent24h)) {
    return null;
  }

  return {
    assetId: asset.assetId,
    changePercent24h: roundPercent(asset.changePercent24h),
    symbol: asset.symbol,
  };
}

// Simple in-memory cache with TTL
const cryptoCache = new Map<string, { value: { assets: CoinCapMarketAsset[]; fetchedAt: string; provider: "coincap" | "coingecko" | "binance" }; expiresAt: number }>();
const CRYPTO_CACHE_TTL_MS = env.MARKET_OVERVIEW_CACHE_TTL_SECONDS * 1000;
const CRYPTO_CACHE_STALE_MS = env.CACHE_STALE_SECONDS * 1000;

function buildOverviewResponse(
  marketOverview: { assets: CoinCapMarketAsset[]; fetchedAt: string; provider: "coincap" | "coingecko" | "binance" },
  limit: number,
  fromCache: boolean,
): CryptoMarketOverviewResponse & { fromCache: boolean } {
  const assets = marketOverview.assets;
  const assetsWithChange = assets.filter(
    (asset): asset is CoinCapMarketAsset & { changePercent24h: number } =>
      isFiniteNumber(asset.changePercent24h),
  );
  const advancers24h = assetsWithChange.filter((asset) => asset.changePercent24h > 0).length;
  const decliners24h = assetsWithChange.filter((asset) => asset.changePercent24h < 0).length;
  const unchanged24h = assetsWithChange.length - advancers24h - decliners24h;
  const topMarketCapUsd = assets.reduce((accumulator, asset) => accumulator + (asset.marketCapUsd ?? 0), 0);
  const topVolumeUsd24h = assets.reduce((accumulator, asset) => accumulator + (asset.volumeUsd24h ?? 0), 0);
  const averageChangePercent24h =
    assetsWithChange.length === 0
      ? null
      : roundPercent(
          assetsWithChange.reduce((accumulator, asset) => accumulator + asset.changePercent24h, 0)
            / assetsWithChange.length,
        );
  const strongest24hAsset = [...assetsWithChange].sort(
    (left, right) => right.changePercent24h - left.changePercent24h,
  )[0] ?? null;
  const weakest24hAsset = [...assetsWithChange].sort(
    (left, right) => left.changePercent24h - right.changePercent24h,
  )[0] ?? null;

  return {
    assets,
    fetchedAt: marketOverview.fetchedAt,
    limit,
    provider: marketOverview.provider,
    summary: {
      advancers24h,
      assetsTracked: assets.length,
      averageChangePercent24h,
      decliners24h,
      strongest24h: toLeader(strongest24hAsset),
      topMarketCapUsd,
      topVolumeUsd24h,
      unchanged24h,
      weakest24h: toLeader(weakest24hAsset),
    },
    fromCache,
  };
}

export class CryptoMarketOverviewService {
  private readonly coinCapAdapter = new CoinCapMarketDataAdapter();
  private readonly binanceAdapter = new BinanceMarketDataAdapter();

  public async getOverview(input?: { limit?: number }): Promise<CryptoMarketOverviewResponse & { fromCache: boolean }> {
    const parsedInput = marketOverviewInputSchema.parse(input ?? {});
    const cacheKey = String(parsedInput.limit ?? 10);
    const now = Date.now();
    const cached = cryptoCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      logger.info({ service: "crypto", type: "cache", hit: true, limit: parsedInput.limit }, "Crypto cache hit");
      return buildOverviewResponse(cached.value, parsedInput.limit, true);
    }

    logger.info({ service: "crypto", type: "cache", hit: false, limit: parsedInput.limit }, "Crypto cache miss");

    try {
      const marketOverview = await this.loadOverviewWithFallback(parsedInput.limit);
      cryptoCache.set(cacheKey, { value: marketOverview, expiresAt: Date.now() + CRYPTO_CACHE_TTL_MS });

      return buildOverviewResponse(marketOverview, parsedInput.limit, false);
    } catch (error) {
      if (cached && now <= cached.expiresAt + CRYPTO_CACHE_STALE_MS) {
        logger.warn(
          {
            err: error,
            limit: parsedInput.limit,
          },
          "Crypto providers unavailable; serving stale overview cache",
        );

        return buildOverviewResponse(cached.value, parsedInput.limit, true);
      }

      throw error;
    }
  }

  private async loadOverviewWithFallback(limit: number): Promise<{
    assets: CoinCapMarketAsset[];
    fetchedAt: string;
    provider: "coincap" | "coingecko" | "binance";
  }> {
    try {
      const coinCapOverview = await this.coinCapAdapter.getMarketOverview({
        limit,
      });

      return {
        assets: coinCapOverview.assets.slice(0, limit),
        fetchedAt: coinCapOverview.fetchedAt,
        provider: coinCapOverview.provider,
      };
    } catch {
      try {
        const coinGeckoAssets = await this.loadCoinGeckoOverview(limit);

        if (coinGeckoAssets.length > 0) {
          return {
            assets: coinGeckoAssets,
            fetchedAt: new Date().toISOString(),
            provider: "coingecko",
          };
        }
      } catch {
        // Continua para fallback Binance.
      }

      const binanceAssets = await this.loadBinanceOverview(limit);

      if (binanceAssets.length === 0) {
        throw new AppError({
          code: "CRYPTO_MARKET_OVERVIEW_UNAVAILABLE",
          details: {
            limit,
            retryable: true,
          },
          message: "CoinCap, CoinGecko e Binance indisponiveis para market overview",
          statusCode: 503,
        });
      }

      return {
        assets: binanceAssets,
        fetchedAt: new Date().toISOString(),
        provider: "binance",
      };
    }
  }

  private async loadCoinGeckoOverview(limit: number): Promise<CoinCapMarketAsset[]> {
    const query = new URLSearchParams({
      order: "market_cap_desc",
      page: "1",
      per_page: String(limit),
      sparkline: "false",
      vs_currency: "usd",
    });

    const payload = await retryWithExponentialBackoff(
      async () => {
        let response: Response;

        try {
          response = await fetch(`${env.COINGECKO_API_BASE_URL}/coins/markets?${query.toString()}`, {
            headers: coinGeckoRequestHeaders,
            method: "GET",
            signal: AbortSignal.timeout(env.COINGECKO_TIMEOUT_MS),
          });
        } catch (error) {
          throw new AppError({
            code: "COINGECKO_UNAVAILABLE",
            details: {
              cause: error,
              retryable: true,
            },
            message: "CoinGecko request failed",
            statusCode: 503,
          });
        }

        if (!response.ok) {
          const responseBody = await response.text();
          const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;

          throw new AppError({
            code: "COINGECKO_BAD_STATUS",
            details: {
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
              retryable: true,
            },
            message: "CoinGecko returned invalid JSON",
            statusCode: 502,
          });
        }
      },
      {
        attempts: Math.max(2, Math.min(6, env.COINGECKO_RETRY_ATTEMPTS)),
        baseDelayMs: env.COINGECKO_RETRY_BASE_DELAY_MS,
        jitterPercent: env.COINGECKO_RETRY_JITTER_PERCENT,
        shouldRetry: (error) => {
          if (!(error instanceof AppError)) {
            return true;
          }

          if (error.code === "COINGECKO_UNAVAILABLE") {
            return true;
          }

          if (error.code !== "COINGECKO_BAD_STATUS") {
            return false;
          }

          const details = error.details as { retryable?: boolean } | undefined;
          return details?.retryable === true;
        },
      },
    );
    const parsedPayload = coinGeckoMarketOverviewSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new AppError({
        code: "COINGECKO_SCHEMA_MISMATCH",
        details: {
          issues: parsedPayload.error.issues,
          retryable: false,
        },
        message: "CoinGecko market overview payload schema mismatch",
        statusCode: 502,
      });
    }

    return parsedPayload.data
      .map((asset, index): CoinCapMarketAsset | null => {
        const priceUsd = typeof asset.current_price === "number" && Number.isFinite(asset.current_price)
          ? asset.current_price
          : null;

        if (priceUsd === null) {
          return null;
        }

        return {
          assetId: asset.id,
          changePercent24h:
            typeof asset.price_change_percentage_24h === "number" && Number.isFinite(asset.price_change_percentage_24h)
              ? asset.price_change_percentage_24h
              : null,
          marketCapUsd:
            typeof asset.market_cap === "number" && Number.isFinite(asset.market_cap)
              ? asset.market_cap
              : null,
          name: asset.name,
          priceUsd,
          rank:
            typeof asset.market_cap_rank === "number" && Number.isFinite(asset.market_cap_rank)
              ? asset.market_cap_rank
              : index + 1,
          symbol: asset.symbol.toUpperCase(),
          volumeUsd24h:
            typeof asset.total_volume === "number" && Number.isFinite(asset.total_volume)
              ? asset.total_volume
              : null,
        };
      })
      .filter((asset): asset is CoinCapMarketAsset => asset !== null)
      .slice(0, limit);
  }

  private async loadBinanceOverview(limit: number): Promise<CoinCapMarketAsset[]> {
    const selectedAssets = binanceFallbackAssets.slice(0, Math.max(1, Math.min(limit, binanceFallbackAssets.length)));
    const results = await Promise.allSettled(
      selectedAssets.map(async (asset) => {
        const snapshot = await this.binanceAdapter.getTickerSnapshot({
          assetId: asset.assetId,
        });

        const rawSymbol = snapshot.symbol.toUpperCase();
        const normalizedSymbol = rawSymbol.endsWith("USDT") ? rawSymbol.slice(0, -4) : rawSymbol;

        return {
          assetId: asset.assetId,
          changePercent24h: snapshot.changePercent24h,
          marketCapUsd: null,
          name: asset.name,
          priceUsd: snapshot.lastPrice,
          rank: null,
          symbol: normalizedSymbol,
          volumeUsd24h: null,
        } satisfies CoinCapMarketAsset;
      }),
    );
    const assets: CoinCapMarketAsset[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        assets.push(result.value);
      }
    }

    return assets.slice(0, limit);
  }
}
