import { z } from "zod";

import {
  YahooMarketDataAdapter,
  type YahooMarketQuote,
} from "../../../integrations/market_data/yahoo-market-data-adapter.js";
import { AppError } from "../../../shared/errors/app-error.js";

const optionsUnderlyingSchema = z
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
  .refine((value) => value.length >= 1 && value.length <= 24, {
    message: "underlying must contain between 1 and 24 characters",
  });

const optionsUnderlyingsSchema = z
  .array(optionsUnderlyingSchema)
  .min(1)
  .max(20)
  .transform((underlyings) => [...new Set(underlyings)]);

const optionsDaysToExpirySchema = z.number().int().min(1).max(365);

const optionsMarketOverviewPresetSchema = z.enum(["us_indices", "us_mega_caps", "high_beta", "global"]);

type OptionsMarketOverviewPreset = z.infer<typeof optionsMarketOverviewPresetSchema>;

type OptionsBias =
  | "directional_call"
  | "directional_put"
  | "long_volatility"
  | "neutral"
  | "short_volatility";

export interface OptionsContractSnapshot {
  daysToExpiry: number;
  expectedMovePercent: number | null;
  expectedMoveValue: number | null;
  fetchedAt: string;
  impliedVolatility: number | null;
  marketState: string | null;
  optionsBias: OptionsBias;
  provider: "yahoo_finance";
  spotPrice: number;
  underlying: string;
  underlyingChangePercent24h: number | null;
  vixLevel: number | null;
}

export interface OptionsSnapshotFailure {
  error: {
    code: "OPTIONS_UNDERLYING_NOT_AVAILABLE";
    message: string;
  };
  status: "error";
  underlying: string;
}

export interface OptionsSnapshotSuccess {
  snapshot: OptionsContractSnapshot;
  status: "ok";
  underlying: string;
}

export type OptionsSnapshotBatchItem = OptionsSnapshotSuccess | OptionsSnapshotFailure;

export interface OptionsSnapshotBatchResponse {
  daysToExpiry: number;
  failureCount: number;
  fetchedAt: string;
  impliedVolatilityProxy: number | null;
  requestedUnderlyings: string[];
  snapshots: OptionsSnapshotBatchItem[];
  successCount: number;
  vixLevel: number | null;
}

export interface OptionsMarketOverviewResponse {
  daysToExpiry: number;
  failureCount: number;
  fetchedAt: string;
  impliedVolatilityProxy: number | null;
  preset: OptionsMarketOverviewPreset;
  requestedUnderlyings: string[];
  snapshots: OptionsSnapshotBatchItem[];
  successCount: number;
  tableMarkdown: string;
  vixLevel: number | null;
}

const optionsPresetUnderlyings: Record<OptionsMarketOverviewPreset, string[]> = {
  global: ["SPY", "QQQ", "EWZ", "EEM", "FXI", "^VIX"],
  high_beta: ["TSLA", "NVDA", "AMD", "COIN", "MSTR", "SMCI"],
  us_indices: ["SPY", "QQQ", "IWM", "DIA", "^GSPC", "^IXIC"],
  us_mega_caps: ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META"],
};

const yahooMarketDataAdapter = new YahooMarketDataAdapter();

function resolveOptionsBias(changePercent: number | null, impliedVolatility: number | null): OptionsBias {
  if (changePercent === null || impliedVolatility === null) {
    return "neutral";
  }

  if (impliedVolatility >= 0.25 && Math.abs(changePercent) < 0.8) {
    return "long_volatility";
  }

  if (impliedVolatility <= 0.15 && Math.abs(changePercent) < 0.6) {
    return "short_volatility";
  }

  if (changePercent >= 1) {
    return "directional_call";
  }

  if (changePercent <= -1) {
    return "directional_put";
  }

  return "neutral";
}

function buildTableMarkdown(items: OptionsSnapshotBatchItem[]): string {
  const headers = ["Underlying", "Spot", "IV proxy", "Move esperado", "Bias"];
  const separator = ["---", "---:", "---:", "---:", "---"];

  const rows = items.map((item) => {
    if (item.status === "error") {
      return `| ${item.underlying} | n/d | n/d | n/d | ${item.error.code} |`;
    }

    const ivLabel =
      typeof item.snapshot.impliedVolatility === "number"
        ? `${(item.snapshot.impliedVolatility * 100).toFixed(2)}%`
        : "n/d";
    const moveLabel =
      typeof item.snapshot.expectedMovePercent === "number"
        ? `${item.snapshot.expectedMovePercent.toFixed(2)}%`
        : "n/d";

    return `| ${item.underlying} | ${item.snapshot.spotPrice.toFixed(4)} | ${ivLabel} | ${moveLabel} | ${item.snapshot.optionsBias} |`;
  });

  return [`| ${headers.join(" | ")} |`, `| ${separator.join(" | ")} |`, ...rows].join("\n");
}

