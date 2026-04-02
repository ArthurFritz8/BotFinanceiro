import { z } from "zod";

import {
  CoinCapMarketDataAdapter,
  type CoinCapMarketAsset,
} from "../../../integrations/market_data/coincap-market-data-adapter.js";

const marketOverviewInputSchema = z.object({
  limit: z.number().int().min(3).max(25).default(10),
});

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
  provider: "coincap";
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

export class CryptoMarketOverviewService {
  private readonly coinCapAdapter = new CoinCapMarketDataAdapter();

  public async getOverview(input?: { limit?: number }): Promise<CryptoMarketOverviewResponse> {
    const parsedInput = marketOverviewInputSchema.parse(input ?? {});
    const marketOverview = await this.coinCapAdapter.getMarketOverview({
      limit: parsedInput.limit,
    });
    const assets = marketOverview.assets.slice(0, parsedInput.limit);
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
      limit: parsedInput.limit,
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
    };
  }
}
