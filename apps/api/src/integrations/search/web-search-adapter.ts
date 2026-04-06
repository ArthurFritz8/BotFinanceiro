import { z } from "zod";

import { env } from "../../shared/config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { retryWithExponentialBackoff } from "../../shared/resilience/retry-with-backoff.js";

const webSearchInputSchema = z.object({
  maxResults: z.number().int().min(1).max(12).default(6),
  query: z.string().trim().min(2).max(220),
});

const tavilySearchResultSchema = z.object({
  content: z.string().optional(),
  score: z.number().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
});

const tavilySearchPayloadSchema = z.object({
  results: z.array(tavilySearchResultSchema).optional(),
});

const serperSearchResultSchema = z.object({
  link: z.string().optional(),
  snippet: z.string().optional(),
  title: z.string().optional(),
});

const serperSearchPayloadSchema = z.object({
  news: z.array(serperSearchResultSchema).optional(),
  organic: z.array(serperSearchResultSchema).optional(),
});

const serpApiSearchResultSchema = z.object({
  link: z.string().optional(),
  snippet: z.string().optional(),
  title: z.string().optional(),
});

const serpApiSearchPayloadSchema = z.object({
  news_results: z.array(serpApiSearchResultSchema).optional(),
  organic_results: z.array(serpApiSearchResultSchema).optional(),
});

const duckDuckGoInstantPayloadSchema = z.object({
  AbstractText: z.string().optional(),
  AbstractURL: z.string().optional(),
  Heading: z.string().optional(),
  RelatedTopics: z.array(z.record(z.string(), z.unknown())).optional(),
  Results: z.array(z.record(z.string(), z.unknown())).optional(),
});

type WebSearchProvider = "duckduckgo" | "serpapi" | "serper" | "tavily";
type WebSearchConfidenceLabel = "high" | "low" | "medium";
type WebSearchSourceType =
  | "community"
  | "exchange"
  | "market_data"
  | "news"
  | "official"
  | "research"
  | "unknown";

type MarketContext = "commodities" | "crypto" | "defi" | "equities" | "fixed_income" | "forex" | "general" | "macro";

interface WebSearchRawResultItem {
  snippet: string;
  title: string;
  url: string;
}

interface DomainRule {
  confidenceScore: number;
  matcher: RegExp;
  sourceType: WebSearchSourceType;
}

interface ContextMatcherRule {
  context: Exclude<MarketContext, "general">;
  matcher: RegExp;
}

interface ContextualDomainRule {
  contextAdjustments: Partial<Record<MarketContext, number>>;
  matcher: RegExp;
}

const domainRules: DomainRule[] = [
  {
    confidenceScore: 95,
    matcher: /(^|\.)[a-z0-9-]+\.gov(\.[a-z]{2})?$/,
    sourceType: "official",
  },
  {
    confidenceScore: 94,
    matcher: /(^|\.)coinbase\.com$/,
    sourceType: "exchange",
  },
  {
    confidenceScore: 94,
    matcher: /(^|\.)binance\.com$/,
    sourceType: "exchange",
  },
  {
    confidenceScore: 93,
    matcher: /(^|\.)kraken\.com$/,
    sourceType: "exchange",
  },
  {
    confidenceScore: 93,
    matcher: /(^|\.)okx\.com$/,
    sourceType: "exchange",
  },
  {
    confidenceScore: 92,
    matcher: /(^|\.)coingecko\.com$/,
    sourceType: "market_data",
  },
  {
    confidenceScore: 91,
    matcher: /(^|\.)coinmarketcap\.com$/,
    sourceType: "market_data",
  },
  {
    confidenceScore: 90,
    matcher: /(^|\.)geckoterminal\.com$/,
    sourceType: "market_data",
  },
  {
    confidenceScore: 89,
    matcher: /(^|\.)dexscreener\.com$/,
    sourceType: "market_data",
  },
  {
    confidenceScore: 88,
    matcher: /(^|\.)defillama\.com$/,
    sourceType: "research",
  },
  {
    confidenceScore: 87,
    matcher: /(^|\.)github\.com$/,
    sourceType: "research",
  },
  {
    confidenceScore: 86,
    matcher: /(^|\.)docs\./,
    sourceType: "official",
  },
  {
    confidenceScore: 82,
    matcher: /(^|\.)reuters\.com$/,
    sourceType: "news",
  },
  {
    confidenceScore: 82,
    matcher: /(^|\.)bloomberg\.com$/,
    sourceType: "news",
  },
  {
    confidenceScore: 70,
    matcher: /(^|\.)wikipedia\.org$/,
    sourceType: "research",
  },
  {
    confidenceScore: 45,
    matcher: /(^|\.)medium\.com$/,
    sourceType: "community",
  },
  {
    confidenceScore: 38,
    matcher: /(^|\.)reddit\.com$/,
    sourceType: "community",
  },
  {
    confidenceScore: 34,
    matcher: /(^|\.)x\.com$|(^|\.)twitter\.com$|(^|\.)t\.me$|(^|\.)discord\.gg$/,
    sourceType: "community",
  },
];

