import { z } from "zod";

import {
  YahooMarketDataAdapter,
  type YahooMarketQuote,
} from "../../../integrations/market_data/yahoo-market-data-adapter.js";
import { AppError } from "../../../shared/errors/app-error.js";

const etfSymbolSchema = z
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

const etfSymbolsSchema = z
  .array(etfSymbolSchema)
  .min(1)
  .max(20)
  .transform((symbols) => [...new Set(symbols)]);

const etfsMarketOverviewPresetSchema = z.enum([
  "broad_market",
  "thematic",
  "international",
  "fixed_income",
]);

type EtfsMarketOverviewPreset = z.infer<typeof etfsMarketOverviewPresetSchema>;

export interface EtfQuoteSnapshot {
  change24h: number | null;
  changePercent24h: number | null;
  currency: string | null;
  fetchedAt: string;
  market: "etfs";
  marketState: string | null;
  name: string;
  previousClose: number | null;
  price: number;
  provider: "yahoo_finance";
  regularMarketTime: string | null;
  symbol: string;
}

export interface EtfQuoteFailure {
  error: {
    code: "ETF_SYMBOL_NOT_AVAILABLE";
    message: string;
  };
  status: "error";
  symbol: string;
}

export interface EtfQuoteSuccess {
  quote: EtfQuoteSnapshot;
  status: "ok";
  symbol: string;
}

export type EtfQuoteBatchItem = EtfQuoteSuccess | EtfQuoteFailure;

export interface EtfsSnapshotBatchResponse {
  failureCount: number;
  fetchedAt: string;
  requestedSymbols: string[];
  snapshots: EtfQuoteBatchItem[];
  successCount: number;
}

export interface EtfsMarketOverviewResponse {
  failureCount: number;
  fetchedAt: string;
  preset: EtfsMarketOverviewPreset;
  requestedSymbols: string[];
  snapshots: EtfQuoteBatchItem[];
  successCount: number;
  tableMarkdown: string;
}

const etfsPresetSymbols: Record<EtfsMarketOverviewPreset, string[]> = {
  broad_market: ["SPY", "VTI", "QQQ", "DIA", "IWM", "VT"],
  fixed_income: ["AGG", "BND", "LQD", "HYG", "TLT", "IEF"],
  international: ["VXUS", "EFA", "EEM", "EWZ", "FXI", "INDA"],
  thematic: ["ARKK", "SMH", "SOXX", "IGV", "XLE", "XLV"],
};

const yahooMarketDataAdapter = new YahooMarketDataAdapter();

function buildTableMarkdown(items: EtfQuoteBatchItem[]): string {
  const headers = ["ETF", "Preco", "Var 24h", "Estado", "Fonte"];
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

function toSnapshot(quote: YahooMarketQuote, fetchedAt: string): EtfQuoteSnapshot {
  return {
    change24h: quote.change,
    changePercent24h: quote.changePercent,
    currency: quote.currency,
    fetchedAt,
    market: "etfs",
    marketState: quote.marketState,
    name: quote.name,
    previousClose: quote.previousClose,
    price: quote.price,
    provider: "yahoo_finance",
    regularMarketTime: quote.regularMarketTime,
    symbol: quote.symbol,
  };
}

export class EtfsMarketService {
  public async getSnapshot(input: { symbol: string }): Promise<EtfQuoteSnapshot> {
    const symbol = etfSymbolSchema.parse(input.symbol);
    const batch = await this.getSnapshotBatch({
      symbols: [symbol],
    });
    const first = batch.snapshots[0];

    if (!first || first.status === "error") {
      throw new AppError({
        code: "ETF_SYMBOL_NOT_AVAILABLE",
        details: {
          symbol,
        },
        message: "ETF symbol is not available",
        statusCode: 503,
      });
    }

    return first.quote;
  }

  public async getSnapshotBatch(input: { symbols: string[] }): Promise<EtfsSnapshotBatchResponse> {
    const symbols = etfSymbolsSchema.parse(input.symbols);
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
          code: "ETF_SYMBOL_NOT_AVAILABLE" as const,
          message: "ETF symbol was not returned by market provider",
        },
        status: "error" as const,
        symbol,
      };
    });

    const successCount = snapshots.filter((item) => item.status === "ok").length;

    return {
      failureCount: snapshots.length - successCount,
      fetchedAt: marketSnapshot.fetchedAt,
      requestedSymbols: symbols,
      snapshots,
      successCount,
    };
  }

  public async getMarketOverview(input?: {
    limit?: number;
    preset?: EtfsMarketOverviewPreset;
    symbols?: string[];
  }): Promise<EtfsMarketOverviewResponse> {
    const preset = etfsMarketOverviewPresetSchema.parse(input?.preset ?? "broad_market");
    const sourceSymbols =
      input?.symbols && input.symbols.length > 0
        ? etfSymbolsSchema.parse(input.symbols)
        : etfsPresetSymbols[preset];
    const limit = Math.max(1, Math.min(20, Math.floor(input?.limit ?? sourceSymbols.length)));
    const selectedSymbols = sourceSymbols.slice(0, limit);
    const batch = await this.getSnapshotBatch({
      symbols: selectedSymbols,
    });

    return {
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