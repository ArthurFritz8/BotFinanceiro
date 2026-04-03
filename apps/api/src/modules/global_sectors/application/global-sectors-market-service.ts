import { z } from "zod";

import {
  YahooMarketDataAdapter,
  type YahooMarketQuote,
} from "../../../integrations/market_data/yahoo-market-data-adapter.js";
import { AppError } from "../../../shared/errors/app-error.js";

const globalSectorSymbolSchema = z
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

const globalSectorSymbolsSchema = z
  .array(globalSectorSymbolSchema)
  .min(1)
  .max(20)
  .transform((symbols) => [...new Set(symbols)]);

const globalSectorsMarketOverviewPresetSchema = z.enum([
  "us_sectors",
  "global_cyclicals",
  "defensives",
  "growth",
]);

type GlobalSectorsMarketOverviewPreset = z.infer<typeof globalSectorsMarketOverviewPresetSchema>;

type SectorTag =
  | "consumer_discretionary"
  | "consumer_staples"
  | "defensive"
  | "diversified"
  | "energy"
  | "financials"
  | "healthcare"
  | "industrials"
  | "innovation"
  | "materials"
  | "real_estate"
  | "technology"
  | "utilities";

export interface GlobalSectorQuoteSnapshot {
  change24h: number | null;
  changePercent24h: number | null;
  currency: string | null;
  fetchedAt: string;
  market: "global_sectors";
  marketState: string | null;
  name: string;
  previousClose: number | null;
  price: number;
  provider: "yahoo_finance";
  regularMarketTime: string | null;
  sectorTag: SectorTag;
  strengthScore: number | null;
  symbol: string;
}

export interface GlobalSectorQuoteFailure {
  error: {
    code: "GLOBAL_SECTORS_SYMBOL_NOT_AVAILABLE";
    message: string;
  };
  status: "error";
  symbol: string;
}

export interface GlobalSectorQuoteSuccess {
  quote: GlobalSectorQuoteSnapshot;
  status: "ok";
  symbol: string;
}

export type GlobalSectorQuoteBatchItem = GlobalSectorQuoteSuccess | GlobalSectorQuoteFailure;

export interface GlobalSectorsSnapshotBatchResponse {
  advanceCount: number;
  declineCount: number;
  failureCount: number;
  fetchedAt: string;
  requestedSymbols: string[];
  snapshots: GlobalSectorQuoteBatchItem[];
  successCount: number;
}

export interface GlobalSectorsMarketOverviewResponse {
  advanceCount: number;
  declineCount: number;
  failureCount: number;
  fetchedAt: string;
  preset: GlobalSectorsMarketOverviewPreset;
  requestedSymbols: string[];
  snapshots: GlobalSectorQuoteBatchItem[];
  successCount: number;
  tableMarkdown: string;
}

const globalSectorsPresetSymbols: Record<GlobalSectorsMarketOverviewPreset, string[]> = {
  defensives: ["XLV", "XLP", "XLU", "TLT", "GLD", "IEF"],
  global_cyclicals: ["XLI", "XLY", "XLB", "XLE", "SMH", "ITA"],
  growth: ["XLK", "SOXX", "IGV", "ARKK", "QQQ", "SMH"],
  us_sectors: ["XLK", "XLF", "XLE", "XLV", "XLI", "XLY", "XLP", "XLU", "XLRE", "XLB"],
};

const yahooMarketDataAdapter = new YahooMarketDataAdapter();

function resolveSectorTag(symbol: string): SectorTag {
  if (["XLK", "SOXX", "SMH", "IGV"].includes(symbol)) {
    return "technology";
  }

  if (symbol === "XLF") {
    return "financials";
  }

  if (symbol === "XLE") {
    return "energy";
  }

  if (symbol === "XLV") {
    return "healthcare";
  }

  if (symbol === "XLI" || symbol === "ITA") {
    return "industrials";
  }

  if (symbol === "XLY") {
    return "consumer_discretionary";
  }

  if (symbol === "XLP") {
    return "consumer_staples";
  }

  if (symbol === "XLU") {
    return "utilities";
  }

  if (symbol === "XLRE") {
    return "real_estate";
  }

  if (symbol === "XLB") {
    return "materials";
  }

  if (symbol === "ARKK") {
    return "innovation";
  }

  if (["TLT", "IEF", "GLD"].includes(symbol)) {
    return "defensive";
  }

  return "diversified";
}

