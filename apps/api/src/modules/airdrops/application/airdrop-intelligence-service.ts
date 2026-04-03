import { z } from "zod";

import { env } from "../../../shared/config/env.js";
import { memoryCache } from "../../../shared/cache/memory-cache.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { logger } from "../../../shared/logger/logger.js";
import { airdropsIntelligenceMetricsStore } from "../../../shared/observability/airdrops-intelligence-metrics-store.js";

const airdropSourceNames = [
  "airdrop_alert",
  "airdrops_io",
  "coingecko_trending",
  "defillama",
  "drops_tab",
  "earnifi",
] as const;

const airdropSourceNameSchema = z.enum(airdropSourceNames);
const airdropConfidenceSchema = z.enum(["high", "medium", "low"]);
const airdropSortBySchema = z.enum(["score", "recent"]);

const airdropIntelligenceInputSchema = z.object({
  chain: z.string().trim().min(1).max(40).optional(),
  confidence: airdropConfidenceSchema.optional(),
  includeSpeculative: z.boolean().default(true),
  limit: z.number().int().min(1).max(40).default(12),
  minScore: z.number().min(0).max(100).default(35),
  query: z.string().trim().max(160).optional(),
  sortBy: airdropSortBySchema.default("score"),
  sources: z.array(airdropSourceNameSchema).min(1).max(6).optional(),
});

const airdropSourceHtmlSchema = z.string().trim().min(1);

const defiLlamaProtocolSchema = z.object({
  category: z.string().trim().optional(),
  chain: z.string().trim().optional(),
  chains: z.array(z.string().trim()).optional(),
  gecko_id: z.string().trim().nullable().optional(),
  name: z.string().trim().min(1),
  symbol: z.string().trim().optional(),
  tvl: z.number().nullable().optional(),
  url: z.string().url().optional(),
});

const defiLlamaProtocolsSchema = z.array(defiLlamaProtocolSchema);

const coinGeckoTrendingSchema = z.object({
  coins: z.array(
    z.object({
      item: z.object({
        id: z.string().trim().min(1),
        market_cap_rank: z.number().nullable().optional(),
        name: z.string().trim().min(1),
        symbol: z.string().trim().min(1),
      }),
    }),
  ),
});

const queryStopWords = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "esta",
  "este",
  "hoje",
  "me",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "para",
  "por",
  "qual",
  "quais",
  "que",
  "se",
  "semana",
  "sobre",
  "um",
  "uma",
  "uns",
  "umas",
]);

const chainHints = [
  "ethereum",
  "solana",
  "base",
  "arbitrum",
  "optimism",
  "polygon",
  "avalanche",
  "bnb",
  "zksync",
  "starknet",
  "sui",
  "aptos",
  "linea",
  "mantle",
  "sei",
  "blast",
];

const discoveryKeywords = [
  "airdrop",
  "retroactive",
  "retroativo",
  "testnet",
  "quest",
  "campaign",
  "campaigns",
  "points",
  "point",
  "farming",
  "farm",
  "whitelist",
  "incentive",
  "incentives",
  "reward",
  "rewards",
  "galxe",
  "layer3",
  "zealy",
];

const defaultSourceWeights = {
  airdrop_alert: 72,
  airdrops_io: 74,
  coingecko_trending: 34,
  defillama: 48,
  drops_tab: 84,
  earnifi: 82,
} as const;

const premiumPayloadArrayKeys = ["airdrops", "data", "items", "opportunities", "results"];
const premiumRecordTextKeys = [
  "campaign",
  "content",
  "description",
  "details",
  "summary",
  "text",
] as const;
const premiumRecordTaskKeys = ["actions", "checklist", "steps", "tasks"] as const;
const premiumRecordTagKeys = ["categories", "labels", "tags"] as const;
const premiumRecordUrlKeys = ["externalUrl", "link", "projectUrl", "sourceUrl", "url"] as const;

const airdropFreshTtlSeconds = 180;
const airdropStaleSeconds = 360;

export type AirdropRewardType = "nft" | "points" | "token" | "unknown";
export type AirdropConfidence = z.infer<typeof airdropConfidenceSchema>;
export type AirdropSortBy = z.infer<typeof airdropSortBySchema>;
export type AirdropSourceName = z.infer<typeof airdropSourceNameSchema>;

export interface AirdropOpportunity {
  chain: string | null;
  confidence: AirdropConfidence;
  description: string;
  discoveredAt: string;
  project: string;
  rewardType: AirdropRewardType;
  score: number;
  sources: AirdropSourceName[];
  tags: string[];
  tasks: string[];
  url: string;
}

export interface AirdropSourceSnapshot {
  endpoint: string;
  error: {
    code: string;
    message: string;
  } | null;
  fetchedAt: string;
  latencyMs: number;
  source: AirdropSourceName;
  status: "error" | "ok";
  totalItems: number;
}

