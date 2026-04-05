import { z } from "zod";
import type { PoolClient } from "pg";

import { OpenRouterChatAdapter } from "../../../integrations/ai/openrouter-chat-adapter.js";
import { memoryCache } from "../../../shared/cache/memory-cache.js";
import { env } from "../../../shared/config/env.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { logger } from "../../../shared/logger/logger.js";
import { resolvePersistenceMode, type PersistenceMode } from "../../../shared/persistence/persistence-mode.js";
import { getPostgresPool } from "../../../shared/persistence/postgres-pool.js";

const memeRadarChainSchema = z.enum(["solana", "base"]);
const memeRadarPrioritySchema = z.enum(["critical", "high", "watch"]);
const memeRadarAiClassificationSchema = z.enum(["ignite", "warm", "cold"]);

const memeRadarAiOutputSchema = z.object({
  catalysts: z.array(z.string().trim().min(2).max(120)).max(3).default([]),
  classification: memeRadarAiClassificationSchema,
  confidence: z.number().min(0).max(100),
  hypeScore: z.number().min(0).max(100),
  oneLineSummary: z.string().trim().min(6).max(180),
  riskFlags: z.array(z.string().trim().min(2).max(120)).max(3).default([]),
});

const memeRadarQuerySchema = z.object({
  chain: z.enum(["all", "base", "solana"]).default("all"),
  limit: z.number().int().min(1).max(80).default(30),
  pinnedOnly: z.boolean().default(false),
  priority: z.enum(["all", "critical", "high", "watch"]).default("all"),
  refresh: z.boolean().default(false),
});

type MemeRadarChain = z.infer<typeof memeRadarChainSchema>;
type MemeRadarPriority = z.infer<typeof memeRadarPrioritySchema>;
type MemeRadarAiClassification = z.infer<typeof memeRadarAiClassificationSchema>;
type MemeRadarCacheState = "fresh" | "miss" | "refreshed" | "stale";

type MemeRadarQueryInput = z.input<typeof memeRadarQuerySchema>;

interface MemeRadarMetricSnapshot {
  fdvUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  priceChange24hPct: number | null;
  txns24h: number | null;
  volume24hUsd: number | null;
}

interface MemeRadarSocialLink {
  type: string;
  url: string;
}

interface MemeRadarPairCandidate {
  chain: MemeRadarChain;
  dexId: string | null;
  discoveredAt: string;
  fingerprint: string;
  launchedAt: string | null;
  metrics: MemeRadarMetricSnapshot;
  pairAddress: string;
  pairUrl: string | null;
  quoteSymbol: string | null;
  socials: MemeRadarSocialLink[];
  sources: string[];
  token: {
    address: string | null;
    name: string;
    symbol: string;
  };
}

interface MemeRadarGeneratedSentiment {
  catalysts: string[];
  classification: MemeRadarAiClassification;
  confidence: number;
  generatedAt: string;
  hypeScore: number;
  model: string;
  oneLineSummary: string;
  riskFlags: string[];
}

interface StoredMemeRadarNotificationRecord {
  catalysts: string[];
  headline: string;
  pair: MemeRadarPairCandidate;
  pinned: boolean;
  priority: MemeRadarPriority;
  riskFlags: string[];
  sentiment: MemeRadarGeneratedSentiment;
  summary: string;
  updatedAt: string;
}

interface RankedMemeRadarCandidate {
  catalysts: string[];
  headline: string;
  pair: MemeRadarPairCandidate;
  priority: MemeRadarPriority;
  riskFlags: string[];
  sentiment: MemeRadarGeneratedSentiment;
  summary: string;
}

export interface MemeRadarSourceSnapshot {
  error: {
    code: string;
    message: string;
  } | null;
  fetchedAt: string;
  latencyMs: number;
  source: "dexscreener" | "geckoterminal_base" | "geckoterminal_solana" | "openrouter";
  status: "error" | "ok";
  totalItems: number;
}

export interface MemeRadarNotification {
  catalysts: string[];
  chain: MemeRadarChain;
  dexId: string | null;
  discoveredAt: string;
  headline: string;
  id: string;
  launchedAt: string | null;
  metrics: MemeRadarMetricSnapshot;
  pairAddress: string;
  pairFingerprint: string;
  pairUrl: string | null;
  pinned: boolean;
  priority: MemeRadarPriority;
  quoteSymbol: string | null;
  riskFlags: string[];
  sentiment: MemeRadarGeneratedSentiment;
  socials: MemeRadarSocialLink[];
  sources: string[];
  summary: string;
  token: {
    address: string | null;
    name: string;
    symbol: string;
  };
  updatedAt: string;
}

export interface MemeRadarBoardResponse {
  board: {
    byChain: {
      base: number;
      solana: number;
    };
    critical: number;
    high: number;
    pinned: number;
    total: number;
    watch: number;
  };
  cache: {
    stale: boolean;
    state: MemeRadarCacheState;
  };
  fetchedAt: string;
  notifications: MemeRadarNotification[];
  sources: MemeRadarSourceSnapshot[];
}

interface CachedMemeRadarSnapshot {
  fetchedAt: string;
  notifications: StoredMemeRadarNotificationRecord[];
  sources: MemeRadarSourceSnapshot[];
}

interface GeckoCollectResult {
  candidates: MemeRadarPairCandidate[];
  snapshot: MemeRadarSourceSnapshot;
}

interface DexCollectResult {
  firstError: {
    code: string;
    message: string;
  } | null;
  latencyMs: number;
  successCount: number;
}

interface PinnedUpdateResult {
  notificationId: string;
  pinned: boolean;
  updatedAt: string;
}

interface PostgresStoredNotificationRow {
  catalysts: string[];
  chain: MemeRadarChain;
  dex_id: string | null;
  discovered_at: Date | string;
  headline: string;
  id: number;
  last_score: number | string;
  launched_at: Date | string | null;
  metrics: unknown;
  pair_address: string;
  pair_fingerprint: string;
  pair_url: string | null;
  pinned: boolean;
  priority: MemeRadarPriority;
  quote_token_symbol: string | null;
  risk_flags: string[];
  sentiment_generated_at: Date | string | null;
  sentiment_model: string | null;
  sentiment_payload: unknown;
  socials: unknown;
  sources: string[];
  summary: string;
  token_address: string | null;
  token_name: string;
  token_symbol: string;
  updated_at: Date | string;
}

const MEME_RADAR_CACHE_KEY = "meme-radar:board:v1";
const MEME_RADAR_STORED_LIMIT = 220;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = record[key];

  if (!isRecord(value)) {
    return null;
  }

  return value;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];

  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function readNestedNumber(
  record: Record<string, unknown>,
  firstKey: string,
  secondKey: string,
): number | null {
  const first = readRecord(record, firstKey);

  if (!first) {
    return null;
  }

  return readNumber(first, secondKey);
}

function readNestedNumberDeep(
  record: Record<string, unknown>,
  firstKey: string,
  secondKey: string,
  thirdKey: string,
): number | null {
  const first = readRecord(record, firstKey);

  if (!first) {
    return null;
  }

  const second = readRecord(first, secondKey);

  if (!second) {
    return null;
  }

  return readNumber(second, thirdKey);
}

function toIsoDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toRounded(value: number, digits: number): number {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function sortByPriorityScore(
  left: StoredMemeRadarNotificationRecord,
  right: StoredMemeRadarNotificationRecord,
): number {
  if (left.pinned !== right.pinned) {
    return left.pinned ? -1 : 1;
  }

  const leftPriority = priorityRank(left.priority);
  const rightPriority = priorityRank(right.priority);

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  if (left.sentiment.hypeScore !== right.sentiment.hypeScore) {
    return right.sentiment.hypeScore - left.sentiment.hypeScore;
  }

  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

function priorityRank(priority: MemeRadarPriority): number {
  if (priority === "critical") {
    return 0;
  }

  if (priority === "high") {
    return 1;
  }

  return 2;
}

function resolveClassificationFromScore(score: number): MemeRadarAiClassification {
  if (score >= 75) {
    return "ignite";
  }

  if (score >= 58) {
    return "warm";
  }

  return "cold";
}

function resolvePriorityFromSentiment(sentiment: MemeRadarGeneratedSentiment): MemeRadarPriority {
  if (sentiment.hypeScore >= 80 && sentiment.confidence >= 55) {
    return "critical";
  }

  if (sentiment.hypeScore >= 62) {
    return "high";
  }

  return "watch";
}

function formatChainLabel(chain: MemeRadarChain): string {
  return chain === "solana" ? "Solana" : "Base";
}

function buildFingerprint(chain: MemeRadarChain, pairAddress: string): string {
  return `${chain}:${pairAddress.trim().toLowerCase()}`;
}

function mergeUniqueStrings(baseValues: string[], incomingValues: string[], maxItems: number): string[] {
  const merged = [...new Set([...baseValues, ...incomingValues])];
  return merged.slice(0, maxItems);
}

function mergeSocialLinks(
  baseLinks: MemeRadarSocialLink[],
  incomingLinks: MemeRadarSocialLink[],
): MemeRadarSocialLink[] {
  const mapByUrl = new Map<string, MemeRadarSocialLink>();

  for (const link of [...baseLinks, ...incomingLinks]) {
    const normalizedUrl = normalizeWhitespace(link.url);

    if (normalizedUrl.length < 8) {
      continue;
    }

    if (!mapByUrl.has(normalizedUrl)) {
      mapByUrl.set(normalizedUrl, {
        type: normalizeWhitespace(link.type).slice(0, 32) || "social",
        url: normalizedUrl,
      });
    }
  }

  return [...mapByUrl.values()].slice(0, 6);
}

function parseSocialLinks(input: unknown): MemeRadarSocialLink[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const links: MemeRadarSocialLink[] = [];

  for (const item of input) {
    if (!isRecord(item)) {
      continue;
    }

    const url = readString(item, "url");

    if (!url) {
      continue;
    }

    const type = readString(item, "type") ?? "social";

    links.push({
      type,
      url,
    });
  }

  return mergeSocialLinks([], links);
}

function ensureMetricSnapshot(value: unknown): MemeRadarMetricSnapshot {
  if (!isRecord(value)) {
    return {
      fdvUsd: null,
      liquidityUsd: null,
      marketCapUsd: null,
      priceChange24hPct: null,
      txns24h: null,
      volume24hUsd: null,
    };
  }

  return {
    fdvUsd: readNumber(value, "fdvUsd"),
    liquidityUsd: readNumber(value, "liquidityUsd"),
    marketCapUsd: readNumber(value, "marketCapUsd"),
    priceChange24hPct: readNumber(value, "priceChange24hPct"),
    txns24h: readNumber(value, "txns24h"),
    volume24hUsd: readNumber(value, "volume24hUsd"),
  };
}

function normalizeIsoString(value: Date | string | null | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const parsedDate = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return fallback;
  }

  return parsedDate.toISOString();
}

function normalizeIsoStringOrNull(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsedDate = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString();
}

function resolveTxCount(attributes: Record<string, unknown>): number | null {
  const buys = readNestedNumberDeep(attributes, "transactions", "h24", "buys");
  const sells = readNestedNumberDeep(attributes, "transactions", "h24", "sells");

  if (buys === null && sells === null) {
    return null;
  }

  return (buys ?? 0) + (sells ?? 0);
}

function inferTokenInfoFromPairName(name: string | null): { name: string; quoteSymbol: string | null; symbol: string } {
  if (!name) {
    return {
      name: "Unknown Meme",
      quoteSymbol: null,
      symbol: "UNKNOWN",
    };
  }

  const [leftPartRaw, rightPartRaw] = name.split("/");
  const leftPart = normalizeWhitespace(leftPartRaw ?? "");
  const rightPart = normalizeWhitespace(rightPartRaw ?? "");
  const symbolCandidate = normalizeToken(leftPart).toUpperCase();

  return {
    name: leftPart.length > 0 ? leftPart.slice(0, 48) : "Unknown Meme",
    quoteSymbol: rightPart.length > 0 ? rightPart.slice(0, 16).toUpperCase() : null,
    symbol: symbolCandidate.length > 0 ? symbolCandidate.slice(0, 14) : "UNKNOWN",
  };
}

function parseCandidateFromGeckoPool(
  chain: MemeRadarChain,
  poolRecord: Record<string, unknown>,
  tokenMap: Map<string, { address: string | null; name: string; symbol: string }>,
): MemeRadarPairCandidate | null {
  const attributes = readRecord(poolRecord, "attributes");

  if (!attributes) {
    return null;
  }

  const pairAddress = readString(attributes, "address");

  if (!pairAddress) {
    return null;
  }

  const pairName = readString(attributes, "name");
  const fallbackTokenInfo = inferTokenInfoFromPairName(pairName);
  const relationships = readRecord(poolRecord, "relationships");
  const baseTokenData = relationships
    ? readRecord(readRecord(relationships, "base_token") ?? {}, "data")
    : null;
  const quoteTokenData = relationships
    ? readRecord(readRecord(relationships, "quote_token") ?? {}, "data")
    : null;
  const baseTokenId = baseTokenData ? readString(baseTokenData, "id") : null;
  const quoteTokenId = quoteTokenData ? readString(quoteTokenData, "id") : null;
  const baseToken = baseTokenId ? tokenMap.get(baseTokenId) : undefined;
  const quoteToken = quoteTokenId ? tokenMap.get(quoteTokenId) : undefined;
  const launchedAt = toIsoDate(readString(attributes, "pool_created_at"));
  const discoveredAt = launchedAt ?? new Date().toISOString();

  return {
    chain,
    dexId: "unknown",
    discoveredAt,
    fingerprint: buildFingerprint(chain, pairAddress),
    launchedAt,
    metrics: {
      fdvUsd: readNumber(attributes, "fdv_usd"),
      liquidityUsd: readNumber(attributes, "reserve_in_usd"),
      marketCapUsd: readNumber(attributes, "market_cap_usd"),
      priceChange24hPct: readNestedNumber(attributes, "price_change_percentage", "h24"),
      txns24h: resolveTxCount(attributes),
      volume24hUsd: readNestedNumber(attributes, "volume_usd", "h24"),
    },
    pairAddress,
    pairUrl: null,
    quoteSymbol: quoteToken?.symbol ?? fallbackTokenInfo.quoteSymbol,
    socials: [],
    sources: ["geckoterminal"],
    token: {
      address: baseToken?.address ?? null,
      name: baseToken?.name ?? fallbackTokenInfo.name,
      symbol: (baseToken?.symbol ?? fallbackTokenInfo.symbol).toUpperCase(),
    },
  };
}

function extractFirstJsonObject(input: string): string | null {
  const startIndex = input.indexOf("{");

  if (startIndex < 0) {
    return null;
  }

  let depth = 0;

  for (let index = startIndex; index < input.length; index += 1) {
    const char = input[index];

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return input.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function deriveSentimentFallback(
  score: number,
  summary: string,
  riskFlags: string[],
  catalysts: string[],
  model: string,
  generatedAt: string,
): MemeRadarGeneratedSentiment {
  const normalizedScore = clamp(toRounded(score, 1), 0, 100);

  return {
    catalysts: catalysts.slice(0, 3),
    classification: resolveClassificationFromScore(normalizedScore),
    confidence: clamp(toRounded(40 + normalizedScore * 0.45, 1), 0, 100),
    generatedAt,
    hypeScore: normalizedScore,
    model,
    oneLineSummary: normalizeWhitespace(summary).slice(0, 180),
    riskFlags: riskFlags.slice(0, 3),
  };
}

function buildBoardSummary(notifications: MemeRadarNotification[]): MemeRadarBoardResponse["board"] {
  return {
    byChain: {
      base: notifications.filter((item) => item.chain === "base").length,
      solana: notifications.filter((item) => item.chain === "solana").length,
    },
    critical: notifications.filter((item) => item.priority === "critical").length,
    high: notifications.filter((item) => item.priority === "high").length,
    pinned: notifications.filter((item) => item.pinned).length,
    total: notifications.length,
    watch: notifications.filter((item) => item.priority === "watch").length,
  };
}

function sanitizeRiskOrCatalyst(values: string[]): string[] {
  return values
    .map((item) => normalizeWhitespace(item))
    .filter((item) => item.length > 2)
    .slice(0, 3);
}

export class MemeRadarService {
  private readonly openRouterChatAdapter = new OpenRouterChatAdapter();

  private mode: PersistenceMode = resolvePersistenceMode();

  private readonly inMemoryStore = new Map<string, StoredMemeRadarNotificationRecord>();

  private refreshInFlight: Promise<CachedMemeRadarSnapshot> | null = null;

  public async getNotificationBoard(
    input?: MemeRadarQueryInput,
  ): Promise<MemeRadarBoardResponse> {
    const parsedQuery = memeRadarQuerySchema.parse(input ?? {});

    const resolvedSnapshot = await this.resolveSnapshot(parsedQuery.refresh);
    const filteredNotifications = resolvedSnapshot.snapshot.notifications
      .filter((record) => {
        if (parsedQuery.chain === "all") {
          return true;
        }

        return record.pair.chain === parsedQuery.chain;
      })
      .filter((record) => {
        if (parsedQuery.priority === "all") {
          return true;
        }

        return record.priority === parsedQuery.priority;
      })
      .filter((record) => {
        if (!parsedQuery.pinnedOnly) {
          return true;
        }

        return record.pinned;
      })
      .slice(0, parsedQuery.limit)
      .map((record) => this.toApiNotification(record));

    return {
      board: buildBoardSummary(filteredNotifications),
      cache: {
        stale: resolvedSnapshot.stale,
        state: resolvedSnapshot.state,
      },
      fetchedAt: resolvedSnapshot.snapshot.fetchedAt,
      notifications: filteredNotifications,
      sources: resolvedSnapshot.snapshot.sources,
    };
  }

  public async refreshNow(reason: "manual" | "scheduled" | "startup"): Promise<void> {
    const snapshot = await this.refreshSnapshot();

    logger.info(
      {
        fetchedAt: snapshot.fetchedAt,
        notifications: snapshot.notifications.length,
        reason,
      },
      "Meme radar refreshed",
    );
  }

  public async setNotificationPinned(input: {
    notificationId: string;
    pinned: boolean;
  }): Promise<PinnedUpdateResult> {
    const normalizedId = normalizeWhitespace(input.notificationId).toLowerCase();

    if (normalizedId.length < 6) {
      throw new AppError({
        code: "MEME_RADAR_NOTIFICATION_ID_INVALID",
        message: "Notification id is invalid",
        statusCode: 400,
      });
    }

    if (this.mode === "postgres") {
      const updated = await this.updatePinnedInPostgres(normalizedId, input.pinned);

      if (updated) {
        const snapshot = await this.snapshotFromStore();
        this.updateCache(snapshot);

        return updated;
      }

      this.mode = "file";
    }

    const inMemory = this.inMemoryStore.get(normalizedId);

    if (!inMemory) {
      throw new AppError({
        code: "MEME_RADAR_NOTIFICATION_NOT_FOUND",
        message: "Notification not found",
        statusCode: 404,
      });
    }

    const updatedAt = new Date().toISOString();

    this.inMemoryStore.set(normalizedId, {
      ...inMemory,
      pinned: input.pinned,
      updatedAt,
    });

    const snapshot = await this.snapshotFromStore();
    this.updateCache(snapshot);

    return {
      notificationId: normalizedId,
      pinned: input.pinned,
      updatedAt,
    };
  }

  private async resolveSnapshot(forceRefresh: boolean): Promise<{
    snapshot: CachedMemeRadarSnapshot;
    stale: boolean;
    state: MemeRadarCacheState;
  }> {
    if (forceRefresh) {
      const refreshed = await this.refreshSnapshot();

      return {
        snapshot: refreshed,
        stale: false,
        state: "refreshed",
      };
    }

    const cached = memoryCache.get<CachedMemeRadarSnapshot>(MEME_RADAR_CACHE_KEY);

    if (cached.state === "fresh") {
      return {
        snapshot: cached.value,
        stale: false,
        state: "fresh",
      };
    }

    if (cached.state === "stale") {
      try {
        const refreshed = await this.refreshSnapshot();

        return {
          snapshot: refreshed,
          stale: false,
          state: "refreshed",
        };
      } catch {
        return {
          snapshot: cached.value,
          stale: true,
          state: "stale",
        };
      }
    }

    const fromStore = await this.snapshotFromStore();

    if (fromStore.notifications.length > 0) {
      this.updateCache(fromStore);

      return {
        snapshot: fromStore,
        stale: false,
        state: "miss",
      };
    }

    const refreshed = await this.refreshSnapshot();

    return {
      snapshot: refreshed,
      stale: false,
      state: "refreshed",
    };
  }

  private async refreshSnapshot(): Promise<CachedMemeRadarSnapshot> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.refreshSnapshotInternal().finally(() => {
      this.refreshInFlight = null;
    });

    return this.refreshInFlight;
  }

  private async refreshSnapshotInternal(): Promise<CachedMemeRadarSnapshot> {
    const sourceSnapshots: MemeRadarSourceSnapshot[] = [];
    const geckoCandidates = await this.collectGeckoCandidates(sourceSnapshots);

    if (geckoCandidates.length === 0) {
      const fallbackSnapshot = await this.snapshotFromStore();

      if (fallbackSnapshot.notifications.length > 0) {
        const mergedSnapshot: CachedMemeRadarSnapshot = {
          ...fallbackSnapshot,
          sources: sourceSnapshots,
        };

        this.updateCache(mergedSnapshot);
        return mergedSnapshot;
      }

      const emptySnapshot: CachedMemeRadarSnapshot = {
        fetchedAt: new Date().toISOString(),
        notifications: [],
        sources: sourceSnapshots,
      };

      this.updateCache(emptySnapshot);
      return emptySnapshot;
    }

    const dexMetrics = await this.enrichCandidatesWithDexScreener(geckoCandidates);

    sourceSnapshots.push({
      error: dexMetrics.firstError,
      fetchedAt: new Date().toISOString(),
      latencyMs: dexMetrics.latencyMs,
      source: "dexscreener",
      status: dexMetrics.firstError ? "error" : "ok",
      totalItems: dexMetrics.successCount,
    });

    const rankedCandidates = await this.rankCandidates(geckoCandidates, sourceSnapshots);

    await this.upsertRankedCandidates(rankedCandidates);

    const refreshedSnapshot = await this.snapshotFromStore();

    const output: CachedMemeRadarSnapshot = {
      fetchedAt: new Date().toISOString(),
      notifications: refreshedSnapshot.notifications,
      sources: sourceSnapshots,
    };

    this.updateCache(output);

    return output;
  }

  private updateCache(snapshot: CachedMemeRadarSnapshot): void {
    memoryCache.set(
      MEME_RADAR_CACHE_KEY,
      snapshot,
      env.MEME_RADAR_CACHE_FRESH_SECONDS,
      env.MEME_RADAR_CACHE_STALE_SECONDS,
    );
  }

  private async collectGeckoCandidates(
    sourceSnapshots: MemeRadarSourceSnapshot[],
  ): Promise<MemeRadarPairCandidate[]> {
    const [solanaResult, baseResult] = await Promise.all([
      this.collectGeckoByChain("solana"),
      this.collectGeckoByChain("base"),
    ]);

    sourceSnapshots.push(solanaResult.snapshot, baseResult.snapshot);

    const deduped = new Map<string, MemeRadarPairCandidate>();

    for (const candidate of [...solanaResult.candidates, ...baseResult.candidates]) {
      const existing = deduped.get(candidate.fingerprint);

      if (!existing) {
        deduped.set(candidate.fingerprint, candidate);
        continue;
      }

      deduped.set(candidate.fingerprint, {
        ...existing,
        metrics: {
          fdvUsd: candidate.metrics.fdvUsd ?? existing.metrics.fdvUsd,
          liquidityUsd: candidate.metrics.liquidityUsd ?? existing.metrics.liquidityUsd,
          marketCapUsd: candidate.metrics.marketCapUsd ?? existing.metrics.marketCapUsd,
          priceChange24hPct: candidate.metrics.priceChange24hPct ?? existing.metrics.priceChange24hPct,
          txns24h: candidate.metrics.txns24h ?? existing.metrics.txns24h,
          volume24hUsd: candidate.metrics.volume24hUsd ?? existing.metrics.volume24hUsd,
        },
        socials: mergeSocialLinks(existing.socials, candidate.socials),
        sources: mergeUniqueStrings(existing.sources, candidate.sources, 6),
      });
    }

    return [...deduped.values()].slice(0, env.MEME_RADAR_NEW_POOLS_PER_CHAIN * 2);
  }

  private async collectGeckoByChain(chain: MemeRadarChain): Promise<GeckoCollectResult> {
    const source = chain === "solana" ? "geckoterminal_solana" : "geckoterminal_base";
    const endpoint = `https://api.geckoterminal.com/api/v2/networks/${chain}/new_pools?page=1`;
    const startedAt = Date.now();

    try {
      const payload = await this.requestJson(endpoint);

      if (!isRecord(payload)) {
        throw new AppError({
          code: "MEME_RADAR_GECKO_INVALID_PAYLOAD",
          message: "GeckoTerminal returned invalid payload",
          statusCode: 502,
        });
      }

      const pools = Array.isArray(payload.data) ? payload.data : [];
      const included = Array.isArray(payload.included) ? payload.included : [];
      const tokenMap = new Map<string, { address: string | null; name: string; symbol: string }>();

      for (const entry of included) {
        if (!isRecord(entry)) {
          continue;
        }

        const tokenId = readString(entry, "id");
        const attributes = readRecord(entry, "attributes");

        if (!tokenId || !attributes) {
          continue;
        }

        const symbol = readString(attributes, "symbol");
        const name = readString(attributes, "name");

        if (!symbol || !name) {
          continue;
        }

        tokenMap.set(tokenId, {
          address: readString(attributes, "address"),
          name: name.slice(0, 64),
          symbol: symbol.slice(0, 16).toUpperCase(),
        });
      }

      const collected: MemeRadarPairCandidate[] = [];

      for (const item of pools) {
        if (!isRecord(item)) {
          continue;
        }

        const parsed = parseCandidateFromGeckoPool(chain, item, tokenMap);

        if (!parsed) {
          continue;
        }

        collected.push(parsed);

        if (collected.length >= env.MEME_RADAR_NEW_POOLS_PER_CHAIN) {
          break;
        }
      }

      return {
        candidates: collected,
        snapshot: {
          error: null,
          fetchedAt: new Date().toISOString(),
          latencyMs: Date.now() - startedAt,
          source,
          status: "ok",
          totalItems: collected.length,
        },
      };
    } catch (error) {
      return {
        candidates: [],
        snapshot: {
          error: {
            code: error instanceof AppError ? error.code : "MEME_RADAR_GECKO_SOURCE_ERROR",
            message: error instanceof Error ? error.message : "Failed to collect GeckoTerminal data",
          },
          fetchedAt: new Date().toISOString(),
          latencyMs: Date.now() - startedAt,
          source,
          status: "error",
          totalItems: 0,
        },
      };
    }
  }

  private async enrichCandidatesWithDexScreener(
    candidates: MemeRadarPairCandidate[],
  ): Promise<DexCollectResult> {
    const startedAt = Date.now();
    const sortedCandidates = [...candidates]
      .sort((left, right) => {
        const rightLiquidity = right.metrics.liquidityUsd ?? 0;
        const leftLiquidity = left.metrics.liquidityUsd ?? 0;

        if (rightLiquidity !== leftLiquidity) {
          return rightLiquidity - leftLiquidity;
        }

        const rightVolume = right.metrics.volume24hUsd ?? 0;
        const leftVolume = left.metrics.volume24hUsd ?? 0;

        return rightVolume - leftVolume;
      })
      .slice(0, env.MEME_RADAR_DEX_ENRICH_LIMIT);

    let successCount = 0;
    let firstError: { code: string; message: string } | null = null;

    for (const candidate of sortedCandidates) {
      try {
        const enriched = await this.fetchDexPair(candidate.chain, candidate.pairAddress);

        if (!enriched) {
          continue;
        }

        successCount += 1;

        const mergedSocials = mergeSocialLinks(candidate.socials, enriched.socials);

        candidate.dexId = enriched.dexId ?? candidate.dexId;
        candidate.pairUrl = enriched.pairUrl ?? candidate.pairUrl;
        candidate.quoteSymbol = enriched.quoteSymbol ?? candidate.quoteSymbol;
        candidate.sources = mergeUniqueStrings(candidate.sources, ["dexscreener"], 6);
        candidate.socials = mergedSocials;
        candidate.token = {
          address: enriched.token.address ?? candidate.token.address,
          name: enriched.token.name ?? candidate.token.name,
          symbol: enriched.token.symbol ?? candidate.token.symbol,
        };
        candidate.metrics = {
          fdvUsd: enriched.metrics.fdvUsd ?? candidate.metrics.fdvUsd,
          liquidityUsd: enriched.metrics.liquidityUsd ?? candidate.metrics.liquidityUsd,
          marketCapUsd: enriched.metrics.marketCapUsd ?? candidate.metrics.marketCapUsd,
          priceChange24hPct: enriched.metrics.priceChange24hPct ?? candidate.metrics.priceChange24hPct,
          txns24h: enriched.metrics.txns24h ?? candidate.metrics.txns24h,
          volume24hUsd: enriched.metrics.volume24hUsd ?? candidate.metrics.volume24hUsd,
        };
      } catch (error) {
        if (!firstError) {
          firstError = {
            code: error instanceof AppError ? error.code : "MEME_RADAR_DEX_SOURCE_ERROR",
            message: error instanceof Error ? error.message : "Failed to enrich with DexScreener",
          };
        }
      }
    }

    return {
      firstError,
      latencyMs: Date.now() - startedAt,
      successCount,
    };
  }

  private async fetchDexPair(
    chain: MemeRadarChain,
    pairAddress: string,
  ): Promise<{
    dexId: string | null;
    metrics: MemeRadarMetricSnapshot;
    pairUrl: string | null;
    quoteSymbol: string | null;
    socials: MemeRadarSocialLink[];
    token: {
      address: string | null;
      name: string | null;
      symbol: string | null;
    };
  } | null> {
    const endpoint = `https://api.dexscreener.com/latest/dex/pairs/${chain}/${pairAddress}`;
    const payload = await this.requestJson(endpoint);

    if (!isRecord(payload)) {
      return null;
    }

    const pair = this.pickDexPair(payload);

    if (!pair) {
      return null;
    }

    const info = readRecord(pair, "info");
    const socials = info ? parseSocialLinks(Array.isArray(info.socials) ? info.socials : []) : [];
    const websites = info ? parseSocialLinks(Array.isArray(info.websites) ? info.websites : []) : [];

    return {
      dexId: readString(pair, "dexId"),
      metrics: {
        fdvUsd: readNumber(pair, "fdv"),
        liquidityUsd: readNestedNumber(pair, "liquidity", "usd"),
        marketCapUsd: readNumber(pair, "marketCap"),
        priceChange24hPct: readNestedNumber(pair, "priceChange", "h24"),
        txns24h:
          (readNestedNumberDeep(pair, "txns", "h24", "buys") ?? 0)
          + (readNestedNumberDeep(pair, "txns", "h24", "sells") ?? 0),
        volume24hUsd: readNestedNumber(pair, "volume", "h24"),
      },
      pairUrl: readString(pair, "url"),
      quoteSymbol: readString(readRecord(pair, "quoteToken") ?? {}, "symbol"),
      socials: mergeSocialLinks(socials, websites),
      token: {
        address: readString(readRecord(pair, "baseToken") ?? {}, "address"),
        name: readString(readRecord(pair, "baseToken") ?? {}, "name"),
        symbol: readString(readRecord(pair, "baseToken") ?? {}, "symbol"),
      },
    };
  }

  private pickDexPair(payload: Record<string, unknown>): Record<string, unknown> | null {
    const directPair = readRecord(payload, "pair");

    if (directPair) {
      return directPair;
    }

    const pairs = payload.pairs;

    if (!Array.isArray(pairs)) {
      return null;
    }

    for (const item of pairs) {
      if (isRecord(item)) {
        return item;
      }
    }

    return null;
  }

  private async rankCandidates(
    candidates: MemeRadarPairCandidate[],
    sourceSnapshots: MemeRadarSourceSnapshot[],
  ): Promise<RankedMemeRadarCandidate[]> {
    const ranked = candidates
      .map((candidate) => {
        const heuristicSentiment = this.buildHeuristicSentiment(candidate);
        const priority = resolvePriorityFromSentiment(heuristicSentiment);

        return {
          catalysts: heuristicSentiment.catalysts,
          headline: `${candidate.token.symbol} em ${formatChainLabel(candidate.chain)} entrou no radar (${Math.round(heuristicSentiment.hypeScore)})`,
          pair: candidate,
          priority,
          riskFlags: heuristicSentiment.riskFlags,
          sentiment: heuristicSentiment,
          summary: heuristicSentiment.oneLineSummary,
        } satisfies RankedMemeRadarCandidate;
      })
      .sort((left, right) => right.sentiment.hypeScore - left.sentiment.hypeScore);

    const aiEnabled = env.OPENROUTER_API_KEY.length >= 20 && env.MEME_RADAR_AI_MAX_ITEMS > 0;

    if (!aiEnabled) {
      sourceSnapshots.push({
        error: null,
        fetchedAt: new Date().toISOString(),
        latencyMs: 0,
        source: "openrouter",
        status: "ok",
        totalItems: 0,
      });

      return ranked;
    }

    const startedAt = Date.now();
    let aiSuccessCount = 0;
    let firstAiError: { code: string; message: string } | null = null;

    for (const candidate of ranked.slice(0, env.MEME_RADAR_AI_MAX_ITEMS)) {
      try {
        const aiSentiment = await this.generateAiSentiment(candidate.pair);
        candidate.sentiment = aiSentiment;
        candidate.priority = resolvePriorityFromSentiment(aiSentiment);
        candidate.headline = `${candidate.pair.token.symbol} em ${formatChainLabel(candidate.pair.chain)} entrou no radar (${Math.round(aiSentiment.hypeScore)})`;
        candidate.summary = aiSentiment.oneLineSummary;
        candidate.riskFlags = aiSentiment.riskFlags;
        candidate.catalysts = aiSentiment.catalysts;
        aiSuccessCount += 1;
      } catch (error) {
        if (!firstAiError) {
          firstAiError = {
            code: error instanceof AppError ? error.code : "MEME_RADAR_AI_SOURCE_ERROR",
            message: error instanceof Error ? error.message : "Failed to generate AI sentiment",
          };
        }
      }
    }

    sourceSnapshots.push({
      error: firstAiError,
      fetchedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      source: "openrouter",
      status: firstAiError ? "error" : "ok",
      totalItems: aiSuccessCount,
    });

    return ranked.sort((left, right) => {
      const priorityDelta = priorityRank(left.priority) - priorityRank(right.priority);

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return right.sentiment.hypeScore - left.sentiment.hypeScore;
    });
  }

  private buildHeuristicSentiment(pair: MemeRadarPairCandidate): MemeRadarGeneratedSentiment {
    const liquidity = pair.metrics.liquidityUsd ?? 0;
    const volume24h = pair.metrics.volume24hUsd ?? 0;
    const txns24h = pair.metrics.txns24h ?? 0;
    const absolutePriceChange = Math.abs(pair.metrics.priceChange24hPct ?? 0);
    const fdv = pair.metrics.fdvUsd ?? pair.metrics.marketCapUsd ?? 0;
    const ageHours = this.computeAgeHours(pair);
    const socialCount = pair.socials.length;

    const ageScore =
      ageHours <= 6
        ? 22
        : ageHours <= 24
          ? 16
          : ageHours <= 72
            ? 11
            : 6;
    const liquidityScore = clamp(Math.log10(Math.max(1, liquidity)) * 4.2, 0, 24);
    const activityScore = clamp(Math.log10(Math.max(1, volume24h + txns24h * 120)) * 5.4, 0, 22);
    const volatilityScore = clamp(absolutePriceChange * 0.32, 0, 14);
    const socialScore = clamp(socialCount * 3.6 + (pair.pairUrl ? 2 : 0), 0, 14);
    const valuationPenalty = fdv > 0 && liquidity > 0 && fdv / Math.max(liquidity, 1) > 40 ? 8 : 0;
    const thinLiquidityPenalty = liquidity > 0 && liquidity < 30_000 ? 12 : liquidity < 80_000 ? 6 : 0;

    const hypeScore = clamp(
      toRounded(
        ageScore + liquidityScore + activityScore + volatilityScore + socialScore - valuationPenalty - thinLiquidityPenalty,
        1,
      ),
      0,
      100,
    );
    const confidence = clamp(
      toRounded(36 + liquidityScore * 1.1 + socialScore * 1.3 - thinLiquidityPenalty * 0.9, 1),
      0,
      100,
    );

    const catalysts: string[] = [];

    if (ageHours <= 24) {
      catalysts.push("Pool recente com janela de descoberta curta");
    }

    if (volume24h >= Math.max(1, liquidity) * 1.2) {
      catalysts.push("Volume 24h acima da liquidez atual");
    }

    if (txns24h >= 250) {
      catalysts.push("Fluxo de transacoes elevado nas ultimas 24h");
    }

    if (socialCount >= 2) {
      catalysts.push("Projeto com presenca social identificada");
    }

    const riskFlags: string[] = [];

    if (liquidity > 0 && liquidity < 30_000) {
      riskFlags.push("Liquidez baixa aumenta risco de slippage");
    }

    if (absolutePriceChange >= 45) {
      riskFlags.push("Volatilidade extrema em 24h");
    }

    if (socialCount === 0) {
      riskFlags.push("Sem links sociais confirmados");
    }

    if (fdv > 0 && liquidity > 0 && fdv / Math.max(liquidity, 1) > 40) {
      riskFlags.push("FDV muito acima da liquidez disponivel");
    }

    const chainLabel = formatChainLabel(pair.chain);
    const summary =
      `${pair.token.symbol} em ${chainLabel} combina ${Math.round(hypeScore)} de hype com `
      + `${Math.round(confidence)} de confianca; monitorar fluxo e risco de liquidez.`;

    return {
      catalysts: sanitizeRiskOrCatalyst(catalysts.length > 0 ? catalysts : ["Monitorar consolidacao de liquidez e volume"]),
      classification: resolveClassificationFromScore(hypeScore),
      confidence,
      generatedAt: new Date().toISOString(),
      hypeScore,
      model: "heuristic-meme-radar-v1",
      oneLineSummary: summary.slice(0, 180),
      riskFlags: sanitizeRiskOrCatalyst(riskFlags.length > 0 ? riskFlags : ["Ativo especulativo com risco de execucao elevado"]),
    };
  }

  private computeAgeHours(pair: MemeRadarPairCandidate): number {
    const anchor = pair.launchedAt ?? pair.discoveredAt;
    const parsedAnchor = new Date(anchor);

    if (Number.isNaN(parsedAnchor.getTime())) {
      return 72;
    }

    return Math.max(1, (Date.now() - parsedAnchor.getTime()) / 3_600_000);
  }

  private async generateAiSentiment(
    pair: MemeRadarPairCandidate,
  ): Promise<MemeRadarGeneratedSentiment> {
    const completion = await this.openRouterChatAdapter.createCompletion({
      maxTokens: 360,
      message: [
        "Dados da pool para avaliacao:",
        JSON.stringify(
          {
            chain: pair.chain,
            dexId: pair.dexId,
            launchedAt: pair.launchedAt,
            metrics: pair.metrics,
            pairAddress: pair.pairAddress,
            pairUrl: pair.pairUrl,
            quoteSymbol: pair.quoteSymbol,
            socials: pair.socials,
            token: pair.token,
          },
          null,
          2,
        ),
        "Responda somente JSON valido.",
      ].join("\n"),
      systemPrompt: [
        "You are a memecoin radar quant assistant.",
        "Return ONLY a valid JSON object with keys:",
        "hypeScore (number 0-100), confidence (number 0-100), classification (ignite|warm|cold),",
        "oneLineSummary (string <= 180 chars), riskFlags (array up to 3 strings), catalysts (array up to 3 strings).",
        "Do not include markdown, comments or additional keys.",
      ].join(" "),
      temperature: 0.1,
    });

    const rawJson = extractFirstJsonObject(completion.answer);

    if (!rawJson) {
      throw new AppError({
        code: "MEME_RADAR_AI_JSON_NOT_FOUND",
        message: "AI output did not contain JSON",
        statusCode: 502,
      });
    }

    let parsedRaw: unknown;

    try {
      parsedRaw = JSON.parse(rawJson) as unknown;
    } catch (error) {
      throw new AppError({
        code: "MEME_RADAR_AI_JSON_INVALID",
        details: {
          cause: error,
        },
        message: "AI output was not valid JSON",
        statusCode: 502,
      });
    }

    const parsedAi = memeRadarAiOutputSchema.safeParse(parsedRaw);

    if (!parsedAi.success) {
      throw new AppError({
        code: "MEME_RADAR_AI_SCHEMA_MISMATCH",
        details: {
          issues: parsedAi.error.issues,
        },
        message: "AI output did not match expected schema",
        statusCode: 502,
      });
    }

    return {
      catalysts: sanitizeRiskOrCatalyst(parsedAi.data.catalysts),
      classification: parsedAi.data.classification,
      confidence: clamp(toRounded(parsedAi.data.confidence, 1), 0, 100),
      generatedAt: completion.fetchedAt,
      hypeScore: clamp(toRounded(parsedAi.data.hypeScore, 1), 0, 100),
      model: completion.model,
      oneLineSummary: normalizeWhitespace(parsedAi.data.oneLineSummary).slice(0, 180),
      riskFlags: sanitizeRiskOrCatalyst(parsedAi.data.riskFlags),
    };
  }

  private async upsertRankedCandidates(candidates: RankedMemeRadarCandidate[]): Promise<void> {
    if (this.mode === "postgres") {
      const persisted = await this.upsertRankedCandidatesPostgres(candidates);

      if (persisted) {
        return;
      }

      this.mode = "file";
    }

    this.upsertRankedCandidatesInMemory(candidates);
  }

  private upsertRankedCandidatesInMemory(candidates: RankedMemeRadarCandidate[]): void {
    for (const candidate of candidates) {
      const existing = this.inMemoryStore.get(candidate.pair.fingerprint);
      const nowIso = new Date().toISOString();

      this.inMemoryStore.set(candidate.pair.fingerprint, {
        catalysts: candidate.catalysts,
        headline: candidate.headline,
        pair: candidate.pair,
        pinned: existing?.pinned ?? false,
        priority: candidate.priority,
        riskFlags: candidate.riskFlags,
        sentiment: candidate.sentiment,
        summary: candidate.summary,
        updatedAt: nowIso,
      });
    }

    if (this.inMemoryStore.size <= MEME_RADAR_STORED_LIMIT) {
      return;
    }

    const sortedRecords = [...this.inMemoryStore.values()].sort(sortByPriorityScore);
    this.inMemoryStore.clear();

    for (const record of sortedRecords.slice(0, MEME_RADAR_STORED_LIMIT)) {
      this.inMemoryStore.set(record.pair.fingerprint, record);
    }
  }

  private async upsertRankedCandidatesPostgres(
    candidates: RankedMemeRadarCandidate[],
  ): Promise<boolean> {
    let client: PoolClient | null = null;

    try {
      const pool = getPostgresPool();
      const pgClient = await pool.connect();
      client = pgClient;
      await pgClient.query("BEGIN");

      for (const candidate of candidates) {
        await pgClient.query(
          `
            INSERT INTO meme_radar_pairs (
              fingerprint,
              chain,
              pair_address,
              dex_id,
              pair_url,
              base_token_address,
              base_token_symbol,
              base_token_name,
              quote_token_symbol,
              launched_at,
              discovered_at,
              updated_at,
              metrics,
              socials,
              sources
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              $9,
              $10,
              $11,
              NOW(),
              $12::jsonb,
              $13::jsonb,
              $14::text[]
            )
            ON CONFLICT (fingerprint)
            DO UPDATE SET
              chain = EXCLUDED.chain,
              pair_address = EXCLUDED.pair_address,
              dex_id = EXCLUDED.dex_id,
              pair_url = EXCLUDED.pair_url,
              base_token_address = EXCLUDED.base_token_address,
              base_token_symbol = EXCLUDED.base_token_symbol,
              base_token_name = EXCLUDED.base_token_name,
              quote_token_symbol = EXCLUDED.quote_token_symbol,
              launched_at = COALESCE(EXCLUDED.launched_at, meme_radar_pairs.launched_at),
              discovered_at = LEAST(meme_radar_pairs.discovered_at, EXCLUDED.discovered_at),
              updated_at = NOW(),
              metrics = EXCLUDED.metrics,
              socials = EXCLUDED.socials,
              sources = EXCLUDED.sources
          `,
          [
            candidate.pair.fingerprint,
            candidate.pair.chain,
            candidate.pair.pairAddress,
            candidate.pair.dexId,
            candidate.pair.pairUrl,
            candidate.pair.token.address,
            candidate.pair.token.symbol,
            candidate.pair.token.name,
            candidate.pair.quoteSymbol,
            candidate.pair.launchedAt,
            candidate.pair.discoveredAt,
            JSON.stringify(candidate.pair.metrics),
            JSON.stringify(candidate.pair.socials),
            candidate.pair.sources,
          ],
        );

        await pgClient.query(
          `
            INSERT INTO meme_radar_sentiment_snapshots (
              pair_fingerprint,
              created_at,
              model,
              payload
            )
            VALUES ($1, NOW(), $2, $3::jsonb)
          `,
          [
            candidate.pair.fingerprint,
            candidate.sentiment.model,
            JSON.stringify(candidate.sentiment),
          ],
        );

        await pgClient.query(
          `
            INSERT INTO meme_radar_notifications (
              pair_fingerprint,
              priority,
              headline,
              summary,
              risk_flags,
              catalysts,
              last_score,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, NOW(), NOW())
            ON CONFLICT (pair_fingerprint)
            DO UPDATE SET
              priority = EXCLUDED.priority,
              headline = EXCLUDED.headline,
              summary = EXCLUDED.summary,
              risk_flags = EXCLUDED.risk_flags,
              catalysts = EXCLUDED.catalysts,
              last_score = EXCLUDED.last_score,
              updated_at = NOW()
          `,
          [
            candidate.pair.fingerprint,
            candidate.priority,
            candidate.headline,
            candidate.summary,
            candidate.riskFlags,
            candidate.catalysts,
            candidate.sentiment.hypeScore,
          ],
        );
      }

      await pgClient.query(
        `
          DELETE FROM meme_radar_notifications
          WHERE pair_fingerprint IN (
            SELECT pair_fingerprint
            FROM meme_radar_notifications
            ORDER BY pinned DESC, updated_at DESC
            OFFSET $1
          )
        `,
        [MEME_RADAR_STORED_LIMIT],
      );

      await pgClient.query(
        `
          DELETE FROM meme_radar_sentiment_snapshots
          WHERE id IN (
            SELECT id
            FROM meme_radar_sentiment_snapshots
            ORDER BY created_at DESC
            OFFSET 2200
          )
        `,
      );

      await pgClient.query("COMMIT");
      return true;
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Ignore rollback errors and fallback to in-memory mode.
        }
      }

      logger.warn(
        {
          err: error,
        },
        "Failed to persist meme radar notifications in Postgres; switching to in-memory mode",
      );

      this.upsertRankedCandidatesInMemory(candidates);
      return false;
    } finally {
      client?.release();
    }
  }

  private async updatePinnedInPostgres(
    notificationId: string,
    pinned: boolean,
  ): Promise<PinnedUpdateResult | null> {
    try {
      const pool = getPostgresPool();
      const result = await pool.query<{
        pair_fingerprint: string;
        pinned: boolean;
        updated_at: Date | string;
      }>(
        `
          UPDATE meme_radar_notifications
          SET pinned = $2,
              updated_at = NOW()
          WHERE pair_fingerprint = $1
          RETURNING pair_fingerprint, pinned, updated_at
        `,
        [notificationId, pinned],
      );

      const row = result.rows[0];

      if (!row) {
        throw new AppError({
          code: "MEME_RADAR_NOTIFICATION_NOT_FOUND",
          message: "Notification not found",
          statusCode: 404,
        });
      }

      return {
        notificationId: row.pair_fingerprint,
        pinned: row.pinned,
        updatedAt: normalizeIsoString(row.updated_at, new Date().toISOString()),
      };
    } catch (error) {
      if (error instanceof AppError && error.code === "MEME_RADAR_NOTIFICATION_NOT_FOUND") {
        throw error;
      }

      logger.warn(
        {
          err: error,
        },
        "Failed to update meme radar pin state in Postgres",
      );

      return null;
    }
  }

  private async snapshotFromStore(): Promise<CachedMemeRadarSnapshot> {
    const records = await this.loadStoredNotifications();

    return {
      fetchedAt: new Date().toISOString(),
      notifications: records,
      sources: [],
    };
  }

  private async loadStoredNotifications(): Promise<StoredMemeRadarNotificationRecord[]> {
    if (this.mode === "postgres") {
      const fromPostgres = await this.loadStoredNotificationsFromPostgres();

      if (fromPostgres) {
        return fromPostgres;
      }

      this.mode = "file";
    }

    return [...this.inMemoryStore.values()].sort(sortByPriorityScore).slice(0, MEME_RADAR_STORED_LIMIT);
  }

  private async loadStoredNotificationsFromPostgres(): Promise<StoredMemeRadarNotificationRecord[] | null> {
    try {
      const pool = getPostgresPool();
      const result = await pool.query<PostgresStoredNotificationRow>(
        `
          SELECT
            n.id,
            n.pair_fingerprint,
            n.priority,
            n.pinned,
            n.headline,
            n.summary,
            n.risk_flags,
            n.catalysts,
            n.last_score,
            n.updated_at,
            p.chain,
            p.pair_address,
            p.dex_id,
            p.pair_url,
            p.base_token_address AS token_address,
            p.base_token_symbol AS token_symbol,
            p.base_token_name AS token_name,
            p.quote_token_symbol,
            p.launched_at,
            p.discovered_at,
            p.metrics,
            p.socials,
            p.sources,
            s.created_at AS sentiment_generated_at,
            s.model AS sentiment_model,
            s.payload AS sentiment_payload
          FROM meme_radar_notifications n
          INNER JOIN meme_radar_pairs p
            ON p.fingerprint = n.pair_fingerprint
          LEFT JOIN LATERAL (
            SELECT created_at, model, payload
            FROM meme_radar_sentiment_snapshots
            WHERE pair_fingerprint = n.pair_fingerprint
            ORDER BY created_at DESC
            LIMIT 1
          ) s ON true
          WHERE n.dismissed = false
          ORDER BY
            n.pinned DESC,
            CASE n.priority
              WHEN 'critical' THEN 0
              WHEN 'high' THEN 1
              ELSE 2
            END ASC,
            n.last_score DESC,
            n.updated_at DESC
          LIMIT $1
        `,
        [MEME_RADAR_STORED_LIMIT],
      );

      const nowIso = new Date().toISOString();

      return result.rows.map((row) => {
        const fallbackSentiment = deriveSentimentFallback(
          typeof row.last_score === "string" ? Number.parseFloat(row.last_score) : row.last_score,
          row.summary,
          row.risk_flags,
          row.catalysts,
          "heuristic-meme-radar-v1",
          normalizeIsoString(row.updated_at, nowIso),
        );

        const parsedSentiment = this.parseSentimentPayload(
          row.sentiment_payload,
          row.sentiment_model,
          row.sentiment_generated_at,
          fallbackSentiment,
        );

        return {
          catalysts: row.catalysts,
          headline: row.headline,
          pair: {
            chain: row.chain,
            dexId: row.dex_id,
            discoveredAt: normalizeIsoString(row.discovered_at, nowIso),
            fingerprint: row.pair_fingerprint,
            launchedAt: normalizeIsoStringOrNull(row.launched_at),
            metrics: ensureMetricSnapshot(row.metrics),
            pairAddress: row.pair_address,
            pairUrl: row.pair_url,
            quoteSymbol: row.quote_token_symbol,
            socials: parseSocialLinks(row.socials),
            sources: Array.isArray(row.sources) ? row.sources.slice(0, 6) : [],
            token: {
              address: row.token_address,
              name: row.token_name,
              symbol: row.token_symbol,
            },
          },
          pinned: row.pinned,
          priority: row.priority,
          riskFlags: row.risk_flags,
          sentiment: parsedSentiment,
          summary: row.summary,
          updatedAt: normalizeIsoString(row.updated_at, nowIso),
        } satisfies StoredMemeRadarNotificationRecord;
      });
    } catch (error) {
      logger.warn(
        {
          err: error,
        },
        "Failed to load meme radar notifications from Postgres",
      );

      return null;
    }
  }

  private parseSentimentPayload(
    payload: unknown,
    model: string | null,
    generatedAt: Date | string | null,
    fallback: MemeRadarGeneratedSentiment,
  ): MemeRadarGeneratedSentiment {
    if (!isRecord(payload)) {
      return fallback;
    }

    const parsed = memeRadarAiOutputSchema.safeParse({
      catalysts: Array.isArray(payload.catalysts) ? payload.catalysts : fallback.catalysts,
      classification:
        typeof payload.classification === "string"
          ? payload.classification
          : fallback.classification,
      confidence: typeof payload.confidence === "number" ? payload.confidence : fallback.confidence,
      hypeScore: typeof payload.hypeScore === "number" ? payload.hypeScore : fallback.hypeScore,
      oneLineSummary:
        typeof payload.oneLineSummary === "string"
          ? payload.oneLineSummary
          : fallback.oneLineSummary,
      riskFlags: Array.isArray(payload.riskFlags) ? payload.riskFlags : fallback.riskFlags,
    });

    if (!parsed.success) {
      return fallback;
    }

    return {
      catalysts: sanitizeRiskOrCatalyst(parsed.data.catalysts),
      classification: parsed.data.classification,
      confidence: clamp(toRounded(parsed.data.confidence, 1), 0, 100),
      generatedAt: normalizeIsoString(generatedAt, fallback.generatedAt),
      hypeScore: clamp(toRounded(parsed.data.hypeScore, 1), 0, 100),
      model: model && model.length > 0 ? model : fallback.model,
      oneLineSummary: normalizeWhitespace(parsed.data.oneLineSummary).slice(0, 180),
      riskFlags: sanitizeRiskOrCatalyst(parsed.data.riskFlags),
    };
  }

  private toApiNotification(record: StoredMemeRadarNotificationRecord): MemeRadarNotification {
    return {
      catalysts: record.catalysts,
      chain: record.pair.chain,
      dexId: record.pair.dexId,
      discoveredAt: record.pair.discoveredAt,
      headline: record.headline,
      id: record.pair.fingerprint,
      launchedAt: record.pair.launchedAt,
      metrics: record.pair.metrics,
      pairAddress: record.pair.pairAddress,
      pairFingerprint: record.pair.fingerprint,
      pairUrl: record.pair.pairUrl,
      pinned: record.pinned,
      priority: record.priority,
      quoteSymbol: record.pair.quoteSymbol,
      riskFlags: record.riskFlags,
      sentiment: record.sentiment,
      socials: record.pair.socials,
      sources: record.pair.sources,
      summary: record.summary,
      token: record.pair.token,
      updatedAt: record.updatedAt,
    };
  }

  private async requestJson(url: string): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(env.MEME_RADAR_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppError({
        code: "MEME_RADAR_SOURCE_UNAVAILABLE",
        details: {
          cause: error,
          url,
        },
        message: "Meme radar source request failed",
        statusCode: 503,
      });
    }

    if (!response.ok) {
      let responseBody = "";

      try {
        responseBody = (await response.text()).slice(0, 360);
      } catch {
        responseBody = "";
      }

      throw new AppError({
        code: "MEME_RADAR_SOURCE_BAD_STATUS",
        details: {
          responseBody,
          responseStatus: response.status,
          url,
        },
        message: "Meme radar source returned non-success status",
        statusCode: 502,
      });
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      throw new AppError({
        code: "MEME_RADAR_SOURCE_INVALID_JSON",
        details: {
          url,
        },
        message: "Meme radar source returned invalid JSON",
        statusCode: 502,
      });
    }
  }
}

export const memeRadarService = new MemeRadarService();
