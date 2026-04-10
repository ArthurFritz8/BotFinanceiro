import { z } from "zod";

import {
  BinanceFuturesMarketDataAdapter,
  type BinanceFuturesContractSnapshot,
  type BinanceFuturesTickerStreamHealth,
} from "../../../integrations/market_data/binance-futures-market-data-adapter.js";
import { env } from "../../../shared/config/env.js";
import { logger } from "../../../shared/logger/logger.js";

const futuresSymbolSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
  .transform((value) => {
    if (value.endsWith("USDT") || value.endsWith("BUSD") || value.endsWith("USD")) {
      return value;
    }

    return `${value}USDT`;
  })
  .refine((value) => value.length >= 6 && value.length <= 20, {
    message: "symbol must contain between 6 and 20 characters",
  });

const futuresSymbolsSchema = z
  .array(futuresSymbolSchema)
  .min(1)
  .max(20)
  .transform((symbols) => [...new Set(symbols)]);

const futuresMarketPresetSchema = z.enum(["crypto_majors", "layer1", "defi"]);

type FuturesMarketPreset = z.infer<typeof futuresMarketPresetSchema>;

export interface FuturesBatchSuccessItem {
  snapshot: BinanceFuturesContractSnapshot;
  status: "ok";
  symbol: string;
}

export interface FuturesBatchErrorItem {
  error: {
    code: string;
    message: string;
  };
  status: "error";
  symbol: string;
}

export type FuturesBatchItem = FuturesBatchSuccessItem | FuturesBatchErrorItem;

export interface FuturesSnapshotBatchResponse {
  failureCount: number;
  fetchedAt: string;
  requestedSymbols: string[];
  snapshots: FuturesBatchItem[];
  successCount: number;
}

export interface FuturesMarketOverviewResponse {
  failureCount: number;
  fetchedAt: string;
  preset: FuturesMarketPreset;
  requestedSymbols: string[];
  snapshots: FuturesBatchItem[];
  successCount: number;
  tableMarkdown: string;
}

export interface FuturesMarketDataHealth {
  stream: BinanceFuturesTickerStreamHealth;
}

const presetSymbols: Record<FuturesMarketPreset, string[]> = {
  crypto_majors: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"],
  defi: ["AAVEUSDT", "UNIUSDT", "MKRUSDT", "CRVUSDT", "DYDXUSDT"],
  layer1: ["ETHUSDT", "SOLUSDT", "AVAXUSDT", "ADAUSDT", "ATOMUSDT"],
};

const binanceFuturesMarketDataAdapter = new BinanceFuturesMarketDataAdapter();
const futuresSnapshotCache = new Map<string, { expiresAt: number; value: BinanceFuturesContractSnapshot }>();
const FUTURES_SNAPSHOT_CACHE_TTL_MS = env.MARKET_OVERVIEW_CACHE_TTL_SECONDS * 1000;
const FUTURES_SNAPSHOT_CACHE_STALE_MS = env.CACHE_STALE_SECONDS * 1000;

function buildTableMarkdown(items: FuturesBatchItem[]): string {
  const headers = ["Contrato", "Preco", "Funding", "OI", "Var 24h", "Status"];
  const separator = ["---", "---:", "---:", "---:", "---:", "---"];

  const rows = items.map((item) => {
    if (item.status === "error") {
      return `| ${item.symbol} | n/d | n/d | n/d | n/d | ${item.error.code} |`;
    }

    const funding =
      typeof item.snapshot.derivatives.lastFundingRate === "number"
        ? `${(item.snapshot.derivatives.lastFundingRate * 100).toFixed(4)}%`
        : "n/d";
    const openInterest =
      typeof item.snapshot.derivatives.openInterest === "number"
        ? item.snapshot.derivatives.openInterest.toFixed(2)
        : "n/d";
    const change =
      typeof item.snapshot.market.changePercent24h === "number"
        ? `${item.snapshot.market.changePercent24h.toFixed(3)}%`
        : "n/d";

    return `| ${item.symbol} | ${item.snapshot.market.lastPrice.toFixed(4)} | ${funding} | ${openInterest} | ${change} | ok |`;
  });

  return [
    `| ${headers.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...rows,
  ].join("\n");
}

export class FuturesMarketService {
  public getMarketDataHealth(): FuturesMarketDataHealth {
    return {
      stream: binanceFuturesMarketDataAdapter.getTickerStreamHealth(),
    };
  }

  public async getSnapshot(input: { symbol: string }): Promise<BinanceFuturesContractSnapshot> {
    const symbol = futuresSymbolSchema.parse(input.symbol);
    const now = Date.now();
    const cached = futuresSnapshotCache.get(symbol);

    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    try {
      const snapshot = await binanceFuturesMarketDataAdapter.getContractSnapshot({
        symbol,
      });
      futuresSnapshotCache.set(symbol, {
        expiresAt: Date.now() + FUTURES_SNAPSHOT_CACHE_TTL_MS,
        value: snapshot,
      });

      return snapshot;
    } catch (error) {
      if (cached && now <= cached.expiresAt + FUTURES_SNAPSHOT_CACHE_STALE_MS) {
        logger.warn(
          {
            symbol,
          },
          "Futures snapshot provider unavailable; serving stale cache",
        );
        return cached.value;
      }

      throw error;
    }
  }

  public async getSnapshotBatch(input: { symbols: string[] }): Promise<FuturesSnapshotBatchResponse> {
    const symbols = futuresSymbolsSchema.parse(input.symbols);
    const snapshots = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const snapshot = await this.getSnapshot({
            symbol,
          });

          return {
            snapshot,
            status: "ok" as const,
            symbol,
          };
        } catch (error) {
          return {
            error: {
              code: error instanceof Error && "code" in error ? String((error as { code: unknown }).code ?? "FUTURES_SNAPSHOT_ERROR") : "FUTURES_SNAPSHOT_ERROR",
              message: error instanceof Error ? error.message : "Unexpected futures snapshot error",
            },
            status: "error" as const,
            symbol,
          };
        }
      }),
    );

    const successCount = snapshots.filter((item) => item.status === "ok").length;

    return {
      failureCount: snapshots.length - successCount,
      fetchedAt: new Date().toISOString(),
      requestedSymbols: symbols,
      snapshots,
      successCount,
    };
  }

  public async getMarketOverview(input?: {
    limit?: number;
    preset?: FuturesMarketPreset;
    symbols?: string[];
  }): Promise<FuturesMarketOverviewResponse> {
    const preset = futuresMarketPresetSchema.parse(input?.preset ?? "crypto_majors");
    const sourceSymbols =
      input?.symbols && input.symbols.length > 0
        ? futuresSymbolsSchema.parse(input.symbols)
        : presetSymbols[preset];
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
