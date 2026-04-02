import { z } from "zod";

import { env } from "../../shared/config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { retryWithExponentialBackoff } from "../../shared/resilience/retry-with-backoff.js";

const yahooQuoteRequestSchema = z.object({
  symbols: z.array(z.string().trim().min(1).max(32)).min(1).max(20),
});

const yahooQuoteResultSchema = z.object({
  currency: z.string().optional(),
  longName: z.string().optional(),
  marketState: z.string().optional(),
  regularMarketChange: z.number().nullable().optional(),
  regularMarketChangePercent: z.number().nullable().optional(),
  regularMarketPreviousClose: z.number().nullable().optional(),
  regularMarketPrice: z.number().nullable().optional(),
  regularMarketTime: z.number().int().nonnegative().nullable().optional(),
  shortName: z.string().optional(),
  symbol: z.string().trim().min(1),
});

const yahooQuoteResponseSchema = z.object({
  quoteResponse: z.object({
    error: z.unknown().nullable().optional(),
    result: z.array(yahooQuoteResultSchema),
  }),
});

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
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

function shouldRetryYahooRequest(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return true;
  }

  if (error.code === "YAHOO_FINANCE_UNAVAILABLE") {
    return true;
  }

  if (error.code === "YAHOO_FINANCE_BAD_STATUS" && hasRetryableFlag(error.details)) {
    return error.details.retryable === true;
  }

  return false;
}

function normalizeOptionalNumber(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Number.isFinite(value) ? value : null;
}

function normalizeOptionalString(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function toIsoFromUnixSeconds(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return new Date(value * 1000).toISOString();
}

export interface YahooMarketQuote {
  change: number | null;
  changePercent: number | null;
  currency: string | null;
  marketState: string | null;
  name: string;
  previousClose: number | null;
  price: number;
  provider: "yahoo_finance";
  regularMarketTime: string | null;
  symbol: string;
}

export interface YahooMarketSnapshot {
  fetchedAt: string;
  missingSymbols: string[];
  provider: "yahoo_finance";
  quotes: YahooMarketQuote[];
  requestedSymbols: string[];
}

export class YahooMarketDataAdapter {
  public async getMarketSnapshot(input: { symbols: string[] }): Promise<YahooMarketSnapshot> {
    const parsedInput = yahooQuoteRequestSchema.parse(input);
    const requestedSymbols = [...new Set(parsedInput.symbols.map(normalizeSymbol))];
    const query = new URLSearchParams({
      symbols: requestedSymbols.join(","),
    });
    const payload = await this.requestJson(`/v7/finance/quote?${query.toString()}`);
    const parsedPayload = yahooQuoteResponseSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new AppError({
        code: "YAHOO_FINANCE_SCHEMA_MISMATCH",
        details: {
          issues: parsedPayload.error.issues,
          retryable: false,
        },
        message: "Yahoo Finance payload schema mismatch",
        statusCode: 502,
      });
    }

    const parsedQuotes = parsedPayload.data.quoteResponse.result;
    const quotesBySymbol = new Map<string, YahooMarketQuote>();

    for (const quotePayload of parsedQuotes) {
      const parsedQuote = this.toQuote(quotePayload);

      if (!parsedQuote) {
        continue;
      }

      quotesBySymbol.set(parsedQuote.symbol, parsedQuote);
    }

    const quotes = requestedSymbols
      .map((symbol) => quotesBySymbol.get(symbol) ?? null)
      .filter((quote): quote is YahooMarketQuote => quote !== null);
    const missingSymbols = requestedSymbols.filter((symbol) => !quotesBySymbol.has(symbol));

    if (quotes.length === 0) {
      throw new AppError({
        code: "YAHOO_FINANCE_EMPTY_QUOTES",
        details: {
          missingSymbols,
          requestedSymbols,
          retryable: true,
        },
        message: "Yahoo Finance returned no market quotes",
        statusCode: 503,
      });
    }

    return {
      fetchedAt: new Date().toISOString(),
      missingSymbols,
      provider: "yahoo_finance",
      quotes,
      requestedSymbols,
    };
  }

  private async requestJson(path: string): Promise<unknown> {
    return retryWithExponentialBackoff(
      () => this.requestJsonOnce(path),
      {
        attempts: 3,
        baseDelayMs: 250,
        jitterPercent: 20,
        shouldRetry: shouldRetryYahooRequest,
      },
    );
  }

  private async requestJsonOnce(path: string): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(`${env.YAHOO_FINANCE_API_BASE_URL}${path}`, {
        method: "GET",
        signal: AbortSignal.timeout(env.YAHOO_FINANCE_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppError({
        code: "YAHOO_FINANCE_UNAVAILABLE",
        details: {
          cause: error,
          retryable: true,
        },
        message: "Yahoo Finance request failed",
        statusCode: 503,
      });
    }

    if (!response.ok) {
      const responseText = await response.text();
      const retryable = isRetryableStatusCode(response.status);

      throw new AppError({
        code: "YAHOO_FINANCE_BAD_STATUS",
        details: {
          path,
          responseBody: responseText.slice(0, 1000),
          responseStatus: response.status,
          retryable,
        },
        message: "Yahoo Finance returned a non-success status",
        statusCode: retryable ? 503 : 502,
      });
    }

    try {
      const responseText = await response.text();
      return JSON.parse(responseText) as unknown;
    } catch {
      throw new AppError({
        code: "YAHOO_FINANCE_INVALID_JSON",
        details: {
          path,
          retryable: true,
        },
        message: "Yahoo Finance returned invalid JSON",
        statusCode: 502,
      });
    }
  }

  private toQuote(payload: z.infer<typeof yahooQuoteResultSchema>): YahooMarketQuote | null {
    const symbol = normalizeSymbol(payload.symbol);
    const price = normalizeOptionalNumber(payload.regularMarketPrice);

    if (price === null) {
      return null;
    }

    const displayName =
      normalizeOptionalString(payload.longName) ??
      normalizeOptionalString(payload.shortName) ??
      symbol;

    return {
      change: normalizeOptionalNumber(payload.regularMarketChange),
      changePercent: normalizeOptionalNumber(payload.regularMarketChangePercent),
      currency: normalizeOptionalString(payload.currency),
      marketState: normalizeOptionalString(payload.marketState),
      name: displayName,
      previousClose: normalizeOptionalNumber(payload.regularMarketPreviousClose),
      price,
      provider: "yahoo_finance",
      regularMarketTime: toIsoFromUnixSeconds(payload.regularMarketTime),
      symbol,
    };
  }
}