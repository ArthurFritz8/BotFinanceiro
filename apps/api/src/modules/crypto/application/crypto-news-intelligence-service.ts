import { z } from "zod";

import { env } from "../../../shared/config/env.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { memoryCache } from "../../../shared/cache/memory-cache.js";

const newsIntelligenceInputSchema = z.object({
  assetId: z.string().trim().min(1).transform((value) => value.toLowerCase()).default("bitcoin"),
  limit: z.number().int().min(3).max(20).default(8),
});

interface NewsSourceDefinition {
  key: string;
  label: string;
  url: string;
}

export type CryptoNewsSentiment = "negative" | "neutral" | "positive";

export interface CryptoNewsIntelligenceItem {
  id: string;
  impactScore: number;
  publishedAt: string;
  relevanceScore: number;
  sentiment: CryptoNewsSentiment;
  source: string;
  summary: string;
  tags: string[];
  title: string;
  url: string;
}

export interface CryptoNewsIntelligenceSummary {
  averageImpactScore: number;
  averageRelevanceScore: number;
  highImpactItems: number;
  sourcesHealthy: number;
  totalItems: number;
  totalSources: number;
}

export interface CryptoNewsIntelligenceResponse {
  assetId: string;
  cache: {
    stale: boolean;
    state: "fresh" | "miss" | "refreshed" | "stale";
  };
  fetchedAt: string;
  items: CryptoNewsIntelligenceItem[];
  limit: number;
  provider: "rss_multi_source";
  summary: CryptoNewsIntelligenceSummary;
}

interface CachedNewsIntelligencePayload {
  assetId: string;
  fetchedAt: string;
  items: CryptoNewsIntelligenceItem[];
  limit: number;
  provider: "rss_multi_source";
  summary: CryptoNewsIntelligenceSummary;
}

interface ParsedRssItem {
  id: string;
  publishedAt: string;
  source: string;
  summary: string;
  title: string;
  url: string;
}

const newsSources: NewsSourceDefinition[] = [
  {
    key: "coindesk",
    label: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
  },
  {
    key: "cointelegraph",
    label: "Cointelegraph",
    url: "https://cointelegraph.com/rss",
  },
  {
    key: "decrypt",
    label: "Decrypt",
    url: "https://decrypt.co/feed",
  },
];

const assetAliasesById: Record<string, string[]> = {
  bitcoin: ["bitcoin", "btc", "xbt"],
  ethereum: ["ethereum", "eth", "ether"],
  solana: ["solana", "sol"],
  xrp: ["xrp", "ripple"],
  dogecoin: ["dogecoin", "doge"],
};

const highImpactKeywords = [
  "etf",
  "sec",
  "regulation",
  "regulator",
  "lawsuit",
  "hack",
  "exploit",
  "liquidation",
  "bankrupt",
  "fed",
  "cpi",
  "interest rate",
  "rate hike",
  "ban",
  "approval",
  "rejection",
];

const mediumImpactKeywords = [
  "upgrade",
  "fork",
  "partnership",
  "integration",
  "listing",
  "delisting",
  "staking",
  "airdrop",
  "governance",
  "roadmap",
  "launch",
  "release",
  "institutional",
  "adoption",
];

const positiveSentimentKeywords = [
  "surge",
  "rally",
  "gain",
  "bull",
  "bullish",
  "recovery",
  "adoption",
  "approval",
  "breakout",
  "uptrend",
  "record high",
];

const negativeSentimentKeywords = [
  "drop",
  "dump",
  "bear",
  "bearish",
  "selloff",
  "crash",
  "fear",
  "lawsuit",
  "hack",
  "exploit",
  "rejection",
  "outflow",
];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function stripHtml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function extractTagContent(input: string, tagName: string): string {
  const tagPattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = tagPattern.exec(input);

  if (!match || typeof match[1] !== "string") {
    return "";
  }

  return decodeEntities(stripHtml(match[1]));
}

