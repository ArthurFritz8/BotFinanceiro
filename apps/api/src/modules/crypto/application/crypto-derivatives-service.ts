// ADR-119 — Crypto Derivatives Service.
//
// Concentra derivativos institucionais (funding rate, open interest, mark/index price),
// CVD (Cumulative Volume Delta) derivado de aggTrades e snapshot de orderbook L2.
//
// Estrategia:
// - Cache em memoria com TTL curto por endpoint para evitar bombardear o
//   provider em cliques rapidos do operador (10s para derivatives/orderbook,
//   3s para CVD que e mais sensivel).
// - Failure-tolerant: se um endpoint falhar, retorna cache stale com flag
//   `cache.state="stale"`; se nao houver cache, propaga AppError.
// - Symbol resolution via `resolveBinanceSymbol` (catalog single source of truth).

import { z } from "zod";

import { AppError } from "../../../shared/errors/app-error.js";
import { logger } from "../../../shared/logger/logger.js";
import {
  BinanceFuturesMarketDataAdapter,
  type BinanceFuturesContractSnapshot,
} from "../../../integrations/market_data/binance-futures-market-data-adapter.js";
import { resolveBinanceSymbol } from "../../../integrations/market_data/binance-market-data-adapter.js";

const DERIVATIVES_TTL_MS = 10_000;
const CVD_TTL_MS = 3_000;
const ORDERBOOK_TTL_MS = 5_000;
const FUNDING_HISTORY_TTL_MS = 60_000; // ADR-125: funding muda a cada 8h, 60s e generoso.
const STALE_TOLERANCE_MS = 60_000;

const assetIdSchema = z.string().trim().min(1).max(64);
const cvdLimitSchema = z.coerce.number().int().min(50).max(1000).default(500);
const fundingHistoryHoursSchema = z.coerce.number().int().min(8).max(168).default(24);
const orderbookLevelsSchema = z.union([
  z.literal(5),
  z.literal(10),
  z.literal(20),
  z.literal(50),
  z.literal(100),
]);

export interface DerivativesCacheState {
  state: "hit" | "miss" | "stale";
  ageMs: number;
}

export interface CryptoDerivativesSnapshot {
  assetId: string;
  symbol: string;
  contract: BinanceFuturesContractSnapshot;
  fundingPressure: {
    // Z-score normalizado [-3, +3] do funding atual vs base 0.
    // Funding > 0 = perp acima do spot (longs pagando shorts) = bias bearish curto prazo.
    // Aqui usamos heuristica simples: |rate * 10000| em multiplos de 1bp.
    rateBps: number | null;
    interpretation: "neutral" | "long_pressure" | "short_pressure" | "extreme_long" | "extreme_short";
  };
  fetchedAt: string;
  cache: DerivativesCacheState;
}

export interface CryptoCvdSnapshot {
  assetId: string;
  symbol: string;
  windowTrades: number;
  // Soma de quantidade de buys agressivos (taker buy) menos quantidade de sells agressivos.
  // isBuyerMaker=true significa o BUYER era maker -> agressor foi seller.
  cvd: number;
  buyVolume: number;
  sellVolume: number;
  buyRatio: number; // buyVolume / (buyVolume + sellVolume)
  firstTradeAt: string | null;
  lastTradeAt: string | null;
  fetchedAt: string;
  cache: DerivativesCacheState;
}

export interface CryptoOrderbookSnapshot {
  assetId: string;
  symbol: string;
  bids: Array<{ price: number; quantity: number }>;
  asks: Array<{ price: number; quantity: number }>;
  totals: {
    bidLiquidity: number;
    askLiquidity: number;
    imbalance: number; // (bid - ask) / (bid + ask) in [-1, 1]
  };
  spread: {
    bestBid: number | null;
    bestAsk: number | null;
    absolute: number | null;
    relativeBps: number | null;
  };
  lastUpdateId: number;
  fetchedAt: string;
  cache: DerivativesCacheState;
}

interface CacheEntry<T> {
  value: T;
  storedAtMs: number;
}

