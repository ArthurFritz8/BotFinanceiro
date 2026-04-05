import { z } from "zod";

import {
  CoinCapMarketDataAdapter,
  type CoinCapMarketAsset,
} from "../../../integrations/market_data/coincap-market-data-adapter.js";
import { env } from "../../../shared/config/env.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { retryWithExponentialBackoff } from "../../../shared/resilience/retry-with-backoff.js";

const defiAssetIdSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
  .refine((value) => value.length >= 2 && value.length <= 40, {
    message: "assetId must contain between 2 and 40 characters",
  });

const defiAssetIdsSchema = z
  .array(defiAssetIdSchema)
  .min(1)
  .max(20)
  .transform((assetIds) => [...new Set(assetIds)]);

const defiMarketOverviewPresetSchema = z.enum(["blue_chips", "dex", "lending", "infrastructure"]);

const coinGeckoDefiAssetSchema = z.object({
  current_price: z.number().nullable().optional(),
  id: z.string().trim().min(1),
  market_cap: z.number().nullable().optional(),
  name: z.string().trim().min(1),
  price_change_percentage_24h: z.number().nullable().optional(),
  symbol: z.string().trim().min(1),
  total_volume: z.number().nullable().optional(),
});

const coinGeckoDefiAssetsSchema = z.array(coinGeckoDefiAssetSchema);

const coinGeckoRequestHeaders = {
  Accept: "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (compatible; BotFinanceiro/1.0)",
};

type DefiMarketOverviewPreset = z.infer<typeof defiMarketOverviewPresetSchema>;
type CoinGeckoDefiAsset = z.infer<typeof coinGeckoDefiAssetSchema>;

export interface DefiQuoteSnapshot {
  assetId: string;
  changePercent24h: number | null;
  fetchedAt: string;
  marketCapUsd: number | null;
  name: string;
  priceUsd: number;
  provider: "coincap" | "coingecko";
  rank: number | null;
  sector: "defi";
  symbol: string;
  volumeUsd24h: number | null;
}

export interface DefiQuoteFailure {
  assetId: string;
  error: {
    code: "DEFI_ASSET_NOT_AVAILABLE";
    message: string;
  };
  status: "error";
}

export interface DefiQuoteSuccess {
  assetId: string;
  quote: DefiQuoteSnapshot;
  status: "ok";
}

export type DefiQuoteBatchItem = DefiQuoteSuccess | DefiQuoteFailure;

export interface DefiSpotBatchResponse {
  assetIds: string[];
  failureCount: number;
  fetchedAt: string;
  quotes: DefiQuoteBatchItem[];
  successCount: number;
}

export interface DefiMarketOverviewResponse {
  assetIds: string[];
  failureCount: number;
  fetchedAt: string;
  preset: DefiMarketOverviewPreset;
  quotes: DefiQuoteBatchItem[];
  successCount: number;
  tableMarkdown: string;
}

const defiPresetAssetIds: Record<DefiMarketOverviewPreset, string[]> = {
  blue_chips: ["ethereum", "chainlink", "uniswap", "aave", "maker", "lido-dao"],
  dex: ["uniswap", "curve-dao-token", "1inch", "balancer", "pancakeswap-token", "dydx"],
  infrastructure: ["chainlink", "the-graph", "arweave", "render-token", "injective-protocol", "theta"],
  lending: ["aave", "maker", "compound", "frax-share", "yearn-finance", "rocket-pool"],
};

const coinCapMarketDataAdapter = new CoinCapMarketDataAdapter();

function toTitleCaseSlug(value: string): string {
  return value
    .split("-")
    .filter((token) => token.length > 0)
    .map((token) => `${token.charAt(0).toUpperCase()}${token.slice(1)}`)
    .join(" ");
}

function buildTableMarkdown(items: DefiQuoteBatchItem[]): string {
  const headers = ["Ativo", "Preco USD", "Var 24h", "Market Cap", "Volume 24h"];
  const separator = ["---", "---:", "---:", "---:", "---:"];

  const rows = items.map((item) => {
    if (item.status === "error") {
      return `| ${item.assetId} | n/d | n/d | n/d | ${item.error.code} |`;
    }

    const changePercent =
      typeof item.quote.changePercent24h === "number"
        ? `${item.quote.changePercent24h.toFixed(3)}%`
        : "n/d";
    const marketCap =
      typeof item.quote.marketCapUsd === "number" ? item.quote.marketCapUsd.toFixed(0) : "n/d";
    const volume =
      typeof item.quote.volumeUsd24h === "number" ? item.quote.volumeUsd24h.toFixed(0) : "n/d";

    return `| ${item.quote.symbol.toUpperCase()} (${item.assetId}) | ${item.quote.priceUsd.toFixed(6)} | ${changePercent} | ${marketCap} | ${volume} |`;
  });

  return [`| ${headers.join(" | ")} |`, `| ${separator.join(" | ")} |`, ...rows].join("\n");
}

