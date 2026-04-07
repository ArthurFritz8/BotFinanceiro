import { z } from "zod";
import type { PoolClient } from "pg";

import { OpenRouterChatAdapter } from "../../../integrations/ai/openrouter-chat-adapter.js";
import {
  WebSearchAdapter,
  type WebSearchResultItem,
} from "../../../integrations/search/web-search-adapter.js";
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
type MemeRadarPoolStatus = "alive" | "delisted" | "rugged";
type MemeRadarSecurityStatus = "honeypot" | "safe" | "unknown";
type BundleRiskCheckStatus = "fail" | "pass" | "unknown";
type BundleRiskFlag =
  | "COORDINATED_BUNDLE"
  | "COMMUNITY_HEALTH_FAILURE"
  | "EARLY_DUMP_TRAP"
  | "FAKE_HOLDERS_WARNING"
  | "HIGH_CONCENTRATION_RISK"
  | "SYMMETRIC_BUNDLE_DETECTED"
  | "VAMP_SCAM";
type InstitutionalRiskConsensusSource =
  | "bundle_risk"
  | "community_health"
  | "liquidity_depth"
  | "security_status"
  | "web_signal";

type MemeRadarQueryInput = z.input<typeof memeRadarQuerySchema>;

interface BundleTopHolderSnapshot {
  fundingSource: string | null;
  fundingTimeBucket: string | null;
  isLiquidityPool: boolean;
  supplyPercent: number;
  tags: string[];
  walletAddress: string;
}

interface BundleRiskCheck {
  details: string;
  evidence: string[];
  status: BundleRiskCheckStatus;
}

interface BundleRiskChecklist {
  communityHealth: BundleRiskCheck;
  coordinatedFunding: BundleRiskCheck;
  earlyDumpTrap: BundleRiskCheck;
  fakeHolders: BundleRiskCheck;
  highConcentration: BundleRiskCheck;
  symmetricBundle: BundleRiskCheck;
}

interface BundleRiskMetrics {
  activeViewerToHolderRatio: number | null;
  coordinatedFundingWallets: number;
  duplicateTopHolderPercentages: number;
  flaggedSniperOrDevWallets: number;
  largestNonLpHolderPercent: number | null;
}

interface BundleSignalPayload {
  activity: {
    activeViewers: number | null;
    totalHolders: number | null;
  };
  community: {
    hasPinnedThesis: boolean | null;
    hasUnmoderatedBotSpam: boolean | null;
    moderationActive: boolean | null;
  };
  topHolders: BundleTopHolderSnapshot[];
  vamp: {
    contractCandidates: string[];
    hasLegacyContractMentions: boolean;
    sourceUrls: string[];
  };
  wallets: {
    freshWalletCount: number | null;
    sniperWalletCount: number | null;
    suspectedDevWalletCount: number | null;
  };
}

export interface BundleRiskReport {
  checklist: BundleRiskChecklist;
  flags: BundleRiskFlag[];
  generatedAt: string;
  metrics: BundleRiskMetrics;
  riskScore: number;
  summary: string[];
  warningMessage: string | null;
}

interface InstitutionalRiskConsensusBreakdownItem {
  contribution: number;
  rationale: string;
  score: number;
  source: InstitutionalRiskConsensusSource;
  weight: number;
}

interface InstitutionalRiskConsensus {
  breakdown: InstitutionalRiskConsensusBreakdownItem[];
  score: number;
  weights: Record<InstitutionalRiskConsensusSource, number>;
}

interface MemeRadarWebSignalEvidence {
  confidenceScore: number;
  title: string;
  url: string;
}

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
  bundleSignals?: BundleSignalPayload;
  chain: MemeRadarChain;
  dexId: string | null;
  discoveredAt: string;
  fingerprint: string;
  launchedAt: string | null;
  metrics: MemeRadarMetricSnapshot;
  pairAddress: string;
  pairUrl: string | null;
  poolStatus: MemeRadarPoolStatus;
  poolStatusReason: string | null;
  quoteSymbol: string | null;
  securityStatus: MemeRadarSecurityStatus;
  securityStatusReason: string | null;
  socialWebEvidence: MemeRadarWebSignalEvidence[];
  socialWebMentions: number;
  socialWebScore: number;
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
  bundleRiskReport: BundleRiskReport | null;
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
  bundleRiskReport: BundleRiskReport;
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
  source:
    | "dexscreener"
    | "geckoterminal_base"
    | "geckoterminal_solana"
    | "goplus_security"
    | "openrouter"
    | "web_social_signal";
  status: "error" | "ok";
  totalItems: number;
}

