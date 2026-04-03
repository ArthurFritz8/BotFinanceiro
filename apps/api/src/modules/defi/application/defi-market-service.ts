import { z } from "zod";

import {
  CoinCapMarketDataAdapter,
  type CoinCapMarketAsset,
} from "../../../integrations/market_data/coincap-market-data-adapter.js";
import { AppError } from "../../../shared/errors/app-error.js";

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

type DefiMarketOverviewPreset = z.infer<typeof defiMarketOverviewPresetSchema>;

export interface DefiQuoteSnapshot {
  assetId: string;
  changePercent24h: number | null;
  fetchedAt: string;
  marketCapUsd: number | null;
  name: string;
  priceUsd: number;
  provider: "coincap";
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

async function resolveSingleDefiQuote(assetId: string): Promise<DefiQuoteSnapshot> {
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

    const overview = await coinCapMarketDataAdapter.getMarketOverview({
      limit: 25,
    });
    const assetsById = new Map<string, CoinCapMarketAsset>(
      overview.assets.map((asset) => [asset.assetId, asset] as const),
    );

    const quotes = await Promise.all(
      selectedAssetIds.map(async (assetId) => {
        const fromOverview = assetsById.get(assetId);

        if (fromOverview) {
          return {
            assetId,
            quote: toSnapshot(fromOverview, overview.fetchedAt),
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
      fetchedAt: overview.fetchedAt,
      preset,
      quotes,
      successCount,
      tableMarkdown: buildTableMarkdown(quotes),
    };
  }
}
