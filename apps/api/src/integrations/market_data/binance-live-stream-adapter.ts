import WebSocket, { type RawData } from "ws";
import { z } from "zod";

import {
  mapRangeToKlineConfig,
  resolveBinanceSymbol,
  type BinanceSupportedRange,
} from "./binance-market-data-adapter.js";
import { env } from "../../shared/config/env.js";
import { logger } from "../../shared/logger/logger.js";

const binanceLiveStreamInputSchema = z.object({
  assetId: z.string().trim().min(1).transform((value) => value.toLowerCase()),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("24h"),
});

type BinanceLiveStreamRange = z.infer<typeof binanceLiveStreamInputSchema>["range"];

type BinanceLiveStreamListener = (event: BinanceLiveStreamEvent) => void;

interface StreamSession {
  closedByClient: boolean;
  interval: string;
  key: string;
  listeners: Set<BinanceLiveStreamListener>;
  reconnectAttempt: number;
  reconnectTimer: NodeJS.Timeout | null;
  symbol: string;
  websocket: WebSocket | null;
}

export interface BinanceLiveTickerEvent {
  changePercent24h: number | null;
  eventAt: string;
  lastPrice: number;
  symbol: string;
  type: "ticker";
  volume24h: number | null;
}

export interface BinanceLiveKlineEvent {
  eventAt: string;
  isClosed: boolean;
  point: {
    close: number;
    high: number;
    low: number;
    open: number;
    timestamp: string;
    volume: number;
  };
  symbol: string;
  type: "kline";
}

export type BinanceLiveStreamEvent = BinanceLiveKlineEvent | BinanceLiveTickerEvent;

