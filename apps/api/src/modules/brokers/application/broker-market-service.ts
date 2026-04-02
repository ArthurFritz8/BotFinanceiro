import { z } from "zod";

import { BinanceMarketDataAdapter } from "../../../integrations/market_data/binance-market-data-adapter.js";
import { env } from "../../../shared/config/env.js";
import { AppError } from "../../../shared/errors/app-error.js";

const brokerNameSchema = z.enum(["binance", "iqoption"]);

const liveQuoteInputSchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  broker: brokerNameSchema.default("binance"),
});

const liveQuoteBatchInputSchema = z.object({
  assetIds: z.array(z.string().trim().min(1)).min(1).max(25),
  broker: brokerNameSchema.default("binance"),
});

export type BrokerName = z.infer<typeof brokerNameSchema>;

export interface BrokerCatalogItem {
  broker: BrokerName;
  capabilities: {
    accountBalance: boolean;
    liveQuote: boolean;
    orderExecution: boolean;
  };
  mode: "public" | "unavailable";
  notes: string;
  status: "active" | "requires_configuration";
}

export interface BrokerCatalogResponse {
  brokers: BrokerCatalogItem[];
  fetchedAt: string;
}

export interface BrokerLiveQuoteResponse {
  assetId: string;
  broker: BrokerName;
  capabilities: BrokerCatalogItem["capabilities"];
  currency: "usd";
  fetchedAt: string;
  market: {
    changePercent24h: number | null;
    price: number | null;
    symbol: string | null;
    volume24h: number | null;
  };
  mode: BrokerCatalogItem["mode"];
  notes: string;
  status: BrokerCatalogItem["status"];
}

export interface BrokerLiveQuoteBatchError {
  code: string;
  message: string;
}

export interface BrokerLiveQuoteBatchItem {
  assetId: string;
  broker: BrokerName;
  error: BrokerLiveQuoteBatchError | null;
  quote: BrokerLiveQuoteResponse | null;
  status: "error" | "ok" | "unavailable";
}

export interface BrokerLiveQuoteBatchResponse {
  broker: BrokerName;
  currency: "usd";
  fetchedAt: string;
  quotes: BrokerLiveQuoteBatchItem[];
  requestedAssets: string[];
  summary: {
    failed: number;
    ok: number;
    successRatePercent: number;
    total: number;
    unavailable: number;
  };
}

function sanitizeAssetIds(assetIds: string[]): string[] {
  const normalizedAssetIds = assetIds
    .map((assetId) => assetId.trim().toLowerCase())
    .filter((assetId) => assetId.length > 0);

  return [...new Set(normalizedAssetIds)];
}

function toBatchError(error: unknown): BrokerLiveQuoteBatchError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      code: "BROKER_QUOTE_ERROR",
      message: error.message,
    };
  }

  return {
    code: "BROKER_QUOTE_ERROR",
    message: "Failed to load broker quote",
  };
}

function buildBinanceCatalogItem(): BrokerCatalogItem {
  return {
    broker: "binance",
    capabilities: {
      accountBalance: false,
      liveQuote: true,
      orderExecution: false,
    },
    mode: "public",
    notes: "Integracao ativa para dados de mercado publicos (ticker e grafico).",
    status: "active",
  };
}

function buildIqOptionCatalogItem(): BrokerCatalogItem {
  if (env.IQOPTION_ENABLED) {
    return {
      broker: "iqoption",
      capabilities: {
        accountBalance: false,
        liveQuote: false,
        orderExecution: false,
      },
      mode: "unavailable",
      notes:
        "Conector IQ Option habilitado, mas sem endpoint publico padronizado nesta build. Configure uma bridge privada para ativar cotacao/ordens.",
      status: "requires_configuration",
    };
  }

  return {
    broker: "iqoption",
    capabilities: {
      accountBalance: false,
      liveQuote: false,
      orderExecution: false,
    },
    mode: "unavailable",
    notes:
      "Conector IQ Option registrado e pronto para extensao, aguardando configuracao (credenciais e bridge privada).",
    status: "requires_configuration",
  };
}

export class BrokerMarketService {
  private readonly binanceAdapter = new BinanceMarketDataAdapter();