const queryContextMatcherRules: ContextMatcherRule[] = [
  {
    context: "crypto",
    matcher:
      /\b(crypto|cripto|token|altcoin|bitcoin|btc|ethereum|eth|solana|airdrop|onchain|blockchain|memecoin|meme\s*coin|cex|dex|wallet|stablecoin|swap|bridge)\b/,
  },
  {
    context: "defi",
    matcher: /\b(defi|tvl|liquidity|liquidez|pool|staking|farm|apr|apy|amm|lending|protocol)\b/,
  },
  {
    context: "equities",
    matcher:
      /\b(acao|acoes|stock|stocks|equity|equities|nasdaq|nyse|earnings|guidance|dividend|ticker|sp500|s&p\s*500|ibovespa|b3|balanco)\b/,
  },
  {
    context: "forex",
    matcher:
      /\b(forex|fx|cambio|exchange\s*rate|usdbrl|usdbrl|eurusd|dolar|euro|yen|iene|libra|moeda|currenc(y|ies))\b/,
  },
  {
    context: "fixed_income",
    matcher:
      /\b(renda\s*f ixa|renda\s*fixa|bond|bonds|treasury|yield\s*curve|duration|coupon|cupom|selic|juros|ntn-b|ltn|fed\s*funds)\b/,
  },
  {
    context: "commodities",
    matcher:
      /\b(commodity|commodities|oil|petroleo|brent|wti|gold|ouro|silver|prata|copper|cobre|soybean|soja|milho|natural\s*gas)\b/,
  },
  {
    context: "macro",
    matcher:
      /\b(macro|inflacao|inflation|cpi|pce|payroll|gdp|pib|fomc|ecb|bce|banco\s*central|economia|vix|taxa\s*de\s*juros)\b/,
  },
];

const sourceTypeContextAdjustments: Record<MarketContext, Partial<Record<WebSearchSourceType, number>>> = {
  commodities: {
    community: -5,
    news: 5,
    official: 4,
    research: 4,
  },
  crypto: {
    community: -4,
    exchange: 6,
    market_data: 5,
    official: 2,
  },
  defi: {
    community: -4,
    market_data: 3,
    official: 4,
    research: 6,
  },
  equities: {
    community: -5,
    market_data: 3,
    news: 6,
    official: 6,
  },
  fixed_income: {
    community: -5,
    news: 3,
    official: 8,
    research: 5,
  },
  forex: {
    community: -5,
    market_data: 3,
    news: 4,
    official: 7,
  },
  general: {},
  macro: {
    community: -5,
    news: 5,
    official: 7,
    research: 4,
  },
};

