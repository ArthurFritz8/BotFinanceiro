import { z } from "zod";

import {
  YahooMarketDataAdapter,
  type YahooMarketQuote,
} from "../../../integrations/market_data/yahoo-market-data-adapter.js";
import { AppError } from "../../../shared/errors/app-error.js";

const portfolioSymbolSchema = z
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

const portfolioPositionSchema = z.object({
  symbol: portfolioSymbolSchema,
  weight: z.number().positive().max(1000),
});

const portfolioPositionsSchema = z
  .array(portfolioPositionSchema)
  .min(1)
  .max(20)
  .transform((positions) => {
    const positionsBySymbol = new Map<string, number>();

    for (const position of positions) {
      positionsBySymbol.set(position.symbol, (positionsBySymbol.get(position.symbol) ?? 0) + position.weight);
    }

    return [...positionsBySymbol.entries()].map(([symbol, weight]) => ({
      symbol,
      weight,
    }));
  });

const portfolioPresetSchema = z.enum(["conservative", "balanced", "growth", "crypto_tilt"]);
const portfolioPresetsSchema = z
  .array(portfolioPresetSchema)
  .min(1)
  .max(6)
  .transform((presets) => [...new Set(presets)]);

type PortfolioPreset = z.infer<typeof portfolioPresetSchema>;

type PortfolioAssetClass =
  | "cash_like"
  | "commodities"
  | "crypto"
  | "equities"
  | "fixed_income"
  | "mixed";

type PortfolioRegime = "balanced" | "defensive_risk_off" | "high_risk_off" | "high_risk_on";

interface PortfolioPositionAllocation {
  symbol: string;
  weight: number;
}

export interface PortfolioPositionSnapshot {
  assetClass: PortfolioAssetClass;
  change24h: number | null;
  changePercent24h: number | null;
  currency: string | null;
  fetchedAt: string;
  marketState: string | null;
  name: string;
  normalizedWeight: number;
  price: number;
  provider: "yahoo_finance";
  symbol: string;
  targetWeight: number;
}

export interface PortfolioPositionFailure {
  assetClass: PortfolioAssetClass;
  error: {
    code: "PORTFOLIO_SYMBOL_NOT_AVAILABLE";
    message: string;
  };
  normalizedWeight: number;
  status: "error";
  symbol: string;
  targetWeight: number;
}

export interface PortfolioPositionSuccess {
  position: PortfolioPositionSnapshot;
  status: "ok";
  symbol: string;
}

export type PortfolioPositionBatchItem = PortfolioPositionSuccess | PortfolioPositionFailure;

export interface PortfolioSnapshotResponse {
  exposureByAssetClass: Record<PortfolioAssetClass, number>;
  failureCount: number;
  fetchedAt: string;
  positions: PortfolioPositionBatchItem[];
  preset: PortfolioPreset | "custom";
  regime: PortfolioRegime;
  requestedSymbols: string[];
  riskScore: number;
  successCount: number;
  tableMarkdown: string;
  weightedChangePercent24h: number | null;
}

export interface PortfolioSnapshotBatchFailure {
  error: {
    code: string;
    message: string;
  };
  preset: PortfolioPreset;
  status: "error";
}

export interface PortfolioSnapshotBatchSuccess {
  preset: PortfolioPreset;
  snapshot: PortfolioSnapshotResponse;
  status: "ok";
}

export type PortfolioSnapshotBatchItem = PortfolioSnapshotBatchSuccess | PortfolioSnapshotBatchFailure;

export interface PortfolioSnapshotBatchResponse {
  failureCount: number;
  fetchedAt: string;
  presets: PortfolioPreset[];
  snapshots: PortfolioSnapshotBatchItem[];
  successCount: number;
}

export interface PortfolioMarketOverviewResponse {
  bestMomentumPreset: {
    preset: PortfolioPreset;
    weightedChangePercent24h: number;
  } | null;
  failureCount: number;
  fetchedAt: string;
  presets: PortfolioPreset[];
  snapshots: PortfolioSnapshotBatchItem[];
  successCount: number;
  tableMarkdown: string;
  worstMomentumPreset: {
    preset: PortfolioPreset;
    weightedChangePercent24h: number;
  } | null;
}

