import { z } from "zod";

import { env } from "../../shared/config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { retryWithExponentialBackoff } from "../../shared/resilience/retry-with-backoff.js";

const webSearchInputSchema = z.object({
  maxResults: z.number().int().min(1).max(12).default(6),
  query: z.string().trim().min(2).max(220),
});

const duckDuckGoInstantPayloadSchema = z.object({
  AbstractText: z.string().optional(),
  AbstractURL: z.string().optional(),
  Heading: z.string().optional(),
  RelatedTopics: z.array(z.record(z.string(), z.unknown())).optional(),
  Results: z.array(z.record(z.string(), z.unknown())).optional(),
});

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

export interface WebSearchResultItem {
  snippet: string;
  title: string;
  url: string;
}

export interface WebSearchResponse {
  fetchedAt: string;
  provider: "duckduckgo";
  query: string;
  results: WebSearchResultItem[];
}

export class WebSearchAdapter {
  public async search(input: z.input<typeof webSearchInputSchema>): Promise<WebSearchResponse> {
    const parsedInput = webSearchInputSchema.parse(input);
    const payload = await this.requestDuckDuckGo(parsedInput.query);
    const results = this.extractSearchResults(parsedInput.query, payload, parsedInput.maxResults);

    return {
      fetchedAt: new Date().toISOString(),
      provider: "duckduckgo",
      query: parsedInput.query,
      results,
    };
  }

  private extractSearchResults(
    query: string,
    payload: z.infer<typeof duckDuckGoInstantPayloadSchema>,
    maxResults: number,
  ): WebSearchResultItem[] {
    const results: WebSearchResultItem[] = [];
    const dedupe = new Set<string>();

    const appendResult = (item: WebSearchResultItem): void => {
      const normalizedUrl = ensureAbsoluteUrl(item.url);

      if (normalizedUrl.length === 0 || dedupe.has(normalizedUrl)) {
        return;
      }

      dedupe.add(normalizedUrl);
      results.push({
        snippet: item.snippet.slice(0, 280),
        title: item.title.slice(0, 140),
        url: normalizedUrl,
      });
    };

    const abstractText = collapseWhitespace(payload.AbstractText ?? "");
    const abstractUrl = ensureAbsoluteUrl(collapseWhitespace(payload.AbstractURL ?? ""));

    if (abstractText.length > 0 && abstractUrl.length > 0) {
      appendResult({
        snippet: abstractText,
        title: collapseWhitespace(payload.Heading ?? "").slice(0, 140) || buildTitleFromUrl(abstractUrl),
        url: abstractUrl,
      });
    }

    for (const resultRecord of payload.Results ?? []) {
      const firstUrl = ensureAbsoluteUrl(readStringField(resultRecord, "FirstURL") ?? "");
      const text = removeHtmlTags(readStringField(resultRecord, "Text") ?? "");

      if (firstUrl.length === 0 || text.length === 0) {
        continue;
      }

      appendResult({
        snippet: text,
        title: buildTitleFromUrl(firstUrl),
        url: firstUrl,
      });

      if (results.length >= maxResults) {
        return results;
      }
    }

    const appendRelatedTopics = (topics: Array<Record<string, unknown>>): void => {
      for (const topicRecord of topics) {
        const nestedTopics = topicRecord.Topics;

        if (Array.isArray(nestedTopics)) {
          const normalizedNestedTopics = nestedTopics.filter(
            (topic): topic is Record<string, unknown> => typeof topic === "object" && topic !== null,
          );

          appendRelatedTopics(normalizedNestedTopics);

          if (results.length >= maxResults) {
            return;
          }

          continue;
        }

        const firstUrl = ensureAbsoluteUrl(readStringField(topicRecord, "FirstURL") ?? "");
        const text = removeHtmlTags(readStringField(topicRecord, "Text") ?? "");

        if (firstUrl.length === 0 || text.length === 0) {
          continue;
        }

        appendResult({
          snippet: text,
          title: buildTitleFromUrl(firstUrl),
          url: firstUrl,
        });

        if (results.length >= maxResults) {
          return;
        }
      }
    };

    appendRelatedTopics(payload.RelatedTopics ?? []);

    if (results.length === 0) {
      const fallbackQueryUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;

      appendResult({
        snippet: "Busca global concluida sem resultado estruturado no endpoint instantaneo.",
        title: "DuckDuckGo Search",
        url: fallbackQueryUrl,
      });
    }

    return results.slice(0, maxResults);
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
          query,
        },
        message: "Web search payload schema mismatch",
        statusCode: 502,
      });
    }

    return parsedPayload.data;
  }
}
