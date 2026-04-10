import { z } from "zod";

import { env } from "../../shared/config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { retryWithExponentialBackoff } from "../../shared/resilience/retry-with-backoff.js";

const dexScreenerLookupInputSchema = z.object({
  chain: z.string().trim().min(2).max(24).optional(),
  contractAddress: z.string().trim().min(20).max(96).optional(),
  maxResults: z.number().int().min(1).max(10).default(5),
  query: z.string().trim().min(2).max(120).optional(),
}).superRefine((value, ctx) => {
  if (value.contractAddress && !isSupportedContractAddress(value.contractAddress)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "contractAddress must be a valid EVM or Solana contract address",
      path: ["contractAddress"],
    });
  }

  if (!value.query && !value.contractAddress) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "query or contractAddress is required",
      path: ["query"],
    });
  }
});

const dexScreenerSearchPayloadSchema = z.object({
  pairs: z.array(z.record(z.string(), z.unknown())).optional(),
});

const dexScreenerPairPayloadSchema = z.object({
  pair: z.record(z.string(), z.unknown()).optional(),
  pairs: z.array(z.record(z.string(), z.unknown())).optional(),
});

const birdseyeHolderPayloadSchema = z.record(z.string(), z.unknown());

const evmContractAddressPattern = /^0x[a-fA-F0-9]{40}$/;
const solanaContractAddressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const chainAliasToId: Record<string, string> = {
  arb: "arbitrum",
  arbitrum: "arbitrum",
  avax: "avalanche",
  avalanche: "avalanche",
  base: "base",
  bnb: "bsc",
  bnbchain: "bsc",
  bsc: "bsc",
  celo: "celo",
  eth: "ethereum",
  ethereum: "ethereum",
  fantom: "fantom",
  linea: "linea",
  op: "optimism",
  optimism: "optimism",
  polygon: "polygon",
  sol: "solana",
  solana: "solana",
};

const birdseyeChainAliasByChainId: Record<string, string> = {
  arbitrum: "arbitrum",
  avalanche: "avalanche",
  base: "base",
  bsc: "bsc",
  celo: "celo",
  ethereum: "ethereum",
  optimism: "optimism",
  polygon: "polygon",
  solana: "solana",
};

