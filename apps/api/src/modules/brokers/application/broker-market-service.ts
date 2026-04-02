import { z } from "zod";

import { BinanceMarketDataAdapter } from "../../../integrations/market_data/binance-market-data-adapter.js";
import {
  CoinCapMarketDataAdapter,
  type CoinCapMarketAsset,
} from "../../../integrations/market_data/coincap-market-data-adapter.js";
import { env } from "../../../shared/config/env.js";
import { AppError } from "../../../shared/errors/app-error.js";

const brokerNameSchema = z.enum(["binance", "bybit", "coinbase", "kraken", "okx", "iqoption"]);

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
  mode: "proxy" | "public" | "unavailable";
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

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatProxySymbol(symbol: string): string {
  return `${symbol.toUpperCase()}USD`;
}

function isProxyBroker(broker: BrokerName): broker is "bybit" | "coinbase" | "kraken" | "okx" {
  return broker === "bybit" || broker === "coinbase" || broker === "kraken" || broker === "okx";
}

function buildProxyCatalogItem(
  broker: "bybit" | "coinbase" | "kraken" | "okx",
): BrokerCatalogItem {
  return {
    broker,
    capabilities: {
      accountBalance: false,
      liveQuote: true,
      orderExecution: false,
    },
    mode: "proxy",
    notes:
      "Cotacao via feed publico resiliente (proxy multi-provider), sem execucao de ordem nesta build.",
    status: "active",
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
  private readonly coinCapAdapter = new CoinCapMarketDataAdapter();

  public getBrokerCatalog(): BrokerCatalogResponse {
    return {
      brokers: [
        buildBinanceCatalogItem(),
        buildProxyCatalogItem("bybit"),
        buildProxyCatalogItem("coinbase"),
        buildProxyCatalogItem("kraken"),
        buildProxyCatalogItem("okx"),
        buildIqOptionCatalogItem(),
      ],
      fetchedAt: new Date().toISOString(),
    };
  }

  public async getLiveQuote(input: {
    assetId: string;
    broker: BrokerName;
  }): Promise<BrokerLiveQuoteResponse> {
    const parsedInput = liveQuoteInputSchema.parse(input);

    if (isProxyBroker(parsedInput.broker)) {
      return this.getProxyLiveQuote(parsedInput.assetId, parsedInput.broker);
    }

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

    if (isProxyBroker(parsedInput.broker)) {
      const quotes = await this.getProxyBatchQuotes(parsedInput.broker, requestedAssets);
      return this.buildBatchResponse(parsedInput.broker, requestedAssets, quotes);
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
            broker: parsedInput.broker,
          });

          return {
            assetId,
            broker: parsedInput.broker,
            error: null,
            quote,
            status: "ok" as const,
          };
        } catch (error) {
          return {
            assetId,
            broker: parsedInput.broker,
            error: toBatchError(error),
            quote: null,
            status: "error" as const,
          };
        }
      }),
    );

    return this.buildBatchResponse(parsedInput.broker, requestedAssets, quotes);
  }

  private async getProxyBatchQuotes(
    broker: "bybit" | "coinbase" | "kraken" | "okx",
    requestedAssets: string[],
  ): Promise<BrokerLiveQuoteBatchItem[]> {
    let marketOverviewAssets: CoinCapMarketAsset[] = [];

    try {
      const marketOverview = await this.coinCapAdapter.getMarketOverview({
        limit: 25,
      });
      marketOverviewAssets = marketOverview.assets;
    } catch {
      marketOverviewAssets = [];
    }

    return Promise.all(
      requestedAssets.map(async (assetId) => {
        try {
          const quote = await this.buildProxyQuoteFromCoinCap(assetId, broker, marketOverviewAssets);

          return {
            assetId,
            broker,
            error: null,
            quote,
            status: "ok" as const,
          };
        } catch (error) {
          return {
            assetId,
            broker,
            error: toBatchError(error),
            quote: null,
            status: "error" as const,
          };
        }
      }),
    );
  }

  private async getProxyLiveQuote(
    assetId: string,
    broker: "bybit" | "coinbase" | "kraken" | "okx",
  ): Promise<BrokerLiveQuoteResponse> {
    let marketOverviewAssets: CoinCapMarketAsset[] = [];

    try {
      const marketOverview = await this.coinCapAdapter.getMarketOverview({
        limit: 25,
      });
      marketOverviewAssets = marketOverview.assets;
    } catch {
      marketOverviewAssets = [];
    }

    const quote = await this.buildProxyQuoteFromCoinCap(assetId, broker, marketOverviewAssets);
    return quote;
  }

  private async buildProxyQuoteFromCoinCap(
    rawAssetId: string,
    broker: "bybit" | "coinbase" | "kraken" | "okx",
    marketOverviewAssets?: CoinCapMarketAsset[],
  ): Promise<BrokerLiveQuoteResponse> {
    const assetId = rawAssetId.toLowerCase();
    const catalog = buildProxyCatalogItem(broker);
    const marketAsset = this.findAssetInOverview(assetId, marketOverviewAssets ?? []);

    if (marketAsset) {
      return {
        assetId,
        broker,
        capabilities: catalog.capabilities,
        currency: "usd",
        fetchedAt: new Date().toISOString(),
        market: {
          changePercent24h: marketAsset.changePercent24h,
          price: marketAsset.priceUsd,
          symbol: formatProxySymbol(marketAsset.symbol),
          volume24h: marketAsset.volumeUsd24h,
        },
        mode: catalog.mode,
        notes: catalog.notes,
        status: catalog.status,
      };
    }

    const spotQuote = await this.coinCapAdapter.getSpotPriceUsd({
      assetId,
    });

    return {
      assetId,
      broker,
      capabilities: catalog.capabilities,
      currency: "usd",
      fetchedAt: spotQuote.fetchedAt,
      market: {
        changePercent24h: null,
        price: spotQuote.price,
        symbol: formatProxySymbol(spotQuote.symbol),
        volume24h: null,
      },
      mode: catalog.mode,
      notes: `${catalog.notes} Variacao/volume podem ficar n/d para ativos fora do top overview.`,
      status: catalog.status,
    };
  }

  private findAssetInOverview(assetId: string, assets: CoinCapMarketAsset[]): CoinCapMarketAsset | null {
    const normalizedAssetId = normalizeToken(assetId);

    const directMatch = assets.find((asset) => normalizeToken(asset.assetId) === normalizedAssetId);

    if (directMatch) {
      return directMatch;
    }

    const bySymbol = assets.find((asset) => normalizeToken(asset.symbol) === normalizedAssetId);

    if (bySymbol) {
      return bySymbol;
    }

    return null;
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
