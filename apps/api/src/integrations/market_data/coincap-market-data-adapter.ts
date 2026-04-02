import { z } from "zod";

import { env } from "../../shared/config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { retryWithExponentialBackoff } from "../../shared/resilience/retry-with-backoff.js";

const coinCapAssetSchema = z.object({
  changePercent24Hr: z.string().optional(),
  id: z.string().trim().min(1),
  marketCapUsd: z.string().optional(),
  name: z.string().trim().min(1),
  priceUsd: z.string().optional(),
  rank: z.string().optional(),
  symbol: z.string().trim().min(1),
  volumeUsd24Hr: z.string().optional(),
});

const coinCapAssetsResponseSchema = z.object({
  data: z.array(coinCapAssetSchema),
  timestamp: z.number().optional(),
});

const coinCapSingleAssetResponseSchema = z.object({
  data: coinCapAssetSchema,
  timestamp: z.number().optional(),
});

const marketOverviewInputSchema = z.object({
  limit: z.number().int().min(3).max(25).default(8),
});

const spotPriceInputSchema = z.object({
  assetId: z.string().trim().min(1).transform((value) => value.toLowerCase()),
});

const coinCapAssetIdAliasMap = new Map<string, string>([
  ["avalanche-2", "avalanche"],
  ["binancecoin", "binance-coin"],
  ["matic-network", "polygon"],
  ["pi-network", "pi"],
  ["polygon-pos", "polygon"],
]);

function parseNumber(value: string | undefined): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function parseRank(value: string | undefined): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsedRank = Number.parseInt(value, 10);
  return Number.isFinite(parsedRank) ? parsedRank : null;
}

function normalizeMatchToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
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

function shouldRetryCoinCapRequest(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return true;
  }

  if (error.code === "COINCAP_UNAVAILABLE") {
    return true;
  }

  if (error.code === "COINCAP_BAD_STATUS" && hasRetryableFlag(error.details)) {
    return error.details.retryable === true;
  }

  return false;
}

function buildSpotSearchTerm(assetId: string): string {
  return assetId.replace(/-/g, " ").trim();
}

function resolveCoinCapAssetId(assetId: string): string {
  return coinCapAssetIdAliasMap.get(assetId) ?? assetId;
}

function scoreAssetMatch(asset: z.infer<typeof coinCapAssetSchema>, requestedAssetId: string): number {
  const normalizedRequestedId = normalizeMatchToken(requestedAssetId);
  const normalizedAssetId = normalizeMatchToken(asset.id);
  const normalizedSymbol = normalizeMatchToken(asset.symbol);
  const normalizedName = normalizeMatchToken(asset.name);

  if (
    normalizedAssetId === normalizedRequestedId ||
    normalizedSymbol === normalizedRequestedId ||
    normalizedName === normalizedRequestedId
  ) {
    return 100;
  }

  if (
    normalizedAssetId.includes(normalizedRequestedId) ||
    normalizedRequestedId.includes(normalizedAssetId)
  ) {
    return 80;
  }

  if (
    normalizedName.includes(normalizedRequestedId) ||
    normalizedRequestedId.includes(normalizedName)
  ) {
    return 70;
  }

  if (normalizedSymbol.includes(normalizedRequestedId)) {
    return 60;
  }

  return 0;
}

export interface CoinCapMarketAsset {
  assetId: string;
  changePercent24h: number | null;
  marketCapUsd: number | null;
  name: string;
  priceUsd: number;
  rank: number | null;
  symbol: string;
  volumeUsd24h: number | null;
}

export interface CoinCapMarketOverview {
  assets: CoinCapMarketAsset[];
  fetchedAt: string;
  provider: "coincap";
}

export interface CoinCapSpotPrice {
  assetId: string;
  fetchedAt: string;
  price: number;
  provider: "coincap";
  symbol: string;
}

export class CoinCapMarketDataAdapter {
  public async getMarketOverview(input?: { limit?: number }): Promise<CoinCapMarketOverview> {
    const parsedInput = marketOverviewInputSchema.parse(input ?? {});
    const payload = await this.requestJson(`/assets?limit=${parsedInput.limit}`);
    const parsedPayload = coinCapAssetsResponseSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new AppError({
        code: "COINCAP_SCHEMA_MISMATCH",
        details: {
          issues: parsedPayload.error.issues,
          retryable: false,
        },
        message: "CoinCap payload schema mismatch",
        statusCode: 502,
      });
    }

    const assets = parsedPayload.data.data
      .map((asset) => {
        const priceUsd = parseNumber(asset.priceUsd);

        if (priceUsd === null) {
          return null;
        }

        return {
          assetId: asset.id,
          changePercent24h: parseNumber(asset.changePercent24Hr),
          marketCapUsd: parseNumber(asset.marketCapUsd),
          name: asset.name,
          priceUsd,
          rank: parseRank(asset.rank),
          symbol: asset.symbol,
          volumeUsd24h: parseNumber(asset.volumeUsd24Hr),
        } satisfies CoinCapMarketAsset;
      })
      .filter((asset) => asset !== null);