function toContractSnapshot(input: {
  daysToExpiry: number;
  fetchedAt: string;
  impliedVolatility: number | null;
  underlyingQuote: YahooMarketQuote;
  vixLevel: number | null;
}): OptionsContractSnapshot {
  const expectedMovePercent =
    input.impliedVolatility === null
      ? null
      : input.impliedVolatility * Math.sqrt(input.daysToExpiry / 365) * 100;
  const expectedMoveValue =
    expectedMovePercent === null
      ? null
      : (input.underlyingQuote.price * expectedMovePercent) / 100;

  return {
    daysToExpiry: input.daysToExpiry,
    expectedMovePercent,
    expectedMoveValue,
    fetchedAt: input.fetchedAt,
    impliedVolatility: input.impliedVolatility,
    marketState: input.underlyingQuote.marketState,
    optionsBias: resolveOptionsBias(input.underlyingQuote.changePercent, input.impliedVolatility),
    provider: "yahoo_finance",
    spotPrice: input.underlyingQuote.price,
    underlying: input.underlyingQuote.symbol,
    underlyingChangePercent24h: input.underlyingQuote.changePercent,
    vixLevel: input.vixLevel,
  };
}

export class OptionsMarketService {
  public async getSnapshot(input: {
    daysToExpiry?: number;
    underlying: string;
  }): Promise<OptionsContractSnapshot> {
    const underlying = optionsUnderlyingSchema.parse(input.underlying);
    const daysToExpiry = optionsDaysToExpirySchema.parse(input.daysToExpiry ?? 30);
    const batch = await this.getSnapshotBatch({
      daysToExpiry,
      underlyings: [underlying],
    });
    const first = batch.snapshots[0];

    if (!first || first.status === "error") {
      throw new AppError({
        code: "OPTIONS_UNDERLYING_NOT_AVAILABLE",
        details: {
          underlying,
        },
        message: "Options underlying is not available",
        statusCode: 503,
      });
    }

    return first.snapshot;
  }

  public async getSnapshotBatch(input: {
    daysToExpiry?: number;
    underlyings: string[];
  }): Promise<OptionsSnapshotBatchResponse> {
    const underlyings = optionsUnderlyingsSchema.parse(input.underlyings);
    const daysToExpiry = optionsDaysToExpirySchema.parse(input.daysToExpiry ?? 30);
    const requestedSymbols = [...new Set([...underlyings, "^VIX"])];
    const marketSnapshot = await yahooMarketDataAdapter.getMarketSnapshot({
      symbols: requestedSymbols,
    });
    const quotesBySymbol = new Map(marketSnapshot.quotes.map((quote) => [quote.symbol, quote] as const));
    const vixLevel = quotesBySymbol.get("^VIX")?.price ?? null;
    const impliedVolatilityProxy = vixLevel === null ? null : vixLevel / 100;

    const snapshots = underlyings.map((underlying) => {
      const quote = quotesBySymbol.get(underlying);

      if (!quote) {
        return {
          error: {
            code: "OPTIONS_UNDERLYING_NOT_AVAILABLE" as const,
            message: "Underlying was not returned by market provider",
          },
          status: "error" as const,
          underlying,
        };
      }

      return {
        snapshot: toContractSnapshot({
          daysToExpiry,
          fetchedAt: marketSnapshot.fetchedAt,
          impliedVolatility: impliedVolatilityProxy,
          underlyingQuote: quote,
          vixLevel,
        }),
        status: "ok" as const,
        underlying,
      };
    });

    const successCount = snapshots.filter((item) => item.status === "ok").length;

    return {
      daysToExpiry,
      failureCount: snapshots.length - successCount,
      fetchedAt: marketSnapshot.fetchedAt,
      impliedVolatilityProxy,
      requestedUnderlyings: underlyings,
      snapshots,
      successCount,
      vixLevel,
    };
  }

  public async getMarketOverview(input?: {
    daysToExpiry?: number;
    limit?: number;
    preset?: OptionsMarketOverviewPreset;
    underlyings?: string[];
  }): Promise<OptionsMarketOverviewResponse> {
    const preset = optionsMarketOverviewPresetSchema.parse(input?.preset ?? "us_indices");
    const sourceUnderlyings =
      input?.underlyings && input.underlyings.length > 0
        ? optionsUnderlyingsSchema.parse(input.underlyings)
        : optionsPresetUnderlyings[preset];
    const limit = Math.max(1, Math.min(20, Math.floor(input?.limit ?? sourceUnderlyings.length)));
    const selectedUnderlyings = sourceUnderlyings.slice(0, limit);
    const batch = await this.getSnapshotBatch({
      daysToExpiry: input?.daysToExpiry,
      underlyings: selectedUnderlyings,
    });

    return {
      daysToExpiry: batch.daysToExpiry,
      failureCount: batch.failureCount,
      fetchedAt: batch.fetchedAt,
      impliedVolatilityProxy: batch.impliedVolatilityProxy,
      preset,
      requestedUnderlyings: selectedUnderlyings,
      snapshots: batch.snapshots,
      successCount: batch.successCount,
      tableMarkdown: buildTableMarkdown(batch.snapshots),
      vixLevel: batch.vixLevel,
    };
  }
}
