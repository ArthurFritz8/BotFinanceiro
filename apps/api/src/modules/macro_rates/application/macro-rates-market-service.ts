import { z } from "zod";

import {
  YahooMarketDataAdapter,
  type YahooMarketQuote,
} from "../../../integrations/market_data/yahoo-market-data-adapter.js";
import { AppError } from "../../../shared/errors/app-error.js";

const macroRatesSymbolSchema = z
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

const macroRatesSymbolsSchema = z
  .array(macroRatesSymbolSchema)
  .min(1)
  .max(20)
  .transform((symbols) => [...new Set(symbols)]);

const macroRatesMarketOverviewPresetSchema = z.enum([
  "usd_rates",
  "global_rates",
  "inflation_proxies",
  "risk_regime",
]);

type MacroRatesMarketOverviewPreset = z.infer<typeof macroRatesMarketOverviewPresetSchema>;

type MacroRateBucket = "commodities" | "fx" | "mixed" | "rates" | "risk";

export interface MacroRatesQuoteSnapshot {
  change24h: number | null;
  changePercent24h: number | null;
  currency: string | null;
  fetchedAt: string;
  market: "macro_rates";
  marketState: string | null;
  name: string;
  previousClose: number | null;
  price: number;
  provider: "yahoo_finance";
  rateBucket: MacroRateBucket;
  regularMarketTime: string | null;
  symbol: string;
  yieldPercent: number | null;
}

export interface MacroRatesQuoteFailure {
  error: {
    code: "MACRO_RATES_SYMBOL_NOT_AVAILABLE";
    message: string;
  };
  status: "error";
  symbol: string;
}

export interface MacroRatesQuoteSuccess {
  quote: MacroRatesQuoteSnapshot;
  status: "ok";
  symbol: string;
}

export type MacroRatesQuoteBatchItem = MacroRatesQuoteSuccess | MacroRatesQuoteFailure;

export interface MacroRatesSnapshotBatchResponse {
  curveSlope10y5y: number | null;
  dollarIndexLevel: number | null;
  failureCount: number;
  fetchedAt: string;
  requestedSymbols: string[];
  snapshots: MacroRatesQuoteBatchItem[];
  successCount: number;
  vixLevel: number | null;
}

export interface MacroRatesMarketOverviewResponse {
  curveSlope10y5y: number | null;
  dollarIndexLevel: number | null;
  failureCount: number;
  fetchedAt: string;
  preset: MacroRatesMarketOverviewPreset;
  requestedSymbols: string[];
  snapshots: MacroRatesQuoteBatchItem[];
  successCount: number;
  tableMarkdown: string;
  vixLevel: number | null;
}

const macroRatesPresetSymbols: Record<MacroRatesMarketOverviewPreset, string[]> = {
  global_rates: ["^TNX", "^FVX", "^TYX", "EURUSD=X", "BRL=X", "DX-Y.NYB"],
  inflation_proxies: ["TIP", "IEF", "GC=F", "CL=F", "GLD", "DBC"],
  risk_regime: ["^VIX", "^TNX", "DX-Y.NYB", "GC=F", "BTC-USD", "ETH-USD"],
  usd_rates: ["^IRX", "^FVX", "^TNX", "^TYX", "DX-Y.NYB"],
};

const yahooMarketDataAdapter = new YahooMarketDataAdapter();

function resolveRateBucket(symbol: string): MacroRateBucket {
  if (["^IRX", "^FVX", "^TNX", "^TYX"].includes(symbol)) {
    return "rates";
  }

  if (symbol === "DX-Y.NYB" || symbol.endsWith("=X")) {
    return "fx";
  }

  if (["^VIX", "BTC-USD", "ETH-USD"].includes(symbol)) {
    return "risk";
  }

  if (["GC=F", "CL=F", "GLD", "DBC"].includes(symbol)) {
    return "commodities";
  }

  return "mixed";
}

function toYieldPercent(symbol: string, price: number): number | null {
  if (symbol.startsWith("^")) {
    return price;
  }

  return null;
}

