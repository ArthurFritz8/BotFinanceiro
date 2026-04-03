import { z } from "zod";

import { BinanceMarketDataAdapter } from "../../../integrations/market_data/binance-market-data-adapter.js";
import {
  CoinCapMarketDataAdapter,
  type CoinCapMarketAsset,
} from "../../../integrations/market_data/coincap-market-data-adapter.js";
import { MultiExchangeMarketDataAdapter } from "../../../integrations/market_data/multi-exchange-market-data-adapter.js";
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

type NativeBroker = "bybit" | "coinbase" | "kraken" | "okx";

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
  diagnostics: {
    latencyMs: number;
    providerMode: "proxy" | "public" | "unavailable";
  };
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

function isNativeBroker(broker: BrokerName): broker is NativeBroker {
  return broker === "bybit" || broker === "coinbase" || broker === "kraken" || broker === "okx";
}

function buildNativeCatalogItem(broker: NativeBroker): BrokerCatalogItem {
  return {
    broker,
    capabilities: {
      accountBalance: false,
      liveQuote: true,
      orderExecution: false,
    },
    mode: "public",
    notes:
      "Cotacao via endpoint publico nativo da corretora, com fallback resiliente para feed proxy quando necessario.",
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

  private readonly multiExchangeAdapter = new MultiExchangeMarketDataAdapter();

  public getBrokerCatalog(): BrokerCatalogResponse {
    return {
      brokers: [
        buildBinanceCatalogItem(),
        buildNativeCatalogItem("bybit"),
        buildNativeCatalogItem("coinbase"),
        buildNativeCatalogItem("kraken"),
        buildNativeCatalogItem("okx"),
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

    if (isNativeBroker(parsedInput.broker)) {
      return this.getNativeExchangeLiveQuote(parsedInput.assetId, parsedInput.broker);
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
    const startedAt = Date.now();
    const parsedInput = liveQuoteBatchInputSchema.parse(input);
    const requestedAssets = sanitizeAssetIds(parsedInput.assetIds);

    if (requestedAssets.length === 0) {
      return {
        broker: parsedInput.broker,
        currency: "usd",
        diagnostics: {
          latencyMs: 0,
          providerMode: this.resolveProviderMode(parsedInput.broker),
        },
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
            status: quote.status === "requires_configuration" ? "unavailable" as const : "ok" as const,
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

    return this.buildBatchResponse(parsedInput.broker, requestedAssets, quotes, Date.now() - startedAt);
  }

  private async getNativeExchangeLiveQuote(
    assetId: string,
    broker: NativeBroker,
  ): Promise<BrokerLiveQuoteResponse> {
    const normalizedAssetId = assetId.toLowerCase();
    const catalog = buildNativeCatalogItem(broker);

    try {
      const tickerSnapshot = await this.multiExchangeAdapter.getTickerSnapshot({
        assetId: normalizedAssetId,
        broker,
      });

      return {
        assetId: normalizedAssetId,
        broker,
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
    } catch {
      const fallbackQuote = await this.buildProxyQuoteFromCoinCap(normalizedAssetId, broker);

      return {
        ...fallbackQuote,
        mode: "proxy",
        notes: `${fallbackQuote.notes} Fallback automatico aplicado por indisponibilidade temporaria do endpoint nativo.`,
      };
    }
  }

  private async buildProxyQuoteFromCoinCap(
    rawAssetId: string,
    broker: NativeBroker,
    marketOverviewAssets?: CoinCapMarketAsset[],
  ): Promise<BrokerLiveQuoteResponse> {
    const assetId = rawAssetId.toLowerCase();
    const catalog = buildNativeCatalogItem(broker);
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
        mode: "proxy",
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
      mode: "proxy",
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

  private resolveProviderMode(broker: BrokerName): "proxy" | "public" | "unavailable" {
    if (broker === "iqoption") {
      return "unavailable";
    }

    return "public";
  }

  private buildBatchResponse(
    broker: BrokerName,
    requestedAssets: string[],
    quotes: BrokerLiveQuoteBatchItem[],
    latencyMs: number,
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
      diagnostics: {
        latencyMs: Number(Math.max(0, latencyMs).toFixed(1)),
        providerMode: this.resolveProviderMode(broker),
      },
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