function roundPrice(value: number): number {
  if (value >= 1000) {
    return Number(value.toFixed(2));
  }

  if (value >= 1) {
    return Number(value.toFixed(4));
  }

  return Number(value.toFixed(8));
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toIsoTimestamp(value: unknown): string {
  const timestampMs = parseInteger(value);

  if (timestampMs === null) {
    return new Date().toISOString();
  }

  return new Date(timestampMs).toISOString();
}

function toRawText(rawData: RawData): string {
  if (typeof rawData === "string") {
    return rawData;
  }

  if (Buffer.isBuffer(rawData)) {
    return rawData.toString("utf8");
  }

  if (Array.isArray(rawData)) {
    return Buffer.concat(rawData).toString("utf8");
  }

  if (rawData instanceof ArrayBuffer) {
    return Buffer.from(rawData).toString("utf8");
  }

  return "";
}

function buildWsUrl(symbol: string, interval: string): string {
  const normalizedBaseUrl = env.BINANCE_WS_BASE_URL.replace(/\/$/, "");
  const streamNames = `${symbol.toLowerCase()}@ticker/${symbol.toLowerCase()}@kline_${interval}`;

  if (normalizedBaseUrl.endsWith("/stream")) {
    return `${normalizedBaseUrl}?streams=${streamNames}`;
  }

  return `${normalizedBaseUrl}/stream?streams=${streamNames}`;
}

function buildSessionKey(symbol: string, range: BinanceSupportedRange): string {
  return `${symbol}:${range}`;
}

function resolveKlineInterval(range: BinanceSupportedRange): string {
  return mapRangeToKlineConfig(range).interval;
}

function computeBackoffMs(attempt: number): number {
  const baseDelayMs = Math.min(30_000, 900 * 2 ** attempt);
  const jitterMs = Math.round(baseDelayMs * 0.2 * Math.random());
  return baseDelayMs + jitterMs;
}

function parseTickerEvent(payloadRecord: Record<string, unknown>): BinanceLiveTickerEvent | null {
  if (payloadRecord.e !== "24hrTicker") {
    return null;
  }

  const symbol = typeof payloadRecord.s === "string" ? payloadRecord.s : "";
  const lastPrice = parseNumber(payloadRecord.c);

  if (symbol.length === 0 || lastPrice === null) {
    return null;
  }

  return {
    changePercent24h: parseNumber(payloadRecord.P),
    eventAt: toIsoTimestamp(payloadRecord.E),
    lastPrice: roundPrice(lastPrice),
    symbol,
    type: "ticker",
    volume24h: parseNumber(payloadRecord.v),
  };
}

function parseKlineEvent(payloadRecord: Record<string, unknown>): BinanceLiveKlineEvent | null {
  if (payloadRecord.e !== "kline") {
    return null;
  }

  const klineRecord = toRecord(payloadRecord.k);

  if (!klineRecord) {
    return null;
  }

  const symbol = typeof klineRecord.s === "string" ? klineRecord.s : "";
  const timestampMs = parseInteger(klineRecord.t);
  const open = parseNumber(klineRecord.o);
  const high = parseNumber(klineRecord.h);
  const low = parseNumber(klineRecord.l);
  const close = parseNumber(klineRecord.c);
  const volume = parseNumber(klineRecord.v);

  if (
    symbol.length === 0
    || timestampMs === null
    || open === null
    || high === null
    || low === null
    || close === null
    || volume === null
  ) {
    return null;
  }

  return {
    eventAt: toIsoTimestamp(payloadRecord.E),
    isClosed: klineRecord.x === true,
    point: {
      close: roundPrice(close),
      high: roundPrice(Math.max(open, high, close)),
      low: roundPrice(Math.min(open, low, close)),
      open: roundPrice(open),
      timestamp: new Date(timestampMs).toISOString(),
      volume: Number(volume.toFixed(2)),
    },
    symbol,
    type: "kline",
  };
}

function parseLiveEvent(rawPayload: unknown): BinanceLiveStreamEvent | null {
  const payloadRecord = toRecord(rawPayload);

  if (!payloadRecord) {
    return null;
  }

  const nestedPayload = toRecord(payloadRecord.data);
  const normalizedPayload = nestedPayload ?? payloadRecord;
  const tickerEvent = parseTickerEvent(normalizedPayload);

  if (tickerEvent) {
    return tickerEvent;
  }

  return parseKlineEvent(normalizedPayload);
}

export class BinanceLiveStreamAdapter {
  private readonly sessionsByKey = new Map<string, StreamSession>();

  public subscribe(
    input: {
      assetId: string;
      range?: BinanceLiveStreamRange;
    },
    listener: BinanceLiveStreamListener,
  ): () => void {
    const parsedInput = binanceLiveStreamInputSchema.parse(input);
    const symbol = resolveBinanceSymbol(parsedInput.assetId);
    const sessionKey = buildSessionKey(symbol, parsedInput.range);
    const session = this.ensureSession(sessionKey, symbol, parsedInput.range);

    session.listeners.add(listener);
    session.closedByClient = false;

    if (!session.websocket && !session.reconnectTimer) {
      this.connectSession(session);
    }

    return () => {
      this.unsubscribe(sessionKey, listener);
    };
  }

  public shutdown(): void {
    for (const session of this.sessionsByKey.values()) {
      this.teardownSession(session);
    }
  }

  private ensureSession(key: string, symbol: string, range: BinanceSupportedRange): StreamSession {
    const existingSession = this.sessionsByKey.get(key);

    if (existingSession) {
      return existingSession;
    }

    const nextSession: StreamSession = {
      closedByClient: false,
      interval: resolveKlineInterval(range),
      key,
      listeners: new Set<BinanceLiveStreamListener>(),
      reconnectAttempt: 0,
      reconnectTimer: null,
      symbol,
      websocket: null,
    };

    this.sessionsByKey.set(key, nextSession);
    return nextSession;
  }

  private unsubscribe(sessionKey: string, listener: BinanceLiveStreamListener): void {
    const session = this.sessionsByKey.get(sessionKey);

    if (!session) {
      return;
    }

    session.listeners.delete(listener);

    if (session.listeners.size === 0) {
      this.teardownSession(session);
    }
  }

  private connectSession(session: StreamSession): void {
    if (session.listeners.size === 0) {
      this.sessionsByKey.delete(session.key);
      return;
    }

    const wsUrl = buildWsUrl(session.symbol, session.interval);
    const websocket = new WebSocket(wsUrl, {
      handshakeTimeout: env.BINANCE_TIMEOUT_MS,
    });

    session.websocket = websocket;

    websocket.on("open", () => {
      session.reconnectAttempt = 0;
    });

    websocket.on("message", (rawData) => {
      this.handleMessage(session, rawData);
    });

    websocket.on("error", (error) => {
      logger.warn(
        {
          err: error,
          symbol: session.symbol,
        },
        "Binance live websocket error",
      );
    });

    websocket.on("close", (code, reasonBuffer) => {
      const reason = reasonBuffer.toString("utf8");
      session.websocket = null;

      if (session.closedByClient || session.listeners.size === 0) {
        this.sessionsByKey.delete(session.key);
        return;
      }

      this.scheduleReconnect(session, code, reason);
    });
  }

  private scheduleReconnect(session: StreamSession, code: number, reason: string): void {
    if (session.reconnectTimer || session.closedByClient || session.listeners.size === 0) {
      return;
    }

    session.reconnectAttempt += 1;
    const backoffMs = computeBackoffMs(session.reconnectAttempt);

    logger.warn(
      {
        backoffMs,
        code,
        reason,
        symbol: session.symbol,
      },
      "Binance live websocket disconnected; scheduling reconnect",
    );

    session.reconnectTimer = setTimeout(() => {
      session.reconnectTimer = null;

      if (session.closedByClient || session.listeners.size === 0) {
        this.sessionsByKey.delete(session.key);
        return;
      }

      this.connectSession(session);
    }, backoffMs);
  }

  private handleMessage(session: StreamSession, rawData: RawData): void {
    const rawText = toRawText(rawData);
    let parsedPayload: unknown;

    try {
      parsedPayload = JSON.parse(rawText) as unknown;
    } catch {
      return;
    }

    const liveEvent = parseLiveEvent(parsedPayload);

    if (!liveEvent) {
      return;
    }

    for (const listener of session.listeners) {
      try {
        listener(liveEvent);
      } catch (error) {
        logger.warn(
          {
            err: error,
            symbol: session.symbol,
          },
          "Binance live listener failed",
        );
      }
    }
  }

  private teardownSession(session: StreamSession): void {
    session.closedByClient = true;

    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }

    if (session.websocket) {
      if (session.websocket.readyState === WebSocket.OPEN || session.websocket.readyState === WebSocket.CONNECTING) {
        session.websocket.close();
      }

      session.websocket = null;
    }

    this.sessionsByKey.delete(session.key);
  }
}