export interface AirdropIntelligenceResponse {
  cache: {
    stale: boolean;
    state: "fresh" | "miss" | "refreshed" | "stale";
  };
  fetchedAt: string;
  opportunities: AirdropOpportunity[];
  query: string | null;
  sources: AirdropSourceSnapshot[];
  summary: {
    highConfidence: number;
    lowConfidence: number;
    mediumConfidence: number;
    sourceCoveragePercent: number;
    sourcesHealthy: number;
    total: number;
    totalSources: number;
  };
}

interface RawAirdropOpportunity {
  chain: string | null;
  description: string;
  discoveredAt: string;
  project: string;
  rewardType: AirdropRewardType;
  source: AirdropSourceName;
  sourceConfidence: number;
  tags: string[];
  tasks: string[];
  url: string;
}

interface SourceCollectionResult {
  endpoint: string;
  error: {
    code: string;
    message: string;
  } | null;
  fetchedAt: string;
  items: RawAirdropOpportunity[];
  latencyMs: number;
  source: AirdropSourceName;
  status: "error" | "ok";
}

interface CachedAirdropPayload {
  fetchedAt: string;
  opportunities: AirdropOpportunity[];
  query: string | null;
  sources: AirdropSourceSnapshot[];
  summary: AirdropIntelligenceResponse["summary"];
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function sanitizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtmlTags(value: string): string {
  return sanitizeWhitespace(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">"),
  );
}

function toIsoDate(value: string): string | null {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString();
}

function resolveAbsoluteUrl(baseUrl: string, targetUrl: string): string {
  try {
    return new URL(targetUrl, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecordString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value !== "string") {
      continue;
    }

    const normalized = sanitizeWhitespace(value);

    if (normalized.length > 0) {
      return normalized;
    }
  }

  return null;
}

function readRecordNumber(
  record: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }

    return value;
  }

  return null;
}

function readRecordStringArray(
  record: Record<string, unknown>,
  keys: readonly string[],
): string[] {
  for (const key of keys) {
    const value = record[key];

    if (!Array.isArray(value)) {
      continue;
    }

    const normalized = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => sanitizeWhitespace(item))
      .filter((item) => item.length > 0);

    if (normalized.length > 0) {
      return normalized;
    }
  }

  return [];
}

function resolveRewardTypeFromValue(value: string | null): AirdropRewardType | null {
  if (!value) {
    return null;
  }

  const normalizedValue = normalizeText(value);

  if (normalizedValue.includes("point") || normalizedValue.includes("xp")) {
    return "points";
  }

  if (normalizedValue.includes("nft") || normalizedValue.includes("whitelist")) {
    return "nft";
  }

  if (
    normalizedValue.includes("token") ||
    normalizedValue.includes("airdrop") ||
    normalizedValue.includes("retroactive") ||
    normalizedValue.includes("retroativo")
  ) {
    return "token";
  }

  if (normalizedValue.includes("unknown") || normalizedValue.includes("n/a")) {
    return "unknown";
  }

  return null;
}

function normalizeSourceConfidence(value: number | null, fallback: number): number {
  if (value === null) {
    return fallback;
  }

  return Number(Math.max(0, Math.min(100, value)).toFixed(1));
}

function detectRewardTypeFromText(text: string): AirdropRewardType {
  const normalizedText = normalizeText(text);

  if (
    normalizedText.includes("point") ||
    normalizedText.includes("points") ||
    normalizedText.includes("xp")
  ) {
    return "points";
  }

  if (normalizedText.includes("nft") || normalizedText.includes("whitelist")) {
    return "nft";
  }

  if (
    normalizedText.includes("token") ||
    normalizedText.includes("airdrop") ||
    normalizedText.includes("retroactive") ||
    normalizedText.includes("retroativo")
  ) {
    return "token";
  }

  return "unknown";
}

function detectChainFromText(text: string): string | null {
  const normalizedText = normalizeText(text);

  for (const chainHint of chainHints) {
    if (normalizedText.includes(chainHint)) {
      return chainHint;
    }
  }

  return null;
}

function inferTasksFromText(text: string): string[] {
  const normalizedText = normalizeText(text);
  const tasks: string[] = [];

  if (normalizedText.includes("testnet")) {
    tasks.push("Executar transacoes em testnet");
  }

  if (normalizedText.includes("bridge") || normalizedText.includes("bridg")) {
    tasks.push("Fazer bridge entre redes elegiveis");
  }

  if (normalizedText.includes("swap")) {
    tasks.push("Realizar swaps no protocolo");
  }

  if (normalizedText.includes("stake") || normalizedText.includes("staking")) {
    tasks.push("Fazer stake quando disponivel");
  }

  if (
    normalizedText.includes("quest") ||
    normalizedText.includes("galxe") ||
    normalizedText.includes("zealy") ||
    normalizedText.includes("layer3")
  ) {
    tasks.push("Completar quests sociais e on-chain");
  }

  if (normalizedText.includes("discord") || normalizedText.includes("twitter") || normalizedText.includes("x.com")) {
    tasks.push("Monitorar anuncios oficiais da comunidade");
  }

  if (tasks.length === 0) {
    tasks.push("Acompanhar regras oficiais de elegibilidade");
  }

  return [...new Set(tasks)].slice(0, 5);
}

