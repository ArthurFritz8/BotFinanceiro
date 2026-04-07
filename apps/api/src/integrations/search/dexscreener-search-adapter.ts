import { z } from "zod";

import { env } from "../../shared/config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { retryWithExponentialBackoff } from "../../shared/resilience/retry-with-backoff.js";

const dexScreenerLookupInputSchema = z.object({
  maxResults: z.number().int().min(1).max(10).default(5),
  query: z.string().trim().min(2).max(120),
});

const dexScreenerSearchPayloadSchema = z.object({
  pairs: z.array(z.record(z.string(), z.unknown())).optional(),
});

interface DexScreenerInternalVenue extends DexScreenerVenue {
  relevanceScore: number;
}

export interface DexScreenerVenue {
  baseTokenAddress: string | null;
  baseTokenName: string | null;
  baseTokenSymbol: string;
  chainId: string;
  chainName: string;
  dexId: string;
  dexName: string;
  liquidityUsd: number | null;
  pairAddress: string;
  pairUrl: string;
  quoteTokenSymbol: string;
  volume24hUsd: number | null;
}

export interface DexScreenerTokenLookupResponse {
  fetchedAt: string;
  found: boolean;
  provider: "dexscreener";
  query: string;
  venues: DexScreenerVenue[];
}

const knownChainNames: Record<string, string> = {
  arbitrum: "Arbitrum",
  avalanche: "Avalanche",
  base: "Base",
  bsc: "BNB Chain",
  celo: "Celo",
  ethereum: "Ethereum",
  fantom: "Fantom",
  linea: "Linea",
  optimism: "Optimism",
  polygon: "Polygon",
  solana: "Solana",
};

