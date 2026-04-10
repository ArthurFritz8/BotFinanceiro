import WebSocket, { type RawData } from "ws";
import { z } from "zod";

import { env } from "../../shared/config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { logger } from "../../shared/logger/logger.js";
import { retryWithExponentialBackoff } from "../../shared/resilience/retry-with-backoff.js";

const FUTURES_STREAM_STALE_MS = 20_000;
const FUTURES_STREAM_STALE_GRACE_MS = Math.max(FUTURES_STREAM_STALE_MS, env.CACHE_STALE_SECONDS * 1000);

const symbolSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
  .refine((value) => value.length >= 4 && value.length <= 20, {
    message: "symbol must contain between 4 and 20 alphanumeric characters",
  });

const tickerSchema = z.object({
  highPrice: z.string().optional(),
  lastPrice: z.string(),
  lowPrice: z.string().optional(),
  openPrice: z.string().optional(),
  priceChangePercent: z.string().optional(),
  quoteVolume: z.string().optional(),
  symbol: z.string().trim().min(1),
  volume: z.string().optional(),
});

const premiumIndexSchema = z.object({
  indexPrice: z.string().optional(),
  lastFundingRate: z.string().optional(),
  markPrice: z.string().optional(),
  nextFundingTime: z.coerce.number().int().nullable().optional(),
  symbol: z.string().trim().min(1),
});

const openInterestSchema = z.object({
  openInterest: z.string().optional(),
  symbol: z.string().trim().min(1),
  time: z.coerce.number().int().nullable().optional(),
});

type PremiumIndexPayload = z.infer<typeof premiumIndexSchema>;
type OpenInterestPayload = z.infer<typeof openInterestSchema>;

const tickerStreamItemSchema = z.object({
  P: z.string().optional(),
  c: z.string(),
  h: z.string().optional(),
  l: z.string().optional(),
  q: z.string().optional(),
  s: z.string().trim().min(1),
  v: z.string().optional(),
});

interface FuturesTickerCacheItem {
  changePercent24h: number | null;
  high24h: number | null;
  lastPrice: number;
  low24h: number | null;
  quoteVolume24h: number | null;
  updatedAtMs: number;
  volume24h: number | null;
}

interface FuturesTickerStreamState {
  closedByClient: boolean;
  reconnectAttempt: number;
  reconnectTimer: NodeJS.Timeout | null;
  websocket: WebSocket | null;
}

function normalizeNumeric(value: string | undefined): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundNumber(value: number): number {
  if (value >= 1000) {
    return Number(value.toFixed(2));
  }

  if (value >= 1) {
    return Number(value.toFixed(4));
  }

  return Number(value.toFixed(8));
}