function inferTagsFromText(text: string): string[] {
  const normalizedText = normalizeText(text);
  const tags = discoveryKeywords.filter((keyword) => normalizedText.includes(keyword));
  return [...new Set(tags)].slice(0, 8);
}

function hasDiscoveryKeyword(text: string): boolean {
  const normalizedText = normalizeText(text);
  return discoveryKeywords.some((keyword) => normalizedText.includes(keyword));
}

function extractDiscoveredAt(text: string): string {
  const isoPattern = /(20\d{2}-\d{2}-\d{2})/;
  const brPattern = /(\d{2})\/(\d{2})\/(20\d{2})/;

  const isoMatch = text.match(isoPattern);

  if (isoMatch?.[1]) {
    const parsedIso = toIsoDate(isoMatch[1]);

    if (parsedIso) {
      return parsedIso;
    }
  }

  const brMatch = text.match(brPattern);

  if (brMatch?.[1] && brMatch[2] && brMatch[3]) {
    const parsedBr = toIsoDate(`${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`);

    if (parsedBr) {
      return parsedBr;
    }
  }

  return new Date().toISOString();
}

function extractProjectName(anchorText: string): string {
  const cleaned = sanitizeWhitespace(
    anchorText
      .replace(/\b(airdrop|campaign|guide|retroactive|retroativo|testnet|points?|quests?)\b/gi, " ")
      .replace(/[|:-]+/g, " "),
  );

  if (cleaned.length >= 3) {
    return cleaned.slice(0, 80);
  }

  return sanitizeWhitespace(anchorText).slice(0, 80);
}

function buildSourceSnapshot(sourceResult: SourceCollectionResult): AirdropSourceSnapshot {
  return {
    endpoint: sourceResult.endpoint,
    error: sourceResult.error,
    fetchedAt: sourceResult.fetchedAt,
    latencyMs: sourceResult.latencyMs,
    source: sourceResult.source,
    status: sourceResult.status,
    totalItems: sourceResult.items.length,
  };
}

function tokenizeQuery(query: string): string[] {
  return [...new Set(
    normalizeText(query)
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !queryStopWords.has(token)),
  )].slice(0, 8);
}

function scoreByRecency(discoveredAt: string): number {
  const parsed = new Date(discoveredAt);

  if (Number.isNaN(parsed.getTime())) {
    return 4;
  }

  const ageMs = Date.now() - parsed.getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);

  if (ageDays <= 3) {
    return 18;
  }

  if (ageDays <= 14) {
    return 12;
  }

  if (ageDays <= 30) {
    return 8;
  }

  return 4;
}

function resolveConfidenceFromScore(score: number): AirdropConfidence {
  if (score >= 72) {
    return "high";
  }

  if (score >= 50) {
    return "medium";
  }

  return "low";
}

function pickBetterDescription(current: string, incoming: string): string {
  if (incoming.length > current.length) {
    return incoming;
  }

  return current;
}

function pickNewestDate(current: string, incoming: string): string {
  const currentDate = new Date(current);
  const incomingDate = new Date(incoming);

  if (Number.isNaN(currentDate.getTime())) {
    return incoming;
  }

  if (Number.isNaN(incomingDate.getTime())) {
    return current;
  }

  return incomingDate.getTime() > currentDate.getTime() ? incoming : current;
}

function mergeUniqueValues(values: string[], incomingValues: string[], maxItems: number): string[] {
  const merged = [...new Set([...values, ...incomingValues])];
  return merged.slice(0, maxItems);
}

function buildCacheKey(input: z.infer<typeof airdropIntelligenceInputSchema>): string {
  const normalizedQuery = input.query?.trim().toLowerCase() ?? "all";
  const normalizedChain = input.chain ? normalizeToken(input.chain) : "all";
  const normalizedConfidence = input.confidence ?? "all";
  const normalizedSources = input.sources?.slice().sort().join("|") ?? "all";

  return [
    "airdrops:intelligence",
    normalizedQuery,
    normalizedChain,
    normalizedConfidence,
    input.sortBy,
    normalizedSources,
    input.limit.toString(),
    input.minScore.toFixed(1),
    input.includeSpeculative ? "speculative" : "strict",
  ].join(":");
}

function toResponse(
  payload: CachedAirdropPayload,
  state: "fresh" | "miss" | "refreshed" | "stale",
  stale: boolean,
): AirdropIntelligenceResponse {
  return {
    cache: {
      stale,
      state,
    },
    fetchedAt: payload.fetchedAt,
    opportunities: payload.opportunities,
    query: payload.query,
    sources: payload.sources,
    summary: payload.summary,
  };
}