interface DexScreenerInternalVenue extends DexScreenerVenue {
  pairCreatedAtMs: number | null;
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

export interface DexHolderDistributionItem {
  address: string;
  amount: number | null;
  isLiquidityPool: boolean | null;
  percentage: number | null;
  source: "birdseye" | "dexscreener_bundle";
}

export interface DexHolderDistributionError {
  code: string;
  message: string;
  provider: "birdseye" | "dexscreener" | "rpc";
  retryable: boolean;
}

export interface DexHolderDistributionSnapshot {
  error: DexHolderDistributionError | null;
  holders: DexHolderDistributionItem[];
  source: "birdseye" | "dexscreener_bundle" | "none";
  status: "ok" | "unavailable";
  totalHolders: number | null;
}

export interface DexScreenerTokenLookupResponse {
  fetchedAt: string;
  found: boolean;
  holderDistribution: DexHolderDistributionSnapshot;
  provider: "dexscreener";
  query: string;
  resolvedChainId: string | null;
  resolvedContractAddress: string | null;
  venues: DexScreenerVenue[];
}

interface ResolvedDexLookupInput {
  chainId: string | null;
  contractAddress: string | null;
  query: string;
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

function isSupportedContractAddress(value: string): boolean {
  return evmContractAddressPattern.test(value) || solanaContractAddressPattern.test(value);
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

function normalizeContractAddressCandidate(value: string): string | null {
  const normalizedValue = collapseWhitespace(value);

  if (evmContractAddressPattern.test(normalizedValue)) {
    return normalizedValue.toLowerCase();
  }

  if (solanaContractAddressPattern.test(normalizedValue)) {
    return normalizedValue;
  }

  return null;
}

function extractContractAddressFromText(value: string): string | null {
  const evmMatch = value.match(/0x[a-fA-F0-9]{40}/);

  if (evmMatch && typeof evmMatch[0] === "string") {
    return evmMatch[0].toLowerCase();
  }

  const solanaMatch = value.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/);

  if (solanaMatch && typeof solanaMatch[0] === "string") {
    return solanaMatch[0];
  }

  return null;
}

function resolveCanonicalChainId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalizedValue = normalizeToken(value);
  return chainAliasToId[normalizedValue] ?? null;
}

function extractChainHintFromQuery(query: string): string | null {
  const match = query.match(/(?:rede|chain|network|na|on)\s*[:\-]?\s*([a-zA-Z0-9_-]{2,24})/i);

  if (match && typeof match[1] === "string") {
    const resolvedChain = resolveCanonicalChainId(match[1]);

    if (resolvedChain) {
      return resolvedChain;
    }
  }

  for (const [alias, chainId] of Object.entries(chainAliasToId)) {
    if (query.toLowerCase().includes(alias)) {
      return chainId;
    }
  }

  return null;
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

function readArray(record: Record<string, unknown>, key: string): unknown[] | null {
  const value = record[key];
  return Array.isArray(value) ? value : null;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | null {
  const value = record[key];

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue === "true") {
      return true;
    }

    if (normalizedValue === "false") {
      return false;
    }
  }

  return null;
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

  if (error.code === "WEB_SEARCH_INVALID_JSON") {
    return true;
  }

  return false;
}

function toSafePositiveNumber(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function toSafePercentage(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return null;
  }

  if (value <= 1) {
    return Number((value * 100).toFixed(6));
  }

  return Number(value.toFixed(6));
}

function toHolderError(
  code: string,
  provider: "birdseye" | "dexscreener" | "rpc",
  retryable: boolean,
  message: string,
): DexHolderDistributionError {
  return {
    code,
    message,
    provider,
    retryable,
  };
}

function buildUnavailableHolderDistribution(error: DexHolderDistributionError): DexHolderDistributionSnapshot {
  return {
    error,
    holders: [],
    source: "none",
    status: "unavailable",
    totalHolders: null,
  };
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
    const resolvedInput = this.resolveLookupInput(parsedInput);
    const payload = await this.executeDexSearch(resolvedInput.query);

    const parsedVenues = this.extractVenues(
      payload,
      resolvedInput.query,
      parsedInput.maxResults,
      resolvedInput.chainId,
    );
    const inferredContractAddress = resolvedInput.contractAddress
      ?? this.resolveContractAddressFromVenues(resolvedInput.chainId, parsedVenues);
    const inferredChainCandidates = this.resolveBirdseyeChainCandidates(
      resolvedInput.chainId,
      inferredContractAddress,
      parsedVenues,
    );
    const holderDistribution = await this.resolveHolderDistribution(resolvedInput, parsedVenues);

    return {
      fetchedAt: new Date().toISOString(),
      found: parsedVenues.length > 0,
      holderDistribution,
      provider: "dexscreener",
      query: resolvedInput.query,
      resolvedChainId: resolvedInput.chainId ?? inferredChainCandidates[0] ?? null,
      resolvedContractAddress: inferredContractAddress,
      venues: parsedVenues,
    };
  }

  private resolveLookupInput(input: z.output<typeof dexScreenerLookupInputSchema>): ResolvedDexLookupInput {
    const normalizedQuery = collapseWhitespace(input.query ?? "");
    const contractFromInput = normalizeContractAddressCandidate(input.contractAddress ?? "");
    const contractFromQuery = extractContractAddressFromText(normalizedQuery);
    const resolvedContract = contractFromInput ?? contractFromQuery;
    const chainFromInput = resolveCanonicalChainId(input.chain);
    const chainFromQuery = extractChainHintFromQuery(normalizedQuery);
    const resolvedChainId = chainFromInput ?? chainFromQuery;
    const resolvedQuery = resolvedContract ?? normalizedQuery;

    if (resolvedQuery.length === 0) {
      throw new AppError({
        code: "WEB_SEARCH_INVALID_QUERY",
        message: "Dex search query is empty after normalization",
        statusCode: 422,
      });
    }

    return {
      chainId: resolvedChainId,
      contractAddress: resolvedContract,
      query: resolvedQuery,
    };
  }