// ADR-125: snapshot do historico de funding rate para sparkline 24h.
export interface CryptoFundingHistoryPoint {
  fundingTime: string; // ISO
  fundingTimeMs: number;
  fundingRate: number;
  fundingRateBps: number;
}
export interface CryptoFundingHistorySnapshot {
  assetId: string;
  symbol: string;
  hours: number;
  points: CryptoFundingHistoryPoint[];
  summary: {
    count: number;
    avgRateBps: number | null;
    minRateBps: number | null;
    maxRateBps: number | null;
    latestRateBps: number | null;
    trend: "up" | "down" | "flat" | "n/a";
  };
  fetchedAt: string;
  cache: DerivativesCacheState;
}

function classifyFundingInterpretation(rate: number | null): CryptoDerivativesSnapshot["fundingPressure"]["interpretation"] {
  if (rate === null || !Number.isFinite(rate)) return "neutral";
  // Funding rate em proporcao (ex.: 0.0001 = 0.01% = 1bp).
  const bps = rate * 10000;
  if (bps >= 5) return "extreme_long";
  if (bps <= -5) return "extreme_short";
  if (bps >= 1) return "long_pressure";
  if (bps <= -1) return "short_pressure";
  return "neutral";
}

export class CryptoDerivativesService {
  private readonly adapter: BinanceFuturesMarketDataAdapter;
  private readonly derivativesCache = new Map<string, CacheEntry<BinanceFuturesContractSnapshot>>();
  private readonly cvdCache = new Map<string, CacheEntry<Omit<CryptoCvdSnapshot, "cache">>>();
  private readonly orderbookCache = new Map<string, CacheEntry<Omit<CryptoOrderbookSnapshot, "cache">>>();
  private readonly fundingHistoryCache = new Map<string, CacheEntry<Omit<CryptoFundingHistorySnapshot, "cache">>>();

  public constructor(adapter?: BinanceFuturesMarketDataAdapter) {
    this.adapter = adapter ?? new BinanceFuturesMarketDataAdapter();
  }

  public async getDerivatives(input: { assetId: string }): Promise<CryptoDerivativesSnapshot> {
    const assetId = assetIdSchema.parse(input.assetId).toLowerCase();
    const symbol = resolveBinanceSymbol(assetId);
    const cacheKey = symbol;
    const cached = this.derivativesCache.get(cacheKey);
    const nowMs = Date.now();

    if (cached && nowMs - cached.storedAtMs < DERIVATIVES_TTL_MS) {
      return this.buildDerivativesResponse(assetId, symbol, cached.value, {
        state: "hit",
        ageMs: nowMs - cached.storedAtMs,
      });
    }

    try {
      const fresh = await this.adapter.getContractSnapshot({ symbol });
      this.derivativesCache.set(cacheKey, { value: fresh, storedAtMs: nowMs });
      return this.buildDerivativesResponse(assetId, symbol, fresh, { state: "miss", ageMs: 0 });
    } catch (error) {
      if (cached && nowMs - cached.storedAtMs < STALE_TOLERANCE_MS) {
        logger.warn({ err: error, symbol }, "derivatives fresh fetch failed; serving stale");
        return this.buildDerivativesResponse(assetId, symbol, cached.value, {
          state: "stale",
          ageMs: nowMs - cached.storedAtMs,
        });
      }
      throw error;
    }
  }