export class AirdropIntelligenceService {
  public async getOpportunities(input?: {
    chain?: string;
    confidence?: AirdropConfidence;
    includeSpeculative?: boolean;
    limit?: number;
    minScore?: number;
    query?: string;
    sortBy?: AirdropSortBy;
    sources?: AirdropSourceName[];
  }): Promise<AirdropIntelligenceResponse> {
    const parsedInput = airdropIntelligenceInputSchema.parse(input ?? {});
    const cacheKey = buildCacheKey(parsedInput);
    const cachedPayload = memoryCache.get<CachedAirdropPayload>(cacheKey);

    if (cachedPayload.state === "fresh") {
      return toResponse(cachedPayload.value, "fresh", false);
    }

    if (cachedPayload.state === "stale") {
      try {
        return await this.refreshOpportunities(parsedInput);
      } catch {
        return toResponse(cachedPayload.value, "stale", true);
      }
    }

    return this.refreshOpportunities(parsedInput);
  }

  private async refreshOpportunities(
    input: z.infer<typeof airdropIntelligenceInputSchema>,
  ): Promise<AirdropIntelligenceResponse> {
    const normalizedQuery = input.query?.trim().length ? input.query.trim() : null;
    const normalizedChainFilter = input.chain ? normalizeToken(input.chain) : null;
    const sourceFilter = input.sources ? new Set(input.sources) : null;
    const queryTokens = normalizedQuery ? tokenizeQuery(normalizedQuery) : [];
    const sourceResults: SourceCollectionResult[] = [];
    const sourceCollectors: Array<Promise<SourceCollectionResult>> = [
      this.collectAirdropsIoSource(),
      this.collectAirdropAlertSource(),
      this.collectDefiLlamaSource(),
      this.collectCoinGeckoTrendingSource(),
    ];

    const hasDropsTabUrl = env.AIRDROPS_DROPS_TAB_SOURCE_URL.length > 0;
    const hasDropsTabApiKey = env.AIRDROPS_DROPS_TAB_API_KEY.length > 0;

    if (hasDropsTabUrl && hasDropsTabApiKey) {
      sourceCollectors.push(this.collectDropsTabSource());
    } else if (hasDropsTabUrl || hasDropsTabApiKey) {
      sourceResults.push(
        this.buildMisconfiguredPremiumSourceResult(
          "drops_tab",
          hasDropsTabUrl ? env.AIRDROPS_DROPS_TAB_SOURCE_URL : "drops_tab",
        ),
      );
    }

    const hasEarnifiUrl = env.AIRDROPS_EARNIFI_SOURCE_URL.length > 0;
    const hasEarnifiApiKey = env.AIRDROPS_EARNIFI_API_KEY.length > 0;

    if (hasEarnifiUrl && hasEarnifiApiKey) {
      sourceCollectors.push(this.collectEarnifiSource());
    } else if (hasEarnifiUrl || hasEarnifiApiKey) {
      sourceResults.push(
        this.buildMisconfiguredPremiumSourceResult(
          "earnifi",
          hasEarnifiUrl ? env.AIRDROPS_EARNIFI_SOURCE_URL : "earnifi",
        ),
      );
    }

    sourceResults.push(...await Promise.all(sourceCollectors));

    for (const sourceResult of sourceResults) {
      airdropsIntelligenceMetricsStore.recordSourceSnapshot({
        error: sourceResult.error,
        fetchedAt: sourceResult.fetchedAt,
        latencyMs: sourceResult.latencyMs,
        source: sourceResult.source,
        status: sourceResult.status,
        totalItems: sourceResult.items.length,
      });
    }

    const sourceSnapshots = sourceResults.map((sourceResult) => buildSourceSnapshot(sourceResult));
    const healthySources = sourceSnapshots.filter((sourceSnapshot) => sourceSnapshot.status === "ok").length;
    const sourceCoveragePercent =
      sourceSnapshots.length === 0
        ? 0
        : Number(((healthySources / sourceSnapshots.length) * 100).toFixed(1));

    const mergedOpportunities = this.mergeAndRankOpportunities(
      sourceResults,
      queryTokens,
      input.includeSpeculative,
      input.sortBy,
    )
      .filter((opportunity) => opportunity.score >= input.minScore)
      .filter((opportunity) => {
        if (!input.confidence) {
          return true;
        }

        return opportunity.confidence === input.confidence;
      })
      .filter((opportunity) => {
        if (!normalizedChainFilter) {
          return true;
        }

        return normalizeToken(opportunity.chain ?? "") === normalizedChainFilter;
      })
      .filter((opportunity) => {
        if (!sourceFilter || sourceFilter.size === 0) {
          return true;
        }

        return opportunity.sources.some((source) => sourceFilter.has(source));
      })
      .slice(0, input.limit);

    const summary = {
      highConfidence: mergedOpportunities.filter((opportunity) => opportunity.confidence === "high").length,
      lowConfidence: mergedOpportunities.filter((opportunity) => opportunity.confidence === "low").length,
      mediumConfidence: mergedOpportunities.filter((opportunity) => opportunity.confidence === "medium").length,
      sourceCoveragePercent,
      sourcesHealthy: healthySources,
      total: mergedOpportunities.length,
      totalSources: sourceSnapshots.length,
    };

    const payload: CachedAirdropPayload = {
      fetchedAt: new Date().toISOString(),
      opportunities: mergedOpportunities,
      query: normalizedQuery,
      sources: sourceSnapshots,
      summary,
    };

    memoryCache.set(buildCacheKey(input), payload, airdropFreshTtlSeconds, airdropStaleSeconds);

    return toResponse(payload, "refreshed", false);
  }

