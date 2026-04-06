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

const duckDuckGoInstantPayloadSchema = z.object({
  AbstractText: z.string().optional(),
  AbstractURL: z.string().optional(),
  Heading: z.string().optional(),
  RelatedTopics: z.array(z.record(z.string(), z.unknown())).optional(),
  Results: z.array(z.record(z.string(), z.unknown())).optional(),
});

type WebSearchProvider = "duckduckgo" | "tavily";
type WebSearchConfidenceLabel = "high" | "low" | "medium";
type WebSearchSourceType =
  | "community"
  | "exchange"
  | "market_data"
  | "news"
  | "official"
  | "research"
  | "unknown";

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

function adjustConfidenceScore(baseScore: number, textBlob: string, sourceType: WebSearchSourceType): number {
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
        const providerResults =
          provider === "tavily"
            ? await this.searchWithTavily(parsedInput.query, parsedInput.maxResults)
            : await this.searchWithDuckDuckGo(parsedInput.query);

        if (providerResults.length === 0) {
          continue;
        }

        const rankedResults = this.normalizeAndRankResults(providerResults, parsedInput.maxResults);

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

  private resolveProviderOrder(): WebSearchProvider[] {
    const hasTavilyKey = env.WEB_SEARCH_TAVILY_API_KEY.trim().length >= 10;

    if (env.WEB_SEARCH_PROVIDER_STRATEGY === "duckduckgo_only") {
      return ["duckduckgo"];
    }

    if (env.WEB_SEARCH_PROVIDER_STRATEGY === "duckduckgo_then_tavily") {
      return hasTavilyKey ? ["duckduckgo", "tavily"] : ["duckduckgo"];
    }

    return hasTavilyKey ? ["tavily", "duckduckgo"] : ["duckduckgo"];
  }

  private normalizeAndRankResults(rawItems: WebSearchRawResultItem[], maxResults: number): WebSearchResultItem[] {
    const dedupe = new Set<string>();
    const rankedResults: WebSearchResultItem[] = [];

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
      const confidenceScore = adjustConfidenceScore(
        baseDomainScore.confidenceScore,
        textBlob,
        baseDomainScore.sourceType,
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