const contextualDomainRules: ContextualDomainRule[] = [
  {
    contextAdjustments: {
      equities: 10,
      fixed_income: 10,
      forex: 9,
      macro: 10,
    },
    matcher: /(^|\.)[a-z0-9-]+\.gov(\.[a-z]{2})?$/,
  },
  {
    contextAdjustments: {
      crypto: 8,
      defi: 6,
      equities: -10,
      fixed_income: -10,
      forex: -8,
      macro: -8,
    },
    matcher:
      /(^|\.)coingecko\.com$|(^|\.)coinmarketcap\.com$|(^|\.)geckoterminal\.com$|(^|\.)dexscreener\.com$|(^|\.)coinbase\.com$|(^|\.)binance\.com$|(^|\.)kraken\.com$|(^|\.)okx\.com$/,
  },
  {
    contextAdjustments: {
      commodities: 8,
      equities: 9,
      fixed_income: 8,
      forex: 7,
      macro: 10,
    },
    matcher: /(^|\.)reuters\.com$|(^|\.)bloomberg\.com$|(^|\.)wsj\.com$|(^|\.)ft\.com$|(^|\.)cnbc\.com$/,
  },
  {
    contextAdjustments: {
      equities: 10,
      fixed_income: 9,
      macro: 7,
    },
    matcher: /(^|\.)sec\.gov$|(^|\.)investor\.[a-z0-9-]+\.[a-z]{2,}$/,
  },
  {
    contextAdjustments: {
      commodities: 4,
      equities: 8,
      fixed_income: 8,
      forex: 7,
      macro: 8,
    },
    matcher: /(^|\.)finance\.yahoo\.com$|(^|\.)marketwatch\.com$|(^|\.)tradingeconomics\.com$/,
  },
  {
    contextAdjustments: {
      fixed_income: 11,
      forex: 11,
      macro: 11,
    },
    matcher:
      /(^|\.)federalreserve\.gov$|(^|\.)ecb\.europa\.eu$|(^|\.)bcb\.gov\.br$|(^|\.)bis\.org$|(^|\.)imf\.org$|(^|\.)worldbank\.org$|(^|\.)oecd\.org$/,
  },
  {
    contextAdjustments: {
      defi: 10,
      fixed_income: -6,
      forex: -6,
      macro: -5,
    },
    matcher: /(^|\.)defillama\.com$|(^|\.)dune\.com$|(^|\.)l2beat\.com$/,
  },
];

const lowTrustTerms = ["boato", "dificil dizer", "nao confirmado", "rumor", "speculative", "unverified"];
const highTrustTerms = ["audit", "contract", "docs", "documentation", "listing", "oficial", "official"];

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

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function removeHtmlTags(value: string): string {
  return collapseWhitespace(value.replace(/<[^>]*>/g, " "));
}

function readStringField(record: Record<string, unknown>, fieldName: string): string | null {
  const fieldValue = record[fieldName];

  if (typeof fieldValue !== "string") {
    return null;
  }

  const sanitizedValue = collapseWhitespace(fieldValue);
  return sanitizedValue.length > 0 ? sanitizedValue : null;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

function buildTitleFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname.replace(/^www\./, "");

    return domain.length > 0 ? domain : url;
  } catch {
    return url;
  }
}