  private mergeAndRankOpportunities(
    sourceResults: SourceCollectionResult[],
    queryTokens: string[],
    includeSpeculative: boolean,
    sortBy: AirdropSortBy,
  ): AirdropOpportunity[] {
    const allRawItems = sourceResults.flatMap((sourceResult) => sourceResult.items);
    const rankedItems = allRawItems
      .map((item) => {
        const textSearchBlob = normalizeText(
          [item.project, item.description, ...item.tags, item.chain ?? "", ...item.tasks].join(" "),
        );
        const matchedTokens = queryTokens.filter((token) => textSearchBlob.includes(token));

        if (queryTokens.length > 0 && matchedTokens.length === 0) {
          return null;
        }

        const score = this.computeOpportunityScore(item, matchedTokens.length, queryTokens.length);
        const confidence = resolveConfidenceFromScore(score);

        if (!includeSpeculative && confidence === "low") {
          return null;
        }

        return {
          ...item,
          confidence,
          score,
          sources: [item.source],
        };
      })
      .filter((item): item is RawAirdropOpportunity & {
        confidence: AirdropConfidence;
        score: number;
        sources: AirdropSourceName[];
      } => item !== null);

    const deduplicated = new Map<string, RawAirdropOpportunity & {
      confidence: AirdropConfidence;
      score: number;
      sources: AirdropSourceName[];
    }>();

    for (const rankedItem of rankedItems) {
      const dedupeKey = `${normalizeToken(rankedItem.project)}:${normalizeToken(rankedItem.chain ?? "global")}`;
      const existingItem = deduplicated.get(dedupeKey);

      if (!existingItem) {
        deduplicated.set(dedupeKey, rankedItem);
        continue;
      }

      deduplicated.set(dedupeKey, {
        ...existingItem,
        chain: existingItem.chain ?? rankedItem.chain,
        confidence: resolveConfidenceFromScore(Math.max(existingItem.score, rankedItem.score)),
        description: pickBetterDescription(existingItem.description, rankedItem.description),
        discoveredAt: pickNewestDate(existingItem.discoveredAt, rankedItem.discoveredAt),
        rewardType:
          existingItem.rewardType === "unknown" ? rankedItem.rewardType : existingItem.rewardType,
        score: Math.max(existingItem.score, rankedItem.score),
        sources: mergeUniqueValues(existingItem.sources, rankedItem.sources, 6) as AirdropSourceName[],
        tags: mergeUniqueValues(existingItem.tags, rankedItem.tags, 8),
        tasks: mergeUniqueValues(existingItem.tasks, rankedItem.tasks, 6),
        url: rankedItem.score > existingItem.score ? rankedItem.url : existingItem.url,
      });
    }

    return [...deduplicated.values()]
      .map((item) => ({
        chain: item.chain,
        confidence: item.confidence,
        description: item.description,
        discoveredAt: item.discoveredAt,
        project: item.project,
        rewardType: item.rewardType,
        score: item.score,
        sources: item.sources,
        tags: item.tags,
        tasks: item.tasks,
        url: item.url,
      }))
      .sort((left, right) => {
        if (sortBy === "recent") {
          const dateDelta = new Date(right.discoveredAt).getTime() - new Date(left.discoveredAt).getTime();

          if (dateDelta !== 0) {
            return dateDelta;
          }

          return right.score - left.score;
        }

        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return new Date(right.discoveredAt).getTime() - new Date(left.discoveredAt).getTime();
      });
  }

  private computeOpportunityScore(
    opportunity: RawAirdropOpportunity,
    matchedTokenCount: number,
    totalQueryTokens: number,
  ): number {
    const sourceScore = opportunity.sourceConfidence * 0.5;
    const actionScore = Math.min(24, opportunity.tasks.length * 6);
    const recencyScore = scoreByRecency(opportunity.discoveredAt);
    const completenessScore =
      (opportunity.chain ? 6 : 0) +
      (opportunity.rewardType !== "unknown" ? 6 : 0) +
      Math.min(6, Math.round(opportunity.description.length / 40));
    const queryScore =
      totalQueryTokens > 0 ? Math.min(20, Math.round((matchedTokenCount / totalQueryTokens) * 20)) : 0;
    const finalScore = sourceScore + actionScore + recencyScore + completenessScore + queryScore;

    return Number(Math.max(0, Math.min(100, finalScore)).toFixed(1));
  }