const portfolioPresets: Record<PortfolioPreset, PortfolioPositionAllocation[]> = {
  balanced: [
    { symbol: "SPY", weight: 30 },
    { symbol: "QQQ", weight: 20 },
    { symbol: "AGG", weight: 25 },
    { symbol: "GLD", weight: 15 },
    { symbol: "BTC-USD", weight: 10 },
  ],
  conservative: [
    { symbol: "SHY", weight: 35 },
    { symbol: "AGG", weight: 30 },
    { symbol: "SPY", weight: 20 },
    { symbol: "GLD", weight: 15 },
  ],
  crypto_tilt: [
    { symbol: "BTC-USD", weight: 45 },
    { symbol: "ETH-USD", weight: 30 },
    { symbol: "SOL-USD", weight: 15 },
    { symbol: "GLD", weight: 10 },
  ],
  growth: [
    { symbol: "QQQ", weight: 30 },
    { symbol: "XLK", weight: 25 },
    { symbol: "SMH", weight: 20 },
    { symbol: "BTC-USD", weight: 15 },
    { symbol: "ETH-USD", weight: 10 },
  ],
};

const fixedIncomeSymbols = new Set(["AGG", "BND", "LQD", "HYG", "IEF", "TLT", "SHY", "TIP", "BIL", "SGOV"]);
const commoditiesSymbols = new Set(["GLD", "SLV", "DBC", "GSG", "GC=F", "CL=F", "NG=F"]);
const cashLikeSymbols = new Set(["BIL", "SGOV", "SHY", "^IRX"]);

const volatilityProxyByAssetClass: Record<PortfolioAssetClass, number> = {
  cash_like: 0.1,
  commodities: 0.45,
  crypto: 0.85,
  equities: 0.55,
  fixed_income: 0.25,
  mixed: 0.35,
};

const yahooMarketDataAdapter = new YahooMarketDataAdapter();

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function resolveAssetClass(symbol: string): PortfolioAssetClass {
  if (symbol.endsWith("-USD")) {
    return "crypto";
  }

  if (cashLikeSymbols.has(symbol)) {
    return "cash_like";
  }

  if (fixedIncomeSymbols.has(symbol) || symbol.startsWith("^")) {
    return "fixed_income";
  }

  if (commoditiesSymbols.has(symbol)) {
    return "commodities";
  }

  if (symbol.includes("=")) {
    return "mixed";
  }

  return "equities";
}

function computeExposureByAssetClass(positions: Array<{ assetClass: PortfolioAssetClass; normalizedWeight: number }>) {
  const exposure: Record<PortfolioAssetClass, number> = {
    cash_like: 0,
    commodities: 0,
    crypto: 0,
    equities: 0,
    fixed_income: 0,
    mixed: 0,
  };

  for (const position of positions) {
    exposure[position.assetClass] += position.normalizedWeight * 100;
  }

  return {
    cash_like: round(exposure.cash_like, 2),
    commodities: round(exposure.commodities, 2),
    crypto: round(exposure.crypto, 2),
    equities: round(exposure.equities, 2),
    fixed_income: round(exposure.fixed_income, 2),
    mixed: round(exposure.mixed, 2),
  };
}

function computeRiskScore(positions: Array<{ assetClass: PortfolioAssetClass; normalizedWeight: number }>): number {
  const weightedVolatility = positions.reduce((accumulator, position) => {
    return accumulator + position.normalizedWeight * volatilityProxyByAssetClass[position.assetClass];
  }, 0);

  return round(Math.min(100, weightedVolatility * 100), 2);
}

function computeWeightedChangePercent24h(positions: PortfolioPositionBatchItem[]): number | null {
  const weightedChange = positions.reduce((accumulator, position) => {
    if (position.status === "error") {
      return accumulator;
    }

    if (typeof position.position.changePercent24h !== "number") {
      return accumulator;
    }

    return accumulator + position.position.normalizedWeight * position.position.changePercent24h;
  }, 0);

  const hasAtLeastOneChange = positions.some(
    (position) => position.status === "ok" && typeof position.position.changePercent24h === "number",
  );

  return hasAtLeastOneChange ? round(weightedChange, 4) : null;
}

function resolveRegime(riskScore: number, weightedChangePercent24h: number | null): PortfolioRegime {
  if (weightedChangePercent24h === null) {
    return riskScore >= 65 ? "high_risk_on" : "balanced";
  }

  if (riskScore >= 65 && weightedChangePercent24h < -0.4) {
    return "high_risk_off";
  }

  if (riskScore >= 65 && weightedChangePercent24h >= -0.4) {
    return "high_risk_on";
  }

  if (riskScore < 45 && weightedChangePercent24h < -0.2) {
    return "defensive_risk_off";
  }

  return "balanced";
}