function toSnapshot(asset: CoinCapMarketAsset, fetchedAt: string): DefiQuoteSnapshot {
  return {
    assetId: asset.assetId,
    changePercent24h: asset.changePercent24h,
    fetchedAt,
    marketCapUsd: asset.marketCapUsd,
    name: asset.name,
    priceUsd: asset.priceUsd,
    provider: "coincap",
    rank: asset.rank,
    sector: "defi",
    symbol: asset.symbol,
    volumeUsd24h: asset.volumeUsd24h,
  };
}

function toSnapshotFromCoinGecko(asset: CoinGeckoDefiAsset, fetchedAt: string): DefiQuoteSnapshot {
  const priceUsd = typeof asset.current_price === "number" && Number.isFinite(asset.current_price)
    ? asset.current_price
    : null;

  if (priceUsd === null) {
    throw new AppError({
      code: "DEFI_ASSET_NOT_AVAILABLE",
      details: {
        assetId: asset.id,
      },
      message: "DeFi asset is not available",
      statusCode: 503,
    });
  }

  return {
    assetId: asset.id,
    changePercent24h:
      typeof asset.price_change_percentage_24h === "number" && Number.isFinite(asset.price_change_percentage_24h)
        ? asset.price_change_percentage_24h
        : null,
    fetchedAt,
    marketCapUsd:
      typeof asset.market_cap === "number" && Number.isFinite(asset.market_cap)
        ? asset.market_cap
        : null,
    name: asset.name,
    priceUsd,
    provider: "coingecko",
    rank: null,
    sector: "defi",
    symbol: asset.symbol.toUpperCase(),
    volumeUsd24h:
      typeof asset.total_volume === "number" && Number.isFinite(asset.total_volume)
        ? asset.total_volume
        : null,
  };
}

