import { z } from "zod";

import {
  YahooMarketDataAdapter,
  type YahooMarketQuote,
} from "../../../integrations/market_data/yahoo-market-data-adapter.js";
import { AppError } from "../../../shared/errors/app-error.js";

const fixedIncomeSymbolSchema = z
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

const fixedIncomeSymbolsSchema = z
  .array(fixedIncomeSymbolSchema)
  .min(1)
  .max(20)
  .transform((symbols) => [...new Set(symbols)]);

const fixedIncomeMarketOverviewPresetSchema = z.enum([
  "us_curve",
  "credit_proxies",
  "rates_risk",
  "global_macro",
]);

type FixedIncomeMarketOverviewPreset = z.infer<typeof fixedIncomeMarketOverviewPresetSchema>;

type DurationBucket = "belly" | "long_term" | "mixed" | "short_term" | "ultra_long";

export interface FixedIncomeQuoteSnapshot {
  change24h: number | null;
  changePercent24h: number | null;
  currency: string | null;
  durationBucket: DurationBucket;
  fetchedAt: string;
  market: "fixed_income";
  marketState: string | null;
  name: string;
  previousClose: number | null;
  price: number;
  provider: "yahoo_finance";
  regularMarketTime: string | null;
  symbol: string;
  yieldPercent: number | null;
}

export interface FixedIncomeQuoteFailure {
  error: {
    code: "FIXED_INCOME_SYMBOL_NOT_AVAILABLE";
    message: string;
  };
  status: "error";
  symbol: string;
}

export interface FixedIncomeQuoteSuccess {
  quote: FixedIncomeQuoteSnapshot;
  status: "ok";
  symbol: string;
}

export type FixedIncomeQuoteBatchItem = FixedIncomeQuoteSuccess | FixedIncomeQuoteFailure;

export interface FixedIncomeSnapshotBatchResponse {
  curveSlope10y5y: number | null;
  failureCount: number;
  fetchedAt: string;
  requestedSymbols: string[];
  snapshots: FixedIncomeQuoteBatchItem[];
  successCount: number;
}

export interface FixedIncomeMarketOverviewResponse {
  curveSlope10y5y: number | null;
  failureCount: number;
  fetchedAt: string;
  preset: FixedIncomeMarketOverviewPreset;
  requestedSymbols: string[];
  snapshots: FixedIncomeQuoteBatchItem[];
  successCount: number;
  tableMarkdown: string;
}

const fixedIncomePresetSymbols: Record<FixedIncomeMarketOverviewPreset, string[]> = {
  credit_proxies: ["LQD", "HYG", "TLT", "IEF", "SHY", "BND"],
  global_macro: ["^TNX", "^FVX", "^IRX", "BRL=X", "EURUSD=X", "DX-Y.NYB"],
  rates_risk: ["^VIX", "^TNX", "^TYX", "TLT", "IEF", "SHY"],
  us_curve: ["^IRX", "^FVX", "^TNX", "^TYX", "TLT", "IEF"],
};

const yahooMarketDataAdapter = new YahooMarketDataAdapter();

function resolveDurationBucket(symbol: string): DurationBucket {
  if (symbol === "^IRX") {
    return "short_term";
  }

  if (symbol === "^FVX") {
    return "belly";
  }

  if (symbol === "^TNX") {
    return "long_term";
  }

  if (symbol === "^TYX") {
    return "ultra_long";
  }

  return "mixed";
}

function toYieldPercent(symbol: string, price: number): number | null {
  if (symbol.startsWith("^")) {
    return price;
  }

  return null;
}

function buildTableMarkdown(items: FixedIncomeQuoteBatchItem[]): string {
  const headers = ["Simbolo", "Yield/Preco", "Var 24h", "Bucket", "Fonte"];
  const separator = ["---", "---:", "---:", "---", "---"];

  const rows = items.map((item) => {
    if (item.status === "error") {
      return `| ${item.symbol} | n/d | n/d | n/d | ${item.error.code} |`;
    }

    const yieldOrPrice =
      typeof item.quote.yieldPercent === "number"
        ? `${item.quote.yieldPercent.toFixed(3)}%`
        : item.quote.price.toFixed(4);
    const changePercent =
      typeof item.quote.changePercent24h === "number"
        ? `${item.quote.changePercent24h.toFixed(3)}%`
        : "n/d";

    return `| ${item.symbol} | ${yieldOrPrice} | ${changePercent} | ${item.quote.durationBucket} | Yahoo |`;
  });

  return [`| ${headers.join(" | ")} |`, `| ${separator.join(" | ")} |`, ...rows].join("\n");
}