  private extractVenues(
    payload: z.infer<typeof dexScreenerSearchPayloadSchema>,
    query: string,
    maxResults: number,
    preferredChainId: string | null,
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
      const pairCreatedAtMs = readNumber(pairItem, "pairCreatedAt");
      const volume24hUsd = readNestedNumber(pairItem, "volume", "h24");

      const relevanceScore = scorePairRelevance(query, baseTokenSymbol, baseTokenName, baseTokenAddress, chainId);
      const chainBoost = preferredChainId && normalizeToken(chainId) === preferredChainId ? 80 : 0;
      const baseBoost = normalizeToken(chainId) === "base" ? 8 : 0;
      const liquidityBoost = liquidityUsd !== null ? Math.min(Math.log10(Math.max(liquidityUsd, 1)) * 3, 14) : 0;
      const volumeBoost = volume24hUsd !== null ? Math.min(Math.log10(Math.max(volume24hUsd, 1)) * 2, 10) : 0;
      const recencyBoost = this.resolvePairRecencyBoost(pairCreatedAtMs);

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
        pairCreatedAtMs,
        pairUrl,
        quoteTokenSymbol,
        relevanceScore: relevanceScore + chainBoost + baseBoost + liquidityBoost + volumeBoost + recencyBoost,
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

    return dedupedVenues.slice(0, maxResults).map(({ pairCreatedAtMs, relevanceScore, ...venue }) => {
      void pairCreatedAtMs;
      void relevanceScore;
      return venue;
    });
  }

  private resolvePairRecencyBoost(pairCreatedAtMs: number | null): number {
    if (pairCreatedAtMs === null || !Number.isFinite(pairCreatedAtMs) || pairCreatedAtMs <= 0) {
      return 0;
    }

    const nowMs = Date.now();
    const ageMs = nowMs - pairCreatedAtMs;

    if (!Number.isFinite(ageMs) || ageMs < 0) {
      return 0;
    }

    const dayMs = 24 * 60 * 60 * 1000;
    const ageDays = ageMs / dayMs;

    if (ageDays <= 3) {
      return 20;
    }

    if (ageDays <= 10) {
      return 10;
    }

    if (ageDays <= 30) {
      return 4;
    }

    return 0;
  }

  private async resolveHolderDistribution(
    resolvedInput: ResolvedDexLookupInput,
    venues: DexScreenerVenue[],
  ): Promise<DexHolderDistributionSnapshot> {
    const effectiveContractAddress = resolvedInput.contractAddress
      ?? this.resolveContractAddressFromVenues(resolvedInput.chainId, venues);
    const effectiveChainCandidates = this.resolveBirdseyeChainCandidates(
      resolvedInput.chainId,
      effectiveContractAddress,
      venues,
    );

    if (effectiveContractAddress === null) {
      return buildUnavailableHolderDistribution(
        toHolderError(
          "ONCHAIN_HOLDER_CONTRACT_UNRESOLVED",
          "rpc",
          false,
          "Contract address is required to fetch structured holder distribution",
        ),
      );
    }

    const dexSnapshot = await this.tryResolveHolderDistributionFromDexScreener(
      effectiveContractAddress,
      resolvedInput.chainId,
      venues,
    );

    if (dexSnapshot.status === "ok") {
      return dexSnapshot;
    }

    const birdseyeSnapshot = await this.tryResolveHolderDistributionFromBirdseye(
      effectiveContractAddress,
      effectiveChainCandidates,
    );

    if (birdseyeSnapshot.status === "ok") {
      return birdseyeSnapshot;
    }

    return buildUnavailableHolderDistribution(
      birdseyeSnapshot.error
      ?? dexSnapshot.error
      ?? toHolderError(
        "ONCHAIN_HOLDER_DATA_UNAVAILABLE",
        "rpc",
        false,
        "No on-chain holder distribution available from configured providers",
      ),
    );
  }