function buildTableMarkdown(items: PortfolioPositionBatchItem[]): string {
  const headers = ["Simbolo", "Classe", "Peso alvo", "Peso norm", "Preco", "Var 24h", "Status"];
  const separator = ["---", "---", "---:", "---:", "---:", "---:", "---"];

  const rows = items.map((item) => {
    if (item.status === "error") {
      return `| ${item.symbol} | ${item.assetClass} | ${item.targetWeight.toFixed(2)}% | ${(item.normalizedWeight * 100).toFixed(2)}% | n/d | n/d | ${item.error.code} |`;
    }

    const changePercent =
      typeof item.position.changePercent24h === "number"
        ? `${item.position.changePercent24h.toFixed(3)}%`
        : "n/d";

    return `| ${item.symbol} | ${item.position.assetClass} | ${item.position.targetWeight.toFixed(2)}% | ${(item.position.normalizedWeight * 100).toFixed(2)}% | ${item.position.price.toFixed(4)} | ${changePercent} | ok |`;
  });

  return [`| ${headers.join(" | ")} |`, `| ${separator.join(" | ")} |`, ...rows].join("\n");
}

function buildBatchTableMarkdown(items: PortfolioSnapshotBatchItem[]): string {
  const headers = ["Preset", "Risk score", "Var ponderada 24h", "Regime", "Status"];
  const separator = ["---", "---:", "---:", "---", "---"];

  const rows = items.map((item) => {
    if (item.status === "error") {
      return `| ${item.preset} | n/d | n/d | n/d | ${item.error.code} |`;
    }

    const weightedChangeLabel =
      typeof item.snapshot.weightedChangePercent24h === "number"
        ? `${item.snapshot.weightedChangePercent24h.toFixed(3)}%`
        : "n/d";

    return `| ${item.preset} | ${item.snapshot.riskScore.toFixed(2)} | ${weightedChangeLabel} | ${item.snapshot.regime} | ok |`;
  });

  return [`| ${headers.join(" | ")} |`, `| ${separator.join(" | ")} |`, ...rows].join("\n");
}

function toSnapshot(quote: YahooMarketQuote, fetchedAt: string): Omit<PortfolioPositionSnapshot, "assetClass" | "normalizedWeight" | "targetWeight"> {
  return {
    change24h: quote.change,
    changePercent24h: quote.changePercent,
    currency: quote.currency,
    fetchedAt,
    marketState: quote.marketState,
    name: quote.name,
    price: quote.price,
    provider: "yahoo_finance",
    symbol: quote.symbol,
  };
}

function normalizePositionsWithWeights(positions: PortfolioPositionAllocation[]) {
  const parsedPositions = portfolioPositionsSchema.parse(positions);
  const totalWeight = parsedPositions.reduce((accumulator, position) => accumulator + position.weight, 0);

  return parsedPositions.map((position) => ({
    assetClass: resolveAssetClass(position.symbol),
    normalizedWeight: position.weight / totalWeight,
    symbol: position.symbol,
    targetWeight: position.weight,
  }));
}

export class PortfolioAnalyticsService {
  public async getSnapshot(input?: {
    positions?: Array<{ symbol: string; weight: number }>;
    preset?: PortfolioPreset;
  }): Promise<PortfolioSnapshotResponse> {
    const preset = portfolioPresetSchema.parse(input?.preset ?? "balanced");
    const basePositions =
      input?.positions && input.positions.length > 0
        ? portfolioPositionsSchema.parse(input.positions)
        : portfolioPresets[preset];
    const positionsWithWeights = normalizePositionsWithWeights(basePositions);
    const requestedSymbols = positionsWithWeights.map((position) => position.symbol);
    const marketSnapshot = await yahooMarketDataAdapter.getMarketSnapshot({
      symbols: requestedSymbols,
    });
    const quotesBySymbol = new Map(
      marketSnapshot.quotes.map((quote) => [quote.symbol, toSnapshot(quote, marketSnapshot.fetchedAt)] as const),
    );

    const positions: PortfolioPositionBatchItem[] = positionsWithWeights.map((position) => {
      const quote = quotesBySymbol.get(position.symbol);

      if (!quote) {
        return {
          assetClass: position.assetClass,
          error: {
            code: "PORTFOLIO_SYMBOL_NOT_AVAILABLE" as const,
            message: "Portfolio symbol was not returned by market provider",
          },
          normalizedWeight: position.normalizedWeight,
          status: "error" as const,
          symbol: position.symbol,
          targetWeight: position.targetWeight,
        };
      }

      return {
        position: {
          ...quote,
          assetClass: position.assetClass,
          normalizedWeight: position.normalizedWeight,
          targetWeight: position.targetWeight,
        },
        status: "ok" as const,
        symbol: position.symbol,
      };
    });

    const successCount = positions.filter((position) => position.status === "ok").length;
    const weightedChangePercent24h = computeWeightedChangePercent24h(positions);
    const riskScore = computeRiskScore(positionsWithWeights);

    return {
      exposureByAssetClass: computeExposureByAssetClass(positionsWithWeights),
      failureCount: positions.length - successCount,
      fetchedAt: marketSnapshot.fetchedAt,
      positions,
      preset: input?.positions && input.positions.length > 0 ? "custom" : preset,
      regime: resolveRegime(riskScore, weightedChangePercent24h),
      requestedSymbols,
      riskScore,
      successCount,
      tableMarkdown: buildTableMarkdown(positions),
      weightedChangePercent24h,
    };
  }