  public async getCvd(input: { assetId: string; limit?: number }): Promise<CryptoCvdSnapshot> {
    const assetId = assetIdSchema.parse(input.assetId).toLowerCase();
    const limit = cvdLimitSchema.parse(input.limit ?? 500);
    const symbol = resolveBinanceSymbol(assetId);
    const cacheKey = `${symbol}:${limit}`;
    const nowMs = Date.now();
    const cached = this.cvdCache.get(cacheKey);

    if (cached && nowMs - cached.storedAtMs < CVD_TTL_MS) {
      return { ...cached.value, cache: { state: "hit", ageMs: nowMs - cached.storedAtMs } };
    }

    try {
      const trades = await this.adapter.getAggTrades({ symbol, limit });
      let buyVolume = 0;
      let sellVolume = 0;
      for (const trade of trades) {
        // isBuyerMaker=true -> agressor foi o vendedor.
        if (trade.isBuyerMaker) {
          sellVolume += trade.quantity;
        } else {
          buyVolume += trade.quantity;
        }
      }
      const totalVolume = buyVolume + sellVolume;
      const snapshot: Omit<CryptoCvdSnapshot, "cache"> = {
        assetId,
        symbol,
        windowTrades: trades.length,
        cvd: roundQty(buyVolume - sellVolume),
        buyVolume: roundQty(buyVolume),
        sellVolume: roundQty(sellVolume),
        buyRatio: totalVolume > 0 ? Number((buyVolume / totalVolume).toFixed(4)) : 0,
        firstTradeAt: trades.length > 0 && trades[0]
          ? new Date(trades[0].timestamp).toISOString()
          : null,
        lastTradeAt: trades.length > 0
          ? new Date((trades[trades.length - 1] as { timestamp: number }).timestamp).toISOString()
          : null,
        fetchedAt: new Date(nowMs).toISOString(),
      };
      this.cvdCache.set(cacheKey, { value: snapshot, storedAtMs: nowMs });
      return { ...snapshot, cache: { state: "miss", ageMs: 0 } };
    } catch (error) {
      if (cached && nowMs - cached.storedAtMs < STALE_TOLERANCE_MS) {
        logger.warn({ err: error, symbol }, "cvd fresh fetch failed; serving stale");
        return { ...cached.value, cache: { state: "stale", ageMs: nowMs - cached.storedAtMs } };
      }
      throw error;
    }
  }

  public async getOrderbook(input: {
    assetId: string;
    levels?: 5 | 10 | 20 | 50 | 100;
  }): Promise<CryptoOrderbookSnapshot> {
    const assetId = assetIdSchema.parse(input.assetId).toLowerCase();
    const levels = orderbookLevelsSchema.parse(input.levels ?? 20);
    const symbol = resolveBinanceSymbol(assetId);
    const cacheKey = `${symbol}:${levels}`;
    const nowMs = Date.now();
    const cached = this.orderbookCache.get(cacheKey);

    if (cached && nowMs - cached.storedAtMs < ORDERBOOK_TTL_MS) {
      return { ...cached.value, cache: { state: "hit", ageMs: nowMs - cached.storedAtMs } };
    }

    try {
      const depth = await this.adapter.getOrderbookDepth({ symbol, levels });
      const bidLiquidity = depth.bids.reduce((acc, lvl) => acc + lvl.price * lvl.quantity, 0);
      const askLiquidity = depth.asks.reduce((acc, lvl) => acc + lvl.price * lvl.quantity, 0);
      const totalLiq = bidLiquidity + askLiquidity;
      const bestBid = depth.bids[0]?.price ?? null;
      const bestAsk = depth.asks[0]?.price ?? null;
      const absoluteSpread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
      const relativeBps = absoluteSpread !== null && bestAsk !== null && bestAsk > 0
        ? Number(((absoluteSpread / bestAsk) * 10000).toFixed(3))
        : null;

      const snapshot: Omit<CryptoOrderbookSnapshot, "cache"> = {
        assetId,
        symbol,
        bids: depth.bids,
        asks: depth.asks,
        totals: {
          bidLiquidity: roundLiq(bidLiquidity),
          askLiquidity: roundLiq(askLiquidity),
          imbalance: totalLiq > 0 ? Number(((bidLiquidity - askLiquidity) / totalLiq).toFixed(4)) : 0,
        },
        spread: {
          bestBid,
          bestAsk,
          absolute: absoluteSpread !== null ? Number(absoluteSpread.toFixed(8)) : null,
          relativeBps,
        },
        lastUpdateId: depth.lastUpdateId,
        fetchedAt: new Date(nowMs).toISOString(),
      };
      this.orderbookCache.set(cacheKey, { value: snapshot, storedAtMs: nowMs });
      return { ...snapshot, cache: { state: "miss", ageMs: 0 } };
    } catch (error) {
      if (cached && nowMs - cached.storedAtMs < STALE_TOLERANCE_MS) {
        logger.warn({ err: error, symbol }, "orderbook fresh fetch failed; serving stale");
        return { ...cached.value, cache: { state: "stale", ageMs: nowMs - cached.storedAtMs } };
      }
      throw error;
    }
  }

