import { z } from "zod";

import {
  YahooMarketDataAdapter,
  type YahooMarketQuote,
} from "../../../integrations/market_data/yahoo-market-data-adapter.js";
import { env } from "../../../shared/config/env.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { logger } from "../../../shared/logger/logger.js";

// Simple in-memory cache with TTL
const forexCache = new Map<string, { value: ForexRateBatchResponse; expiresAt: number }>();
const FOREX_CACHE_TTL_MS = env.MARKET_OVERVIEW_CACHE_TTL_SECONDS * 1000;
const forexPairSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toUpperCase().replace(/[^A-Z]/g, ""))
  .refine((value) => value.length === 6, {
    message: "pair must contain 6 alphabetic characters",
  });

const forexPairsSchema = z
  .array(forexPairSchema)
  .min(1)
  .max(20)
  .transform((pairs) => [...new Set(pairs)]);

const forexMarketOverviewPresetSchema = z.enum(["majors", "latam", "europe", "asia", "global"]);

type ForexMarketOverviewPreset = z.infer<typeof forexMarketOverviewPresetSchema>;

export interface ForexRateSnapshot {
  baseCurrency: string;
  change24h: number | null;
  changePercent24h: number | null;
  fetchedAt: string;
  marketState: string | null;
  pair: string;
  previousClose: number | null;
  provider: "yahoo_finance";
  quoteCurrency: string;
  rate: number;
  regularMarketTime: string | null;
  yahooSymbol: string;
}

export interface ForexRateFailure {
  error: {
    code: "FOREX_PAIR_NOT_AVAILABLE";
    message: string;
  };
  pair: string;
  status: "error";
}

export interface ForexRateBatchItemSuccess {
  pair: string;
  quote: ForexRateSnapshot;
  status: "ok";
}

export type ForexRateBatchItem = ForexRateBatchItemSuccess | ForexRateFailure;

export interface ForexRateBatchResponse {
  failureCount: number;
  fetchedAt: string;
  pairs: string[];
  quotes: ForexRateBatchItem[];
  requestedPairs: string[];
  successCount: number;
}

export interface ForexMarketOverviewResponse {
  failureCount: number;
  fetchedAt: string;
  pairs: string[];
  preset: ForexMarketOverviewPreset;
  quotes: ForexRateBatchItem[];
  successCount: number;
  tableMarkdown: string;
}

const forexPresetPairs: Record<ForexMarketOverviewPreset, string[]> = {
  asia: ["USDJPY", "USDCNH", "USDINR", "USDKRW", "USDHKD", "USDTHB"],
  europe: ["EURUSD", "EURGBP", "EURCHF", "EURJPY", "GBPUSD", "USDCHF"],
  global: ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD", "USDBRL"],
  latam: ["USDBRL", "USDMXN", "USDCLP", "USDCOP", "USDARS", "USDPEN"],
  majors: ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD"],
};

const yahooMarketDataAdapter = new YahooMarketDataAdapter();

function toYahooSymbol(pair: string): string {
  return `${pair}=X`;
}

function fromYahooSymbol(symbol: string): string {
  return symbol
    .toUpperCase()
    .replace(/=X$/, "")
    .replace(/[^A-Z]/g, "");
}

function splitPair(pair: string): { baseCurrency: string; quoteCurrency: string } {
  return {
    baseCurrency: pair.slice(0, 3),
    quoteCurrency: pair.slice(3),
  };
}