  private resolveContractAddressFromVenues(
    preferredChainId: string | null,
    venues: DexScreenerVenue[],
  ): string | null {
    const validVenues = venues.filter((venue) => typeof venue.baseTokenAddress === "string" && venue.baseTokenAddress.length > 0);

    if (validVenues.length === 0) {
      return null;
    }

    const sortedVenues = [...validVenues].sort((left, right) => {
      const leftPreferred = preferredChainId !== null && normalizeToken(left.chainId) === preferredChainId ? 1 : 0;
      const rightPreferred = preferredChainId !== null && normalizeToken(right.chainId) === preferredChainId ? 1 : 0;

      if (rightPreferred !== leftPreferred) {
        return rightPreferred - leftPreferred;
      }

      const rightLiquidity = right.liquidityUsd ?? -1;
      const leftLiquidity = left.liquidityUsd ?? -1;

      if (rightLiquidity !== leftLiquidity) {
        return rightLiquidity - leftLiquidity;
      }

      return (right.volume24hUsd ?? -1) - (left.volume24hUsd ?? -1);
    });

    return sortedVenues[0]?.baseTokenAddress ?? null;
  }

  private resolveBirdseyeChainCandidates(
    preferredChainId: string | null,
    contractAddress: string | null,
    venues: DexScreenerVenue[],
  ): string[] {
    const candidates: string[] = [];

    if (preferredChainId) {
      candidates.push(preferredChainId);
    }

    for (const venue of venues) {
      if (
        contractAddress
        && venue.baseTokenAddress
        && normalizeText(venue.baseTokenAddress) !== normalizeText(contractAddress)
      ) {
        continue;
      }

      if (venue.chainId.length > 0) {
        candidates.push(normalizeToken(venue.chainId));
      }
    }

    if (contractAddress && solanaContractAddressPattern.test(contractAddress)) {
      candidates.push("solana");
    }

    const dedupe = new Set<string>();
    const normalizedCandidates: string[] = [];

    for (const candidate of candidates) {
      const normalizedCandidate = normalizeToken(candidate);

      if (normalizedCandidate.length === 0 || dedupe.has(normalizedCandidate)) {
        continue;
      }

      dedupe.add(normalizedCandidate);
      normalizedCandidates.push(normalizedCandidate);
    }

    return normalizedCandidates;
  }

  private async tryResolveHolderDistributionFromDexScreener(
    contractAddress: string,
    preferredChainId: string | null,
    venues: DexScreenerVenue[],
  ): Promise<DexHolderDistributionSnapshot> {
    const candidateVenues = this.pickHolderCandidateVenues(contractAddress, preferredChainId, venues);

    if (candidateVenues.length === 0) {
      return buildUnavailableHolderDistribution(
        toHolderError(
          "ONCHAIN_HOLDER_VENUE_NOT_FOUND",
          "dexscreener",
          false,
          "No DexScreener venue was found for the requested contract",
        ),
      );
    }

    let firstError: DexHolderDistributionError | null = null;

    for (const venue of candidateVenues.slice(0, 3)) {
      try {
        const payload = await this.requestDexPairPayload(venue.chainId, venue.pairAddress);
        const holderDistribution = this.parseDexPairHolderDistribution(payload);

        if (holderDistribution) {
          return {
            error: null,
            holders: holderDistribution.holders,
            source: "dexscreener_bundle",
            status: "ok",
            totalHolders: holderDistribution.totalHolders,
          };
        }
      } catch (error) {
        if (!firstError) {
          firstError = this.toHolderError(error, "dexscreener");
        }
      }
    }

    return buildUnavailableHolderDistribution(
      firstError
      ?? toHolderError(
        "ONCHAIN_HOLDER_DATA_MISSING",
        "dexscreener",
        false,
        "DexScreener pair payload did not include holder distribution",
      ),
    );
  }

