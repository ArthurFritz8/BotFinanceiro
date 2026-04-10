import { z } from "zod";

import {
  YahooMarketDataAdapter,
  type YahooMarketQuote,
} from "../../../integrations/market_data/yahoo-market-data-adapter.js";
import { env } from "../../../shared/config/env.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { logger } from "../../../shared/logger/logger.js";

// Simple in-memory cache with TTL
const equitiesCache = new Map<string, { value: EquitiesSnapshotBatchResponse; expiresAt: number }>();
const EQUITIES_CACHE_TTL_MS = env.MARKET_OVERVIEW_CACHE_TTL_SECONDS * 1000;
const equitiesSymbolSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toUpperCase())
  .transform((value) => {
    if (value.startsWith("^")) {
      return `^${value.slice(1).replace(/[^A-Z0-9]/g, "")}`;
    }

    return value.replace(/[^A-Z0-9.=-]/g, "");
  })
  .refine((value) => value.length >= 1 && value.length <= 32, {
    message: "symbol must contain between 1 and 32 characters",
  });

const equitiesSymbolsSchema = z
  .array(equitiesSymbolSchema)
  .min(1)
  .max(20)
  .transform((symbols) => [...new Set(symbols)]);

const equitiesMarketOverviewPresetSchema = z.enum([
  "us_mega_caps",
  "global_brands",
  "innovation",
  "dividends",
]);

type EquitiesMarketOverviewPreset = z.infer<typeof equitiesMarketOverviewPresetSchema>;

export interface EquitiesQuoteSnapshot {
  change24h: number | null;
  changePercent24h: number | null;
  currency: string | null;
  fetchedAt: string;
  market: "equities";
  marketState: string | null;
  name: string;
  previousClose: number | null;
  price: number;
  provider: "yahoo_finance";
  regularMarketTime: string | null;
  symbol: string;
}

export interface EquitiesQuoteFailure {
  error: {
    code: "EQUITIES_SYMBOL_NOT_AVAILABLE";
    message: string;
  };
  status: "error";
  symbol: string;
}

export interface EquitiesQuoteSuccess {
  quote: EquitiesQuoteSnapshot;
  status: "ok";
  symbol: string;
}

export type EquitiesQuoteBatchItem = EquitiesQuoteSuccess | EquitiesQuoteFailure;

export interface EquitiesSnapshotBatchResponse {
  failureCount: number;
  fetchedAt: string;
  requestedSymbols: string[];
  snapshots: EquitiesQuoteBatchItem[];
  successCount: number;
}

export interface EquitiesMarketOverviewResponse {
  failureCount: number;
  fetchedAt: string;
  preset: EquitiesMarketOverviewPreset;
  requestedSymbols: string[];
  snapshots: EquitiesQuoteBatchItem[];
  successCount: number;
  tableMarkdown: string;
}

const equitiesPresetSymbols: Record<EquitiesMarketOverviewPreset, string[]> = {
  dividends: ["KO", "PG", "JNJ", "PEP", "MCD", "IBM"],
  global_brands: ["AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA"],
  innovation: ["NVDA", "AMD", "PLTR", "CRWD", "SNOW", "SHOP"],
  us_mega_caps: ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "BRK-B"],
};

const yahooMarketDataAdapter = new YahooMarketDataAdapter();

function buildTableMarkdown(items: EquitiesQuoteBatchItem[]): string {
  const headers = ["Simbolo", "Preco", "Var 24h", "Estado", "Fonte"];
  const separator = ["---", "---:", "---:", "---", "---"];

  const rows = items.map((item) => {
    if (item.status === "error") {
      return `| ${item.symbol} | n/d | n/d | n/d | ${item.error.code} |`;
    }

    const changePercent =
      typeof item.quote.changePercent24h === "number"
        ? `${item.quote.changePercent24h.toFixed(3)}%`
        : "n/d";

    return `| ${item.symbol} | ${item.quote.price.toFixed(4)} | ${changePercent} | ${item.quote.marketState ?? "n/d"} | Yahoo |`;
  });

  return [`| ${headers.join(" | ")} |`, `| ${separator.join(" | ")} |`, ...rows].join("\n");
}

