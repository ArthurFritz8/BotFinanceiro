import { z } from "zod";

import {
  YahooMarketDataAdapter,
  type YahooMarketQuote,
} from "../../../integrations/market_data/yahoo-market-data-adapter.js";
import { AppError } from "../../../shared/errors/app-error.js";

const b3SymbolSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toUpperCase())
  .transform((value) => {
    if (value.startsWith("^")) {
      return `^${value.slice(1).replace(/[^A-Z0-9]/g, "")}`;
    }

    const sanitized = value.replace(/[^A-Z0-9.]/g, "");

    if (sanitized.endsWith(".SA")) {
      return sanitized;
    }

    return `${sanitized}.SA`;
  })
  .refine((value) => value.length >= 4 && value.length <= 24, {
    message: "symbol must contain between 4 and 24 characters",
  });

const b3SymbolsSchema = z
  .array(b3SymbolSchema)
  .min(1)
  .max(20)
  .transform((symbols) => [...new Set(symbols)]);

const b3MarketOverviewPresetSchema = z.enum(["blue_chips", "indices", "dividendos", "mid_caps"]);

type B3MarketOverviewPreset = z.infer<typeof b3MarketOverviewPresetSchema>;

export interface B3QuoteSnapshot {
  change24h: number | null;
  changePercent24h: number | null;
  currency: string | null;
  fetchedAt: string;
  market: "b3";
  marketState: string | null;
  name: string;
  previousClose: number | null;
  price: number;
  provider: "yahoo_finance";
  regularMarketTime: string | null;
  symbol: string;
}

export interface B3QuoteFailure {
  error: {
    code: "B3_SYMBOL_NOT_AVAILABLE";
    message: string;
  };
  status: "error";
  symbol: string;
}

export interface B3QuoteSuccess {
  quote: B3QuoteSnapshot;
  status: "ok";
  symbol: string;
}

export type B3QuoteBatchItem = B3QuoteSuccess | B3QuoteFailure;

export interface B3SnapshotBatchResponse {
  failureCount: number;
  fetchedAt: string;
  requestedSymbols: string[];
  snapshots: B3QuoteBatchItem[];
  successCount: number;
}

export interface B3MarketOverviewResponse {
  failureCount: number;
  fetchedAt: string;
  preset: B3MarketOverviewPreset;
  requestedSymbols: string[];
  snapshots: B3QuoteBatchItem[];
  successCount: number;
  tableMarkdown: string;
}

const b3PresetSymbols: Record<B3MarketOverviewPreset, string[]> = {
  blue_chips: ["PETR4.SA", "VALE3.SA", "ITUB4.SA", "BBDC4.SA", "ABEV3.SA", "BBAS3.SA"],
  dividendos: ["TAEE11.SA", "CPLE6.SA", "BBSE3.SA", "EGIE3.SA", "TRPL4.SA", "ITSA4.SA"],
  indices: ["^BVSP", "BOVA11.SA", "SMAL11.SA", "IVVB11.SA", "BRL=X", "^TNX"],
  mid_caps: ["LWSA3.SA", "CMIG4.SA", "RADL3.SA", "SUZB3.SA", "RENT3.SA", "TIMS3.SA"],
};

const yahooMarketDataAdapter = new YahooMarketDataAdapter();

function buildTableMarkdown(items: B3QuoteBatchItem[]): string {
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

function toSnapshot(quote: YahooMarketQuote, fetchedAt: string): B3QuoteSnapshot {
  return {
    change24h: quote.change,
    changePercent24h: quote.changePercent,
    currency: quote.currency,
    fetchedAt,
    market: "b3",
    marketState: quote.marketState,
    name: quote.name,
    previousClose: quote.previousClose,
    price: quote.price,
    provider: "yahoo_finance",
    regularMarketTime: quote.regularMarketTime,
    symbol: quote.symbol,
  };
}

export class B3MarketService {
  public async getSnapshot(input: { symbol: string }): Promise<B3QuoteSnapshot> {
    const symbol = b3SymbolSchema.parse(input.symbol);
    const batch = await this.getSnapshotBatch({
      symbols: [symbol],
    });
    const first = batch.snapshots[0];

    if (!first || first.status === "error") {
      throw new AppError({
        code: "B3_SYMBOL_NOT_AVAILABLE",
        details: {
          symbol,
        },
        message: "B3 symbol is not available",
        statusCode: 503,
      });
    }

    return first.quote;
  }

  public async getSnapshotBatch(input: { symbols: string[] }): Promise<B3SnapshotBatchResponse> {
    const symbols = b3SymbolsSchema.parse(input.symbols);
    const snapshot = await yahooMarketDataAdapter.getMarketSnapshot({
      symbols,
    });
    const quotesBySymbol = new Map<string, B3QuoteSnapshot>(
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
          code: "B3_SYMBOL_NOT_AVAILABLE" as const,
          message: "B3 symbol was not returned by market provider",
        },
        status: "error" as const,
        symbol,
      };
    });

    const successCount = snapshots.filter((item) => item.status === "ok").length;

    return {
      failureCount: snapshots.length - successCount,
      fetchedAt: snapshot.fetchedAt,
      requestedSymbols: symbols,
      snapshots,
      successCount,
    };
  }

  public async getMarketOverview(input?: {
    limit?: number;
    preset?: B3MarketOverviewPreset;
    symbols?: string[];
  }): Promise<B3MarketOverviewResponse> {
    const preset = b3MarketOverviewPresetSchema.parse(input?.preset ?? "blue_chips");
    const sourceSymbols =
      input?.symbols && input.symbols.length > 0
        ? b3SymbolsSchema.parse(input.symbols)
        : b3PresetSymbols[preset];
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
