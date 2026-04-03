import { z } from "zod";

import {
  YahooMarketDataAdapter,
  type YahooMarketQuote,
} from "../../../integrations/market_data/yahoo-market-data-adapter.js";
import { AppError } from "../../../shared/errors/app-error.js";

const fiiSymbolSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toUpperCase().replace(/[^A-Z0-9.]/g, ""))
  .transform((value) => {
    if (value.endsWith(".SA")) {
      return value;
    }

    return `${value}.SA`;
  })
  .refine((value) => value.length >= 6 && value.length <= 16, {
    message: "symbol must contain between 6 and 16 characters",
  });

const fiiSymbolsSchema = z
  .array(fiiSymbolSchema)
  .min(1)
  .max(20)
  .transform((symbols) => [...new Set(symbols)]);

const fiiMarketOverviewPresetSchema = z.enum(["high_liquidity", "tijolo", "papel", "global"]);

type FiiMarketOverviewPreset = z.infer<typeof fiiMarketOverviewPresetSchema>;

export interface FiiQuoteSnapshot {
  change24h: number | null;
  changePercent24h: number | null;
  currency: string | null;
  fetchedAt: string;
  market: "fiis";
  marketState: string | null;
  name: string;
  previousClose: number | null;
  price: number;
  provider: "yahoo_finance";
  regularMarketTime: string | null;
  symbol: string;
}

export interface FiiQuoteFailure {
  error: {
    code: "FIIS_SYMBOL_NOT_AVAILABLE";
    message: string;
  };
  status: "error";
  symbol: string;
}

export interface FiiQuoteSuccess {
  quote: FiiQuoteSnapshot;
  status: "ok";
  symbol: string;
}

export type FiiQuoteBatchItem = FiiQuoteSuccess | FiiQuoteFailure;

export interface FiiSnapshotBatchResponse {
  failureCount: number;
  fetchedAt: string;
  requestedSymbols: string[];
  snapshots: FiiQuoteBatchItem[];
  successCount: number;
}

export interface FiiMarketOverviewResponse {
  failureCount: number;
  fetchedAt: string;
  preset: FiiMarketOverviewPreset;
  requestedSymbols: string[];
  snapshots: FiiQuoteBatchItem[];
  successCount: number;
  tableMarkdown: string;
}

const fiiPresetSymbols: Record<FiiMarketOverviewPreset, string[]> = {
  global: ["IFIX.SA", "HGLG11.SA", "KNRI11.SA", "MXRF11.SA", "VISC11.SA", "XPLG11.SA"],
  high_liquidity: ["HGLG11.SA", "KNRI11.SA", "XPLG11.SA", "MXRF11.SA", "VISC11.SA", "HGRE11.SA"],
  papel: ["MXRF11.SA", "KNCR11.SA", "CPTS11.SA", "RBRR11.SA", "IRDM11.SA", "CVBI11.SA"],
  tijolo: ["HGLG11.SA", "XPLG11.SA", "VISC11.SA", "HSML11.SA", "KNRI11.SA", "BRCO11.SA"],
};

const yahooMarketDataAdapter = new YahooMarketDataAdapter();

function buildTableMarkdown(items: FiiQuoteBatchItem[]): string {
  const headers = ["FII", "Preco", "Var 24h", "Estado", "Fonte"];
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

function toSnapshot(quote: YahooMarketQuote, fetchedAt: string): FiiQuoteSnapshot {
  return {
    change24h: quote.change,
    changePercent24h: quote.changePercent,
    currency: quote.currency,
    fetchedAt,
    market: "fiis",
    marketState: quote.marketState,
    name: quote.name,
    previousClose: quote.previousClose,
    price: quote.price,
    provider: "yahoo_finance",
    regularMarketTime: quote.regularMarketTime,
    symbol: quote.symbol,
  };
}

export class FiisMarketService {
  public async getSnapshot(input: { symbol: string }): Promise<FiiQuoteSnapshot> {
    const symbol = fiiSymbolSchema.parse(input.symbol);
    const batch = await this.getSnapshotBatch({
      symbols: [symbol],
    });
    const first = batch.snapshots[0];

    if (!first || first.status === "error") {
      throw new AppError({
        code: "FIIS_SYMBOL_NOT_AVAILABLE",
        details: {
          symbol,
        },
        message: "FIIs symbol is not available",
        statusCode: 503,
      });
    }

    return first.quote;
  }

  public async getSnapshotBatch(input: { symbols: string[] }): Promise<FiiSnapshotBatchResponse> {
    const symbols = fiiSymbolsSchema.parse(input.symbols);
    const snapshot = await yahooMarketDataAdapter.getMarketSnapshot({
      symbols,
    });
    const quotesBySymbol = new Map<string, FiiQuoteSnapshot>(
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
          code: "FIIS_SYMBOL_NOT_AVAILABLE" as const,
          message: "FIIs symbol was not returned by market provider",
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
    preset?: FiiMarketOverviewPreset;
    symbols?: string[];
  }): Promise<FiiMarketOverviewResponse> {
    const preset = fiiMarketOverviewPresetSchema.parse(input?.preset ?? "high_liquidity");
    const sourceSymbols =
      input?.symbols && input.symbols.length > 0
        ? fiiSymbolsSchema.parse(input.symbols)
        : fiiPresetSymbols[preset];
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