function buildTableMarkdown(items: ForexRateBatchItem[]): string {
  const headers = ["Par", "Taxa", "Var 24h", "Mercado", "Fonte"];
  const separator = ["---", "---:", "---:", "---", "---"];

  const rows = items.map((item) => {
    if (item.status === "error") {
      return `| ${item.pair} | n/d | n/d | n/d | ${item.error.code} |`;
    }

    const changePercent =
      typeof item.quote.changePercent24h === "number"
        ? `${item.quote.changePercent24h.toFixed(3)}%`
        : "n/d";

    return `| ${item.pair} | ${item.quote.rate.toFixed(6)} | ${changePercent} | ${item.quote.marketState ?? "n/d"} | Yahoo |`;
  });

  return [
    `| ${headers.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...rows,
  ].join("\n");
}

function toSnapshot(quote: YahooMarketQuote, fetchedAt: string): ForexRateSnapshot {
  const pair = fromYahooSymbol(quote.symbol);
  const { baseCurrency, quoteCurrency } = splitPair(pair);

  return {
    baseCurrency,
    change24h: quote.change,
    changePercent24h: quote.changePercent,
    fetchedAt,
    marketState: quote.marketState,
    pair,
    previousClose: quote.previousClose,
    provider: "yahoo_finance",
    quoteCurrency,
    rate: quote.price,
    regularMarketTime: quote.regularMarketTime,
    yahooSymbol: quote.symbol,
  };
}

export class ForexMarketService {
  /**
   * Retorna um snapshot de mercado de forex, usando cache in-memory com TTL.
   * O cache é por preset/pares.
   */
  private getCacheKey(pairs: string[]): string {
    return [...pairs].sort().join(",");
  }
  public async getSpotRate(input: { pair: string }): Promise<ForexRateSnapshot> {
    const pair = forexPairSchema.parse(input.pair);
    const batch = await this.getSpotRateBatch({
      pairs: [pair],
    });
    const first = batch.quotes[0];

    if (!first || first.status === "error") {
      throw new AppError({
        code: "FOREX_PAIR_NOT_AVAILABLE",
        details: {
          pair,
        },
        message: "Forex pair is not available",
        statusCode: 503,
      });
    }

    return first.quote;
  }

  public async getSpotRateBatch(input: { pairs: string[] }): Promise<ForexRateBatchResponse & { fromCache?: boolean }> {
    const pairs = forexPairsSchema.parse(input.pairs);
    const cacheKey = this.getCacheKey(pairs);
    const now = Date.now();
    const cached = forexCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      logger.info({ service: "forex", type: "cache", hit: true, pairs }, "Forex cache hit");
      return { ...cached.value, fromCache: true };
    }
    logger.info({ service: "forex", type: "cache", hit: false, pairs }, "Forex cache miss");

    const requestedSymbols = pairs.map((pair) => toYahooSymbol(pair));
    const snapshot = await yahooMarketDataAdapter.getMarketSnapshot({ symbols: requestedSymbols });
    const quotesByPair = new Map<string, ForexRateSnapshot>(
      snapshot.quotes
        .filter((quote) => quote.symbol.endsWith("=X"))
        .map((quote) => {
          const normalizedPair = fromYahooSymbol(quote.symbol);
          return [normalizedPair, toSnapshot(quote, snapshot.fetchedAt)] as const;
        }),
    );

    const quotes = pairs.map((pair) => {
      const foundQuote = quotesByPair.get(pair);
      if (foundQuote) {
        return {
          pair,
          quote: foundQuote,
          status: "ok" as const,
        };
      }
      return {
        error: {
          code: "FOREX_PAIR_NOT_AVAILABLE" as const,
          message: "Forex pair was not returned by market provider",
        },
        pair,
        status: "error" as const,
      };
    });

    const successCount = quotes.filter((item) => item.status === "ok").length;
    const result: ForexRateBatchResponse = {
      failureCount: quotes.length - successCount,
      fetchedAt: snapshot.fetchedAt,
      pairs,
      quotes,
      requestedPairs: pairs,
      successCount,
    };
    forexCache.set(cacheKey, { value: result, expiresAt: now + FOREX_CACHE_TTL_MS });
    return { ...result, fromCache: false };
  }

  public async getMarketOverview(input?: {
    limit?: number;
    pairs?: string[];
    preset?: ForexMarketOverviewPreset;
  }): Promise<ForexMarketOverviewResponse & { fromCache?: boolean }> {
    const preset = forexMarketOverviewPresetSchema.parse(input?.preset ?? "majors");
    const sourcePairs =
      input?.pairs && input.pairs.length > 0
        ? forexPairsSchema.parse(input.pairs)
        : forexPresetPairs[preset];
    const limit = Math.max(1, Math.min(20, Math.floor(input?.limit ?? sourcePairs.length)));
    const selectedPairs = sourcePairs.slice(0, limit);
    const batch = await this.getSpotRateBatch({ pairs: selectedPairs });
    return {
      failureCount: batch.failureCount,
      fetchedAt: batch.fetchedAt,
      pairs: selectedPairs,
      preset,
      quotes: batch.quotes,
      successCount: batch.successCount,
      tableMarkdown: buildTableMarkdown(batch.quotes),
      fromCache: batch.fromCache,
    };
  }
}
