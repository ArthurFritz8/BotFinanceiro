import { z } from "zod";

import {
  YahooMarketDataAdapter,
  type YahooMarketQuote,
} from "../../../integrations/market_data/yahoo-market-data-adapter.js";
import { AppError } from "../../../shared/errors/app-error.js";

const commoditySymbolSchema = z
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
  .refine((value) => value.length >= 2 && value.length <= 32, {
    message: "symbol must contain between 2 and 32 characters",
  });

const commoditySymbolsSchema = z
  .array(commoditySymbolSchema)
  .min(1)
  .max(20)
  .transform((symbols) => [...new Set(symbols)]);

const commoditiesMarketOverviewPresetSchema = z.enum(["metals", "energy", "agro", "global"]);

type CommoditiesMarketOverviewPreset = z.infer<typeof commoditiesMarketOverviewPresetSchema>;

export interface CommodityQuoteSnapshot {
  change24h: number | null;
  changePercent24h: number | null;
  currency: string | null;
  fetchedAt: string;
  market: "commodities";
  marketState: string | null;
  name: string;
  previousClose: number | null;
  price: number;
  provider: "yahoo_finance";
  regularMarketTime: string | null;
  symbol: string;
}

export interface CommodityQuoteFailure {
  error: {
    code: "COMMODITY_SYMBOL_NOT_AVAILABLE";
    message: string;
  };
  status: "error";
  symbol: string;
}

export interface CommodityQuoteSuccess {
  quote: CommodityQuoteSnapshot;
  status: "ok";
  symbol: string;
}

export type CommodityQuoteBatchItem = CommodityQuoteSuccess | CommodityQuoteFailure;

export interface CommoditiesSnapshotBatchResponse {
  failureCount: number;
  fetchedAt: string;
  requestedSymbols: string[];
  snapshots: CommodityQuoteBatchItem[];
  successCount: number;
}

export interface CommoditiesMarketOverviewResponse {
  failureCount: number;
  fetchedAt: string;
  preset: CommoditiesMarketOverviewPreset;
  requestedSymbols: string[];
  snapshots: CommodityQuoteBatchItem[];
  successCount: number;
  tableMarkdown: string;
}

const commoditiesPresetSymbols: Record<CommoditiesMarketOverviewPreset, string[]> = {
  agro: ["ZC=F", "ZW=F", "ZS=F", "KC=F", "CC=F", "CT=F"],
  energy: ["CL=F", "BZ=F", "NG=F", "RB=F", "HO=F", "XLE"],
  global: ["GC=F", "SI=F", "CL=F", "NG=F", "ZC=F", "HG=F"],
  metals: ["GC=F", "SI=F", "HG=F", "PL=F", "PA=F", "CPER"],
};

const yahooMarketDataAdapter = new YahooMarketDataAdapter();

function buildTableMarkdown(items: CommodityQuoteBatchItem[]): string {
  const headers = ["Contrato", "Preco", "Var 24h", "Estado", "Fonte"];
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

function toSnapshot(quote: YahooMarketQuote, fetchedAt: string): CommodityQuoteSnapshot {
  return {
    change24h: quote.change,
    changePercent24h: quote.changePercent,
    currency: quote.currency,
    fetchedAt,
    market: "commodities",
    marketState: quote.marketState,
    name: quote.name,
    previousClose: quote.previousClose,
    price: quote.price,
    provider: "yahoo_finance",
    regularMarketTime: quote.regularMarketTime,
    symbol: quote.symbol,
  };
}

export class CommoditiesMarketService {
  public async getSnapshot(input: { symbol: string }): Promise<CommodityQuoteSnapshot> {
    const symbol = commoditySymbolSchema.parse(input.symbol);
    const batch = await this.getSnapshotBatch({
      symbols: [symbol],
    });
    const first = batch.snapshots[0];

    if (!first || first.status === "error") {
      throw new AppError({
        code: "COMMODITY_SYMBOL_NOT_AVAILABLE",
        details: {
          symbol,
        },
        message: "Commodity symbol is not available",
        statusCode: 503,
      });
    }

    return first.quote;
  }

  public async getSnapshotBatch(input: { symbols: string[] }): Promise<CommoditiesSnapshotBatchResponse> {
    const symbols = commoditySymbolsSchema.parse(input.symbols);
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
          code: "COMMODITY_SYMBOL_NOT_AVAILABLE" as const,
          message: "Commodity symbol was not returned by market provider",
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
    preset?: CommoditiesMarketOverviewPreset;
    symbols?: string[];
  }): Promise<CommoditiesMarketOverviewResponse> {
    const preset = commoditiesMarketOverviewPresetSchema.parse(input?.preset ?? "global");
    const sourceSymbols =
      input?.symbols && input.symbols.length > 0
        ? commoditySymbolsSchema.parse(input.symbols)
        : commoditiesPresetSymbols[preset];
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