  private async collectAirdropsIoSource(): Promise<SourceCollectionResult> {
    return this.collectHtmlSource("airdrops_io", env.AIRDROPS_IO_SOURCE_URL, defaultSourceWeights.airdrops_io);
  }

  private async collectAirdropAlertSource(): Promise<SourceCollectionResult> {
    return this.collectHtmlSource(
      "airdrop_alert",
      env.AIRDROP_ALERT_SOURCE_URL,
      defaultSourceWeights.airdrop_alert,
    );
  }

  private async collectHtmlSource(
    source: "airdrop_alert" | "airdrops_io",
    endpoint: string,
    sourceConfidence: number,
  ): Promise<SourceCollectionResult> {
    return this.collectSource(source, endpoint, async () => {
      const htmlPayload = await this.requestText(endpoint);
      const htmlText = airdropSourceHtmlSchema.parse(htmlPayload);
      return this.parseHtmlOpportunities(source, endpoint, htmlText, sourceConfidence);
    });
  }

  private async collectDefiLlamaSource(): Promise<SourceCollectionResult> {
    const endpoint = `${env.DEFILLAMA_API_BASE_URL}/protocols`;

    return this.collectSource("defillama", endpoint, async () => {
      const payload = await this.requestJson(endpoint);
      const parsedPayload = defiLlamaProtocolsSchema.safeParse(payload);

      if (!parsedPayload.success) {
        throw new AppError({
          code: "AIRDROPS_DEFILLAMA_SCHEMA_MISMATCH",
          details: {
            issues: parsedPayload.error.issues,
          },
          message: "DeFiLlama payload schema mismatch",
          statusCode: 502,
        });
      }

      const nowIso = new Date().toISOString();

      return parsedPayload.data
        .filter((protocol) => (protocol.tvl ?? 0) >= 5_000_000)
        .filter((protocol) => !protocol.gecko_id)
        .sort((left, right) => (right.tvl ?? 0) - (left.tvl ?? 0))
        .slice(0, env.AIRDROPS_MAX_ITEMS_PER_SOURCE)
        .map((protocol) => {
          const chain = protocol.chain ?? protocol.chains?.[0] ?? null;
          const protocolUrl =
            protocol.url ?? `https://defillama.com/protocol/${encodeURIComponent(protocol.name.toLowerCase())}`;

          return {
            chain,
            description:
              `${protocol.name} e um protocolo DeFi sem token amplamente consolidado. ` +
              "Historicamente, protocolos nessa fase podem abrir campanhas retroativas.",
            discoveredAt: nowIso,
            project: protocol.name,
            rewardType: "token" as const,
            source: "defillama" as const,
            sourceConfidence: defaultSourceWeights.defillama,
            tags: ["defi", "retroactive", "onchain"],
            tasks: [
              "Executar operacoes reais no protocolo com risco controlado",
              "Acompanhar snapshots e regras oficiais de elegibilidade",
            ],
            url: protocolUrl,
          } satisfies RawAirdropOpportunity;
        });
    });
  }

  private async collectCoinGeckoTrendingSource(): Promise<SourceCollectionResult> {
    const endpoint = `${env.COINGECKO_API_BASE_URL}/search/trending`;

    return this.collectSource("coingecko_trending", endpoint, async () => {
      const payload = await this.requestJson(endpoint);
      const parsedPayload = coinGeckoTrendingSchema.safeParse(payload);

      if (!parsedPayload.success) {
        throw new AppError({
          code: "AIRDROPS_COINGECKO_SCHEMA_MISMATCH",
          details: {
            issues: parsedPayload.error.issues,
          },
          message: "CoinGecko trending payload schema mismatch",
          statusCode: 502,
        });
      }

      const nowIso = new Date().toISOString();

      return parsedPayload.data.coins
        .slice(0, env.AIRDROPS_MAX_ITEMS_PER_SOURCE)
        .map((coin) => {
          const marketRank = coin.item.market_cap_rank ?? null;
          const rankLabel = marketRank === null ? "n/d" : `#${marketRank}`;

          return {
            chain: null,
            description:
              `${coin.item.name} esta em alta no radar de tendencia (${rankLabel}). ` +
              "Monitorar comunidade e canais oficiais pode antecipar campanhas de incentivo.",
            discoveredAt: nowIso,
            project: coin.item.name,
            rewardType: "unknown" as const,
            source: "coingecko_trending" as const,
            sourceConfidence: defaultSourceWeights.coingecko_trending,
            tags: ["trending", "monitoring", "speculative"],
            tasks: [
              "Monitorar anuncios oficiais e roadmap",
              "Acompanhar campanhas de comunidade e pontos",
            ],
            url: `https://www.coingecko.com/en/coins/${encodeURIComponent(coin.item.id)}`,
          } satisfies RawAirdropOpportunity;
        });
    });
  }