function buildTableMarkdown(items: GlobalSectorQuoteBatchItem[]): string {
  const headers = ["Simbolo", "Setor", "Preco", "Var 24h", "Score"];
  const separator = ["---", "---", "---:", "---:", "---:"];

  const rows = items.map((item) => {
    if (item.status === "error") {
      return `| ${item.symbol} | n/d | n/d | n/d | ${item.error.code} |`;
    }

    const changePercent =
      typeof item.quote.changePercent24h === "number"
        ? `${item.quote.changePercent24h.toFixed(3)}%`
        : "n/d";
    const strengthScore =
      typeof item.quote.strengthScore === "number"
        ? item.quote.strengthScore.toFixed(2)
        : "n/d";

    return `| ${item.symbol} | ${item.quote.sectorTag} | ${item.quote.price.toFixed(4)} | ${changePercent} | ${strengthScore} |`;
  });

  return [`| ${headers.join(" | ")} |`, `| ${separator.join(" | ")} |`, ...rows].join("\n");
}

function toSnapshot(quote: YahooMarketQuote, fetchedAt: string): GlobalSectorQuoteSnapshot {
  return {
    change24h: quote.change,
    changePercent24h: quote.changePercent,
    currency: quote.currency,
    fetchedAt,
    market: "global_sectors",
    marketState: quote.marketState,
    name: quote.name,
    previousClose: quote.previousClose,
    price: quote.price,
    provider: "yahoo_finance",
    regularMarketTime: quote.regularMarketTime,
    sectorTag: resolveSectorTag(quote.symbol),
    strengthScore: quote.changePercent,
    symbol: quote.symbol,
  };
}

function computeAdvanceDecline(items: GlobalSectorQuoteBatchItem): {
  advanceCount: number;
  declineCount: number;
} {
  if (items.status === "error" || items.quote.changePercent24h === null) {
    return {
      advanceCount: 0,
      declineCount: 0,
    };
  }

  return {
    advanceCount: items.quote.changePercent24h > 0 ? 1 : 0,
    declineCount: items.quote.changePercent24h < 0 ? 1 : 0,
  };
}

export class GlobalSectorsMarketService {
  public async getSnapshot(input: { symbol: string }): Promise<GlobalSectorQuoteSnapshot> {
    const symbol = globalSectorSymbolSchema.parse(input.symbol);
    const batch = await this.getSnapshotBatch({
      symbols: [symbol],
    });
    const first = batch.snapshots[0];

    if (!first || first.status === "error") {
      throw new AppError({
        code: "GLOBAL_SECTORS_SYMBOL_NOT_AVAILABLE",
        details: {
          symbol,
        },
        message: "Global sectors symbol is not available",
        statusCode: 503,
      });
    }

    return first.quote;
  }

  public async getSnapshotBatch(input: {
    symbols: string[];
  }): Promise<GlobalSectorsSnapshotBatchResponse> {
    const symbols = globalSectorSymbolsSchema.parse(input.symbols);
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
          code: "GLOBAL_SECTORS_SYMBOL_NOT_AVAILABLE" as const,
          message: "Global sectors symbol was not returned by market provider",
        },
        status: "error" as const,
        symbol,
      };
    });

    const successCount = snapshots.filter((item) => item.status === "ok").length;
    const advanceDecline = snapshots.reduce(
      (accumulator, item) => {
        const current = computeAdvanceDecline(item);

        return {
          advanceCount: accumulator.advanceCount + current.advanceCount,
          declineCount: accumulator.declineCount + current.declineCount,
        };
      },
      {
        advanceCount: 0,
        declineCount: 0,
      },
    );

    return {
      advanceCount: advanceDecline.advanceCount,
      declineCount: advanceDecline.declineCount,
      failureCount: snapshots.length - successCount,
      fetchedAt: marketSnapshot.fetchedAt,
      requestedSymbols: symbols,
      snapshots,
      successCount,
    };
  }

  public async getMarketOverview(input?: {
    limit?: number;
    preset?: GlobalSectorsMarketOverviewPreset;
    symbols?: string[];
  }): Promise<GlobalSectorsMarketOverviewResponse> {
    const preset = globalSectorsMarketOverviewPresetSchema.parse(input?.preset ?? "us_sectors");
    const sourceSymbols =
      input?.symbols && input.symbols.length > 0
        ? globalSectorSymbolsSchema.parse(input.symbols)
        : globalSectorsPresetSymbols[preset];
    const limit = Math.max(1, Math.min(20, Math.floor(input?.limit ?? sourceSymbols.length)));
    const selectedSymbols = sourceSymbols.slice(0, limit);
    const batch = await this.getSnapshotBatch({
      symbols: selectedSymbols,
    });

    return {
      advanceCount: batch.advanceCount,
      declineCount: batch.declineCount,
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