function toSnapshot(quote: YahooMarketQuote, fetchedAt: string): FixedIncomeQuoteSnapshot {
  return {
    change24h: quote.change,
    changePercent24h: quote.changePercent,
    currency: quote.currency,
    durationBucket: resolveDurationBucket(quote.symbol),
    fetchedAt,
    market: "fixed_income",
    marketState: quote.marketState,
    name: quote.name,
    previousClose: quote.previousClose,
    price: quote.price,
    provider: "yahoo_finance",
    regularMarketTime: quote.regularMarketTime,
    symbol: quote.symbol,
    yieldPercent: toYieldPercent(quote.symbol, quote.price),
  };
}

function computeCurveSlope10y5y(quotes: FixedIncomeQuoteBatchItem[]): number | null {
  const tenYear = quotes.find((item) => item.status === "ok" && item.symbol === "^TNX");
  const fiveYear = quotes.find((item) => item.status === "ok" && item.symbol === "^FVX");

  if (!tenYear || tenYear.status !== "ok" || !fiveYear || fiveYear.status !== "ok") {
    return null;
  }

  return tenYear.quote.price - fiveYear.quote.price;
}

export class FixedIncomeMarketService {
  public async getSnapshot(input: { symbol: string }): Promise<FixedIncomeQuoteSnapshot> {
    const symbol = fixedIncomeSymbolSchema.parse(input.symbol);
    const batch = await this.getSnapshotBatch({
      symbols: [symbol],
    });
    const first = batch.snapshots[0];

    if (!first || first.status === "error") {
      throw new AppError({
        code: "FIXED_INCOME_SYMBOL_NOT_AVAILABLE",
        details: {
          symbol,
        },
        message: "Fixed income symbol is not available",
        statusCode: 503,
      });
    }

    return first.quote;
  }

  public async getSnapshotBatch(input: { symbols: string[] }): Promise<FixedIncomeSnapshotBatchResponse> {
    const symbols = fixedIncomeSymbolsSchema.parse(input.symbols);
    const marketSnapshot = await yahooMarketDataAdapter.getMarketSnapshot({
      symbols,
    });
    const quotesBySymbol = new Map(
      marketSnapshot.quotes.map((quote) => [quote.symbol, toSnapshot(quote, marketSnapshot.fetchedAt)] as const),
    );

    const snapshots = symbols.map((symbol) => {
      const quote = quotesBySymbol.get(symbol);

      if (quote) {
        return {
          quote,
          status: "ok" as const,
          symbol,
        };
      }

      return {
        error: {
          code: "FIXED_INCOME_SYMBOL_NOT_AVAILABLE" as const,
          message: "Fixed income symbol was not returned by market provider",
        },
        status: "error" as const,
        symbol,
      };
    });

    const successCount = snapshots.filter((item) => item.status === "ok").length;

    return {
      curveSlope10y5y: computeCurveSlope10y5y(snapshots),
      failureCount: snapshots.length - successCount,
      fetchedAt: marketSnapshot.fetchedAt,
      requestedSymbols: symbols,
      snapshots,
      successCount,
    };
  }

  public async getMarketOverview(input?: {
    limit?: number;
    preset?: FixedIncomeMarketOverviewPreset;
    symbols?: string[];
  }): Promise<FixedIncomeMarketOverviewResponse> {
    const preset = fixedIncomeMarketOverviewPresetSchema.parse(input?.preset ?? "us_curve");
    const sourceSymbols =
      input?.symbols && input.symbols.length > 0
        ? fixedIncomeSymbolsSchema.parse(input.symbols)
        : fixedIncomePresetSymbols[preset];
    const limit = Math.max(1, Math.min(20, Math.floor(input?.limit ?? sourceSymbols.length)));
    const selectedSymbols = sourceSymbols.slice(0, limit);
    const batch = await this.getSnapshotBatch({
      symbols: selectedSymbols,
    });

    return {
      curveSlope10y5y: batch.curveSlope10y5y,
      failureCount: batch.failureCount,
      fetchedAt: batch.fetchedAt,
      preset,
      requestedSymbols: selectedSymbols,
      snapshots: batch.snapshots,
      successCount: batch.successCount,
      tableMarkdown: buildTableMarkdown(batch.snapshots),
    };
  }
}