  private async collectDropsTabSource(): Promise<SourceCollectionResult> {
    return this.collectPremiumJsonSource(
      "drops_tab",
      env.AIRDROPS_DROPS_TAB_SOURCE_URL,
      env.AIRDROPS_DROPS_TAB_API_KEY,
      defaultSourceWeights.drops_tab,
    );
  }

  private async collectEarnifiSource(): Promise<SourceCollectionResult> {
    return this.collectPremiumJsonSource(
      "earnifi",
      env.AIRDROPS_EARNIFI_SOURCE_URL,
      env.AIRDROPS_EARNIFI_API_KEY,
      defaultSourceWeights.earnifi,
    );
  }

  private buildMisconfiguredPremiumSourceResult(
    source: "drops_tab" | "earnifi",
    endpoint: string,
  ): SourceCollectionResult {
    return {
      endpoint,
      error: {
        code: "AIRDROPS_PREMIUM_SOURCE_MISCONFIGURED",
        message: "Premium source requires both endpoint and API key",
      },
      fetchedAt: new Date().toISOString(),
      items: [],
      latencyMs: 0,
      source,
      status: "error",
    };
  }

  private async collectPremiumJsonSource(
    source: "drops_tab" | "earnifi",
    endpoint: string,
    apiKey: string,
    sourceConfidence: number,
  ): Promise<SourceCollectionResult> {
    return this.collectSource(source, endpoint, async () => {
      const payload = await this.requestJson(endpoint, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-API-Key": apiKey,
        },
      });

      return this.parsePremiumJsonOpportunities(source, endpoint, payload, sourceConfidence);
    });
  }

  private extractPremiumPayloadRecords(payload: unknown): Record<string, unknown>[] {
    if (Array.isArray(payload)) {
      return payload.filter((item): item is Record<string, unknown> => isRecord(item));
    }

    if (!isRecord(payload)) {
      return [];
    }

    for (const key of premiumPayloadArrayKeys) {
      const maybeArray = payload[key];

      if (!Array.isArray(maybeArray)) {
        continue;
      }

      return maybeArray.filter((item): item is Record<string, unknown> => isRecord(item));
    }

    return [];
  }

  private parsePremiumJsonOpportunities(
    source: "drops_tab" | "earnifi",
    endpoint: string,
    payload: unknown,
    sourceConfidence: number,
  ): RawAirdropOpportunity[] {
    const records = this.extractPremiumPayloadRecords(payload);
    const opportunities: RawAirdropOpportunity[] = [];

    for (const record of records) {
      if (opportunities.length >= env.AIRDROPS_MAX_ITEMS_PER_SOURCE) {
        break;
      }

      const project = readRecordString(record, ["name", "project", "protocol", "title", "token"]);

      if (!project || project.length < 3) {
        continue;
      }

      const projectLabel = project.slice(0, 80);
      const textBlob = sanitizeWhitespace(
        [
          projectLabel,
          readRecordString(record, premiumRecordTextKeys) ?? "",
          readRecordString(record, ["chain", "network", "blockchain"]) ?? "",
          ...readRecordStringArray(record, premiumRecordTagKeys),
          ...readRecordStringArray(record, premiumRecordTaskKeys),
        ].join(" "),
      );
      const discoveredAtRaw = readRecordString(record, [
        "createdAt",
        "date",
        "discoveredAt",
        "publishedAt",
        "updatedAt",
      ]);
      const discoveredAt = discoveredAtRaw
        ? (toIsoDate(discoveredAtRaw) ?? extractDiscoveredAt(discoveredAtRaw))
        : extractDiscoveredAt(textBlob);
      const chain =
        readRecordString(record, ["blockchain", "chain", "network"]) ??
        detectChainFromText(textBlob);
      const rewardType =
        resolveRewardTypeFromValue(
          readRecordString(record, ["incentiveType", "reward", "rewardType", "type"]),
        ) ?? detectRewardTypeFromText(textBlob);
      const confidenceOverride = readRecordNumber(record, [
        "confidence",
        "priority",
        "qualityScore",
        "score",
      ]);
      const tags = mergeUniqueValues(
        inferTagsFromText(textBlob),
        readRecordStringArray(record, premiumRecordTagKeys),
        8,
      );
      const tasksFromRecord = readRecordStringArray(record, premiumRecordTaskKeys).slice(0, 5);
      const tasks = tasksFromRecord.length > 0 ? tasksFromRecord : inferTasksFromText(textBlob);
      const descriptionText =
        readRecordString(record, premiumRecordTextKeys) ??
        `${projectLabel} possui campanha monitorada em fonte premium.`;
      const sourceUrl = readRecordString(record, premiumRecordUrlKeys);

      opportunities.push({
        chain,
        description: descriptionText.slice(0, 260),
        discoveredAt,
        project: projectLabel,
        rewardType,
        source,
        sourceConfidence: normalizeSourceConfidence(confidenceOverride, sourceConfidence),
        tags,
        tasks,
        url: resolveAbsoluteUrl(endpoint, sourceUrl ?? endpoint),
      });
    }

    return opportunities;
  }

  private parseHtmlOpportunities(
    source: "airdrop_alert" | "airdrops_io",
    baseUrl: string,
    htmlText: string,
    sourceConfidence: number,
  ): RawAirdropOpportunity[] {
    const opportunities: RawAirdropOpportunity[] = [];
    const anchorPattern = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let matchedAnchor = anchorPattern.exec(htmlText);

    while (matchedAnchor) {
      if (opportunities.length >= env.AIRDROPS_MAX_ITEMS_PER_SOURCE) {
        break;
      }

      const href = matchedAnchor[1] ?? "";
      const anchorRawText = stripHtmlTags(matchedAnchor[2] ?? "");
      const anchorIndex = typeof matchedAnchor.index === "number" ? matchedAnchor.index : 0;
      const contextStart = Math.max(0, anchorIndex - 220);
      const contextEnd = Math.min(htmlText.length, anchorIndex + 500);
      const contextText = stripHtmlTags(htmlText.slice(contextStart, contextEnd));
      const fullText = sanitizeWhitespace(`${anchorRawText} ${contextText}`);

      if (anchorRawText.length < 3 || !hasDiscoveryKeyword(fullText)) {
        matchedAnchor = anchorPattern.exec(htmlText);
        continue;
      }

      const project = extractProjectName(anchorRawText);

      if (project.length < 3) {
        matchedAnchor = anchorPattern.exec(htmlText);
        continue;
      }

      const opportunity: RawAirdropOpportunity = {
        chain: detectChainFromText(fullText),
        description: fullText.slice(0, 260),
        discoveredAt: extractDiscoveredAt(fullText),
        project,
        rewardType: detectRewardTypeFromText(fullText),
        source,
        sourceConfidence,
        tags: inferTagsFromText(fullText),
        tasks: inferTasksFromText(fullText),
        url: resolveAbsoluteUrl(baseUrl, href),
      };

      opportunities.push(opportunity);
      matchedAnchor = anchorPattern.exec(htmlText);
    }

    return opportunities;
  }

  private async collectSource(
    source: AirdropSourceName,
    endpoint: string,
    collector: () => Promise<RawAirdropOpportunity[]>,
  ): Promise<SourceCollectionResult> {
    const startedAt = Date.now();

    try {
      const collectedItems = await collector();

      return {
        endpoint,
        error: null,
        fetchedAt: new Date().toISOString(),
        items: collectedItems,
        latencyMs: Date.now() - startedAt,
        source,
        status: "ok",
      };
    } catch (error) {
      logger.warn(
        {
          endpoint,
          err: error,
          source,
        },
        "Airdrop source collection failed",
      );

      return {
        endpoint,
        error: {
          code: error instanceof AppError ? error.code : "AIRDROPS_SOURCE_ERROR",
          message: error instanceof Error ? error.message : "Failed to collect source",
        },
        fetchedAt: new Date().toISOString(),
        items: [],
        latencyMs: Date.now() - startedAt,
        source,
        status: "error",
      };
    }
  }

  private async requestJson(
    url: string,
    input?: {
      headers?: HeadersInit;
    },
  ): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(url, {
        headers: input?.headers,
        method: "GET",
        signal: AbortSignal.timeout(env.AIRDROPS_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppError({
        code: "AIRDROPS_SOURCE_UNAVAILABLE",
        details: {
          cause: error,
          url,
        },
        message: "Airdrop source request failed",
        statusCode: 503,
      });
    }

    if (!response.ok) {
      const responseBody = await response.text();

      throw new AppError({
        code: "AIRDROPS_SOURCE_BAD_STATUS",
        details: {
          responseBody: responseBody.slice(0, 500),
          responseStatus: response.status,
          url,
        },
        message: "Airdrop source returned non-success status",
        statusCode: 502,
      });
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      throw new AppError({
        code: "AIRDROPS_SOURCE_INVALID_JSON",
        details: {
          url,
        },
        message: "Airdrop source returned invalid JSON",
        statusCode: 502,
      });
    }
  }

  private async requestText(url: string): Promise<string> {
    let response: Response;

    try {
      response = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(env.AIRDROPS_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppError({
        code: "AIRDROPS_SOURCE_UNAVAILABLE",
        details: {
          cause: error,
          url,
        },
        message: "Airdrop source request failed",
        statusCode: 503,
      });
    }

    if (!response.ok) {
      const responseBody = await response.text();

      throw new AppError({
        code: "AIRDROPS_SOURCE_BAD_STATUS",
        details: {
          responseBody: responseBody.slice(0, 500),
          responseStatus: response.status,
          url,
        },
        message: "Airdrop source returned non-success status",
        statusCode: 502,
      });
    }

    return response.text();
  }
}