function toSnapshot(quote: YahooMarketQuote, fetchedAt: string): EquitiesQuoteSnapshot {
  return {
    change24h: quote.change,
    changePercent24h: quote.changePercent,
    currency: quote.currency,
    fetchedAt,
    market: "equities",
    marketState: quote.marketState,
    name: quote.name,
    previousClose: quote.previousClose,
    price: quote.price,
    provider: "yahoo_finance",
    regularMarketTime: quote.regularMarketTime,
    symbol: quote.symbol,
  };
}

export class EquitiesMarketService {
  /**
   * Retorna um snapshot de mercado de ações, usando cache in-memory com TTL.
   * O cache é por preset/símbolos.
   */
  private getCacheKey(symbols: string[]): string {
    return [...symbols].sort().join(",");
  }
  public async getSnapshot(input: { symbol: string }): Promise<EquitiesQuoteSnapshot> {
    const symbol = equitiesSymbolSchema.parse(input.symbol);
    const batch = await this.getSnapshotBatch({
      symbols: [symbol],
    });
    const first = batch.snapshots[0];

    if (!first || first.status === "error") {
      throw new AppError({
        code: "EQUITIES_SYMBOL_NOT_AVAILABLE",
        details: {
          symbol,
        },
        message: "Equities symbol is not available",
        statusCode: 503,
      });
    }

    return first.quote;
  }

  public async getSnapshotBatch(input: { symbols: string[] }): Promise<EquitiesSnapshotBatchResponse & { fromCache?: boolean }> {
    const symbols = equitiesSymbolsSchema.parse(input.symbols);
    const cacheKey = this.getCacheKey(symbols);
    const now = Date.now();
    const cached = equitiesCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      logger.info({ service: "equities", type: "cache", hit: true, symbols }, "Equities cache hit");
      return { ...cached.value, fromCache: true };
    }
    logger.info({ service: "equities", type: "cache", hit: false, symbols }, "Equities cache miss");

    const snapshot = await yahooMarketDataAdapter.getMarketSnapshot({ symbols });
    const quotesBySymbol = new Map<string, EquitiesQuoteSnapshot>(
      snapshot.quotes.map((quote) => [quote.symbol, toSnapshot(quote, snapshot.fetchedAt)] as const),
    );

    const snapshots = symbols.map((symbol) => {
      const foundQuote = quotesBySymbol.get(symbol);
      if (foundQuote) {
        return {
          quote: foundQuote,
          status: "ok" as const,
          symbol,
        };
      }
      return {
        error: {
          code: "EQUITIES_SYMBOL_NOT_AVAILABLE" as const,
          message: "Equities symbol was not returned by market provider",
        },
        status: "error" as const,
        symbol,
      };
    });

    const successCount = snapshots.filter((item) => item.status === "ok").length;
    const result: EquitiesSnapshotBatchResponse = {
      failureCount: snapshots.length - successCount,
      fetchedAt: snapshot.fetchedAt,
      requestedSymbols: symbols,
      snapshots,
      successCount,
    };
    equitiesCache.set(cacheKey, { value: result, expiresAt: now + EQUITIES_CACHE_TTL_MS });
    return { ...result, fromCache: false };
  }

  public async getMarketOverview(input?: {
    limit?: number;
    preset?: EquitiesMarketOverviewPreset;
    symbols?: string[];
  }): Promise<EquitiesMarketOverviewResponse & { fromCache?: boolean }> {
    const preset = equitiesMarketOverviewPresetSchema.parse(input?.preset ?? "us_mega_caps");
    const sourceSymbols =
      input?.symbols && input.symbols.length > 0
        ? equitiesSymbolsSchema.parse(input.symbols)
        : equitiesPresetSymbols[preset];
    const limit = Math.max(1, Math.min(20, Math.floor(input?.limit ?? sourceSymbols.length)));
    const selectedSymbols = sourceSymbols.slice(0, limit);
    const batch = await this.getSnapshotBatch({ symbols: selectedSymbols });
    return {
      failureCount: batch.failureCount,
      fetchedAt: batch.fetchedAt,
      preset,
      requestedSymbols: selectedSymbols,
      snapshots: batch.snapshots,
      successCount: batch.successCount,
      tableMarkdown: buildTableMarkdown(batch.snapshots),
      fromCache: batch.fromCache,
    };
  }
}