    if (assets.length === 0) {
      throw new AppError({
        code: "COINCAP_EMPTY_MARKET_DATA",
        details: {
          retryable: true,
        },
        message: "CoinCap returned an empty market overview",
        statusCode: 503,
      });
    }

    return {
      assets,
      fetchedAt: new Date().toISOString(),
      provider: "coincap",
    };
  }

  public async getSpotPriceUsd(input: { assetId: string }): Promise<CoinCapSpotPrice> {
    const parsedInput = spotPriceInputSchema.parse(input);
    const requestedAssetId = parsedInput.assetId;
    const directAssetId = resolveCoinCapAssetId(requestedAssetId);

    try {
      return await this.requestSpotAssetById(requestedAssetId, directAssetId);
    } catch (error) {
      if (!this.isNotFoundError(error)) {
        throw error;
      }
    }

    const payload = await this.requestJson(
      `/assets?search=${encodeURIComponent(buildSpotSearchTerm(requestedAssetId))}&limit=30`,
    );
    const parsedPayload = coinCapAssetsResponseSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new AppError({
        code: "COINCAP_SCHEMA_MISMATCH",
        details: {
          issues: parsedPayload.error.issues,
          retryable: false,
        },
        message: "CoinCap payload schema mismatch",
        statusCode: 502,
      });
    }

    const bestMatch = parsedPayload.data.data
      .map((asset) => ({
        asset,
        score: scoreAssetMatch(asset, requestedAssetId),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score)[0]?.asset;

    if (!bestMatch) {
      throw new AppError({
        code: "COINCAP_ASSET_NOT_FOUND",
        details: {
          assetId: requestedAssetId,
          retryable: false,
        },
        message: "CoinCap could not match the requested asset",
        statusCode: 502,
      });
    }

    return this.toSpotPrice(bestMatch, requestedAssetId);
  }

  private isNotFoundError(error: unknown): boolean {
    if (!(error instanceof AppError)) {
      return false;
    }

    if (error.code !== "COINCAP_BAD_STATUS") {
      return false;
    }

    if (typeof error.details !== "object" || error.details === null) {
      return false;
    }

    const responseStatus = (error.details as Record<string, unknown>).responseStatus;
    return responseStatus === 404;
  }

  private async requestSpotAssetById(
    requestedAssetId: string,
    coinCapAssetId: string,
  ): Promise<CoinCapSpotPrice> {
    const payload = await this.requestJson(`/assets/${encodeURIComponent(coinCapAssetId)}`);
    const parsedPayload = coinCapSingleAssetResponseSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new AppError({
        code: "COINCAP_SCHEMA_MISMATCH",
        details: {
          issues: parsedPayload.error.issues,
          retryable: false,
        },
        message: "CoinCap payload schema mismatch",
        statusCode: 502,
      });
    }

    return this.toSpotPrice(parsedPayload.data.data, requestedAssetId);
  }

  private async requestJson(path: string): Promise<unknown> {
    return retryWithExponentialBackoff(
      () => this.requestJsonOnce(path),
      {
        attempts: 3,
        baseDelayMs: 250,
        jitterPercent: 20,
        shouldRetry: shouldRetryCoinCapRequest,
      },
    );
  }

  private async requestJsonOnce(path: string): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(`${env.COINCAP_API_BASE_URL}${path}`, {
        method: "GET",
        signal: AbortSignal.timeout(env.COINCAP_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppError({
        code: "COINCAP_UNAVAILABLE",
        details: {
          cause: error,
          retryable: true,
        },
        message: "CoinCap request failed",
        statusCode: 503,
      });
    }

    if (!response.ok) {
      const responseText = await response.text();
      const retryable = isRetryableStatusCode(response.status);

      throw new AppError({
        code: "COINCAP_BAD_STATUS",
        details: {
          path,
          responseBody: responseText.slice(0, 1000),
          responseStatus: response.status,
          retryable,
        },
        message: "CoinCap returned a non-success status",
        statusCode: retryable ? 503 : 502,
      });
    }

    try {
      const responseText = await response.text();
      return JSON.parse(responseText) as unknown;
    } catch {
      throw new AppError({
        code: "COINCAP_INVALID_JSON",
        details: {
          path,
          retryable: true,
        },
        message: "CoinCap returned invalid JSON",
        statusCode: 502,
      });
    }
  }

  private toSpotPrice(asset: z.infer<typeof coinCapAssetSchema>, requestedAssetId: string): CoinCapSpotPrice {
    const priceUsd = parseNumber(asset.priceUsd);

    if (priceUsd === null) {
      throw new AppError({
        code: "COINCAP_PRICE_NOT_FOUND",
        details: {
          assetId: requestedAssetId,
          retryable: false,
        },
        message: "Price not found in CoinCap payload",
        statusCode: 502,
      });
    }

    return {
      assetId: requestedAssetId,
      fetchedAt: new Date().toISOString(),
      price: priceUsd,
      provider: "coincap",
      symbol: asset.symbol,
    };
  }
}