  private pickHolderCandidateVenues(
    contractAddress: string,
    preferredChainId: string | null,
    venues: DexScreenerVenue[],
  ): DexScreenerVenue[] {
    const normalizedContract = normalizeText(contractAddress);
    const venuesMatchingContract = venues.filter((venue) => normalizeText(venue.baseTokenAddress ?? "") === normalizedContract);
    const selectedVenues = venuesMatchingContract.length > 0 ? venuesMatchingContract : venues;

    return [...selectedVenues].sort((left, right) => {
      const leftPreferred = preferredChainId !== null && normalizeToken(left.chainId) === preferredChainId ? 1 : 0;
      const rightPreferred = preferredChainId !== null && normalizeToken(right.chainId) === preferredChainId ? 1 : 0;

      if (rightPreferred !== leftPreferred) {
        return rightPreferred - leftPreferred;
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
  }

  private parseDexPairHolderDistribution(
    payload: z.infer<typeof dexScreenerPairPayloadSchema>,
  ): { holders: DexHolderDistributionItem[]; totalHolders: number | null } | null {
    const pair = this.pickPairRecord(payload);

    if (!pair) {
      return null;
    }

    const bundleSignals = readRecord(pair, "bundleSignals");

    if (!bundleSignals) {
      return null;
    }

    const topHoldersRaw = readArray(bundleSignals, "topHolders");

    if (!topHoldersRaw || topHoldersRaw.length === 0) {
      return null;
    }

    const holders: DexHolderDistributionItem[] = [];

    for (const holderRaw of topHoldersRaw) {
      if (!isRecord(holderRaw)) {
        continue;
      }

      const address =
        readString(holderRaw, "address")
        ?? readString(holderRaw, "wallet")
        ?? readString(holderRaw, "owner")
        ?? "";
      const percentage = toSafePercentage(
        readNumber(holderRaw, "supplyPercent")
        ?? readNumber(holderRaw, "percentage")
        ?? readNumber(holderRaw, "share"),
      );
      const amount = toSafePositiveNumber(
        readNumber(holderRaw, "balance")
        ?? readNumber(holderRaw, "amount")
        ?? readNumber(holderRaw, "tokenAmount"),
      );
      const isLiquidityPool = readBoolean(holderRaw, "isLiquidityPool") ?? readBoolean(holderRaw, "is_lp");

      if (address.length === 0 || (percentage === null && amount === null)) {
        continue;
      }

      holders.push({
        address,
        amount,
        isLiquidityPool,
        percentage,
        source: "dexscreener_bundle",
      });
    }

    if (holders.length === 0) {
      return null;
    }

    const activity = readRecord(bundleSignals, "activity");
    const totalHoldersRaw = activity ? readNumber(activity, "totalHolders") : null;
    const totalHolders =
      totalHoldersRaw !== null && Number.isFinite(totalHoldersRaw) && totalHoldersRaw >= 0
        ? Math.trunc(totalHoldersRaw)
        : null;

    return {
      holders: holders.slice(0, 10),
      totalHolders,
    };
  }

  private pickPairRecord(payload: z.infer<typeof dexScreenerPairPayloadSchema>): Record<string, unknown> | null {
    if (payload.pair) {
      return payload.pair;
    }

    for (const pairItem of payload.pairs ?? []) {
      if (isRecord(pairItem)) {
        return pairItem;
      }
    }

    return null;
  }

  private async tryResolveHolderDistributionFromBirdseye(
    contractAddress: string,
    chainCandidates: string[],
  ): Promise<DexHolderDistributionSnapshot> {
    if (env.ONCHAIN_BIRDSEYE_API_KEY.length < 10) {
      return buildUnavailableHolderDistribution(
        toHolderError(
          "ONCHAIN_BIRDSEYE_NOT_CONFIGURED",
          "birdseye",
          false,
          "BirdEye API key is not configured",
        ),
      );
    }

    const supportedChainCandidates = chainCandidates
      .map((chainId) => birdseyeChainAliasByChainId[chainId])
      .filter((chainId): chainId is string => typeof chainId === "string" && chainId.length > 0);

    if (supportedChainCandidates.length === 0) {
      return buildUnavailableHolderDistribution(
        toHolderError(
          "ONCHAIN_BIRDSEYE_CHAIN_UNRESOLVED",
          "birdseye",
          false,
          "Unable to resolve a supported BirdEye chain for holder lookup",
        ),
      );
    }

    let firstError: DexHolderDistributionError | null = null;

    for (const birdseyeChainId of supportedChainCandidates) {
      try {
        const payload = await this.requestBirdseyeHolders(contractAddress, birdseyeChainId);
        const parsedHolderDistribution = this.parseBirdseyeHolderDistribution(payload);

        if (!parsedHolderDistribution) {
          if (!firstError) {
            firstError = toHolderError(
              "ONCHAIN_BIRDSEYE_HOLDER_DATA_MISSING",
              "birdseye",
              false,
              "BirdEye response did not include holder distribution",
            );
          }

          continue;
        }

        return {
          error: null,
          holders: parsedHolderDistribution.holders,
          source: "birdseye",
          status: "ok",
          totalHolders: parsedHolderDistribution.totalHolders,
        };
      } catch (error) {
        if (!firstError) {
          firstError = this.toHolderError(error, "birdseye");
        }
      }
    }

    return buildUnavailableHolderDistribution(
      firstError
      ?? toHolderError(
        "ONCHAIN_BIRDSEYE_HOLDER_DATA_MISSING",
        "birdseye",
        false,
        "BirdEye response did not include holder distribution",
      ),
    );
  }

  private parseBirdseyeHolderDistribution(
    payload: z.infer<typeof birdseyeHolderPayloadSchema>,
  ): { holders: DexHolderDistributionItem[]; totalHolders: number | null } | null {
    const dataRecord = readRecord(payload, "data");

    if (!dataRecord) {
      return null;
    }

    const candidateArrays: unknown[][] = [
      readArray(dataRecord, "items") ?? [],
      readArray(dataRecord, "holders") ?? [],
      readArray(dataRecord, "topHolders") ?? [],
      readArray(dataRecord, "list") ?? [],
    ];

    const selectedArray = candidateArrays.find((items) => items.length > 0);

    if (!selectedArray) {
      return null;
    }

    const holders: DexHolderDistributionItem[] = [];

    for (const holderRaw of selectedArray) {
      if (!isRecord(holderRaw)) {
        continue;
      }

      const address =
        readString(holderRaw, "address")
        ?? readString(holderRaw, "owner")
        ?? readString(holderRaw, "wallet")
        ?? readString(holderRaw, "walletAddress")
        ?? "";
      const percentage = toSafePercentage(
        readNumber(holderRaw, "percentage")
        ?? readNumber(holderRaw, "share")
        ?? readNumber(holderRaw, "ownership")
        ?? readNumber(holderRaw, "ownershipPct"),
      );
      const amount = toSafePositiveNumber(
        readNumber(holderRaw, "amount")
        ?? readNumber(holderRaw, "balance")
        ?? readNumber(holderRaw, "tokenAmount")
        ?? readNumber(holderRaw, "uiAmount"),
      );
      const isLiquidityPool =
        readBoolean(holderRaw, "isLiquidityPool")
        ?? readBoolean(holderRaw, "is_lp")
        ?? readBoolean(holderRaw, "liquidityPool");

      if (address.length === 0 || (percentage === null && amount === null)) {
        continue;
      }

      holders.push({
        address,
        amount,
        isLiquidityPool,
        percentage,
        source: "birdseye",
      });
    }

    if (holders.length === 0) {
      return null;
    }

    const totalHoldersRaw =
      readNumber(dataRecord, "totalHolders")
      ?? readNumber(dataRecord, "holderCount")
      ?? readNumber(dataRecord, "total");
    const totalHolders =
      totalHoldersRaw !== null && Number.isFinite(totalHoldersRaw) && totalHoldersRaw >= 0
        ? Math.trunc(totalHoldersRaw)
        : null;

    return {
      holders: holders.slice(0, 10),
      totalHolders,
    };
  }

  private toHolderError(
    error: unknown,
    fallbackProvider: "birdseye" | "dexscreener",
  ): DexHolderDistributionError {
    if (!(error instanceof AppError)) {
      return toHolderError(
        "ONCHAIN_HOLDER_SOURCE_UNAVAILABLE",
        fallbackProvider,
        true,
        "On-chain holder source request failed",
      );
    }

    if (error.code === "WEB_SEARCH_BAD_STATUS" && hasRetryableFlag(error.details)) {
      return toHolderError(
        "ONCHAIN_HOLDER_BAD_STATUS",
        fallbackProvider,
        error.details.retryable === true,
        error.message,
      );
    }

    if (error.code === "WEB_SEARCH_UNAVAILABLE") {
      return toHolderError("ONCHAIN_HOLDER_SOURCE_UNAVAILABLE", fallbackProvider, true, error.message);
    }

    if (error.code === "WEB_SEARCH_INVALID_JSON" || error.code === "WEB_SEARCH_SCHEMA_MISMATCH") {
      return toHolderError("ONCHAIN_HOLDER_PAYLOAD_INVALID", fallbackProvider, true, error.message);
    }

    return toHolderError("ONCHAIN_HOLDER_UNEXPECTED_ERROR", fallbackProvider, false, error.message);
  }

  private async executeDexSearch(query: string): Promise<z.infer<typeof dexScreenerSearchPayloadSchema>> {
    return retryWithExponentialBackoff(
      () => this.requestDexScreenerOnce(query),
      {
        attempts: 3,
        baseDelayMs: 250,
        jitterPercent: 25,
        shouldRetry: shouldRetryWebSearchRequest,
      },
    );
  }

  private async requestDexPairPayload(
    chainId: string,
    pairAddress: string,
  ): Promise<z.infer<typeof dexScreenerPairPayloadSchema>> {
    return retryWithExponentialBackoff(
      () => this.requestDexPairPayloadOnce(chainId, pairAddress),
      {
        attempts: 3,
        baseDelayMs: 250,
        jitterPercent: 25,
        shouldRetry: shouldRetryWebSearchRequest,
      },
    );
  }

  private async requestDexPairPayloadOnce(
    chainId: string,
    pairAddress: string,
  ): Promise<z.infer<typeof dexScreenerPairPayloadSchema>> {
    const requestUrl = `${env.WEB_SEARCH_DEXSCREENER_API_BASE_URL}/latest/dex/pairs/${encodeURIComponent(chainId)}/${encodeURIComponent(pairAddress)}`;

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
          pairAddress,
          provider: "dexscreener",
          query: chainId,
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
          pairAddress,
          provider: "dexscreener",
          query: chainId,
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
          pairAddress,
          provider: "dexscreener",
          query: chainId,
        },
        message: "Web search provider returned invalid JSON",
        statusCode: 502,
      });
    }