function ensureAbsoluteUrl(url: string): string {
  if (isHttpUrl(url)) {
    return url;
  }

  return "";
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function canonicalizeUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.hash = "";
    parsedUrl.search = "";

    const normalizedPathname = parsedUrl.pathname.replace(/\/+$/, "");
    const safePathname = normalizedPathname.length > 0 ? normalizedPathname : "/";

    return `${parsedUrl.protocol}//${parsedUrl.hostname.toLowerCase()}${safePathname}`;
  } catch {
    return url;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function detectMarketContexts(normalizedQuery: string): Set<MarketContext> {
  const contexts = new Set<MarketContext>();

  for (const contextRule of queryContextMatcherRules) {
    if (contextRule.matcher.test(normalizedQuery)) {
      contexts.add(contextRule.context);
    }
  }

  if (contexts.size === 0) {
    contexts.add("general");
  }

  return contexts;
}

function scoreContextSignalTerms(context: Exclude<MarketContext, "general">, textBlob: string): number {
  switch (context) {
    case "commodities":
      return /\b(brent|wti|futures|inventory|metals?)\b/.test(textBlob) ? 2 : 0;
    case "crypto":
      return /\b(token|pair|contract|onchain|chain|wallet|listing)\b/.test(textBlob) ? 2 : 0;
    case "defi":
      return /\b(tvl|liquidity|protocol|pool|staking|apy|apr)\b/.test(textBlob) ? 2 : 0;
    case "equities":
      return /\b(earnings|10-k|10-q|guidance|dividend|quarter)\b/.test(textBlob) ? 2 : 0;
    case "fixed_income":
      return /\b(yield|duration|coupon|treasury|curve|spread)\b/.test(textBlob) ? 2 : 0;
    case "forex":
      return /\b(fx|spot|exchange\s*rate|cross|usd|eur|jpy|gbp|brl)\b/.test(textBlob) ? 2 : 0;
    case "macro":
      return /\b(cpi|inflation|payroll|gdp|fomc|rates?|policy|central\s*bank)\b/.test(textBlob) ? 2 : 0;
    default:
      return 0;
  }
}

function scoreContextualRelevance(
  contexts: Set<MarketContext>,
  domain: string,
  sourceType: WebSearchSourceType,
  textBlob: string,
): number {
  const effectiveContexts = Array.from(contexts).filter(
    (context): context is Exclude<MarketContext, "general"> => context !== "general",
  );

  if (effectiveContexts.length === 0) {
    return 0;
  }

  let totalAdjustment = 0;

  for (const context of effectiveContexts) {
    totalAdjustment += sourceTypeContextAdjustments[context]?.[sourceType] ?? 0;

    for (const contextualDomainRule of contextualDomainRules) {
      if (!contextualDomainRule.matcher.test(domain)) {
        continue;
      }

      totalAdjustment += contextualDomainRule.contextAdjustments[context] ?? 0;
    }

    totalAdjustment += scoreContextSignalTerms(context, textBlob);
  }

  const averagedAdjustment = Math.round(totalAdjustment / effectiveContexts.length);
  return clamp(averagedAdjustment, -16, 16);
}

function scoreDomain(domain: string): { confidenceScore: number; sourceType: WebSearchSourceType } {
  if (domain.length === 0) {
    return {
      confidenceScore: 40,
      sourceType: "unknown",
    };
  }

  for (const domainRule of domainRules) {
    if (domainRule.matcher.test(domain)) {
      return {
        confidenceScore: domainRule.confidenceScore,
        sourceType: domainRule.sourceType,
      };
    }
  }

  return {
    confidenceScore: 56,
    sourceType: "unknown",
  };
}

function classifyConfidenceLabel(confidenceScore: number): WebSearchConfidenceLabel {
  if (confidenceScore >= 80) {
    return "high";
  }

  if (confidenceScore >= 55) {
    return "medium";
  }

  return "low";
}

function adjustConfidenceScore(
  baseScore: number,
  textBlob: string,
  sourceType: WebSearchSourceType,
  contextualDelta: number,
): number {
  let adjustedScore = baseScore;

  if (highTrustTerms.some((term) => textBlob.includes(term))) {
    adjustedScore += 4;
  }

  if (lowTrustTerms.some((term) => textBlob.includes(term))) {
    adjustedScore -= 20;
  }

  if (sourceType === "community") {
    adjustedScore = Math.min(adjustedScore, 52);
  }

  adjustedScore += contextualDelta;

  return clamp(adjustedScore, 12, 98);
}

export interface WebSearchResultItem {
  confidenceLabel: WebSearchConfidenceLabel;
  confidenceScore: number;
  domain: string;
  snippet: string;
  sourceType: WebSearchSourceType;
  title: string;
  url: string;
}

export interface WebSearchResponse {
  fetchedAt: string;
  provider: WebSearchProvider;
  query: string;
  results: WebSearchResultItem[];
}

export class WebSearchAdapter {
  public async search(input: z.input<typeof webSearchInputSchema>): Promise<WebSearchResponse> {
    const parsedInput = webSearchInputSchema.parse(input);
    const providerOrder = this.resolveProviderOrder();

    for (const provider of providerOrder) {
      try {
        const providerResults = await this.searchWithProvider(provider, parsedInput.query, parsedInput.maxResults);

        if (providerResults.length === 0) {
          continue;
        }

        const rankedResults = this.normalizeAndRankResults(providerResults, parsedInput.query, parsedInput.maxResults);

        if (rankedResults.length === 0) {
          continue;
        }

        return {
          fetchedAt: new Date().toISOString(),
          provider,
          query: parsedInput.query,
          results: rankedResults,
        };
      } catch (error) {
        if (provider === providerOrder[providerOrder.length - 1]) {
          throw error;
        }
      }
    }

    return {
      fetchedAt: new Date().toISOString(),
      provider: providerOrder[0] ?? "duckduckgo",
      query: parsedInput.query,
      results: [
        {
          confidenceLabel: "low",
          confidenceScore: 24,
          domain: "duckduckgo.com",
          snippet: "Busca global concluida sem resultado estruturado nos providers configurados.",
          sourceType: "unknown",
          title: "DuckDuckGo Search",
          url: `https://duckduckgo.com/?q=${encodeURIComponent(parsedInput.query)}`,
        },
      ],
    };
  }

  private async searchWithProvider(
    provider: WebSearchProvider,
    query: string,
    maxResults: number,
  ): Promise<WebSearchRawResultItem[]> {
    switch (provider) {
      case "tavily":
        return this.searchWithTavily(query, maxResults);
      case "serper":
        return this.searchWithSerper(query, maxResults);
      case "serpapi":
        return this.searchWithSerpApi(query, maxResults);
      case "duckduckgo":
      default:
        return this.searchWithDuckDuckGo(query);
    }
  }

  private resolveProviderOrder(): WebSearchProvider[] {
    const hasTavilyKey = env.WEB_SEARCH_TAVILY_API_KEY.trim().length >= 10;
    const hasSerperKey = env.WEB_SEARCH_SERPER_API_KEY.trim().length >= 10;
    const hasSerpApiKey = env.WEB_SEARCH_SERPAPI_API_KEY.trim().length >= 10;

    if (env.WEB_SEARCH_PROVIDER_STRATEGY === "duckduckgo_only") {
      return ["duckduckgo"];
    }

    if (env.WEB_SEARCH_PROVIDER_STRATEGY === "duckduckgo_then_tavily") {
      return hasTavilyKey ? ["duckduckgo", "tavily"] : ["duckduckgo"];
    }

    if (env.WEB_SEARCH_PROVIDER_STRATEGY === "tavily_then_serper_then_serpapi_then_duckduckgo") {
      const prioritizedProviders: WebSearchProvider[] = [];

      if (hasTavilyKey) {
        prioritizedProviders.push("tavily");
      }

      if (hasSerperKey) {
        prioritizedProviders.push("serper");
      }

      if (hasSerpApiKey) {
        prioritizedProviders.push("serpapi");
      }

      prioritizedProviders.push("duckduckgo");
      return prioritizedProviders;
    }

    return hasTavilyKey ? ["tavily", "duckduckgo"] : ["duckduckgo"];
  }

  private normalizeAndRankResults(
    rawItems: WebSearchRawResultItem[],
    query: string,
    maxResults: number,
  ): WebSearchResultItem[] {
    const dedupe = new Set<string>();
    const rankedResults: WebSearchResultItem[] = [];
    const queryContexts = detectMarketContexts(normalizeText(query));

    for (const rawItem of rawItems) {
      const url = ensureAbsoluteUrl(rawItem.url);
      const title = collapseWhitespace(rawItem.title);
      const snippet = removeHtmlTags(rawItem.snippet);

      if (url.length === 0 || title.length === 0 || snippet.length === 0) {
        continue;
      }

      const dedupeKey = canonicalizeUrl(url);

      if (dedupe.has(dedupeKey)) {
        continue;
      }

      dedupe.add(dedupeKey);

      const domain = extractDomain(url);
      const baseDomainScore = scoreDomain(domain);
      const textBlob = normalizeText(`${title} ${snippet}`);
      const contextualDelta = scoreContextualRelevance(queryContexts, domain, baseDomainScore.sourceType, textBlob);
      const confidenceScore = adjustConfidenceScore(
        baseDomainScore.confidenceScore,
        textBlob,
        baseDomainScore.sourceType,
        contextualDelta,
      );

      rankedResults.push({
        confidenceLabel: classifyConfidenceLabel(confidenceScore),
        confidenceScore,
        domain,
        snippet: snippet.slice(0, 280),
        sourceType: baseDomainScore.sourceType,
        title: title.slice(0, 140),
        url,
      });
    }

    rankedResults.sort((left, right) => {
      if (right.confidenceScore !== left.confidenceScore) {
        return right.confidenceScore - left.confidenceScore;
      }

      return left.domain.localeCompare(right.domain);
    });

    return rankedResults.slice(0, maxResults);
  }

  private async searchWithTavily(query: string, maxResults: number): Promise<WebSearchRawResultItem[]> {
    const payload = await this.requestTavily(query, maxResults);

    return (payload.results ?? [])
      .map((item) => {
        const title = collapseWhitespace(item.title ?? "");
        const snippet = collapseWhitespace(item.content ?? "");
        const url = ensureAbsoluteUrl(collapseWhitespace(item.url ?? ""));

        if (title.length === 0 || snippet.length === 0 || url.length === 0) {
          return null;
        }

        return {
          snippet,
          title,
          url,
        } satisfies WebSearchRawResultItem;
      })
      .filter((item): item is WebSearchRawResultItem => item !== null);
  }

  private async searchWithSerper(query: string, maxResults: number): Promise<WebSearchRawResultItem[]> {
    const payload = await this.requestSerper(query, maxResults);

    return [...(payload.organic ?? []), ...(payload.news ?? [])]
      .map((item) => {
        const title = collapseWhitespace(item.title ?? "");
        const snippet = collapseWhitespace(item.snippet ?? item.title ?? "");
        const url = ensureAbsoluteUrl(collapseWhitespace(item.link ?? ""));

        if (title.length === 0 || snippet.length === 0 || url.length === 0) {
          return null;
        }

        return {
          snippet,
          title,
          url,
        } satisfies WebSearchRawResultItem;
      })
      .filter((item): item is WebSearchRawResultItem => item !== null);
  }

  private async searchWithSerpApi(query: string, maxResults: number): Promise<WebSearchRawResultItem[]> {
    const payload = await this.requestSerpApi(query, maxResults);

    return [...(payload.organic_results ?? []), ...(payload.news_results ?? [])]
      .map((item) => {
        const title = collapseWhitespace(item.title ?? "");
        const snippet = collapseWhitespace(item.snippet ?? item.title ?? "");
        const url = ensureAbsoluteUrl(collapseWhitespace(item.link ?? ""));

        if (title.length === 0 || snippet.length === 0 || url.length === 0) {
          return null;
        }

        return {
          snippet,
          title,
          url,
        } satisfies WebSearchRawResultItem;
      })
      .filter((item): item is WebSearchRawResultItem => item !== null);
  }

  private async searchWithDuckDuckGo(query: string): Promise<WebSearchRawResultItem[]> {
    const payload = await this.requestDuckDuckGo(query);
    const results: WebSearchRawResultItem[] = [];

    const abstractText = collapseWhitespace(payload.AbstractText ?? "");
    const abstractUrl = ensureAbsoluteUrl(collapseWhitespace(payload.AbstractURL ?? ""));

    if (abstractText.length > 0 && abstractUrl.length > 0) {
      results.push({
        snippet: abstractText,
        title: collapseWhitespace(payload.Heading ?? "") || buildTitleFromUrl(abstractUrl),
        url: abstractUrl,
      });
    }

    for (const resultRecord of payload.Results ?? []) {
      const firstUrl = ensureAbsoluteUrl(readStringField(resultRecord, "FirstURL") ?? "");
      const text = removeHtmlTags(readStringField(resultRecord, "Text") ?? "");

      if (firstUrl.length === 0 || text.length === 0) {
        continue;
      }

      results.push({
        snippet: text,
        title: buildTitleFromUrl(firstUrl),
        url: firstUrl,
      });
    }

    const appendRelatedTopics = (topics: Array<Record<string, unknown>>): void => {
      for (const topicRecord of topics) {
        const nestedTopics = topicRecord.Topics;

        if (Array.isArray(nestedTopics)) {
          const normalizedNestedTopics = nestedTopics.filter(
            (topic): topic is Record<string, unknown> => typeof topic === "object" && topic !== null,
          );

          appendRelatedTopics(normalizedNestedTopics);
          continue;
        }

        const firstUrl = ensureAbsoluteUrl(readStringField(topicRecord, "FirstURL") ?? "");
        const text = removeHtmlTags(readStringField(topicRecord, "Text") ?? "");

        if (firstUrl.length === 0 || text.length === 0) {
          continue;
        }

        results.push({
          snippet: text,
          title: buildTitleFromUrl(firstUrl),
          url: firstUrl,
        });
      }
    };

    appendRelatedTopics(payload.RelatedTopics ?? []);

    return results;
  }

  private async requestTavily(
    query: string,
    maxResults: number,
  ): Promise<z.infer<typeof tavilySearchPayloadSchema>> {
    return retryWithExponentialBackoff(
      () => this.requestTavilyOnce(query, maxResults),
      {
        attempts: 2,
        baseDelayMs: 250,
        jitterPercent: 25,
        shouldRetry: shouldRetryWebSearchRequest,
      },
    );
  }

  private async requestTavilyOnce(
    query: string,
    maxResults: number,
  ): Promise<z.infer<typeof tavilySearchPayloadSchema>> {
    const requestUrl = `${env.WEB_SEARCH_TAVILY_API_BASE_URL}/search`;

    let response: Response;

    try {
      response = await fetch(requestUrl, {
        body: JSON.stringify({
          api_key: env.WEB_SEARCH_TAVILY_API_KEY,
          include_answer: false,
          include_images: false,
          include_raw_content: false,
          max_results: maxResults,
          query,
          search_depth: "basic",
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "BotFinanceiro/1.0 (+https://github.com/ArthurFritz8/BotFinanceiro)",
        },
        method: "POST",
        signal: AbortSignal.timeout(env.WEB_SEARCH_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppError({
        code: "WEB_SEARCH_UNAVAILABLE",
        details: {
          cause: error,
          provider: "tavily",
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
          provider: "tavily",
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
          provider: "tavily",
          query,
        },
        message: "Web search provider returned invalid JSON",
        statusCode: 502,
      });
    }

    const parsedPayload = tavilySearchPayloadSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new AppError({
        code: "WEB_SEARCH_SCHEMA_MISMATCH",
        details: {
          issues: parsedPayload.error.issues,
          provider: "tavily",
          query,
        },
        message: "Web search payload schema mismatch",
        statusCode: 502,
      });
    }

    return parsedPayload.data;
  }

  private async requestSerper(
    query: string,
    maxResults: number,
  ): Promise<z.infer<typeof serperSearchPayloadSchema>> {
    return retryWithExponentialBackoff(
      () => this.requestSerperOnce(query, maxResults),
      {
        attempts: 2,
        baseDelayMs: 250,
        jitterPercent: 25,
        shouldRetry: shouldRetryWebSearchRequest,
      },
    );
  }

  private async requestSerperOnce(
    query: string,
    maxResults: number,
  ): Promise<z.infer<typeof serperSearchPayloadSchema>> {
    const requestUrl = `${env.WEB_SEARCH_SERPER_API_BASE_URL}/search`;

    let response: Response;

    try {
      response = await fetch(requestUrl, {
        body: JSON.stringify({
          autocorrect: true,
          num: Math.min(Math.max(maxResults, 1), 10),
          q: query,
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "BotFinanceiro/1.0 (+https://github.com/ArthurFritz8/BotFinanceiro)",
          "X-API-KEY": env.WEB_SEARCH_SERPER_API_KEY,
        },
        method: "POST",
        signal: AbortSignal.timeout(env.WEB_SEARCH_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppError({
        code: "WEB_SEARCH_UNAVAILABLE",
        details: {
          cause: error,
          provider: "serper",
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
          provider: "serper",
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
          provider: "serper",
          query,
        },
        message: "Web search provider returned invalid JSON",
        statusCode: 502,
      });
    }

    const parsedPayload = serperSearchPayloadSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new AppError({
        code: "WEB_SEARCH_SCHEMA_MISMATCH",
        details: {
          issues: parsedPayload.error.issues,
          provider: "serper",
          query,
        },
        message: "Web search payload schema mismatch",
        statusCode: 502,
      });
    }

    return parsedPayload.data;
  }

  private async requestSerpApi(
    query: string,
    maxResults: number,
  ): Promise<z.infer<typeof serpApiSearchPayloadSchema>> {
    return retryWithExponentialBackoff(
      () => this.requestSerpApiOnce(query, maxResults),
      {
        attempts: 2,
        baseDelayMs: 250,
        jitterPercent: 25,
        shouldRetry: shouldRetryWebSearchRequest,
      },
    );
  }

  private async requestSerpApiOnce(
    query: string,
    maxResults: number,
  ): Promise<z.infer<typeof serpApiSearchPayloadSchema>> {
    const requestUrl = `${env.WEB_SEARCH_SERPAPI_API_BASE_URL}/search.json?${new URLSearchParams({
      api_key: env.WEB_SEARCH_SERPAPI_API_KEY,
      engine: "google",
      gl: "us",
      hl: "en",
      num: String(Math.min(Math.max(maxResults, 1), 10)),
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
          provider: "serpapi",
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
          provider: "serpapi",
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
          provider: "serpapi",
          query,
        },
        message: "Web search provider returned invalid JSON",
        statusCode: 502,
      });
    }

    const parsedPayload = serpApiSearchPayloadSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new AppError({
        code: "WEB_SEARCH_SCHEMA_MISMATCH",
        details: {
          issues: parsedPayload.error.issues,
          provider: "serpapi",
          query,
        },
        message: "Web search payload schema mismatch",
        statusCode: 502,
      });
    }

    return parsedPayload.data;
  }

  private async requestDuckDuckGo(query: string): Promise<z.infer<typeof duckDuckGoInstantPayloadSchema>> {
    return retryWithExponentialBackoff(
      () => this.requestDuckDuckGoOnce(query),
      {
        attempts: 2,
        baseDelayMs: 250,
        jitterPercent: 25,
        shouldRetry: shouldRetryWebSearchRequest,
      },
    );
  }

  private async requestDuckDuckGoOnce(query: string): Promise<z.infer<typeof duckDuckGoInstantPayloadSchema>> {
    const requestUrl = `${env.WEB_SEARCH_DUCKDUCKGO_API_BASE_URL}/?${new URLSearchParams({
      format: "json",
      no_html: "1",
      no_redirect: "1",
      q: query,
      skip_disambig: "1",
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
          provider: "duckduckgo",
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
          provider: "duckduckgo",
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
          provider: "duckduckgo",
          query,
        },
        message: "Web search provider returned invalid JSON",
        statusCode: 502,
      });
    }

    const parsedPayload = duckDuckGoInstantPayloadSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new AppError({
        code: "WEB_SEARCH_SCHEMA_MISMATCH",
        details: {
          issues: parsedPayload.error.issues,
          provider: "duckduckgo",
          query,
        },
        message: "Web search payload schema mismatch",
        statusCode: 502,
      });
    }

    return parsedPayload.data;
  }
}