  public async getSnapshotBatch(input?: { presets?: PortfolioPreset[] }): Promise<PortfolioSnapshotBatchResponse> {
    const presets = portfolioPresetsSchema.parse(input?.presets ?? ["conservative", "balanced", "growth", "crypto_tilt"]);
    const snapshots = await Promise.all(
      presets.map(async (preset) => {
        try {
          const snapshot = await this.getSnapshot({
            preset,
          });

          return {
            preset,
            snapshot,
            status: "ok" as const,
          };
        } catch (error) {
          if (error instanceof AppError) {
            return {
              error: {
                code: error.code,
                message: error.message,
              },
              preset,
              status: "error" as const,
            };
          }

          return {
            error: {
              code: "PORTFOLIO_BATCH_UNEXPECTED_ERROR",
              message: "Unexpected error while fetching portfolio preset",
            },
            preset,
            status: "error" as const,
          };
        }
      }),
    );

    const successCount = snapshots.filter((snapshot) => snapshot.status === "ok").length;

    return {
      failureCount: snapshots.length - successCount,
      fetchedAt: new Date().toISOString(),
      presets,
      snapshots,
      successCount,
    };
  }

  public async getMarketOverview(input?: {
    limit?: number;
    presets?: PortfolioPreset[];
  }): Promise<PortfolioMarketOverviewResponse> {
    const presetSource = portfolioPresetsSchema.parse(input?.presets ?? ["conservative", "balanced", "growth", "crypto_tilt"]);
    const limit = Math.max(1, Math.min(6, Math.floor(input?.limit ?? presetSource.length)));
    const selectedPresets = presetSource.slice(0, limit);
    const batch = await this.getSnapshotBatch({
      presets: selectedPresets,
    });

    const successfulSnapshots = batch.snapshots.filter(
      (snapshot): snapshot is PortfolioSnapshotBatchSuccess => snapshot.status === "ok",
    );
    const withMomentum = successfulSnapshots.filter(
      (snapshot) => typeof snapshot.snapshot.weightedChangePercent24h === "number",
    );
    const bestMomentumPreset =
      withMomentum.length === 0
        ? null
        : [...withMomentum].sort(
            (left, right) =>
              (right.snapshot.weightedChangePercent24h ?? Number.NEGATIVE_INFINITY) -
              (left.snapshot.weightedChangePercent24h ?? Number.NEGATIVE_INFINITY),
          )[0];
    const worstMomentumPreset =
      withMomentum.length === 0
        ? null
        : [...withMomentum].sort(
            (left, right) =>
              (left.snapshot.weightedChangePercent24h ?? Number.POSITIVE_INFINITY) -
              (right.snapshot.weightedChangePercent24h ?? Number.POSITIVE_INFINITY),
          )[0];

    return {
      bestMomentumPreset:
        bestMomentumPreset && typeof bestMomentumPreset.snapshot.weightedChangePercent24h === "number"
          ? {
              preset: bestMomentumPreset.preset,
              weightedChangePercent24h: bestMomentumPreset.snapshot.weightedChangePercent24h,
            }
          : null,
      failureCount: batch.failureCount,
      fetchedAt: new Date().toISOString(),
      presets: selectedPresets,
      snapshots: batch.snapshots,
      successCount: batch.successCount,
      tableMarkdown: buildBatchTableMarkdown(batch.snapshots),
      worstMomentumPreset:
        worstMomentumPreset && typeof worstMomentumPreset.snapshot.weightedChangePercent24h === "number"
          ? {
              preset: worstMomentumPreset.preset,
              weightedChangePercent24h: worstMomentumPreset.snapshot.weightedChangePercent24h,
            }
          : null,
    };
  }
}