const knownDexNames: Record<string, string> = {
  aerodrome: "Aerodrome",
  apeswap: "ApeSwap",
  biswap: "Biswap",
  curve: "Curve",
  dextools: "DexTools",
  gate: "Gate",
  maverick: "Maverick",
  meteora: "Meteora",
  orca: "Orca",
  pancakeswap: "PancakeSwap",
  quickswap: "QuickSwap",
  raydium: "Raydium",
  sushiswap: "SushiSwap",
  thena: "Thena",
  traderjoe: "Trader Joe",
  uniswap: "Uniswap",
  velodrome: "Velodrome",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeToken(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = collapseWhitespace(value);
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = record[key];
  return isRecord(value) ? value : null;
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readNestedNumber(record: Record<string, unknown>, key: string, nestedKey: string): number | null {
  const nestedRecord = readRecord(record, key);

  if (!nestedRecord) {
    return null;
  }

  return readNumber(nestedRecord, nestedKey);
}

function isRetryableStatusCode(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

interface RetryableErrorDetails {
  retryable?: boolean;
}

function hasRetryableFlag(details: unknown): details is RetryableErrorDetails {
  if (!isRecord(details)) {
    return false;
  }

  return typeof details.retryable === "boolean";
}

function shouldRetryWebSearchRequest(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return true;
  }

  if (error.code === "WEB_SEARCH_UNAVAILABLE") {
    return true;
  }

  if (error.code === "WEB_SEARCH_BAD_STATUS" && hasRetryableFlag(error.details)) {
    return error.details.retryable === true;
  }

  return false;
}

function toDisplayName(value: string): string {
  if (value.length === 0) {
    return "Desconhecido";
  }

  return value
    .split(/[^a-z0-9]+/i)
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function resolveChainName(chainId: string): string {
  const normalizedChainId = normalizeToken(chainId);
  return knownChainNames[normalizedChainId] ?? toDisplayName(chainId);
}

function resolveDexName(dexId: string): string {
  const normalizedDexId = normalizeToken(dexId);
  return knownDexNames[normalizedDexId] ?? toDisplayName(dexId);
}

function isHttpUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

function ensureAbsoluteUrl(value: string): string {
  return isHttpUrl(value) ? value : "";
}

function scorePairRelevance(
  query: string,
  baseTokenSymbol: string,
  baseTokenName: string | null,
  baseTokenAddress: string | null,
  chainId: string,
): number {
  const normalizedQuery = normalizeText(query);
  const normalizedQueryToken = normalizeToken(query);
  const queryTokens = normalizedQuery.split(/[^a-z0-9]+/).filter((token) => token.length >= 2);

  const normalizedSymbol = normalizeToken(baseTokenSymbol);
  const normalizedName = normalizeText(baseTokenName ?? "");
  const normalizedAddress = normalizeText(baseTokenAddress ?? "");
  const normalizedChain = normalizeToken(chainId);

  let score = 0;

  if (normalizedSymbol.length > 0 && queryTokens.includes(normalizedSymbol)) {
    score += 90;
  }

  if (normalizedName.length > 0 && normalizedQuery.includes(normalizedName)) {
    score += 55;
  }

  if (normalizedName.length > 0 && queryTokens.some((token) => token.length > 2 && normalizedName.includes(token))) {
    score += 25;
  }

  if (normalizedAddress.length > 0 && normalizedQueryToken.length >= 10 && normalizedAddress.includes(normalizedQueryToken)) {
    score += 120;
  }

  if (normalizedChain.length > 0 && queryTokens.includes(normalizedChain)) {
    score += 15;
  }

  return score;
}

export class DexScreenerSearchAdapter {
  public async searchTokenListings(
    input: z.input<typeof dexScreenerLookupInputSchema>,
  ): Promise<DexScreenerTokenLookupResponse> {
    const parsedInput = dexScreenerLookupInputSchema.parse(input);
    const payload = await this.requestDexScreener(parsedInput.query);

    const parsedVenues = this.extractVenues(payload, parsedInput.query, parsedInput.maxResults);

    return {
      fetchedAt: new Date().toISOString(),
      found: parsedVenues.length > 0,
      provider: "dexscreener",
      query: parsedInput.query,
      venues: parsedVenues,
    };
  }

  private extractVenues(
    payload: z.infer<typeof dexScreenerSearchPayloadSchema>,
    query: string,
    maxResults: number,
  ): DexScreenerVenue[] {
    const allVenues: DexScreenerInternalVenue[] = [];

    for (const pairItem of payload.pairs ?? []) {
      const chainId = (readString(pairItem, "chainId") ?? "").toLowerCase();
      const dexId = (readString(pairItem, "dexId") ?? "").toLowerCase();
      const pairAddress = readString(pairItem, "pairAddress") ?? "";
      const pairUrl = ensureAbsoluteUrl(readString(pairItem, "url") ?? "");
      const baseToken = readRecord(pairItem, "baseToken") ?? {};
      const quoteToken = readRecord(pairItem, "quoteToken") ?? {};
      const baseTokenSymbol = readString(baseToken, "symbol") ?? "";
      const quoteTokenSymbol = readString(quoteToken, "symbol") ?? "";

      if (
        chainId.length === 0
        || dexId.length === 0
        || pairAddress.length === 0
        || pairUrl.length === 0
        || baseTokenSymbol.length === 0
        || quoteTokenSymbol.length === 0
      ) {
        continue;
      }

      const baseTokenName = readString(baseToken, "name");
      const baseTokenAddress = readString(baseToken, "address");
      const liquidityUsd = readNestedNumber(pairItem, "liquidity", "usd");
      const volume24hUsd = readNestedNumber(pairItem, "volume", "h24");

      const relevanceScore = scorePairRelevance(query, baseTokenSymbol, baseTokenName, baseTokenAddress, chainId);

      allVenues.push({
        baseTokenAddress,
        baseTokenName,
        baseTokenSymbol,
        chainId,
        chainName: resolveChainName(chainId),
        dexId,
        dexName: resolveDexName(dexId),
        liquidityUsd,
        pairAddress,
        pairUrl,
        quoteTokenSymbol,
        relevanceScore,
        volume24hUsd,
      });
    }

    const relevantVenues = allVenues.filter((venue) => venue.relevanceScore > 0);
    const selectedVenues = relevantVenues.length > 0 ? relevantVenues : allVenues;

    const dedupe = new Set<string>();
    const dedupedVenues = selectedVenues.filter((venue) => {
      const dedupeKey = `${venue.chainId}:${venue.dexId}:${venue.pairAddress}`;

      if (dedupe.has(dedupeKey)) {
        return false;
      }

      dedupe.add(dedupeKey);
      return true;
    });

    dedupedVenues.sort((left, right) => {
      if (right.relevanceScore !== left.relevanceScore) {
        return right.relevanceScore - left.relevanceScore;
      }

      const rightLiquidity = right.liquidityUsd ?? -1;
      const leftLiquidity = left.liquidityUsd ?? -1;

      if (rightLiquidity !== leftLiquidity) {
        return rightLiquidity - leftLiquidity;
      }

      const rightVolume = right.volume24hUsd ?? -1;
      const leftVolume = left.volume24hUsd ?? -1;

      if (rightVolume !== leftVolume) {
        return rightVolume - leftVolume;
      }

      return left.dexId.localeCompare(right.dexId);
    });

    return dedupedVenues.slice(0, maxResults).map(({ relevanceScore, ...venue }) => {
      void relevanceScore;
      return venue;
    });
  }

  private async requestDexScreener(query: string): Promise<z.infer<typeof dexScreenerSearchPayloadSchema>> {
    return retryWithExponentialBackoff(
      () => this.requestDexScreenerOnce(query),
      {
        attempts: 2,
        baseDelayMs: 250,
        jitterPercent: 25,
        shouldRetry: shouldRetryWebSearchRequest,
      },
    );
  }

  private async requestDexScreenerOnce(query: string): Promise<z.infer<typeof dexScreenerSearchPayloadSchema>> {
    const requestUrl = `${env.WEB_SEARCH_DEXSCREENER_API_BASE_URL}/latest/dex/search/?${new URLSearchParams({
      q: query,
    }).toString()}`;

    let response: Response;

    try {
      response = await fetch(requestUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "BotFinanceiro/1.0 (+https://github.com/ArthurFritz8/BotFinanceiro)",
        },
        method: "GET",
        signal: AbortSignal.timeout(env.WEB_SEARCH_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppError({
        code: "WEB_SEARCH_UNAVAILABLE",
        details: {
          cause: error,
          provider: "dexscreener",
          query,
        },
        message: "Web search provider request failed",
        statusCode: 503,
      });
    }

    if (!response.ok) {
      const responseBodyPreview = await response.text();
      const retryable = isRetryableStatusCode(response.status);

      throw new AppError({
        code: "WEB_SEARCH_BAD_STATUS",
        details: {
          provider: "dexscreener",
          query,
          responseBody: responseBodyPreview.slice(0, 500),
          responseStatus: response.status,
          retryable,
        },
        message: "Web search provider returned non-success status",
        statusCode: retryable ? 503 : 502,
      });
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new AppError({
        code: "WEB_SEARCH_INVALID_JSON",
        details: {
          provider: "dexscreener",
          query,
        },
        message: "Web search provider returned invalid JSON",
        statusCode: 502,
      });
    }

    const parsedPayload = dexScreenerSearchPayloadSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new AppError({
        code: "WEB_SEARCH_SCHEMA_MISMATCH",
        details: {
          issues: parsedPayload.error.issues,
          provider: "dexscreener",
          query,
        },
        message: "Web search payload schema mismatch",
        statusCode: 502,
      });
    }

    return parsedPayload.data;
  }
}
