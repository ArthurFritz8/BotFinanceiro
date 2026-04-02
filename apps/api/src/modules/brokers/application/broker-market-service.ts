import { z } from "zod";

import { BinanceMarketDataAdapter } from "../../../integrations/market_data/binance-market-data-adapter.js";
import { env } from "../../../shared/config/env.js";

const brokerNameSchema = z.enum(["binance", "iqoption"]);

const liveQuoteInputSchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
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
}