function buildTableMarkdown(items: MacroRatesQuoteBatchItem[]): string {
  const headers = ["Ativo", "Valor", "Var 24h", "Bucket", "Fonte"];
  const separator = ["---", "---:", "---:", "---", "---"];

  const rows = items.map((item) => {
    if (item.status === "error") {
      return `| ${item.symbol} | n/d | n/d | n/d | ${item.error.code} |`;
    }

    const value =
      typeof item.quote.yieldPercent === "number"
        ? `${item.quote.yieldPercent.toFixed(3)}%`
        : item.quote.price.toFixed(4);
    const changePercent =
      typeof item.quote.changePercent24h === "number"
        ? `${item.quote.changePercent24h.toFixed(3)}%`
        : "n/d";

    return `| ${item.symbol} | ${value} | ${changePercent} | ${item.quote.rateBucket} | Yahoo |`;
  });

  return [`| ${headers.join(" | ")} |`, `| ${separator.join(" | ")} |`, ...rows].join("\n");
}

function toSnapshot(quote: YahooMarketQuote, fetchedAt: string): MacroRatesQuoteSnapshot {
  return {
    change24h: quote.change,
    changePercent24h: quote.changePercent,
    currency: quote.currency,
    fetchedAt,
    market: "macro_rates",
    marketState: quote.marketState,
    name: quote.name,
    previousClose: quote.previousClose,
    price: quote.price,
    provider: "yahoo_finance",
    rateBucket: resolveRateBucket(quote.symbol),
    regularMarketTime: quote.regularMarketTime,
    symbol: quote.symbol,
    yieldPercent: toYieldPercent(quote.symbol, quote.price),
  };
}

function extractValue(items: MacroRatesQuoteBatchItem[], symbol: string): number | null {
  const found = items.find((item) => item.status === "ok" && item.symbol === symbol);

  if (!found || found.status !== "ok") {
    return null;
  }

  return found.quote.price;
}

export class MacroRatesMarketService {
  public async getSnapshot(input: { symbol: string }): Promise<MacroRatesQuoteSnapshot> {
    const symbol = macroRatesSymbolSchema.parse(input.symbol);
    const batch = await this.getSnapshotBatch({
      symbols: [symbol],
    });
    const first = batch.snapshots[0];

    if (!first || first.status === "error") {
      throw new AppError({
        code: "MACRO_RATES_SYMBOL_NOT_AVAILABLE",
        details: {
          symbol,
        },
        message: "Macro rates symbol is not available",
        statusCode: 503,
      });
    }

    return first.quote;
  }

  public async getSnapshotBatch(input: {
    symbols: string[];
  }): Promise<MacroRatesSnapshotBatchResponse> {
    const symbols = macroRatesSymbolsSchema.parse(input.symbols);
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
          code: "MACRO_RATES_SYMBOL_NOT_AVAILABLE" as const,
          message: "Macro rates symbol was not returned by market provider",
        },
        status: "error" as const,
        symbol,
      };
    });

    const successCount = snapshots.filter((item) => item.status === "ok").length;
    const tenYear = extractValue(snapshots, "^TNX");
    const fiveYear = extractValue(snapshots, "^FVX");

    return {
      curveSlope10y5y: tenYear !== null && fiveYear !== null ? tenYear - fiveYear : null,
      dollarIndexLevel: extractValue(snapshots, "DX-Y.NYB"),
      failureCount: snapshots.length - successCount,
      fetchedAt: marketSnapshot.fetchedAt,
      requestedSymbols: symbols,
      snapshots,
      successCount,
      vixLevel: extractValue(snapshots, "^VIX"),
    };
  }

  public async getMarketOverview(input?: {
    limit?: number;
    preset?: MacroRatesMarketOverviewPreset;
    symbols?: string[];
  }): Promise<MacroRatesMarketOverviewResponse> {
    const preset = macroRatesMarketOverviewPresetSchema.parse(input?.preset ?? "usd_rates");
    const sourceSymbols =
      input?.symbols && input.symbols.length > 0
        ? macroRatesSymbolsSchema.parse(input.symbols)
        : macroRatesPresetSymbols[preset];
    const limit = Math.max(1, Math.min(20, Math.floor(input?.limit ?? sourceSymbols.length)));
    const selectedSymbols = sourceSymbols.slice(0, limit);
    const batch = await this.getSnapshotBatch({
      symbols: selectedSymbols,
    });

    return {
      curveSlope10y5y: batch.curveSlope10y5y,
      dollarIndexLevel: batch.dollarIndexLevel,
      failureCount: batch.failureCount,
      fetchedAt: batch.fetchedAt,
      preset,
      requestedSymbols: selectedSymbols,
      snapshots: batch.snapshots,
      successCount: batch.successCount,
      tableMarkdown: buildTableMarkdown(batch.snapshots),
      vixLevel: batch.vixLevel,
    };
  }
}