export interface MemeRadarNotification {
  actionable: boolean;
  bundleRiskReport: BundleRiskReport | null;
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
  poolStatus: "ALIVE" | "DELISTED" | "RUGGED";
  poolStatusReason: string | null;
  priority: MemeRadarPriority;
  quoteSymbol: string | null;
  riskFlags: string[];
  securityStatus: "HONEYPOT" | "SAFE" | "UNKNOWN";
  securityStatusReason: string | null;
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

export interface MemeRadarInstitutionalRiskAuditResponse {
  assetId: string;
  bundleRiskReport: BundleRiskReport;
  chain: MemeRadarChain | null;
  checklistMarkdown: string;
  consensus: InstitutionalRiskConsensus;
  found: boolean;
  matchedNotificationId: string | null;
  token: {
    address: string | null;
    name: string | null;
    symbol: string | null;
  };
  updatedAt: string;
}

export interface MemeRadarInstitutionalRiskAuditByContractResponse {
  bundleRiskReport: BundleRiskReport;
  chain: MemeRadarChain | null;
  checklistMarkdown: string;
  consensus: InstitutionalRiskConsensus;
  contractAddress: string;
  found: boolean;
  matchedNotificationId: string | null;
  matchedOn: "pair_address" | "token_address" | "vamp_contract_candidate" | null;
  token: {
    address: string | null;
    name: string | null;
    symbol: string | null;
  };
  updatedAt: string;
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
const MEME_RADAR_POOL_STATUS_RUGGED_FLAG = "POOL RUGGED";
const MEME_RADAR_POOL_STATUS_DELISTED_FLAG = "POOL DELISTED";
const MEME_RADAR_SECURITY_HONEYPOT_FLAG = "HONEYPOT";
const MEME_RADAR_STRICT_MIN_MARKET_CAP_USD = 6_000;
const MEME_RADAR_STRICT_MIN_AGE_MINUTES = 5;
const MEME_RADAR_STRICT_MAX_AGE_MINUTES = 30;
const MEME_RADAR_HIGH_CONCENTRATION_SUPPLY_PERCENT = 4;
const MEME_RADAR_FAKE_HOLDER_RATIO_THRESHOLD = 0.3;
const MEME_RADAR_EARLY_DUMP_TRAP_MAX_MARKET_CAP_USD = 10_000;
const MEME_RADAR_COORDINATED_BUNDLE_MIN_WALLETS = 2;
const MEME_RADAR_SYMMETRIC_DUPLICATE_MIN_WALLETS = 3;
const MEME_RADAR_SNIPER_TRAP_MIN_WALLETS = 2;
const MEME_RADAR_CONSENSUS_DEFAULT_WEIGHTS: Record<InstitutionalRiskConsensusSource, number> = {
  bundle_risk: 35,
  community_health: 10,
  liquidity_depth: 20,
  security_status: 25,
  web_signal: 10,
};

type StrictIngestionDropReason =
  | "AGE_OUTSIDE_SNIPE_WINDOW"
  | "MARKET_CAP_BELOW_MINIMUM"
  | "MISSING_OFFICIAL_SOCIAL_LINK";

type StrictIngestionFilter = (
  candidate: MemeRadarPairCandidate,
  nowMs: number,
) => StrictIngestionDropReason | null;

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

function normalizeAssetIdForLookup(value: string): string {
  return normalizeSignalText(value).replace(/[^a-z0-9]/g, "");
}

function normalizeContractAddressForLookup(value: string): string {
  const normalized = normalizeWhitespace(value);

  if (isEvmAddress(normalized)) {
    return normalized.toLowerCase();
  }

  return normalized;
}

function hasEquivalentContractAddress(left: string, right: string): boolean {
  const normalizedLeft = normalizeContractAddressForLookup(left);
  const normalizedRight = normalizeContractAddressForLookup(right);

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  return normalizedLeft.toLowerCase() === normalizedRight.toLowerCase();
}

function normalizeSignalText(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function poolStatusRank(status: MemeRadarPoolStatus): number {
  if (status === "rugged") {
    return 2;
  }

  if (status === "delisted") {
    return 1;
  }

  return 0;
}

function mergePoolStatus(left: MemeRadarPoolStatus, right: MemeRadarPoolStatus): MemeRadarPoolStatus {
  return poolStatusRank(left) >= poolStatusRank(right) ? left : right;
}

function mergeSecurityStatus(left: MemeRadarSecurityStatus, right: MemeRadarSecurityStatus): MemeRadarSecurityStatus {
  if (left === "honeypot" || right === "honeypot") {
    return "honeypot";
  }

  if (left === "safe" || right === "safe") {
    return "safe";
  }

  return "unknown";
}

function resolvePoolStatusFromRiskFlags(
  riskFlags: string[],
  pairUrl: string | null,
): MemeRadarPoolStatus {
  const normalizedFlags = riskFlags.map((flag) => normalizeWhitespace(flag).toLowerCase());

  if (normalizedFlags.some((flag) => flag.includes(MEME_RADAR_POOL_STATUS_RUGGED_FLAG.toLowerCase()))) {
    return "rugged";
  }

  if (normalizedFlags.some((flag) => flag.includes(MEME_RADAR_POOL_STATUS_DELISTED_FLAG.toLowerCase()))) {
    return "delisted";
  }

  if (!pairUrl) {
    return "delisted";
  }

  return "alive";
}

function extractPoolStatusReasonFromRiskFlags(riskFlags: string[], fallbackStatus: MemeRadarPoolStatus): string | null {
  const normalized = riskFlags
    .map((flag) => normalizeWhitespace(flag))
    .find((flag) => {
      const lowered = flag.toLowerCase();

      if (fallbackStatus === "rugged") {
        return lowered.includes(MEME_RADAR_POOL_STATUS_RUGGED_FLAG.toLowerCase());
      }

      if (fallbackStatus === "delisted") {
        return lowered.includes(MEME_RADAR_POOL_STATUS_DELISTED_FLAG.toLowerCase());
      }

      return false;
    });

  return normalized ?? null;
}

function resolveSecurityStatusFromRiskFlags(riskFlags: string[]): MemeRadarSecurityStatus {
  const normalizedFlags = riskFlags.map((flag) => normalizeWhitespace(flag).toLowerCase());

  if (normalizedFlags.some((flag) => flag.includes(MEME_RADAR_SECURITY_HONEYPOT_FLAG.toLowerCase()))) {
    return "honeypot";
  }

  return "unknown";
}

function extractSecurityReasonFromRiskFlags(riskFlags: string[]): string | null {
  return (
    riskFlags
      .map((flag) => normalizeWhitespace(flag))
      .find((flag) => flag.toLowerCase().includes(MEME_RADAR_SECURITY_HONEYPOT_FLAG.toLowerCase()))
    ?? null
  );
}

function isEvmAddress(value: string | null): boolean {
  if (!value) {
    return false;
  }

  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function parseBooleanLikeFlag(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }

    return null;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();

    if (["1", "true", "yes", "y"].includes(normalizedValue)) {
      return true;
    }

    if (["0", "false", "no", "n"].includes(normalizedValue)) {
      return false;
    }
  }

  return null;
}

function truncateSearchQuery(value: string, maxLength: number): string {
  const normalized = normalizeWhitespace(value);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength).trim();
}

function applyPoolAndSecurityRiskFlags(
  baseRiskFlags: string[],
  pair: Pick<MemeRadarPairCandidate, "poolStatus" | "poolStatusReason" | "securityStatus" | "securityStatusReason">,
): string[] {
  const filteredRiskFlags = baseRiskFlags.filter((riskFlag) => {
    const normalized = normalizeWhitespace(riskFlag).toLowerCase();

    return !(
      normalized.includes(MEME_RADAR_POOL_STATUS_RUGGED_FLAG.toLowerCase())
      || normalized.includes(MEME_RADAR_POOL_STATUS_DELISTED_FLAG.toLowerCase())
      || normalized.includes(MEME_RADAR_SECURITY_HONEYPOT_FLAG.toLowerCase())
    );
  });

  if (pair.poolStatus === "rugged") {
    filteredRiskFlags.unshift(
      pair.poolStatusReason
        ? `${MEME_RADAR_POOL_STATUS_RUGGED_FLAG}: ${pair.poolStatusReason}`
        : `${MEME_RADAR_POOL_STATUS_RUGGED_FLAG}: liquidez drenada/quase zerada.`,
    );
  } else if (pair.poolStatus === "delisted") {
    filteredRiskFlags.unshift(
      pair.poolStatusReason
        ? `${MEME_RADAR_POOL_STATUS_DELISTED_FLAG}: ${pair.poolStatusReason}`
        : `${MEME_RADAR_POOL_STATUS_DELISTED_FLAG}: par nao encontrado no DexScreener.`,
    );
  }

  if (pair.securityStatus === "honeypot") {
    filteredRiskFlags.unshift(
      pair.securityStatusReason
        ? `${MEME_RADAR_SECURITY_HONEYPOT_FLAG}: ${pair.securityStatusReason}`
        : `${MEME_RADAR_SECURITY_HONEYPOT_FLAG}: risco de bloqueio de venda identificado.`,
    );
  }

  return sanitizeRiskOrCatalyst(filteredRiskFlags);
}

function toApiPoolStatus(status: MemeRadarPoolStatus): "ALIVE" | "DELISTED" | "RUGGED" {
  if (status === "rugged") {
    return "RUGGED";
  }

  if (status === "delisted") {
    return "DELISTED";
  }

  return "ALIVE";
}

function toApiSecurityStatus(status: MemeRadarSecurityStatus): "HONEYPOT" | "SAFE" | "UNKNOWN" {
  if (status === "honeypot") {
    return "HONEYPOT";
  }

  if (status === "safe") {
    return "SAFE";
  }

  return "UNKNOWN";
}

function isPairActionableForUi(
  pair: Pick<MemeRadarPairCandidate, "pairUrl" | "poolStatus" | "securityStatus">,
): boolean {
  return Boolean(pair.pairUrl) && pair.poolStatus === "alive" && pair.securityStatus !== "honeypot";
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

function extractEvmContractCandidatesFromText(value: string): string[] {
  const matches = value.match(/\b0x[a-fA-F0-9]{40}\b/g) ?? [];
  const dedupe = new Set<string>();
  const contracts: string[] = [];

  for (const match of matches) {
    const normalized = match.toLowerCase();

    if (!dedupe.has(normalized)) {
      dedupe.add(normalized);
      contracts.push(normalized);
    }
  }

  return contracts;
}

function hasLegacyContractMentionsInWebResults(results: WebSearchResultItem[]): boolean {
  return results.some((result) => {
    const normalizedBlob = normalizeSignalText(`${result.title} ${result.snippet}`);

    return (
      normalizedBlob.includes("old contract") ||
      normalizedBlob.includes("dead contract") ||
      normalizedBlob.includes("deprecated") ||
      normalizedBlob.includes("migrat") ||
      normalizedBlob.includes("abandon") ||
      normalizedBlob.includes("v1") ||
      normalizedBlob.includes("rug")
    );
  });
}

function hasOfficialTwitterOrTelegramLink(links: MemeRadarSocialLink[]): boolean {
  return links.some((link) => {
    const normalizedType = normalizeWhitespace(link.type).toLowerCase();
    const normalizedUrl = normalizeWhitespace(link.url).toLowerCase();

    if (normalizedType.includes("twitter") || normalizedType.includes("x") || normalizedType.includes("telegram")) {
      return true;
    }

    return (
      normalizedUrl.includes("twitter.com/")
      || normalizedUrl.includes("x.com/")
      || normalizedUrl.includes("t.me/")
      || normalizedUrl.includes("telegram.me/")
      || normalizedUrl.includes("telegram.org/")
    );
  });
}

function computeCandidateAgeMinutes(candidate: Pick<MemeRadarPairCandidate, "discoveredAt" | "launchedAt">, nowMs: number): number | null {
  const anchor = candidate.launchedAt ?? candidate.discoveredAt;
  const parsedDate = new Date(anchor);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return Math.max(0, (nowMs - parsedDate.getTime()) / 60_000);
}

function resolveCandidateMarketCapUsd(candidate: Pick<MemeRadarPairCandidate, "metrics">): number {
  const resolved = candidate.metrics.marketCapUsd ?? candidate.metrics.fdvUsd ?? 0;
  return Number.isFinite(resolved) ? Math.max(0, resolved) : 0;
}

const strictIngestionFilters: StrictIngestionFilter[] = [
  (candidate) => {
    const marketCapUsd = resolveCandidateMarketCapUsd(candidate);

    if (marketCapUsd < MEME_RADAR_STRICT_MIN_MARKET_CAP_USD) {
      return "MARKET_CAP_BELOW_MINIMUM";
    }

    return null;
  },
  (candidate, nowMs) => {
    const ageMinutes = computeCandidateAgeMinutes(candidate, nowMs);

    if (ageMinutes === null) {
      return "AGE_OUTSIDE_SNIPE_WINDOW";
    }

    if (ageMinutes > MEME_RADAR_STRICT_MAX_AGE_MINUTES || ageMinutes < MEME_RADAR_STRICT_MIN_AGE_MINUTES) {
      return "AGE_OUTSIDE_SNIPE_WINDOW";
    }

    return null;
  },
  (candidate) => {
    if (candidate.socials.length === 0 || !hasOfficialTwitterOrTelegramLink(candidate.socials)) {
      return "MISSING_OFFICIAL_SOCIAL_LINK";
    }

    return null;
  },
];

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
    poolStatus: "alive",
    poolStatusReason: null,
    quoteSymbol: quoteToken?.symbol ?? fallbackTokenInfo.quoteSymbol,
    securityStatus: "unknown",
    securityStatusReason: null,
    socialWebEvidence: [],
    socialWebMentions: 0,
    socialWebScore: 0,
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

function computeStandardDeviation(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;

  return Math.sqrt(variance);
}

function toNonNegativeInteger(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function resolveDuplicateTopHolderPercentages(topHolders: BundleTopHolderSnapshot[]): number {
  const grouped = new Map<string, number>();

  for (const holder of topHolders) {
    if (!Number.isFinite(holder.supplyPercent) || holder.supplyPercent <= 0) {
      continue;
    }

    const key = toRounded(holder.supplyPercent, 4).toFixed(4);
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }

  let maxDuplicated = 0;

  for (const count of grouped.values()) {
    if (count > maxDuplicated) {
      maxDuplicated = count;
    }
  }

  return maxDuplicated;
}

function resolveCoordinatedFundingWallets(topHolders: BundleTopHolderSnapshot[]): number {
  const grouped = new Map<string, number>();

  for (const holder of topHolders) {
    if (holder.isLiquidityPool) {
      continue;
    }

    const source = normalizeWhitespace(holder.fundingSource ?? "").toLowerCase();
    const bucket = normalizeWhitespace(holder.fundingTimeBucket ?? "").toLowerCase();

    if (source.length === 0 || bucket.length === 0) {
      continue;
    }

    const key = `${source}|${bucket}`;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }

  let maxFundingCluster = 0;

  for (const count of grouped.values()) {
    if (count > maxFundingCluster) {
      maxFundingCluster = count;
    }
  }

  return maxFundingCluster;
}

function buildRiskCheck(status: BundleRiskCheckStatus, details: string, evidence: string[] = []): BundleRiskCheck {
  return {
    details,
    evidence: evidence.map((item) => normalizeWhitespace(item)).filter((item) => item.length > 0),
    status,
  };
}

function toChecklistStatusLabel(status: BundleRiskCheckStatus): string {
  if (status === "fail") {
    return "**<span style=\"color:red\">FAIL</span>**";
  }

  if (status === "pass") {
    return "**PASS**";
  }

  return "UNKNOWN";
}

export function formatBundleRiskChecklistMarkdown(report: BundleRiskReport): string {
  const hasMultiWalletFlag =
    report.flags.includes("HIGH_CONCENTRATION_RISK") ||
    report.flags.includes("SYMMETRIC_BUNDLE_DETECTED") ||
    report.flags.includes("COORDINATED_BUNDLE") ||
    report.flags.includes("FAKE_HOLDERS_WARNING");
  const hasModerationFailure = report.flags.includes("COMMUNITY_HEALTH_FAILURE");
  const hasVampScam = report.flags.includes("VAMP_SCAM");
  const lines = [
    `[RISK SCORE: ${report.riskScore}/100]`,
    "",
    "| Checklist de Seguranca | Status | Evidencia |",
    "| --- | --- | --- |",
    `| High concentration (>4%) | ${toChecklistStatusLabel(report.checklist.highConcentration.status)} | ${report.checklist.highConcentration.details} |`,
    `| Symmetric bundle | ${toChecklistStatusLabel(report.checklist.symmetricBundle.status)} | ${report.checklist.symmetricBundle.details} |`,
    `| Viewers vs Holders anomaly | ${toChecklistStatusLabel(report.checklist.fakeHolders.status)} | ${report.checklist.fakeHolders.details} |`,
    `| Coordinated funding ping | ${toChecklistStatusLabel(report.checklist.coordinatedFunding.status)} | ${report.checklist.coordinatedFunding.details} |`,
    `| Early dump trap (<10k MC) | ${toChecklistStatusLabel(report.checklist.earlyDumpTrap.status)} | ${report.checklist.earlyDumpTrap.details} |`,
    `| Community health | ${toChecklistStatusLabel(report.checklist.communityHealth.status)} | ${report.checklist.communityHealth.details} |`,
  ];

  if (hasMultiWalletFlag) {
    lines.push("", "**<span style=\"color:red\">ALERTA: suspeita de Multi-Wallet detectada.</span>**");
  }

  if (hasModerationFailure) {
    lines.push("", "**<span style=\"color:red\">ALERTA: comunidade sem moderacao confiavel.</span>**");
  }

  if (hasVampScam) {
    lines.push("", "**<span style=\"color:red\">VAMP SCAM (Copia Parasita) detectado no cruzamento de ticker/contrato.</span>**");
  }

  if (report.warningMessage) {
    lines.push("", `**Alerta:** ${report.warningMessage}`);
  }

  return lines.join("\n");
}

function buildUnknownBundleRiskReport(): BundleRiskReport {
  const unknownCheck = buildRiskCheck("unknown", "Sem dados suficientes para validar esta regra nesta rodada.");

  return {
    checklist: {
      communityHealth: unknownCheck,
      coordinatedFunding: unknownCheck,
      earlyDumpTrap: unknownCheck,
      fakeHolders: unknownCheck,
      highConcentration: unknownCheck,
      symmetricBundle: unknownCheck,
    },
    flags: [],
    generatedAt: new Date().toISOString(),
    metrics: {
      activeViewerToHolderRatio: null,
      coordinatedFundingWallets: 0,
      duplicateTopHolderPercentages: 0,
      flaggedSniperOrDevWallets: 0,
      largestNonLpHolderPercent: null,
    },
    riskScore: 50,
    summary: ["Ativo fora do radar atual. Relatorio retornado em modo UNKNOWN para auditoria inicial."],
    warningMessage: null,
  };
}

function normalizeInstitutionalConsensusWeights(
  input: Record<InstitutionalRiskConsensusSource, number>,
): Record<InstitutionalRiskConsensusSource, number> {
  const fallback = MEME_RADAR_CONSENSUS_DEFAULT_WEIGHTS;
  const fallbackTotal =
    fallback.bundle_risk
    + fallback.community_health
    + fallback.liquidity_depth
    + fallback.security_status
    + fallback.web_signal;
  const inputTotal =
    input.bundle_risk
    + input.community_health
    + input.liquidity_depth
    + input.security_status
    + input.web_signal;
  const source = inputTotal > 0 ? input : fallback;
  const total = inputTotal > 0 ? inputTotal : fallbackTotal;
  const bundleRisk = toRounded((source.bundle_risk / total) * 100, 2);
  const securityStatus = toRounded((source.security_status / total) * 100, 2);
  const liquidityDepth = toRounded((source.liquidity_depth / total) * 100, 2);
  const webSignal = toRounded((source.web_signal / total) * 100, 2);
  const communityHealth = clamp(
    toRounded(100 - bundleRisk - securityStatus - liquidityDepth - webSignal, 2),
    0,
    100,
  );

  return {
    bundle_risk: bundleRisk,
    community_health: communityHealth,
    liquidity_depth: liquidityDepth,
    security_status: securityStatus,
    web_signal: webSignal,
  };
}

export class MemeRadarService {
  private readonly openRouterChatAdapter = new OpenRouterChatAdapter();

  private readonly webSearchAdapter = new WebSearchAdapter();

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

  public async getInstitutionalRiskAudit(input: {
    assetId: string;
    chain?: "all" | MemeRadarChain;
    refresh?: boolean;
  }): Promise<MemeRadarInstitutionalRiskAuditResponse> {
    const normalizedAssetId = normalizeAssetIdForLookup(input.assetId);

    if (normalizedAssetId.length < 2) {
      throw new AppError({
        code: "MEME_RADAR_ASSET_ID_INVALID",
        message: "Asset id is invalid",
        statusCode: 400,
      });
    }

    const chainScope = input.chain ?? "all";
    const resolvedSnapshot = await this.resolveSnapshot(input.refresh === true);
    const scopedNotifications = resolvedSnapshot.snapshot.notifications.filter((record) =>
      chainScope === "all" ? true : record.pair.chain === chainScope,
    );
    const matched = this.resolveNotificationByAssetId(scopedNotifications, normalizedAssetId);

    if (!matched) {
      const report = buildUnknownBundleRiskReport();
      const consensus = this.buildInstitutionalRiskConsensus(null, report);

      return {
        assetId: normalizedAssetId,
        bundleRiskReport: report,
        chain: null,
        checklistMarkdown: formatBundleRiskChecklistMarkdown(report),
        consensus,
        found: false,
        matchedNotificationId: null,
        token: {
          address: null,
          name: null,
          symbol: null,
        },
        updatedAt: new Date().toISOString(),
      };
    }

    const report = matched.bundleRiskReport ?? buildUnknownBundleRiskReport();
    const consensus = this.buildInstitutionalRiskConsensus(matched, report);

    return {
      assetId: normalizedAssetId,
      bundleRiskReport: report,
      chain: matched.pair.chain,
      checklistMarkdown: formatBundleRiskChecklistMarkdown(report),
      consensus,
      found: true,
      matchedNotificationId: matched.pair.fingerprint,
      token: {
        address: matched.pair.token.address,
        name: matched.pair.token.name,
        symbol: matched.pair.token.symbol,
      },
      updatedAt: matched.updatedAt,
    };
  }

  public async getInstitutionalRiskAuditByContract(input: {
    chain?: "all" | MemeRadarChain;
    contractAddress: string;
    refresh?: boolean;
  }): Promise<MemeRadarInstitutionalRiskAuditByContractResponse> {
    const normalizedContractAddress = normalizeContractAddressForLookup(input.contractAddress);

    if (normalizedContractAddress.length < 8) {
      throw new AppError({
        code: "MEME_RADAR_CONTRACT_ADDRESS_INVALID",
        message: "Contract address is invalid",
        statusCode: 400,
      });
    }

    const chainScope = input.chain ?? "all";
    const resolvedSnapshot = await this.resolveSnapshot(input.refresh === true);
    const scopedNotifications = resolvedSnapshot.snapshot.notifications.filter((record) =>
      chainScope === "all" ? true : record.pair.chain === chainScope,
    );
    const matched = this.resolveNotificationByContractAddress(
      scopedNotifications,
      normalizedContractAddress,
    );

    if (!matched) {
      const report = buildUnknownBundleRiskReport();
      const consensus = this.buildInstitutionalRiskConsensus(null, report);

      return {
        bundleRiskReport: report,
        chain: null,
        checklistMarkdown: formatBundleRiskChecklistMarkdown(report),
        consensus,
        contractAddress: normalizedContractAddress,
        found: false,
        matchedNotificationId: null,
        matchedOn: null,
        token: {
          address: null,
          name: null,
          symbol: null,
        },
        updatedAt: new Date().toISOString(),
      };
    }

    const report = matched.notification.bundleRiskReport ?? buildUnknownBundleRiskReport();
    const consensus = this.buildInstitutionalRiskConsensus(matched.notification, report);

    return {
      bundleRiskReport: report,
      chain: matched.notification.pair.chain,
      checklistMarkdown: formatBundleRiskChecklistMarkdown(report),
      consensus,
      contractAddress: normalizedContractAddress,
      found: true,
      matchedNotificationId: matched.notification.pair.fingerprint,
      matchedOn: matched.matchedOn,
      token: {
        address: matched.notification.pair.token.address,
        name: matched.notification.pair.token.name,
        symbol: matched.notification.pair.token.symbol,
      },
      updatedAt: matched.notification.updatedAt,
    };
  }

  private resolveNotificationByAssetId(
    notifications: StoredMemeRadarNotificationRecord[],
    normalizedAssetId: string,
  ): StoredMemeRadarNotificationRecord | null {
    for (const notification of notifications) {
      const symbol = normalizeAssetIdForLookup(notification.pair.token.symbol);
      const name = normalizeAssetIdForLookup(notification.pair.token.name);

      if (symbol === normalizedAssetId || name.includes(normalizedAssetId)) {
        return notification;
      }
    }

    return null;
  }

  private resolveNotificationByContractAddress(
    notifications: StoredMemeRadarNotificationRecord[],
    contractAddress: string,
  ):
    | {
      matchedOn: "pair_address" | "token_address" | "vamp_contract_candidate";
      notification: StoredMemeRadarNotificationRecord;
    }
    | null {
    for (const notification of notifications) {
      const tokenAddress = notification.pair.token.address;

      if (tokenAddress && hasEquivalentContractAddress(tokenAddress, contractAddress)) {
        return {
          matchedOn: "token_address",
          notification,
        };
      }

      if (hasEquivalentContractAddress(notification.pair.pairAddress, contractAddress)) {
        return {
          matchedOn: "pair_address",
          notification,
        };
      }

      const vampContracts = notification.pair.bundleSignals?.vamp.contractCandidates ?? [];

      if (vampContracts.some((candidate) => hasEquivalentContractAddress(candidate, contractAddress))) {
        return {
          matchedOn: "vamp_contract_candidate",
          notification,
        };
      }
    }

    return null;
  }

  private buildInstitutionalRiskConsensus(
    notification: StoredMemeRadarNotificationRecord | null,
    report: BundleRiskReport,
  ): InstitutionalRiskConsensus {
    const weights = this.resolveInstitutionalConsensusWeights();
    const bundleRiskScore = clamp(report.riskScore, 0, 100);
    const securitySignal = this.resolveSecurityConsensusSignal(notification);
    const liquiditySignal = this.resolveLiquidityConsensusSignal(notification);
    const webSignal = this.resolveWebConsensusSignal(notification, report);
    const communitySignal = this.resolveCommunityConsensusSignal(report);
    const bundleRiskRationale =
      report.flags.length > 0
        ? `Bundle heuristics com ${report.flags.length} flag(s): ${report.flags.join(", ")}.`
        : "Bundle heuristics sem flags criticas nesta rodada.";
    const breakdown: InstitutionalRiskConsensusBreakdownItem[] = [
      {
        contribution: toRounded((bundleRiskScore * weights.bundle_risk) / 100, 2),
        rationale: bundleRiskRationale,
        score: toRounded(bundleRiskScore, 1),
        source: "bundle_risk",
        weight: weights.bundle_risk,
      },
      {
        contribution: toRounded((securitySignal.score * weights.security_status) / 100, 2),
        rationale: securitySignal.rationale,
        score: securitySignal.score,
        source: "security_status",
        weight: weights.security_status,
      },
      {
        contribution: toRounded((liquiditySignal.score * weights.liquidity_depth) / 100, 2),
        rationale: liquiditySignal.rationale,
        score: liquiditySignal.score,
        source: "liquidity_depth",
        weight: weights.liquidity_depth,
      },
      {
        contribution: toRounded((webSignal.score * weights.web_signal) / 100, 2),
        rationale: webSignal.rationale,
        score: webSignal.score,
        source: "web_signal",
        weight: weights.web_signal,
      },
      {
        contribution: toRounded((communitySignal.score * weights.community_health) / 100, 2),
        rationale: communitySignal.rationale,
        score: communitySignal.score,
        source: "community_health",
        weight: weights.community_health,
      },
    ];
    const score = toRounded(
      breakdown.reduce((accumulator, item) => accumulator + item.contribution, 0),
      1,
    );

    return {
      breakdown,
      score,
      weights,
    };
  }

  private resolveInstitutionalConsensusWeights(): Record<InstitutionalRiskConsensusSource, number> {
    return normalizeInstitutionalConsensusWeights({
      bundle_risk: env.MEME_RADAR_CONSENSUS_WEIGHT_BUNDLE_RISK,
      community_health: env.MEME_RADAR_CONSENSUS_WEIGHT_COMMUNITY_HEALTH,
      liquidity_depth: env.MEME_RADAR_CONSENSUS_WEIGHT_LIQUIDITY_DEPTH,
      security_status: env.MEME_RADAR_CONSENSUS_WEIGHT_SECURITY_STATUS,
      web_signal: env.MEME_RADAR_CONSENSUS_WEIGHT_WEB_SIGNAL,
    });
  }

  private resolveSecurityConsensusSignal(
    notification: StoredMemeRadarNotificationRecord | null,
  ): { rationale: string; score: number } {
    if (!notification) {
      return {
        rationale: "Status de seguranca indisponivel para o contrato nesta rodada.",
        score: 50,
      };
    }

    const reason = notification.pair.securityStatusReason;

    if (notification.pair.securityStatus === "honeypot") {
      return {
        rationale: reason
          ? `Security provider marcou HONEYPOT: ${reason}`
          : "Security provider marcou HONEYPOT para o contrato.",
        score: 0,
      };
    }

    if (notification.pair.securityStatus === "safe") {
      const score = notification.pair.poolStatus === "alive" ? 90 : 70;

      return {
        rationale: reason
          ? `Security provider marcou SAFE: ${reason}`
          : "Security provider marcou SAFE sem ressalvas criticas.",
        score,
      };
    }

    return {
      rationale: reason
        ? `Security provider retornou UNKNOWN: ${reason}`
        : "Security provider sem conclusao definitiva de seguranca.",
      score: 52,
    };
  }

  private resolveLiquidityConsensusSignal(
    notification: StoredMemeRadarNotificationRecord | null,
  ): { rationale: string; score: number } {
    if (!notification) {
      return {
        rationale: "Liquidez indisponivel para o contrato nesta rodada.",
        score: 50,
      };
    }

    if (notification.pair.poolStatus === "rugged") {
      return {
        rationale: "Pool marcado como RUGGED, liquidez considerada comprometida.",
        score: 0,
      };
    }

    if (notification.pair.poolStatus === "delisted") {
      return {
        rationale: "Pool marcado como DELISTED, confiabilidade de liquidez reduzida.",
        score: 12,
      };
    }

    const liquidityUsd = notification.pair.metrics.liquidityUsd;

    if (liquidityUsd === null || !Number.isFinite(liquidityUsd)) {
      return {
        rationale: "Sem leitura de liquidez USD para calibrar profundidade do book.",
        score: 50,
      };
    }

    let score = 45;

    if (liquidityUsd >= 200_000) {
      score = 90;
    } else if (liquidityUsd >= 100_000) {
      score = 82;
    } else if (liquidityUsd >= 50_000) {
      score = 72;
    } else if (liquidityUsd >= 20_000) {
      score = 62;
    } else if (liquidityUsd >= 10_000) {
      score = 55;
    }

    const txns24h = notification.pair.metrics.txns24h;

    if (typeof txns24h === "number" && Number.isFinite(txns24h)) {
      if (txns24h >= 400) {
        score += 5;
      } else if (txns24h >= 150) {
        score += 3;
      } else if (txns24h < 30) {
        score -= 6;
      }
    }

    const normalizedScore = clamp(toRounded(score, 1), 0, 100);
    const txnsDescriptor =
      typeof txns24h === "number" && Number.isFinite(txns24h)
        ? ` | txns24h=${Math.round(txns24h)}`
        : "";

    return {
      rationale: `Liquidez observada ${Math.round(liquidityUsd)} USD${txnsDescriptor}.`,
      score: normalizedScore,
    };
  }

  private resolveWebConsensusSignal(
    notification: StoredMemeRadarNotificationRecord | null,
    report: BundleRiskReport,
  ): { rationale: string; score: number } {
    if (!notification) {
      return {
        rationale: "Sem evidencia web/comunidade suficiente para o contrato nesta rodada.",
        score: 50,
      };
    }

    const socialWebScore = clamp(notification.pair.socialWebScore, 0, 100);
    const socialWebMentions = Math.max(0, notification.pair.socialWebMentions);
    const mentionsScore =
      socialWebMentions > 0
        ? clamp(35 + Math.min(socialWebMentions, 40) * 1.1, 35, 80)
        : 45;
    let score = socialWebScore > 0 ? socialWebScore : mentionsScore;

    if (report.flags.includes("VAMP_SCAM")) {
      score = Math.min(score, 12);

      return {
        rationale: "Sinal web penalizado por VAMP_SCAM detectado no cruzamento de ticker/contrato.",
        score: toRounded(score, 1),
      };
    }

    return {
      rationale: `Sinal web com social_web_score=${toRounded(socialWebScore, 1)} e mentions=${socialWebMentions}.`,
      score: toRounded(score, 1),
    };
  }

  private resolveCommunityConsensusSignal(report: BundleRiskReport): { rationale: string; score: number } {
    const status = report.checklist.communityHealth.status;

    if (status === "pass") {
      return {
        rationale: "Checklist de comunidade em PASS (moderacao e comunicacao operacionais).",
        score: 86,
      };
    }

    if (status === "fail") {
      return {
        rationale: "Checklist de comunidade em FAIL (risco de manipulacao social).",
        score: 15,
      };
    }

    return {
      rationale: "Checklist de comunidade sem dados suficientes (UNKNOWN).",
      score: 50,
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

    const strictEligibleCandidates = this.applyStrictIngestionPipeline(geckoCandidates);

    if (strictEligibleCandidates.length === 0) {
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

    const securityMetrics = await this.enrichCandidatesWithSecuritySignals(strictEligibleCandidates);

    sourceSnapshots.push({
      error: securityMetrics.firstError,
      fetchedAt: new Date().toISOString(),
      latencyMs: securityMetrics.latencyMs,
      source: "goplus_security",
      status: securityMetrics.firstError ? "error" : "ok",
      totalItems: securityMetrics.successCount,
    });

    const webSignalMetrics = await this.enrichCandidatesWithWebSignals(strictEligibleCandidates);

    sourceSnapshots.push({
      error: webSignalMetrics.firstError,
      fetchedAt: new Date().toISOString(),
      latencyMs: webSignalMetrics.latencyMs,
      source: "web_social_signal",
      status: webSignalMetrics.firstError ? "error" : "ok",
      totalItems: webSignalMetrics.successCount,
    });

    const rankedCandidates = await this.rankCandidates(strictEligibleCandidates, sourceSnapshots);

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

      const mergedPoolStatus = mergePoolStatus(existing.poolStatus, candidate.poolStatus);
      const mergedSecurityStatus = mergeSecurityStatus(existing.securityStatus, candidate.securityStatus);

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
        pairUrl: existing.pairUrl ?? candidate.pairUrl,
        poolStatus: mergedPoolStatus,
        poolStatusReason:
          (mergedPoolStatus === candidate.poolStatus ? candidate.poolStatusReason : existing.poolStatusReason)
          ?? existing.poolStatusReason
          ?? candidate.poolStatusReason,
        securityStatus: mergedSecurityStatus,
        securityStatusReason:
          (mergedSecurityStatus === candidate.securityStatus
            ? candidate.securityStatusReason
            : existing.securityStatusReason)
          ?? existing.securityStatusReason
          ?? candidate.securityStatusReason,
        socialWebEvidence:
          candidate.socialWebEvidence.length > existing.socialWebEvidence.length
            ? candidate.socialWebEvidence
            : existing.socialWebEvidence,
        socialWebMentions: Math.max(existing.socialWebMentions, candidate.socialWebMentions),
        socialWebScore: Math.max(existing.socialWebScore, candidate.socialWebScore),
        socials: mergeSocialLinks(existing.socials, candidate.socials),
        sources: mergeUniqueStrings(existing.sources, candidate.sources, 6),
      });
    }

    return [...deduped.values()].slice(0, env.MEME_RADAR_NEW_POOLS_PER_CHAIN * 2);
  }

  private applyStrictIngestionPipeline(candidates: MemeRadarPairCandidate[]): MemeRadarPairCandidate[] {
    const nowMs = Date.now();
    const droppedByReason: Record<StrictIngestionDropReason, number> = {
      AGE_OUTSIDE_SNIPE_WINDOW: 0,
      MARKET_CAP_BELOW_MINIMUM: 0,
      MISSING_OFFICIAL_SOCIAL_LINK: 0,
    };
    const approved: MemeRadarPairCandidate[] = [];

    for (const candidate of candidates) {
      let dropReason: StrictIngestionDropReason | null = null;

      for (const filter of strictIngestionFilters) {
        const result = filter(candidate, nowMs);

        if (result) {
          dropReason = result;
          break;
        }
      }

      if (dropReason) {
        droppedByReason[dropReason] += 1;
        continue;
      }

      approved.push(candidate);
    }

    const droppedCount = candidates.length - approved.length;

    if (droppedCount > 0) {
      logger.info(
        {
          approved: approved.length,
          dropped: droppedCount,
          droppedByReason,
          totalCandidates: candidates.length,
        },
        "Meme radar strict ingestion pipeline applied",
      );
    }

    return approved;
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
        candidate.sources = mergeUniqueStrings(candidate.sources, ["dexscreener"], 6);

        if (!enriched) {
          candidate.poolStatus = mergePoolStatus(candidate.poolStatus, "delisted");
          candidate.poolStatusReason =
            candidate.poolStatusReason
            ?? "Par nao encontrado no DexScreener durante a verificacao de liquidez.";
          continue;
        }

        successCount += 1;

        const mergedSocials = mergeSocialLinks(candidate.socials, enriched.socials);

        candidate.dexId = enriched.dexId ?? candidate.dexId;
        candidate.pairUrl = enriched.pairUrl ?? candidate.pairUrl;
        candidate.quoteSymbol = enriched.quoteSymbol ?? candidate.quoteSymbol;
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

        const resolvedLiquidity = candidate.metrics.liquidityUsd ?? 0;

        if (!candidate.pairUrl) {
          candidate.poolStatus = mergePoolStatus(candidate.poolStatus, "delisted");
          candidate.poolStatusReason = "Pool sem URL valida no DexScreener.";
        } else if (resolvedLiquidity > 0 && resolvedLiquidity <= 1_200) {
          candidate.poolStatus = "rugged";
          candidate.poolStatusReason = `Liquidez critica detectada (${Math.round(resolvedLiquidity)} USD).`;
        } else if (candidate.poolStatus !== "rugged") {
          candidate.poolStatus = "alive";
          candidate.poolStatusReason = null;
        }
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

  private async enrichCandidatesWithSecuritySignals(
    candidates: MemeRadarPairCandidate[],
  ): Promise<DexCollectResult> {
    const startedAt = Date.now();
    const securityCandidates = [...candidates]
      .filter((candidate) => candidate.chain === "base" && isEvmAddress(candidate.token.address))
      .slice(0, env.MEME_RADAR_DEX_ENRICH_LIMIT);

    let successCount = 0;
    let firstError: { code: string; message: string } | null = null;

    for (const candidate of securityCandidates) {
      const tokenAddress = candidate.token.address;

      if (!tokenAddress) {
        continue;
      }

      try {
        const securityPayload = await this.fetchGoPlusTokenSecurity(candidate.chain, tokenAddress);

        if (!securityPayload) {
          continue;
        }

        successCount += 1;

        if (securityPayload.isHoneypot === true) {
          candidate.securityStatus = "honeypot";
          candidate.securityStatusReason =
            securityPayload.reason ?? "GoPlus sinalizou risco de bloqueio de venda (honeypot).";
        } else if (securityPayload.isHoneypot === false && candidate.securityStatus !== "honeypot") {
          candidate.securityStatus = "safe";
          candidate.securityStatusReason =
            securityPayload.reason ?? "GoPlus sem indicio de honeypot no contrato.";
        }

        candidate.sources = mergeUniqueStrings(candidate.sources, ["goplus_security"], 6);
      } catch (error) {
        if (!firstError) {
          firstError = {
            code: error instanceof AppError ? error.code : "MEME_RADAR_SECURITY_SOURCE_ERROR",
            message: error instanceof Error ? error.message : "Failed to enrich security status",
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

  private async fetchGoPlusTokenSecurity(
    chain: MemeRadarChain,
    tokenAddress: string,
  ): Promise<{ isHoneypot: boolean | null; reason: string | null } | null> {
    if (chain !== "base") {
      return null;
    }

    const chainId = "8453";
    const endpoint =
      `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${encodeURIComponent(tokenAddress)}`;
    const payload = await this.requestJson(endpoint);

    if (!isRecord(payload)) {
      return null;
    }

    const resultRecord = readRecord(payload, "result");

    if (!resultRecord) {
      return null;
    }

    const loweredAddress = tokenAddress.toLowerCase();
    let tokenSecurity = readRecord(resultRecord, loweredAddress) ?? readRecord(resultRecord, tokenAddress);

    if (!tokenSecurity) {
      for (const value of Object.values(resultRecord)) {
        if (isRecord(value)) {
          tokenSecurity = value;
          break;
        }
      }
    }

    if (!tokenSecurity) {
      return null;
    }

    const honeypot = parseBooleanLikeFlag(tokenSecurity.is_honeypot);
    const cannotSellAll = parseBooleanLikeFlag(tokenSecurity.cannot_sell_all);
    const blacklisted = parseBooleanLikeFlag(tokenSecurity.is_blacklisted);
    const tradingCooldown = parseBooleanLikeFlag(tokenSecurity.trading_cooldown);
    const reasonFlags: string[] = [];

    if (honeypot === true) {
      reasonFlags.push("is_honeypot=true");
    }

    if (cannotSellAll === true) {
      reasonFlags.push("cannot_sell_all=true");
    }

    if (blacklisted === true) {
      reasonFlags.push("is_blacklisted=true");
    }

    if (tradingCooldown === true) {
      reasonFlags.push("trading_cooldown=true");
    }

    if (reasonFlags.length > 0) {
      return {
        isHoneypot: true,
        reason: `GoPlus: ${reasonFlags.join(", ")}`,
      };
    }

    if (honeypot === false || cannotSellAll === false) {
      return {
        isHoneypot: false,
        reason: "GoPlus sem sinal direto de honeypot.",
      };
    }

    return {
      isHoneypot: null,
      reason: null,
    };
  }

  private async enrichCandidatesWithWebSignals(
    candidates: MemeRadarPairCandidate[],
  ): Promise<DexCollectResult> {
    const startedAt = Date.now();
    const webCandidates = [...candidates]
      .sort((left, right) => {
        const leftScore = (left.metrics.volume24hUsd ?? 0) + (left.metrics.txns24h ?? 0) * 250;
        const rightScore = (right.metrics.volume24hUsd ?? 0) + (right.metrics.txns24h ?? 0) * 250;
        return rightScore - leftScore;
      })
      .slice(0, Math.max(1, Math.min(env.MEME_RADAR_AI_MAX_ITEMS, 8)));

    let successCount = 0;
    let firstError: { code: string; message: string } | null = null;

    for (const candidate of webCandidates) {
      try {
        const tokenSymbol = candidate.token.symbol || "TOKEN";
        const query = truncateSearchQuery(
          `${tokenSymbol} ${candidate.token.name} ${candidate.chain} token twitter x telegram community`,
          180,
        );
        const webResponse = await this.webSearchAdapter.search({
          maxResults: 6,
          query,
        });
        const webResults = webResponse.results.slice(0, 6);

        const socialHits = webResults.filter((result) => {
          const domain = result.domain.toLowerCase();
          const normalizedText = normalizeSignalText(`${result.title} ${result.snippet}`);

          return (
            result.sourceType === "community"
            || /x\.com|twitter\.com|t\.me|telegram|discord\.gg|reddit\.com|medium\.com/.test(domain)
            || normalizedText.includes("twitter")
            || normalizedText.includes("telegram")
            || normalizedText.includes("discord")
          );
        });

        const normalizedResultBlobs = webResults.map((result) =>
          normalizeSignalText(`${result.title} ${result.snippet} ${result.url}`),
        );
        const webSignalBlob = webResults
          .map((result) => `${result.title}\n${result.snippet}\n${result.url}`)
          .join("\n");
        const vampContractCandidates = extractEvmContractCandidatesFromText(webSignalBlob);
        const hasLegacyContractMentions = hasLegacyContractMentionsInWebResults(webResults);
        const hasPinnedThesisEvidence = normalizedResultBlobs.some((blob) =>
          blob.includes("pinned") && (blob.includes("thesis") || blob.includes("roadmap") || blob.includes("tokenomics")),
        );
        const hasPinnedThesisNegative = normalizedResultBlobs.some((blob) =>
          blob.includes("no pinned") || blob.includes("sem pinned") || blob.includes("without pinned"),
        );
        const hasUnmoderatedBotSpam = normalizedResultBlobs.some((blob) =>
          blob.includes("bot spam")
          || blob.includes("spam links")
          || blob.includes("telegram spam")
          || blob.includes("scam links")
          || blob.includes("raid bot"),
        );
        const hasModerationEvidence = normalizedResultBlobs.some((blob) =>
          blob.includes("moderat") || blob.includes("admin active") || blob.includes("community manager"),
        );
        const sniperWalletSignals = normalizedResultBlobs.filter((blob) => blob.includes("sniper")).length;
        const freshWalletSignals = normalizedResultBlobs.filter((blob) =>
          blob.includes("fresh wallet") || blob.includes("new wallet cluster"),
        ).length;
        const devWalletSignals = normalizedResultBlobs.filter((blob) =>
          blob.includes("dev wallet") || blob.includes("team wallet"),
        ).length;
        const previousSignals = candidate.bundleSignals;

        candidate.socialWebEvidence = socialHits.slice(0, 3).map((result) => ({
          confidenceScore: result.confidenceScore,
          title: result.title.slice(0, 120),
          url: result.url,
        }));
        candidate.socialWebMentions = socialHits.length;

        const confidenceSum = socialHits.reduce((sum, result) => sum + result.confidenceScore, 0);
        const meanConfidence = socialHits.length > 0 ? confidenceSum / socialHits.length : 0;

        candidate.socialWebScore = clamp(
          toRounded(meanConfidence * 0.68 + Math.min(socialHits.length, 6) * 7.2, 1),
          0,
          100,
        );
        candidate.bundleSignals = {
          activity: {
            activeViewers: socialHits.length > 0
              ? socialHits.length
              : previousSignals?.activity.activeViewers ?? null,
            totalHolders: previousSignals?.activity.totalHolders ?? null,
          },
          community: {
            hasPinnedThesis:
              hasPinnedThesisEvidence
                ? true
                : hasPinnedThesisNegative
                  ? false
                  : previousSignals?.community.hasPinnedThesis ?? null,
            hasUnmoderatedBotSpam:
              hasUnmoderatedBotSpam
                ? true
                : previousSignals?.community.hasUnmoderatedBotSpam ?? null,
            moderationActive:
              hasUnmoderatedBotSpam
                ? false
                : hasModerationEvidence
                  ? true
                  : previousSignals?.community.moderationActive ?? null,
          },
          topHolders: previousSignals?.topHolders ?? [],
          vamp: {
            contractCandidates: vampContractCandidates,
            hasLegacyContractMentions,
            sourceUrls: webResults.map((result) => result.url).slice(0, 3),
          },
          wallets: {
            freshWalletCount: freshWalletSignals > 0
              ? freshWalletSignals
              : previousSignals?.wallets.freshWalletCount ?? null,
            sniperWalletCount: sniperWalletSignals > 0
              ? sniperWalletSignals
              : previousSignals?.wallets.sniperWalletCount ?? null,
            suspectedDevWalletCount: devWalletSignals > 0
              ? devWalletSignals
              : previousSignals?.wallets.suspectedDevWalletCount ?? null,
          },
        };

        if (socialHits.length > 0) {
          successCount += 1;
          candidate.sources = mergeUniqueStrings(
            candidate.sources,
            ["web_social_signal", `web_${webResponse.provider}`],
            6,
          );
        }
      } catch (error) {
        if (!firstError) {
          firstError = {
            code: error instanceof AppError ? error.code : "MEME_RADAR_WEB_SIGNAL_SOURCE_ERROR",
            message: error instanceof Error ? error.message : "Failed to enrich web social signals",
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
        const bundleRiskReport = this.buildBundleRiskReport(candidate);
        const heuristicSentiment = this.applyBundleRiskToSentiment(
          this.buildHeuristicSentiment(candidate),
          bundleRiskReport,
        );
        const guardedSentiment = this.applyGuardrailsToSentiment(candidate, heuristicSentiment);
        const priority = resolvePriorityFromSentiment(guardedSentiment);

        return {
          bundleRiskReport,
          catalysts: guardedSentiment.catalysts,
          headline: `${candidate.token.symbol} em ${formatChainLabel(candidate.chain)} entrou no radar (${Math.round(guardedSentiment.hypeScore)})`,
          pair: candidate,
          priority,
          riskFlags: guardedSentiment.riskFlags,
          sentiment: guardedSentiment,
          summary: guardedSentiment.oneLineSummary,
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
      if (candidate.pair.poolStatus !== "alive" || candidate.pair.securityStatus === "honeypot") {
        continue;
      }

      try {
        const aiSentiment = await this.generateAiSentiment(candidate.pair);
        const aiWithBundleRisk = this.applyBundleRiskToSentiment(aiSentiment, candidate.bundleRiskReport);
        const guardedAiSentiment = this.applyGuardrailsToSentiment(candidate.pair, aiWithBundleRisk);
        candidate.sentiment = guardedAiSentiment;
        candidate.priority = resolvePriorityFromSentiment(guardedAiSentiment);
        candidate.headline = `${candidate.pair.token.symbol} em ${formatChainLabel(candidate.pair.chain)} entrou no radar (${Math.round(guardedAiSentiment.hypeScore)})`;
        candidate.summary = guardedAiSentiment.oneLineSummary;
        candidate.riskFlags = guardedAiSentiment.riskFlags;
        candidate.catalysts = guardedAiSentiment.catalysts;
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

  private buildBundleRiskReport(pair: MemeRadarPairCandidate): BundleRiskReport {
    const generatedAt = new Date().toISOString();
    const topHolders = (pair.bundleSignals?.topHolders ?? []).slice(0, 10);
    const nonLpTopHolders = topHolders.filter((holder) => !holder.isLiquidityPool);
    const nonLpHolderPercents = nonLpTopHolders
      .map((holder) => holder.supplyPercent)
      .filter((value) => Number.isFinite(value) && value > 0);
    const largestNonLpHolderPercent =
      nonLpHolderPercents.length > 0
        ? toRounded(Math.max(...nonLpHolderPercents), 4)
        : null;
    const duplicateTopHolderPercentages = resolveDuplicateTopHolderPercentages(topHolders);
    const nonLpStdDeviation = computeStandardDeviation(nonLpHolderPercents);
    const highConcentrationRisk =
      largestNonLpHolderPercent !== null
      && largestNonLpHolderPercent > MEME_RADAR_HIGH_CONCENTRATION_SUPPLY_PERCENT;
    const symmetricBundleRisk =
      duplicateTopHolderPercentages >= MEME_RADAR_SYMMETRIC_DUPLICATE_MIN_WALLETS
      || (nonLpStdDeviation !== null
        && nonLpHolderPercents.length >= 4
        && nonLpStdDeviation <= 0.12);

    const activeViewers =
      pair.bundleSignals?.activity.activeViewers
      ?? (pair.socialWebMentions > 0 ? pair.socialWebMentions : null);
    const totalHolders = pair.bundleSignals?.activity.totalHolders ?? null;
    const activeViewerToHolderRatio =
      typeof activeViewers === "number" && Number.isFinite(activeViewers)
      && typeof totalHolders === "number" && Number.isFinite(totalHolders)
      && totalHolders > 0
        ? activeViewers / totalHolders
        : null;
    const fakeHoldersWarning =
      activeViewerToHolderRatio !== null
      && activeViewerToHolderRatio < MEME_RADAR_FAKE_HOLDER_RATIO_THRESHOLD;

    const coordinatedFundingWallets = resolveCoordinatedFundingWallets(topHolders);
    const coordinatedBundle = coordinatedFundingWallets >= MEME_RADAR_COORDINATED_BUNDLE_MIN_WALLETS;

    const sniperWalletCount = toNonNegativeInteger(pair.bundleSignals?.wallets.sniperWalletCount);
    const suspectedDevWalletCount = toNonNegativeInteger(pair.bundleSignals?.wallets.suspectedDevWalletCount);
    const freshWalletCount = toNonNegativeInteger(pair.bundleSignals?.wallets.freshWalletCount);
    const flaggedSniperOrDevWallets = sniperWalletCount + suspectedDevWalletCount + freshWalletCount;
    const marketCapUsd = resolveCandidateMarketCapUsd(pair);
    const earlyDumpTrap =
      marketCapUsd < MEME_RADAR_EARLY_DUMP_TRAP_MAX_MARKET_CAP_USD
      && flaggedSniperOrDevWallets >= MEME_RADAR_SNIPER_TRAP_MIN_WALLETS;

    const hasPinnedThesis = pair.bundleSignals?.community.hasPinnedThesis ?? null;
    const hasUnmoderatedBotSpam = pair.bundleSignals?.community.hasUnmoderatedBotSpam ?? null;
    const moderationActive = pair.bundleSignals?.community.moderationActive ?? null;
    const communityHealthFailure =
      hasPinnedThesis === false
      || hasUnmoderatedBotSpam === true
      || moderationActive === false;
    const vampSignals = pair.bundleSignals?.vamp;
    const vampScamDetected =
      (vampSignals?.contractCandidates.length ?? 0) >= 2
      && vampSignals?.hasLegacyContractMentions === true;

    const checklist: BundleRiskChecklist = {
      communityHealth:
        hasPinnedThesis === null && hasUnmoderatedBotSpam === null && moderationActive === null
          ? buildRiskCheck("unknown", "Sem dados suficientes para auditar moderacao e tese da comunidade.")
          : communityHealthFailure
            ? buildRiskCheck(
                "fail",
                "Comunidade sem tese fixada e/ou com spam sem moderacao; confianca deve ser anulada.",
                [
                  `pinned_thesis=${String(hasPinnedThesis)}`,
                  `bot_spam=${String(hasUnmoderatedBotSpam)}`,
                  `moderation_active=${String(moderationActive)}`,
                ],
              )
            : buildRiskCheck("pass", "Comunicacao e moderacao comunitaria em estado operacional."),
      coordinatedFunding:
        topHolders.length === 0
          ? buildRiskCheck("unknown", "Top holders nao informados para verificar funding sincronizado de CEX.")
          : coordinatedBundle
            ? buildRiskCheck(
                "fail",
                "Padrao de financiamento sincronizado entre carteiras do top 10.",
                [`cluster_wallets=${coordinatedFundingWallets}`],
              )
            : buildRiskCheck("pass", "Sem padrao evidente de funding coordenado no top 10."),
      earlyDumpTrap:
        marketCapUsd <= 0
          ? buildRiskCheck("unknown", "Market cap indisponivel para validar armadilha de despejo inicial.")
          : earlyDumpTrap
            ? buildRiskCheck(
                "fail",
                "Presenca de multiplos snipers em MC baixo. Risco extremo de despejo de liquidez.",
                [
                  `market_cap_usd=${Math.round(marketCapUsd)}`,
                  `flagged_wallets=${flaggedSniperOrDevWallets}`,
                ],
              )
            : buildRiskCheck("pass", "Sem combinacao critica de MC baixo com concentracao de wallets agressivas."),
      fakeHolders:
        activeViewerToHolderRatio === null
          ? buildRiskCheck("unknown", "Sem dados de viewers/holders para detectar holders inflados.")
          : fakeHoldersWarning
            ? buildRiskCheck(
                "fail",
                "Atividade social inferior a 30% da base de holders: suspeita de holders inativos/multi-wallet.",
                [
                  `ratio=${toRounded(activeViewerToHolderRatio, 4)}`,
                  `threshold=${MEME_RADAR_FAKE_HOLDER_RATIO_THRESHOLD}`,
                ],
              )
            : buildRiskCheck("pass", "Racio de atividade acima do threshold minimo de holders."),
      highConcentration:
        largestNonLpHolderPercent === null
          ? buildRiskCheck("unknown", "Sem leitura de top holders para concentracao acima de 4%.")
          : highConcentrationRisk
            ? buildRiskCheck(
                "fail",
                "Top holder nao-LP acima de 4% do supply.",
                [
                  `largest_non_lp=${largestNonLpHolderPercent}%`,
                  `threshold=${MEME_RADAR_HIGH_CONCENTRATION_SUPPLY_PERCENT}%`,
                ],
              )
            : buildRiskCheck("pass", "Nao houve concentracao nao-LP acima de 4% do supply."),
      symmetricBundle:
        topHolders.length === 0
          ? buildRiskCheck("unknown", "Sem distribuicao top 10 para detectar padrao simetrico de bundle.")
          : symmetricBundleRisk
            ? buildRiskCheck(
                "fail",
                "Distribuicao simetrica suspeita no top 10 (duplicatas exatas ou baixa dispersao).",
                [
                  `duplicated=${duplicateTopHolderPercentages}`,
                  `std_dev=${nonLpStdDeviation === null ? "n/d" : toRounded(nonLpStdDeviation, 4)}`,
                ],
              )
            : buildRiskCheck("pass", "Nao foi detectado padrao de clone simetrico no top 10."),
    };

    const flags: BundleRiskFlag[] = [];

    if (highConcentrationRisk) {
      flags.push("HIGH_CONCENTRATION_RISK");
    }

    if (symmetricBundleRisk) {
      flags.push("SYMMETRIC_BUNDLE_DETECTED");
    }

    if (fakeHoldersWarning) {
      flags.push("FAKE_HOLDERS_WARNING");
    }

    if (coordinatedBundle) {
      flags.push("COORDINATED_BUNDLE");
    }

    if (earlyDumpTrap) {
      flags.push("EARLY_DUMP_TRAP");
    }

    if (communityHealthFailure) {
      flags.push("COMMUNITY_HEALTH_FAILURE");
    }

    if (vampScamDetected) {
      flags.push("VAMP_SCAM");
    }

    const weightedPenalty =
      (highConcentrationRisk ? 22 : 0)
      + (symmetricBundleRisk ? 18 : 0)
      + (fakeHoldersWarning ? 14 : 0)
      + (coordinatedBundle ? 18 : 0)
      + (earlyDumpTrap ? 24 : 0)
      + (communityHealthFailure ? 20 : 0)
      + (vampScamDetected ? 22 : 0);
    const riskScore = clamp(100 - weightedPenalty, 0, 100);
    const summary = [
      `Checklist: ${flags.length > 0 ? flags.join(", ") : "nenhuma flag critica detectada"}.`,
      `Mercado: MC ${Math.round(marketCapUsd)} USD | top-holder-dup ${duplicateTopHolderPercentages}.`,
      activeViewerToHolderRatio === null
        ? "Atividade: viewers/holders indisponivel para auditoria de holders inativos."
        : `Atividade: viewers/holders ${toRounded(activeViewerToHolderRatio, 3)}.`,
      vampScamDetected
        ? "VAMP SCAM: ticker cruzado com contratos antigos/mortos na varredura web."
        : "Anti-Vamp: sem evidencia forte de copia parasita nesta rodada.",
    ];
    const warningSegments: string[] = [];

    if (earlyDumpTrap) {
      warningSegments.push("Presenca de multiplos snipers em MC baixo. Risco extremo de despejo de liquidez.");
    }

    if (vampScamDetected) {
      warningSegments.push("VAMP SCAM detectado no cruzamento de ticker/contrato.");
    }

    const warningMessage = warningSegments.length > 0 ? warningSegments.join(" ") : null;

    return {
      checklist,
      flags,
      generatedAt,
      metrics: {
        activeViewerToHolderRatio:
          activeViewerToHolderRatio === null
            ? null
            : toRounded(activeViewerToHolderRatio, 4),
        coordinatedFundingWallets,
        duplicateTopHolderPercentages,
        flaggedSniperOrDevWallets,
        largestNonLpHolderPercent,
      },
      riskScore,
      summary,
      warningMessage,
    };
  }

  private applyBundleRiskToSentiment(
    sentiment: MemeRadarGeneratedSentiment,
    report: BundleRiskReport,
  ): MemeRadarGeneratedSentiment {
    const normalizedRiskFlags = [...sentiment.riskFlags];
    const severeFlagLabels: Record<BundleRiskFlag, string> = {
      COORDINATED_BUNDLE: "COORDINATED_BUNDLE detectado no padrao de funding",
      COMMUNITY_HEALTH_FAILURE: "Comunidade sem moderacao confiavel",
      EARLY_DUMP_TRAP: "EARLY_DUMP_TRAP: MC baixo com wallets agressivas",
      FAKE_HOLDERS_WARNING: "FAKE_HOLDERS_WARNING por baixa atividade relativa",
      HIGH_CONCENTRATION_RISK: "HIGH_CONCENTRATION_RISK por concentracao >4%",
      SYMMETRIC_BUNDLE_DETECTED: "SYMMETRIC_BUNDLE_DETECTED no top 10",
      VAMP_SCAM: "VAMP_SCAM sinalizado por ticker parasita",
    };

    for (const flag of report.flags) {
      const label = severeFlagLabels[flag];

      if (!normalizedRiskFlags.some((risk) => risk.includes(label))) {
        normalizedRiskFlags.push(label);
      }
    }

    const riskPenalty = (100 - report.riskScore) * 0.38;
    const confidencePenalty = (100 - report.riskScore) * 0.46;
    const confidence =
      report.flags.includes("COMMUNITY_HEALTH_FAILURE")
        ? 0
        : clamp(toRounded(sentiment.confidence - confidencePenalty, 1), 0, 100);
    const hypeScore = clamp(toRounded(sentiment.hypeScore - riskPenalty, 1), 0, 100);
    const oneLineSummary = normalizeWhitespace(
      report.warningMessage
        ? `${sentiment.oneLineSummary} ${report.warningMessage}`
        : sentiment.oneLineSummary,
    ).slice(0, 180);

    return {
      ...sentiment,
      classification: resolveClassificationFromScore(hypeScore),
      confidence,
      hypeScore,
      oneLineSummary,
      riskFlags: sanitizeRiskOrCatalyst(normalizedRiskFlags),
    };
  }

  private buildHeuristicSentiment(pair: MemeRadarPairCandidate): MemeRadarGeneratedSentiment {
    const liquidity = pair.metrics.liquidityUsd ?? 0;
    const volume24h = pair.metrics.volume24hUsd ?? 0;
    const txns24h = pair.metrics.txns24h ?? 0;
    const absolutePriceChange = Math.abs(pair.metrics.priceChange24hPct ?? 0);
    const fdv = pair.metrics.fdvUsd ?? pair.metrics.marketCapUsd ?? 0;
    const ageHours = this.computeAgeHours(pair);
    const socialCount = pair.socials.length;
    const socialWebScore = pair.socialWebScore;
    const socialWebMentions = pair.socialWebMentions;

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
    const webSignalBoost = clamp(socialWebScore * 0.18 + socialWebMentions * 1.8, 0, 18);
    const valuationPenalty = fdv > 0 && liquidity > 0 && fdv / Math.max(liquidity, 1) > 40 ? 8 : 0;
    const thinLiquidityPenalty = liquidity > 0 && liquidity < 30_000 ? 12 : liquidity < 80_000 ? 6 : 0;
    const lifecyclePenalty = pair.poolStatus === "rugged" ? 55 : pair.poolStatus === "delisted" ? 26 : 0;
    const honeypotPenalty = pair.securityStatus === "honeypot" ? 70 : 0;

    const hypeScore = clamp(
      toRounded(
        ageScore
          + liquidityScore
          + activityScore
          + volatilityScore
          + socialScore
          + webSignalBoost
          - valuationPenalty
          - thinLiquidityPenalty
          - lifecyclePenalty
          - honeypotPenalty,
        1,
      ),
      0,
      100,
    );
    const confidence = clamp(
      toRounded(
        36
          + liquidityScore * 1.1
          + socialScore * 1.3
          + webSignalBoost * 1.1
          - thinLiquidityPenalty * 0.9
          - lifecyclePenalty * 0.7
          - honeypotPenalty * 0.85,
        1,
      ),
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

    if (socialWebMentions >= 2) {
      catalysts.push("Sinais sociais web ativos (X/Telegram/communities)");
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

    if (socialWebMentions === 0) {
      riskFlags.push("Baixa tracao social organica no monitoramento web");
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

  private applyGuardrailsToSentiment(
    pair: Pick<MemeRadarPairCandidate, "poolStatus" | "poolStatusReason" | "securityStatus" | "securityStatusReason">,
    sentiment: MemeRadarGeneratedSentiment,
  ): MemeRadarGeneratedSentiment {
    let adjustedHypeScore = sentiment.hypeScore;
    let adjustedConfidence = sentiment.confidence;

    if (pair.poolStatus === "rugged") {
      adjustedHypeScore = Math.min(adjustedHypeScore, 12);
      adjustedConfidence = Math.min(adjustedConfidence, 18);
    } else if (pair.poolStatus === "delisted") {
      adjustedHypeScore = Math.min(adjustedHypeScore, 34);
      adjustedConfidence = Math.min(adjustedConfidence, 42);
    }

    if (pair.securityStatus === "honeypot") {
      adjustedHypeScore = Math.min(adjustedHypeScore, 8);
      adjustedConfidence = Math.min(adjustedConfidence, 14);
    }

    const guardedSummary = normalizeWhitespace(
      pair.securityStatus === "honeypot"
        ? `${sentiment.oneLineSummary} Potencial bloqueio de venda identificado.`
        : pair.poolStatus !== "alive"
          ? `${sentiment.oneLineSummary} Pool com status de risco operacional.`
          : sentiment.oneLineSummary,
    ).slice(0, 180);

    return {
      ...sentiment,
      classification: resolveClassificationFromScore(adjustedHypeScore),
      confidence: clamp(toRounded(adjustedConfidence, 1), 0, 100),
      hypeScore: clamp(toRounded(adjustedHypeScore, 1), 0, 100),
      oneLineSummary: guardedSummary,
      riskFlags: applyPoolAndSecurityRiskFlags(sentiment.riskFlags, pair),
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
            poolStatus: pair.poolStatus,
            poolStatusReason: pair.poolStatusReason,
            quoteSymbol: pair.quoteSymbol,
            securityStatus: pair.securityStatus,
            securityStatusReason: pair.securityStatusReason,
            socialWebEvidence: pair.socialWebEvidence,
            socialWebMentions: pair.socialWebMentions,
            socialWebScore: pair.socialWebScore,
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
        bundleRiskReport: candidate.bundleRiskReport,
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
        const rawRiskFlags = Array.isArray(row.risk_flags) ? row.risk_flags : [];
        const fallbackSentiment = deriveSentimentFallback(
          typeof row.last_score === "string" ? Number.parseFloat(row.last_score) : row.last_score,
          row.summary,
          rawRiskFlags,
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

        const poolStatus = resolvePoolStatusFromRiskFlags(rawRiskFlags, row.pair_url);
        const poolStatusReason =
          extractPoolStatusReasonFromRiskFlags(rawRiskFlags, poolStatus)
          ?? (poolStatus === "delisted" && !row.pair_url
            ? "Par sem URL ativa no DexScreener durante a ultima leitura."
            : null);
        const securityStatus = resolveSecurityStatusFromRiskFlags(rawRiskFlags);
        const securityStatusReason = extractSecurityReasonFromRiskFlags(rawRiskFlags);

        const pair: MemeRadarPairCandidate = {
          chain: row.chain,
          dexId: row.dex_id,
          discoveredAt: normalizeIsoString(row.discovered_at, nowIso),
          fingerprint: row.pair_fingerprint,
          launchedAt: normalizeIsoStringOrNull(row.launched_at),
          metrics: ensureMetricSnapshot(row.metrics),
          pairAddress: row.pair_address,
          pairUrl: row.pair_url,
          poolStatus,
          poolStatusReason,
          quoteSymbol: row.quote_token_symbol,
          securityStatus,
          securityStatusReason,
          socialWebEvidence: [],
          socialWebMentions: 0,
          socialWebScore: 0,
          socials: parseSocialLinks(row.socials),
          sources: Array.isArray(row.sources) ? row.sources.slice(0, 6) : [],
          token: {
            address: row.token_address,
            name: row.token_name,
            symbol: row.token_symbol,
          },
        };

        const riskFlags = applyPoolAndSecurityRiskFlags(rawRiskFlags, {
          poolStatus: pair.poolStatus,
          poolStatusReason: pair.poolStatusReason,
          securityStatus: pair.securityStatus,
          securityStatusReason: pair.securityStatusReason,
        });

        return {
          bundleRiskReport: null,
          catalysts: row.catalysts,
          headline: row.headline,
          pair,
          pinned: row.pinned,
          priority: row.priority,
          riskFlags,
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
    const resolvedPoolStatus =
      record.pair.poolStatus === "alive" && !record.pair.pairUrl
        ? "delisted"
        : record.pair.poolStatus;
    const resolvedPoolStatusReason =
      resolvedPoolStatus === "delisted" && !record.pair.poolStatusReason && !record.pair.pairUrl
        ? "Pool sem URL valida para negociacao no DexScreener."
        : record.pair.poolStatusReason;
    const resolvedSecurityStatus = record.pair.securityStatus;
    const resolvedSecurityStatusReason = record.pair.securityStatusReason;
    const actionable = isPairActionableForUi({
      pairUrl: record.pair.pairUrl,
      poolStatus: resolvedPoolStatus,
      securityStatus: resolvedSecurityStatus,
    });
    const riskFlags = applyPoolAndSecurityRiskFlags(record.riskFlags, {
      poolStatus: resolvedPoolStatus,
      poolStatusReason: resolvedPoolStatusReason,
      securityStatus: resolvedSecurityStatus,
      securityStatusReason: resolvedSecurityStatusReason,
    });

    return {
      actionable,
      bundleRiskReport: record.bundleRiskReport,
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
      poolStatus: toApiPoolStatus(resolvedPoolStatus),
      poolStatusReason: resolvedPoolStatusReason,
      priority: record.priority,
      quoteSymbol: record.pair.quoteSymbol,
      riskFlags,
      securityStatus: toApiSecurityStatus(resolvedSecurityStatus),
      securityStatusReason: resolvedSecurityStatusReason,
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