  // ADR-125: historico de funding rate para sparkline 24h.
  // Cache TTL 60s alinhado com cadencia macro (funding muda apenas a cada 8h).
  public async getFundingHistory(input: {
    assetId: string;
    hours?: number;
  }): Promise<CryptoFundingHistorySnapshot> {
    const assetId = assetIdSchema.parse(input.assetId).toLowerCase();
    const hours = fundingHistoryHoursSchema.parse(input.hours ?? 24);
    const symbol = resolveBinanceSymbol(assetId);
    // Funding ocorre a cada 8h => entries necessarias = ceil(hours/8) + 1 (margem).
    const limit = Math.min(1000, Math.max(2, Math.ceil(hours / 8) + 1));
    const cacheKey = `${symbol}:${hours}`;
    const nowMs = Date.now();
    const cached = this.fundingHistoryCache.get(cacheKey);

    if (cached && nowMs - cached.storedAtMs < FUNDING_HISTORY_TTL_MS) {
      return { ...cached.value, cache: { state: "hit", ageMs: nowMs - cached.storedAtMs } };
    }

    try {
      const rawHistory = await this.adapter.getFundingHistory({ symbol, limit });
      const cutoffMs = nowMs - hours * 3_600_000;
      const filtered = rawHistory.filter((entry) => entry.fundingTime >= cutoffMs);
      const points: CryptoFundingHistoryPoint[] = filtered.map((entry) => ({
        fundingTime: new Date(entry.fundingTime).toISOString(),
        fundingTimeMs: entry.fundingTime,
        fundingRate: entry.fundingRate,
        fundingRateBps: Number((entry.fundingRate * 10000).toFixed(3)),
      }));

      const bpsValues = points.map((p) => p.fundingRateBps);
      const summary = bpsValues.length === 0
        ? { count: 0, avgRateBps: null, minRateBps: null, maxRateBps: null, latestRateBps: null, trend: "n/a" as const }
        : {
            count: bpsValues.length,
            avgRateBps: Number((bpsValues.reduce((acc, v) => acc + v, 0) / bpsValues.length).toFixed(3)),
            minRateBps: Number(Math.min(...bpsValues).toFixed(3)),
            maxRateBps: Number(Math.max(...bpsValues).toFixed(3)),
            latestRateBps: bpsValues[bpsValues.length - 1] ?? null,
            trend: classifyFundingTrend(bpsValues),
          };

      const snapshot: Omit<CryptoFundingHistorySnapshot, "cache"> = {
        assetId,
        symbol,
        hours,
        points,
        summary,
        fetchedAt: new Date(nowMs).toISOString(),
      };
      this.fundingHistoryCache.set(cacheKey, { value: snapshot, storedAtMs: nowMs });
      return { ...snapshot, cache: { state: "miss", ageMs: 0 } };
    } catch (error) {
      if (cached && nowMs - cached.storedAtMs < STALE_TOLERANCE_MS) {
        logger.warn({ err: error, symbol }, "funding history fresh fetch failed; serving stale");
        return { ...cached.value, cache: { state: "stale", ageMs: nowMs - cached.storedAtMs } };
      }
      throw error;
    }
  }

  private buildDerivativesResponse(
    assetId: string,
    symbol: string,
    contract: BinanceFuturesContractSnapshot,
    cache: DerivativesCacheState,
  ): CryptoDerivativesSnapshot {
    const rate = contract.derivatives.lastFundingRate;
    return {
      assetId,
      symbol,
      contract,
      fundingPressure: {
        rateBps: rate !== null && Number.isFinite(rate) ? Number((rate * 10000).toFixed(3)) : null,
        interpretation: classifyFundingInterpretation(rate),
      },
      fetchedAt: new Date().toISOString(),
      cache,
    };
  }
}

function roundQty(value: number): number {
  return Number(value.toFixed(6));
}

// ADR-125: classifica trend do funding pelo delta entre primeiro e ultimo bps.
function classifyFundingTrend(bpsValues: number[]): "up" | "down" | "flat" | "n/a" {
  if (bpsValues.length < 2) return "n/a";
  const first = bpsValues[0] ?? 0;
  const last = bpsValues[bpsValues.length - 1] ?? 0;
  const delta = last - first;
  if (Math.abs(delta) < 0.5) return "flat"; // < 0.5 bps de variacao = lateral.
  return delta > 0 ? "up" : "down";
}

function roundLiq(value: number): number {
  if (value >= 1000) return Number(value.toFixed(2));
  return Number(value.toFixed(4));
}

// Re-export para casos de erro testaveis.
export { AppError };