function isRetryableStatusCode(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toRawText(rawData: RawData): string {
  if (typeof rawData === "string") {
    return rawData;
  }

  if (Array.isArray(rawData)) {
    return Buffer.concat(rawData).toString("utf8");
  }

  return rawData.toString("utf8");
}

function normalizeStreamSymbol(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function computeBackoffMs(attempt: number): number {
  const baseDelayMs = Math.min(30_000, 900 * 2 ** attempt);
  const jitterMs = Math.round(baseDelayMs * 0.2 * Math.random());
  return baseDelayMs + jitterMs;
}

function buildFuturesTickerWsUrl(): string {
  const normalizedBaseUrl = env.BINANCE_FUTURES_WS_BASE_URL.replace(/\/$/, "");

  if (normalizedBaseUrl.endsWith("/ws")) {
    return `${normalizedBaseUrl}/!ticker@arr`;
  }

  if (normalizedBaseUrl.endsWith("/stream")) {
    return `${normalizedBaseUrl}?streams=!ticker@arr`;
  }

  return `${normalizedBaseUrl}/ws/!ticker@arr`;
}

function extractTickerRecordsFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const payloadRecord = toRecord(payload);

  if (!payloadRecord) {
    return [];
  }

  if (Array.isArray(payloadRecord.data)) {
    return payloadRecord.data;
  }

  if (toRecord(payloadRecord.data)) {
    return [payloadRecord.data];
  }

  return [payloadRecord];
}

interface RetryableErrorDetails {
  retryable?: boolean;
}

function hasRetryableFlag(details: unknown): details is RetryableErrorDetails {
  if (typeof details !== "object" || details === null) {
    return false;
  }

  const detailsRecord = details as Record<string, unknown>;
  return typeof detailsRecord.retryable === "boolean";
}

function shouldRetryFuturesRequest(error: unknown): boolean {
  if (!(error instanceof AppError)) {
    return true;
  }

  if (error.code === "BINANCE_FUTURES_UNAVAILABLE") {
    return true;
  }

  if (error.code === "BINANCE_FUTURES_BAD_STATUS" && hasRetryableFlag(error.details)) {
    return error.details.retryable === true;
  }

  return false;
}

export interface BinanceFuturesContractSnapshot {
  derivatives: {
    indexPrice: number | null;
    lastFundingRate: number | null;
    markPrice: number | null;
    nextFundingTime: string | null;
    openInterest: number | null;
  };
  fetchedAt: string;
  market: {
    changePercent24h: number | null;
    high24h: number | null;
    lastPrice: number;
    low24h: number | null;
    quoteVolume24h: number | null;
    volume24h: number | null;
  };
  symbol: string;
  venue: "binance_futures";
}

export interface BinanceFuturesTickerStreamHealth {
  cacheSize: number;
  connected: boolean;
  connecting: boolean;
  enabled: boolean;
  freshSymbols: number;
  freshestTickerAt: string | null;
  reconnectAttempt: number;
  staleSymbols: number;
  stalenessThresholdMs: number;
  streamUrl: string;
}

export class BinanceFuturesMarketDataAdapter {
  private readonly streamEnabled = env.BINANCE_FUTURES_WS_ENABLED && env.NODE_ENV !== "test";

  private readonly tickerCacheBySymbol = new Map<string, FuturesTickerCacheItem>();

  private readonly tickerStreamState: FuturesTickerStreamState = {
    closedByClient: false,
    reconnectAttempt: 0,
    reconnectTimer: null,
    websocket: null,
  };

  public async getContractSnapshot(input: {
    symbol: string;
  }): Promise<BinanceFuturesContractSnapshot> {
    const symbol = symbolSchema.parse(input.symbol);
    this.ensureTickerStreamStarted();
    const [tickerData, premiumData, openInterestData] = await Promise.all([
      this.loadTickerWithFallback(symbol),
      this.loadPremiumIndexSafe(symbol),
      this.loadOpenInterestSafe(symbol),
    ]);
    const nextFundingTimeMs = premiumData?.nextFundingTime;

    return {
      derivatives: {
        indexPrice: normalizeNumeric(premiumData?.indexPrice),
        lastFundingRate: normalizeNumeric(premiumData?.lastFundingRate),
        markPrice: normalizeNumeric(premiumData?.markPrice),
        nextFundingTime:
          typeof nextFundingTimeMs === "number" && Number.isFinite(nextFundingTimeMs) && nextFundingTimeMs > 0
            ? new Date(nextFundingTimeMs).toISOString()
            : null,
        openInterest: normalizeNumeric(openInterestData?.openInterest),
      },
      fetchedAt: new Date().toISOString(),
      market: {
        changePercent24h: tickerData.changePercent24h,
        high24h: tickerData.high24h,
        lastPrice: tickerData.lastPrice,
        low24h: tickerData.low24h,
        quoteVolume24h: tickerData.quoteVolume24h,
        volume24h: tickerData.volume24h,
      },
      symbol,
      venue: "binance_futures",
    };
  }

  public shutdown(): void {
    this.teardownTickerStream();
  }

  public getTickerStreamHealth(): BinanceFuturesTickerStreamHealth {
    const websocket = this.tickerStreamState.websocket;
    const streamUrl = buildFuturesTickerWsUrl();
    const nowMs = Date.now();
    let freshSymbols = 0;
    let staleSymbols = 0;
    let freshestTickerAtMs: number | null = null;

    for (const cachedTicker of this.tickerCacheBySymbol.values()) {
      if (freshestTickerAtMs === null || cachedTicker.updatedAtMs > freshestTickerAtMs) {
        freshestTickerAtMs = cachedTicker.updatedAtMs;
      }

      if (nowMs - cachedTicker.updatedAtMs <= FUTURES_STREAM_STALE_MS) {
        freshSymbols += 1;
      } else {
        staleSymbols += 1;
      }
    }

    return {
      cacheSize: this.tickerCacheBySymbol.size,
      connected: websocket?.readyState === WebSocket.OPEN,
      connecting: websocket?.readyState === WebSocket.CONNECTING,
      enabled: this.streamEnabled,
      freshSymbols,
      freshestTickerAt:
        freshestTickerAtMs !== null
          ? new Date(freshestTickerAtMs).toISOString()
          : null,
      reconnectAttempt: this.tickerStreamState.reconnectAttempt,
      staleSymbols,
      stalenessThresholdMs: FUTURES_STREAM_STALE_MS,
      streamUrl,
    };
  }

  private async loadTickerViaRest(symbol: string): Promise<FuturesTickerCacheItem> {
    const query = new URLSearchParams({
      symbol,
    }).toString();
    const tickerPayload = await retryWithExponentialBackoff(
      () => this.requestJson(`/fapi/v1/ticker/24hr?${query}`),
      {
        attempts: 3,
        baseDelayMs: 200,
        jitterPercent: 20,
        shouldRetry: shouldRetryFuturesRequest,
      },
    );
    const parsedTicker = tickerSchema.safeParse(tickerPayload);

    if (!parsedTicker.success) {
      throw new AppError({
        code: "BINANCE_FUTURES_SCHEMA_MISMATCH",
        details: {
          openInterestIssues: [],
          premiumIssues: [],
          tickerIssues: parsedTicker.error.issues,
        },
        message: "Binance futures payload schema mismatch",
        statusCode: 502,
      });
    }

    const lastPrice = normalizeNumeric(parsedTicker.data.lastPrice);

    if (lastPrice === null) {
      throw new AppError({
        code: "BINANCE_FUTURES_PRICE_NOT_FOUND",
        details: {
          symbol,
        },
        message: "Binance futures ticker price is unavailable",
        statusCode: 503,
      });
    }

    const tickerData: FuturesTickerCacheItem = {
      changePercent24h: normalizeNumeric(parsedTicker.data.priceChangePercent),
      high24h: normalizeNumeric(parsedTicker.data.highPrice),
      lastPrice: roundNumber(lastPrice),
      low24h: normalizeNumeric(parsedTicker.data.lowPrice),
      quoteVolume24h: normalizeNumeric(parsedTicker.data.quoteVolume),
      updatedAtMs: Date.now(),
      volume24h: normalizeNumeric(parsedTicker.data.volume),
    };

    this.tickerCacheBySymbol.set(symbol, tickerData);
    return tickerData;
  }

  private async loadTickerWithFallback(symbol: string): Promise<FuturesTickerCacheItem> {
    const tickerFromStream = this.readTickerFromStream(symbol);

    if (tickerFromStream) {
      return tickerFromStream;
    }

    try {
      return await this.loadTickerViaRest(symbol);
    } catch (error) {
      const staleTicker = this.readStaleTickerFromCache(symbol);

      if (staleTicker) {
        logger.warn(
          {
            symbol,
          },
          "Binance futures ticker unavailable; serving stale ticker cache",
        );
        return staleTicker;
      }

      throw error;
    }
  }

  private async loadPremiumIndexSafe(symbol: string): Promise<PremiumIndexPayload | null> {
    const query = new URLSearchParams({
      symbol,
    }).toString();

    try {
      const payload = await retryWithExponentialBackoff(
        () => this.requestJson(`/fapi/v1/premiumIndex?${query}`),
        {
          attempts: 3,
          baseDelayMs: 200,
          jitterPercent: 20,
          shouldRetry: shouldRetryFuturesRequest,
        },
      );
      const parsedPayload = premiumIndexSchema.safeParse(payload);

      if (!parsedPayload.success) {
        logger.warn(
          {
            issues: parsedPayload.error.issues,
            symbol,
          },
          "Binance futures premium index schema mismatch; setting derivatives fields to null",
        );
        return null;
      }

      return parsedPayload.data;
    } catch (error) {
      logger.warn(
        {
          err: error,
          symbol,
        },
        "Binance futures premium index unavailable; setting derivatives fields to null",
      );
      return null;
    }
  }

  private async loadOpenInterestSafe(symbol: string): Promise<OpenInterestPayload | null> {
    const query = new URLSearchParams({
      symbol,
    }).toString();

    try {
      const payload = await retryWithExponentialBackoff(
        () => this.requestJson(`/fapi/v1/openInterest?${query}`),
        {
          attempts: 3,
          baseDelayMs: 200,
          jitterPercent: 20,
          shouldRetry: shouldRetryFuturesRequest,
        },
      );
      const parsedPayload = openInterestSchema.safeParse(payload);

      if (!parsedPayload.success) {
        logger.warn(
          {
            issues: parsedPayload.error.issues,
            symbol,
          },
          "Binance futures open interest schema mismatch; setting derivatives fields to null",
        );
        return null;
      }

      return parsedPayload.data;
    } catch (error) {
      logger.warn(
        {
          err: error,
          symbol,
        },
        "Binance futures open interest unavailable; setting derivatives fields to null",
      );
      return null;
    }
  }

  private readTickerFromStream(symbol: string): FuturesTickerCacheItem | null {
    const cachedTicker = this.tickerCacheBySymbol.get(symbol);

    if (!cachedTicker) {
      return null;
    }

    if (Date.now() - cachedTicker.updatedAtMs > FUTURES_STREAM_STALE_MS) {
      return null;
    }

    return cachedTicker;
  }

  private readStaleTickerFromCache(symbol: string): FuturesTickerCacheItem | null {
    const cachedTicker = this.tickerCacheBySymbol.get(symbol);

    if (!cachedTicker) {
      return null;
    }

    if (Date.now() - cachedTicker.updatedAtMs > FUTURES_STREAM_STALE_GRACE_MS) {
      return null;
    }

    return cachedTicker;
  }

  private ensureTickerStreamStarted(): void {
    if (!this.streamEnabled) {
      return;
    }

    if (this.tickerStreamState.reconnectTimer) {
      return;
    }

    const websocket = this.tickerStreamState.websocket;

    if (websocket && (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.connectTickerStream();
  }

  private connectTickerStream(): void {
    if (!this.streamEnabled) {
      return;
    }

    const wsUrl = buildFuturesTickerWsUrl();
    const websocket = new WebSocket(wsUrl, {
      handshakeTimeout: env.BINANCE_FUTURES_TIMEOUT_MS,
    });

    this.tickerStreamState.closedByClient = false;
    this.tickerStreamState.websocket = websocket;

    websocket.on("open", () => {
      this.tickerStreamState.reconnectAttempt = 0;
      logger.info({ wsUrl }, "Binance futures ticker stream connected");
    });

    websocket.on("message", (rawData) => {
      this.handleTickerStreamMessage(rawData);
    });

    websocket.on("error", (error) => {
      logger.warn({ err: error }, "Binance futures ticker stream error");
    });

    websocket.on("close", (code, reasonBuffer) => {
      const reason = reasonBuffer.toString("utf8");
      this.tickerStreamState.websocket = null;

      if (!this.streamEnabled || this.tickerStreamState.closedByClient) {
        return;
      }

      this.scheduleTickerReconnect(code, reason);
    });
  }

  private scheduleTickerReconnect(code: number, reason: string): void {
    if (this.tickerStreamState.closedByClient || this.tickerStreamState.reconnectTimer) {
      return;
    }

    this.tickerStreamState.reconnectAttempt += 1;
    const backoffMs = computeBackoffMs(this.tickerStreamState.reconnectAttempt);

    logger.warn(
      {
        backoffMs,
        code,
        reason,
      },
      "Binance futures ticker stream disconnected; scheduling reconnect",
    );

    this.tickerStreamState.reconnectTimer = setTimeout(() => {
      this.tickerStreamState.reconnectTimer = null;

      if (this.tickerStreamState.closedByClient || !this.streamEnabled) {
        return;
      }

      this.connectTickerStream();
    }, backoffMs);
  }

  private handleTickerStreamMessage(rawData: RawData): void {
    let payload: unknown;

    try {
      payload = JSON.parse(toRawText(rawData)) as unknown;
    } catch {
      return;
    }

    const tickerRecords = extractTickerRecordsFromPayload(payload);

    for (const tickerRecordRaw of tickerRecords) {
      const parsedTickerRecord = tickerStreamItemSchema.safeParse(tickerRecordRaw);

      if (!parsedTickerRecord.success) {
        continue;
      }

      const symbol = normalizeStreamSymbol(parsedTickerRecord.data.s);
      const lastPrice = normalizeNumeric(parsedTickerRecord.data.c);

      if (symbol.length < 4 || lastPrice === null) {
        continue;
      }

      this.tickerCacheBySymbol.set(symbol, {
        changePercent24h: normalizeNumeric(parsedTickerRecord.data.P),
        high24h: normalizeNumeric(parsedTickerRecord.data.h),
        lastPrice: roundNumber(lastPrice),
        low24h: normalizeNumeric(parsedTickerRecord.data.l),
        quoteVolume24h: normalizeNumeric(parsedTickerRecord.data.q),
        updatedAtMs: Date.now(),
        volume24h: normalizeNumeric(parsedTickerRecord.data.v),
      });
    }
  }

  private teardownTickerStream(): void {
    this.tickerStreamState.closedByClient = true;

    if (this.tickerStreamState.reconnectTimer) {
      clearTimeout(this.tickerStreamState.reconnectTimer);
      this.tickerStreamState.reconnectTimer = null;
    }

    const websocket = this.tickerStreamState.websocket;

    if (!websocket) {
      return;
    }

    if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) {
      websocket.close();
    }

    this.tickerStreamState.websocket = null;
  }

  private async requestJson(path: string): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(`${env.BINANCE_FUTURES_API_BASE_URL}${path}`, {
        method: "GET",
        signal: AbortSignal.timeout(env.BINANCE_FUTURES_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppError({
        code: "BINANCE_FUTURES_UNAVAILABLE",
        details: {
          cause: error,
          retryable: true,
        },
        message: "Binance futures request failed",
        statusCode: 503,
      });
    }

    if (!response.ok) {
      const responseBody = await response.text();
      const retryable = isRetryableStatusCode(response.status);

      throw new AppError({
        code: "BINANCE_FUTURES_BAD_STATUS",
        details: {
          path,
          responseBody: responseBody.slice(0, 1000),
          responseStatus: response.status,
          retryable,
        },
        message: "Binance futures returned a non-success status",
        statusCode: retryable ? 503 : 502,
      });
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      throw new AppError({
        code: "BINANCE_FUTURES_INVALID_JSON",
        details: {
          path,
          retryable: true,
        },
        message: "Binance futures returned invalid JSON",
        statusCode: 502,
      });
    }
  }
}