  public getBrokerCatalog(): BrokerCatalogResponse {
    return {
      brokers: [buildBinanceCatalogItem(), buildIqOptionCatalogItem()],
      fetchedAt: new Date().toISOString(),
    };
  }

  public async getLiveQuote(input: {
    assetId: string;
    broker: BrokerName;
  }): Promise<BrokerLiveQuoteResponse> {
    const parsedInput = liveQuoteInputSchema.parse(input);

    if (parsedInput.broker === "binance") {
      const tickerSnapshot = await this.binanceAdapter.getTickerSnapshot({
        assetId: parsedInput.assetId,
      });
      const catalog = buildBinanceCatalogItem();

      return {
        assetId: parsedInput.assetId.toLowerCase(),
        broker: "binance",
        capabilities: catalog.capabilities,
        currency: "usd",
        fetchedAt: tickerSnapshot.fetchedAt,
        market: {
          changePercent24h: tickerSnapshot.changePercent24h,
          price: tickerSnapshot.lastPrice,
          symbol: tickerSnapshot.symbol,
          volume24h: tickerSnapshot.volume24h,
        },
        mode: catalog.mode,
        notes: catalog.notes,
        status: catalog.status,
      };
    }

    const catalog = buildIqOptionCatalogItem();

    return {
      assetId: parsedInput.assetId.toLowerCase(),
      broker: "iqoption",
      capabilities: catalog.capabilities,
      currency: "usd",
      fetchedAt: new Date().toISOString(),
      market: {
        changePercent24h: null,
        price: null,
        symbol: null,
        volume24h: null,
      },
      mode: catalog.mode,
      notes: catalog.notes,
      status: catalog.status,
    };
  }

  public async getLiveQuoteBatch(input: {
    assetIds: string[];
    broker: BrokerName;
  }): Promise<BrokerLiveQuoteBatchResponse> {
    const parsedInput = liveQuoteBatchInputSchema.parse(input);
    const requestedAssets = sanitizeAssetIds(parsedInput.assetIds);

    if (requestedAssets.length === 0) {
      return {
        broker: parsedInput.broker,
        currency: "usd",
        fetchedAt: new Date().toISOString(),
        quotes: [],
        requestedAssets,
        summary: {
          failed: 0,
          ok: 0,
          successRatePercent: 0,
          total: 0,
          unavailable: 0,
        },
      };
    }

    if (parsedInput.broker === "iqoption") {
      const quotes = await Promise.all(
        requestedAssets.map(async (assetId) => {
          const quote = await this.getLiveQuote({
            assetId,
            broker: "iqoption",
          });

          return {
            assetId,
            broker: "iqoption" as const,
            error: null,
            quote,
            status: "unavailable" as const,
          };
        }),
      );

      return this.buildBatchResponse(parsedInput.broker, requestedAssets, quotes);
    }

    const quotes = await Promise.all(
      requestedAssets.map(async (assetId) => {
        try {
          const quote = await this.getLiveQuote({
            assetId,
            broker: "binance",
          });

          return {
            assetId,
            broker: "binance" as const,
            error: null,
            quote,
            status: "ok" as const,
          };
        } catch (error) {
          return {
            assetId,
            broker: "binance" as const,
            error: toBatchError(error),
            quote: null,
            status: "error" as const,
          };
        }
      }),
    );

    return this.buildBatchResponse(parsedInput.broker, requestedAssets, quotes);
  }

  private buildBatchResponse(
    broker: BrokerName,
    requestedAssets: string[],
    quotes: BrokerLiveQuoteBatchItem[],
  ): BrokerLiveQuoteBatchResponse {
    const ok = quotes.filter((item) => item.status === "ok").length;
    const unavailable = quotes.filter((item) => item.status === "unavailable").length;
    const failed = quotes.filter((item) => item.status === "error").length;
    const total = quotes.length;
    const successfulItems = ok + unavailable;
    const successRatePercent =
      total === 0 ? 0 : Number(((successfulItems / total) * 100).toFixed(1));

    return {
      broker,
      currency: "usd",
      fetchedAt: new Date().toISOString(),
      quotes,
      requestedAssets,
      summary: {
        failed,
        ok,
        successRatePercent,
        total,
        unavailable,
      },
    };
  }
}