    const parsedPayload = dexScreenerPairPayloadSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new AppError({
        code: "WEB_SEARCH_SCHEMA_MISMATCH",
        details: {
          issues: parsedPayload.error.issues,
          pairAddress,
          provider: "dexscreener",
          query: chainId,
        },
        message: "Web search payload schema mismatch",
        statusCode: 502,
      });
    }

    return parsedPayload.data;
  }

  private async requestBirdseyeHolders(
    contractAddress: string,
    chainId: string,
  ): Promise<z.infer<typeof birdseyeHolderPayloadSchema>> {
    return retryWithExponentialBackoff(
      () => this.requestBirdseyeHoldersOnce(contractAddress, chainId),
      {
        attempts: 2,
        baseDelayMs: 250,
        jitterPercent: 25,
        shouldRetry: shouldRetryWebSearchRequest,
      },
    );
  }

  private async requestBirdseyeHoldersOnce(
    contractAddress: string,
    chainId: string,
  ): Promise<z.infer<typeof birdseyeHolderPayloadSchema>> {
    const requestUrl = `${env.ONCHAIN_BIRDSEYE_API_BASE_URL}/v3/token/holder?${new URLSearchParams({
      address: contractAddress,
      limit: "10",
      offset: "0",
    }).toString()}`;

    let response: Response;

    try {
      response = await fetch(requestUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "BotFinanceiro/1.0 (+https://github.com/ArthurFritz8/BotFinanceiro)",
          "X-API-KEY": env.ONCHAIN_BIRDSEYE_API_KEY,
          "x-chain": chainId,
        },
        method: "GET",
        signal: AbortSignal.timeout(env.ONCHAIN_BIRDSEYE_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppError({
        code: "WEB_SEARCH_UNAVAILABLE",
        details: {
          cause: error,
          provider: "birdseye",
          query: contractAddress,
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
          provider: "birdseye",
          query: contractAddress,
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
          provider: "birdseye",
          query: contractAddress,
        },
        message: "Web search provider returned invalid JSON",
        statusCode: 502,
      });
    }

    const parsedPayload = birdseyeHolderPayloadSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new AppError({
        code: "WEB_SEARCH_SCHEMA_MISMATCH",
        details: {
          issues: parsedPayload.error.issues,
          provider: "birdseye",
          query: contractAddress,
        },
        message: "Web search payload schema mismatch",
        statusCode: 502,
      });
    }

    return parsedPayload.data;
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