function parsePublishedAt(value: string): string {
  if (value.length === 0) {
    return new Date().toISOString();
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return new Date().toISOString();
  }

  return parsedDate.toISOString();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function hasKeywordAsToken(tokens: string[], keyword: string): boolean {
  const normalizedKeyword = normalizeText(keyword);

  if (normalizedKeyword.includes(" ")) {
    return tokens.join(" ").includes(normalizedKeyword);
  }

  return tokens.includes(normalizedKeyword);
}

function countKeywordMatches(tokens: string[], keywords: string[]): number {
  let count = 0;

  for (const keyword of keywords) {
    if (hasKeywordAsToken(tokens, keyword)) {
      count += 1;
    }
  }

  return count;
}

function clampScore(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function resolveAssetAliases(assetId: string): string[] {
  const aliases = assetAliasesById[assetId] ?? [assetId];
  return [...new Set(aliases.map((item) => normalizeText(item)))];
}

function computeRelevanceScore(item: ParsedRssItem, assetAliases: string[]): number {
  const combinedText = `${item.title} ${item.summary}`;
  const normalizedText = normalizeText(combinedText);
  const tokens = tokenize(combinedText);

  let score = 8;

  for (const alias of assetAliases) {
    if (alias.length <= 4) {
      if (tokens.includes(alias)) {
        score += 35;
      }
      continue;
    }

    if (normalizedText.includes(alias)) {
      score += 42;
    }
  }

  const marketKeywords = ["crypto", "bitcoin", "ethereum", "market", "trading", "token", "blockchain"];
  score += countKeywordMatches(tokens, marketKeywords) * 4;

  return clampScore(score, 0, 100);
}

function computeImpactScore(item: ParsedRssItem): number {
  const text = `${item.title} ${item.summary}`;
  const tokens = tokenize(text);
  const highMatches = countKeywordMatches(tokens, highImpactKeywords);
  const mediumMatches = countKeywordMatches(tokens, mediumImpactKeywords);
  const baseScore = 26 + highMatches * 16 + mediumMatches * 8;

  return clampScore(baseScore, 0, 100);
}

function computeSentiment(item: ParsedRssItem): CryptoNewsSentiment {
  const text = `${item.title} ${item.summary}`;
  const tokens = tokenize(text);
  const positiveMatches = countKeywordMatches(tokens, positiveSentimentKeywords);
  const negativeMatches = countKeywordMatches(tokens, negativeSentimentKeywords);

  if (positiveMatches > negativeMatches) {
    return "positive";
  }

  if (negativeMatches > positiveMatches) {
    return "negative";
  }

  return "neutral";
}

function buildTags(item: ParsedRssItem): string[] {
  const text = `${item.title} ${item.summary}`;
  const tokens = tokenize(text);
  const tags: string[] = [];

  for (const keyword of highImpactKeywords) {
    if (hasKeywordAsToken(tokens, keyword)) {
      tags.push(keyword);
    }

    if (tags.length >= 6) {
      break;
    }
  }

  if (tags.length < 3) {
    for (const keyword of mediumImpactKeywords) {
      if (hasKeywordAsToken(tokens, keyword) && !tags.includes(keyword)) {
        tags.push(keyword);
      }

      if (tags.length >= 6) {
        break;
      }
    }
  }

  return tags;
}

function buildCacheKey(assetId: string, limit: number): string {
  return `crypto:news-intelligence:${assetId}:${limit}`;
}

function buildSummary(items: CryptoNewsIntelligenceItem[]): CryptoNewsIntelligenceSummary {
  if (items.length === 0) {
    return {
      averageImpactScore: 0,
      averageRelevanceScore: 0,
      highImpactItems: 0,
      sourcesHealthy: 0,
      totalItems: 0,
      totalSources: newsSources.length,
    };
  }

  const highImpactItems = items.filter((item) => item.impactScore >= 70).length;
  const averageImpactScore = round(
    items.reduce((accumulator, item) => accumulator + item.impactScore, 0) / items.length,
  );
  const averageRelevanceScore = round(
    items.reduce((accumulator, item) => accumulator + item.relevanceScore, 0) / items.length,
  );
  const healthySourceLabels = new Set(items.map((item) => item.source));

  return {
    averageImpactScore,
    averageRelevanceScore,
    highImpactItems,
    sourcesHealthy: healthySourceLabels.size,
    totalItems: items.length,
    totalSources: newsSources.length,
  };
}

function toResponse(
  payload: CachedNewsIntelligencePayload,
  state: "fresh" | "miss" | "refreshed" | "stale",
  stale: boolean,
): CryptoNewsIntelligenceResponse {
  return {
    assetId: payload.assetId,
    cache: {
      stale,
      state,
    },
    fetchedAt: payload.fetchedAt,
    items: payload.items,
    limit: payload.limit,
    provider: payload.provider,
    summary: payload.summary,
  };
}

function parseRssItems(xmlPayload: string, source: NewsSourceDefinition): ParsedRssItem[] {
  const itemMatches = xmlPayload.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const parsedItems: ParsedRssItem[] = [];

  for (const [index, itemXml] of itemMatches.entries()) {
    const title = extractTagContent(itemXml, "title");
    const url = extractTagContent(itemXml, "link");
    const summary = extractTagContent(itemXml, "description");
    const publishedAtRaw = extractTagContent(itemXml, "pubDate");

    if (title.length === 0 || url.length === 0) {
      continue;
    }

    parsedItems.push({
      id: `${source.key}:${url}:${index}`,
      publishedAt: parsePublishedAt(publishedAtRaw),
      source: source.label,
      summary: summary.slice(0, 280),
      title: title.slice(0, 180),
      url,
    });
  }

  return parsedItems;
}

export class CryptoNewsIntelligenceService {
  public async getNewsIntelligence(input?: {
    assetId?: string;
    limit?: number;
  }): Promise<CryptoNewsIntelligenceResponse> {
    const parsedInput = newsIntelligenceInputSchema.parse(input ?? {});
    const cacheKey = buildCacheKey(parsedInput.assetId, parsedInput.limit);
    const cachedPayload = memoryCache.get<CachedNewsIntelligencePayload>(cacheKey);

    if (cachedPayload.state === "fresh") {
      return toResponse(cachedPayload.value, "fresh", false);
    }

    if (cachedPayload.state === "stale") {
      try {
        return await this.refreshNewsIntelligence(parsedInput);
      } catch {
        return toResponse(cachedPayload.value, "stale", true);
      }
    }

    return this.refreshNewsIntelligence(parsedInput);
  }

  private async refreshNewsIntelligence(input: {
    assetId: string;
    limit: number;
  }): Promise<CryptoNewsIntelligenceResponse> {
    const aliases = resolveAssetAliases(input.assetId);
    const sourceResults = await Promise.all(
      newsSources.map(async (source) => {
        try {
          const xmlPayload = await this.requestSourceRss(source);
          const parsedItems = parseRssItems(xmlPayload, source);

          return {
            items: parsedItems,
            ok: true as const,
          };
        } catch {
          return {
            items: [] as ParsedRssItem[],
            ok: false as const,
          };
        }
      }),
    );

    const allItems = sourceResults.flatMap((result) => result.items);
    const scoredItems = allItems
      .map((item) => {
        const relevanceScore = computeRelevanceScore(item, aliases);
        const impactScore = computeImpactScore(item);
        const sentiment = computeSentiment(item);

        return {
          id: item.id,
          impactScore,
          publishedAt: item.publishedAt,
          relevanceScore,
          sentiment,
          source: item.source,
          summary: item.summary,
          tags: buildTags(item),
          title: item.title,
          url: item.url,
        } satisfies CryptoNewsIntelligenceItem;
      })
      .filter((item) => item.relevanceScore >= 18)
      .sort((left, right) => {
        const scoreDiff = right.relevanceScore + right.impactScore - (left.relevanceScore + left.impactScore);

        if (scoreDiff !== 0) {
          return scoreDiff;
        }

        return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
      })
      .slice(0, input.limit);

    const summary = buildSummary(scoredItems);
    const sourcesHealthy = sourceResults.filter((result) => result.ok).length;
    const payload: CachedNewsIntelligencePayload = {
      assetId: input.assetId,
      fetchedAt: new Date().toISOString(),
      items: scoredItems,
      limit: input.limit,
      provider: "rss_multi_source",
      summary: {
        ...summary,
        sourcesHealthy,
      },
    };
    const cacheKey = buildCacheKey(input.assetId, input.limit);

    memoryCache.set(cacheKey, payload, env.CACHE_DEFAULT_TTL_SECONDS, env.CACHE_STALE_SECONDS);

    return toResponse(payload, "refreshed", false);
  }

  private async requestSourceRss(source: NewsSourceDefinition): Promise<string> {
    let response: Response;

    try {
      response = await fetch(source.url, {
        headers: {
          Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
          "User-Agent": "BotFinanceiro/1.0 (+https://github.com/ArthurFritz8/BotFinanceiro)",
        },
        method: "GET",
        signal: AbortSignal.timeout(Math.max(4500, env.COINCAP_TIMEOUT_MS)),
      });
    } catch (error) {
      throw new AppError({
        code: "CRYPTO_NEWS_SOURCE_UNAVAILABLE",
        details: {
          cause: error,
          source: source.key,
          url: source.url,
        },
        message: `News source ${source.key} is unavailable`,
        statusCode: 503,
      });
    }

    if (!response.ok) {
      const responseText = await response.text();

      throw new AppError({
        code: "CRYPTO_NEWS_SOURCE_BAD_STATUS",
        details: {
          source: source.key,
          statusCode: response.status,
          url: source.url,
          preview: responseText.slice(0, 240),
        },
        message: `News source ${source.key} returned non-success status`,
        statusCode: 502,
      });
    }

    const responseText = await response.text();

    if (responseText.trim().length === 0) {
      throw new AppError({
        code: "CRYPTO_NEWS_SOURCE_EMPTY",
        details: {
          source: source.key,
          url: source.url,
        },
        message: `News source ${source.key} returned an empty payload`,
        statusCode: 502,
      });
    }

    return responseText;
  }
}