async function loadCoinGeckoDefiAssets(assetIds: string[]): Promise<{
  assetsById: Map<string, CoinGeckoDefiAsset>;
  fetchedAt: string;
}> {
  if (assetIds.length === 0) {
    return {
      assetsById: new Map<string, CoinGeckoDefiAsset>(),
      fetchedAt: new Date().toISOString(),
    };
  }

  const query = new URLSearchParams({
    ids: assetIds.join(","),
    order: "market_cap_desc",
    page: "1",
    per_page: String(Math.max(1, Math.min(50, assetIds.length))),
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
  const parsedPayload = coinGeckoDefiAssetsSchema.safeParse(payload);

  if (!parsedPayload.success) {
    throw new AppError({
      code: "COINGECKO_SCHEMA_MISMATCH",
      details: {
        issues: parsedPayload.error.issues,
        retryable: false,
      },
      message: "CoinGecko market payload schema mismatch",
      statusCode: 502,
    });
  }

  return {
    assetsById: new Map<string, CoinGeckoDefiAsset>(
      parsedPayload.data.map((asset) => [asset.id, asset] as const),
    ),
    fetchedAt: new Date().toISOString(),
  };
}

async function resolveSingleDefiQuote(assetId: string): Promise<DefiQuoteSnapshot> {
  try {
    const spot = await coinCapMarketDataAdapter.getSpotPriceUsd({
      assetId,
    });

    return {
      assetId: spot.assetId,
      changePercent24h: null,
      fetchedAt: spot.fetchedAt,
      marketCapUsd: null,
      name: toTitleCaseSlug(spot.assetId),
      priceUsd: spot.price,
      provider: "coincap",
      rank: null,
      sector: "defi",
      symbol: spot.symbol,
      volumeUsd24h: null,
    };
  } catch {
    const coinGeckoData = await loadCoinGeckoDefiAssets([assetId]);
    const asset = coinGeckoData.assetsById.get(assetId);

    if (!asset) {
      throw new AppError({
        code: "DEFI_ASSET_NOT_AVAILABLE",
        details: {
          assetId,
        },
        message: "DeFi asset is not available",
        statusCode: 503,
      });
    }

    return toSnapshotFromCoinGecko(asset, coinGeckoData.fetchedAt);
  }
}

export class DefiMarketService {
  public async getSpotRate(input: { assetId: string }): Promise<DefiQuoteSnapshot> {
    const assetId = defiAssetIdSchema.parse(input.assetId);
    const batch = await this.getSpotRateBatch({
      assetIds: [assetId],
    });
    const first = batch.quotes[0];

    if (!first || first.status === "error") {
      throw new AppError({
        code: "DEFI_ASSET_NOT_AVAILABLE",
        details: {
          assetId,
        },
        message: "DeFi asset is not available",
        statusCode: 503,
      });
    }

    return first.quote;
  }

  public async getSpotRateBatch(input: { assetIds: string[] }): Promise<DefiSpotBatchResponse> {
    const assetIds = defiAssetIdsSchema.parse(input.assetIds);

    const quotes = await Promise.all(
      assetIds.map(async (assetId) => {
        try {
          const quote = await resolveSingleDefiQuote(assetId);

          return {
            assetId,
            quote,
            status: "ok" as const,
          };
        } catch {
          return {
            assetId,
            error: {
              code: "DEFI_ASSET_NOT_AVAILABLE" as const,
              message: "DeFi asset was not returned by market provider",
            },
            status: "error" as const,
          };
        }
      }),
    );

    const successCount = quotes.filter((item) => item.status === "ok").length;

    return {
      assetIds,
      failureCount: quotes.length - successCount,
      fetchedAt: new Date().toISOString(),
      quotes,
      successCount,
    };
  }

  public async getMarketOverview(input?: {
    assetIds?: string[];
    limit?: number;
    preset?: DefiMarketOverviewPreset;
  }): Promise<DefiMarketOverviewResponse> {
    const preset = defiMarketOverviewPresetSchema.parse(input?.preset ?? "blue_chips");
    const sourceAssetIds =
      input?.assetIds && input.assetIds.length > 0
        ? defiAssetIdsSchema.parse(input.assetIds)
        : defiPresetAssetIds[preset];
    const limit = Math.max(1, Math.min(20, Math.floor(input?.limit ?? sourceAssetIds.length)));
    const selectedAssetIds = sourceAssetIds.slice(0, limit);

    let overviewFetchedAt = new Date().toISOString();
    let assetsById = new Map<string, CoinCapMarketAsset>();
    let shouldUseCoinGeckoBatchFallback = false;

    try {
      const overview = await coinCapMarketDataAdapter.getMarketOverview({
        limit: 25,
      });

      overviewFetchedAt = overview.fetchedAt;
      assetsById = new Map<string, CoinCapMarketAsset>(
        overview.assets.map((asset) => [asset.assetId, asset] as const),
      );
    } catch {
      overviewFetchedAt = new Date().toISOString();
      shouldUseCoinGeckoBatchFallback = true;
    }

    let coinGeckoFallbackById = new Map<string, CoinGeckoDefiAsset>();

    if (shouldUseCoinGeckoBatchFallback) {
      try {
        const coinGeckoFallback = await loadCoinGeckoDefiAssets(selectedAssetIds);
        overviewFetchedAt = coinGeckoFallback.fetchedAt;
        coinGeckoFallbackById = coinGeckoFallback.assetsById;
      } catch {
        coinGeckoFallbackById = new Map<string, CoinGeckoDefiAsset>();
      }
    }

    const quotes = await Promise.all(
      selectedAssetIds.map(async (assetId) => {
        const fromOverview = assetsById.get(assetId);

        if (fromOverview) {
          return {
            assetId,
            quote: toSnapshot(fromOverview, overviewFetchedAt),
            status: "ok" as const,
          };
        }

        const fromCoinGeckoBatch = coinGeckoFallbackById.get(assetId);

        if (fromCoinGeckoBatch) {
          return {
            assetId,
            quote: toSnapshotFromCoinGecko(fromCoinGeckoBatch, overviewFetchedAt),
            status: "ok" as const,
          };
        }

        try {
          const fallbackQuote = await resolveSingleDefiQuote(assetId);

          return {
            assetId,
            quote: fallbackQuote,
            status: "ok" as const,
          };
        } catch {
          return {
            assetId,
            error: {
              code: "DEFI_ASSET_NOT_AVAILABLE" as const,
              message: "DeFi asset was not returned by market provider",
            },
            status: "error" as const,
          };
        }
      }),
    );

    const successCount = quotes.filter((item) => item.status === "ok").length;

    return {
      assetIds: selectedAssetIds,
      failureCount: quotes.length - successCount,
      fetchedAt: overviewFetchedAt,
      preset,
      quotes,
      successCount,
      tableMarkdown: buildTableMarkdown(quotes),
    };
  }
}
