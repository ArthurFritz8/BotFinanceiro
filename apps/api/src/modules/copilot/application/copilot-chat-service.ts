import {
  OpenRouterChatAdapter,
  type OpenRouterChatCompletion,
  type OpenRouterConversationMessage,
  type OpenRouterToolDefinition,
} from "../../../integrations/ai/openrouter-chat-adapter.js";
import {
  WebSearchAdapter,
  type WebSearchResultItem,
} from "../../../integrations/search/web-search-adapter.js";
import {
  DexScreenerSearchAdapter,
} from "../../../integrations/search/dexscreener-search-adapter.js";
import {
  CoinCapMarketDataAdapter,
  type CoinCapMarketAsset,
  type CoinCapMarketOverview,
} from "../../../integrations/market_data/coincap-market-data-adapter.js";
import {
  YahooMarketDataAdapter,
  type YahooMarketQuote,
} from "../../../integrations/market_data/yahoo-market-data-adapter.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { logger } from "../../../shared/logger/logger.js";
import {
  copilotChatAuditStore,
  type CopilotChatSessionHistory,
} from "../../../shared/observability/copilot-chat-audit-store.js";
import {
  AirdropIntelligenceService,
  type AirdropRewardType,
  type AirdropConfidence,
} from "../../airdrops/application/airdrop-intelligence-service.js";
import {
  B3MarketService,
} from "../../b3/application/b3-market-service.js";
import {
  BrokerMarketService,
  type BrokerName,
} from "../../brokers/application/broker-market-service.js";
import {
  CommoditiesMarketService,
} from "../../commodities/application/commodities-market-service.js";
import {
  CryptoChartService,
  type CryptoChartRange,
  type CryptoTrend,
  type TradeAction,
} from "../../crypto/application/crypto-chart-service.js";
import {
  CryptoSpotPriceService,
  type SpotPriceResponse,
} from "../../crypto/application/crypto-spot-price-service.js";
import {
  CryptoSyncPolicyService,
} from "../../crypto/application/crypto-sync-policy-service.js";
import {
  DefiMarketService,
} from "../../defi/application/defi-market-service.js";
import {
  EquitiesMarketService,
} from "../../equities/application/equities-market-service.js";
import {
  EtfsMarketService,
} from "../../etfs/application/etfs-market-service.js";
import {
  FiisMarketService,
} from "../../fiis/application/fiis-market-service.js";
import {
  FixedIncomeMarketService,
} from "../../fixed_income/application/fixed-income-market-service.js";
import {
  ForexMarketService,
} from "../../forex/application/forex-market-service.js";
import {
  FuturesMarketService,
} from "../../futures/application/futures-market-service.js";
import {
  GlobalSectorsMarketService,
} from "../../global_sectors/application/global-sectors-market-service.js";
import {
  MacroRatesMarketService,
} from "../../macro_rates/application/macro-rates-market-service.js";
import {
  OptionsMarketService,
} from "../../options/application/options-market-service.js";
import {
  PortfolioAnalyticsService,
} from "../../portfolios/application/portfolio-analytics-service.js";
import { SystemStatusService } from "../../system/application/system-status-service.js";
import {
  WallStreetMarketService,
} from "../../wall_street/application/wall-street-market-service.js";
import { z } from "zod";

export interface CopilotChatInput {
  maxTokens?: number;
  message: string;
  sessionId?: string;
  systemPrompt?: string;
  temperature?: number;
}

const openRouterChatAdapter = new OpenRouterChatAdapter();
const webSearchAdapter = new WebSearchAdapter();
const dexScreenerSearchAdapter = new DexScreenerSearchAdapter();
const coinCapMarketDataAdapter = new CoinCapMarketDataAdapter();
const yahooMarketDataAdapter = new YahooMarketDataAdapter();
const brokerMarketService = new BrokerMarketService();
const commoditiesMarketService = new CommoditiesMarketService();
const cryptoChartService = new CryptoChartService();
const cryptoSpotPriceService = new CryptoSpotPriceService();
const cryptoSyncPolicyService = new CryptoSyncPolicyService();
const systemStatusService = new SystemStatusService();
const airdropIntelligenceService = new AirdropIntelligenceService();
const b3MarketService = new B3MarketService();
const defiMarketService = new DefiMarketService();
const equitiesMarketService = new EquitiesMarketService();
const etfsMarketService = new EtfsMarketService();
const fiisMarketService = new FiisMarketService();
const fixedIncomeMarketService = new FixedIncomeMarketService();
const forexMarketService = new ForexMarketService();
const futuresMarketService = new FuturesMarketService();
const globalSectorsMarketService = new GlobalSectorsMarketService();
const macroRatesMarketService = new MacroRatesMarketService();
const optionsMarketService = new OptionsMarketService();
const portfolioAnalyticsService = new PortfolioAnalyticsService();
const wallStreetMarketService = new WallStreetMarketService();

const copilotDefaultSystemPrompt = [
  "Voce e um assistente geral util, com especialidade em dados objetivos de mercado e operacao.",
  "Se a pergunta for geral e nao envolver mercado financeiro, responda normalmente de forma clara e direta, sem forcar contexto de mercado ou uso de tools.",
  "Quando a pergunta envolver resumo, panorama ou contexto do mercado cripto, priorize a tool get_crypto_market_overview.",
  "Quando a pergunta envolver preco ou comparacao entre ativos, use get_crypto_spot_price ou get_crypto_multi_spot_price.",
  "Quando a pergunta envolver grafico, tendencia, suporte/resistencia ou analise tecnica de cripto, use get_crypto_chart_insights.",
  "Quando a pergunta envolver airdrops, retroativos, testnet, quests ou farming, use get_airdrop_opportunities.",
  "Quando a pergunta envolver corretoras (Binance, Bybit, Coinbase, Kraken, OKX, IQ Option), use get_broker_live_quote para informar disponibilidade e cotacao ao vivo quando possivel.",
  "Quando a pergunta envolver forex (pares de moedas, cambio), use get_forex_market_snapshot.",
  "Quando a pergunta envolver futuros (funding, open interest, contratos perp), use get_futures_market_snapshot.",
  "Quando a pergunta envolver opcoes (volatilidade implicita, move esperado e bias), use get_options_market_snapshot.",
  "Quando a pergunta envolver commodities (metais, energia, agro), use get_commodities_market_snapshot.",
  "Quando a pergunta envolver renda fixa (curva de juros, bonds, duration), use get_fixed_income_market_snapshot.",
  "Quando a pergunta envolver ETFs (broad market, tematicos, internacionais), use get_etfs_market_snapshot.",
  "Quando a pergunta envolver rotacao setorial global (tecnologia, financeiro, energia), use get_global_sectors_market_snapshot.",
  "Quando a pergunta envolver macro rates (curva de juros, DXY, VIX, regime de risco), use get_macro_rates_market_snapshot.",
  "Quando a pergunta envolver carteira, alocacao, diversificacao e risco ponderado, use get_portfolio_risk_snapshot.",
  "Quando a pergunta envolver B3 (acoes brasileiras e indices locais), use get_b3_market_snapshot.",
  "Quando a pergunta envolver FIIs (fundos imobiliarios listados), use get_fiis_market_snapshot.",
  "Quando a pergunta envolver acoes globais por ticker (AAPL, MSFT, NVDA etc), use get_equities_market_snapshot.",
  "Quando a pergunta envolver Wall Street (indices/setores/rates/risk-on), use get_wall_street_market_snapshot.",
  "Quando a pergunta envolver DeFi (tokens, DEX, lending), use get_defi_market_snapshot.",
  "Quando a pergunta pedir comprar/vender, responda com sinal tatico informativo (buy/sell/wait), confianca e niveis de risco, sem tratar como recomendacao de investimento.",
  "Quando a pergunta envolver indices, acoes, cambio, juros ou commodities, use get_financial_market_snapshot.",
  "Quando a pergunta envolver risco de curto prazo, entregue analise por fatores (volatilidade, liquidez, macro e operacao), sem recomendacao de investimento.",
  "Quando houver duvida sobre onde comprar/listagem de token, use primeiro a tool search_token_listings_dexscreener e so depois search_web_realtime se nao houver resposta suficiente.",
  "Quando houver ativo/ticker desconhecido ou anafora (ex.: 'essa moeda'), use obrigatoriamente a tool search_web_realtime antes de responder.",
  "E proibido delegar o trabalho com frases como 'pesquise no Google', 'procure no Google' ou equivalentes.",
  "Ao usar dados de busca web, sintetize e cite as principais fontes com URL no corpo da resposta.",
  "Nao recuse genericamente se houver dados disponiveis nas tools; entregue resposta concisa com numeros e contexto.",
  "Se algum dado estiver indisponivel, explicite a limitacao e continue com os dados que conseguiu coletar.",
  "Nao forneca recomendacao de investimento; mantenha tom analitico e neutro.",
].join(" ");

const copilotGeneralAssistantSystemPrompt = [
  "Voce e um assistente geral util, claro e objetivo.",
  "Responda em portugues do Brasil, com linguagem natural e direta.",
  "Nao force contexto financeiro se a pergunta for de outro assunto.",
  "Se nao souber algum fato, sinalize a limitacao de forma transparente e sugira como verificar.",
].join(" ");

const copilotSpotPriceToolInputSchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  currency: z.string().trim().min(2).max(10).default("usd"),
});

const copilotMultiSpotPriceToolInputSchema = z.object({
  assetIds: z
    .array(z.string().trim().min(1).max(50).transform((value) => value.toLowerCase()))
    .min(2)
    .max(8)
    .default(["bitcoin", "ethereum"]),
  currency: z.string().trim().min(2).max(10).default("usd"),
});

const copilotMarketOverviewToolInputSchema = z.object({
  limit: z.number().int().min(3).max(15).default(8),
});

const copilotCryptoChartToolInputSchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  currency: z.string().trim().min(2).max(10).default("usd"),
  exchange: z.enum(["binance", "bybit", "coinbase", "kraken", "okx"]).default("binance"),
  mode: z.enum(["delayed", "live"]).default("delayed"),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("7d"),
});

const copilotAirdropOpportunitiesToolInputSchema = z.object({
  includeSpeculative: z.boolean().default(true),
  limit: z.number().int().min(3).max(25).default(10),
  minScore: z.number().min(0).max(100).default(30),
  query: z.string().trim().max(160).optional(),
});

const copilotSyncPolicyToolInputSchema = z.object({
  scope: z.enum(["hot", "warm", "cold"]).optional(),
});

const copilotOperationalHealthToolInputSchema = z.object({});

const copilotFinancialMarketSnapshotToolInputSchema = z.object({
  preset: z.enum(["global", "us", "brazil", "risk"]).default("global"),
  symbols: z
    .array(z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()))
    .min(1)
    .max(12)
    .optional(),
});

const copilotBrokerLiveQuoteToolInputSchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  broker: z.enum(["binance", "bybit", "coinbase", "kraken", "okx", "iqoption"]).default("binance"),
});

const copilotDexScreenerTokenLookupToolInputSchema = z.object({
  maxResults: z.number().int().min(1).max(8).default(4),
  query: z.string().trim().min(2).max(120),
});

const copilotWebSearchToolInputSchema = z.object({
  focus: z.enum(["general", "news", "token_lookup", "where_to_buy"]).default("general"),
  maxResults: z.number().int().min(3).max(10).default(6),
  query: z.string().trim().min(2).max(180),
});

const copilotForexMarketSnapshotToolInputSchema = z.object({
  pairs: z
    .array(z.string().trim().min(3).max(12).transform((value) => value.toUpperCase()))
    .min(1)
    .max(10)
    .optional(),
  preset: z.enum(["majors", "latam", "europe", "asia", "global"]).default("majors"),
});

const copilotFuturesMarketSnapshotToolInputSchema = z.object({
  preset: z.enum(["crypto_majors", "layer1", "defi"]).default("crypto_majors"),
  symbols: z
    .array(z.string().trim().min(2).max(20).transform((value) => value.toUpperCase()))
    .min(1)
    .max(8)
    .optional(),
});

const copilotOptionsMarketSnapshotToolInputSchema = z.object({
  daysToExpiry: z.number().int().min(1).max(365).default(30),
  preset: z.enum(["us_indices", "us_mega_caps", "high_beta", "global"]).default("us_indices"),
  underlyings: z
    .array(z.string().trim().min(1).max(24).transform((value) => value.toUpperCase()))
    .min(1)
    .max(10)
    .optional(),
});

const copilotCommoditiesMarketSnapshotToolInputSchema = z.object({
  preset: z.enum(["metals", "energy", "agro", "global"]).default("global"),
  symbols: z
    .array(z.string().trim().min(2).max(32).transform((value) => value.toUpperCase()))
    .min(1)
    .max(10)
    .optional(),
});

const copilotFixedIncomeMarketSnapshotToolInputSchema = z.object({
  preset: z.enum(["us_curve", "credit_proxies", "rates_risk", "global_macro"]).default("us_curve"),
  symbols: z
    .array(z.string().trim().min(1).max(32).transform((value) => value.toUpperCase()))
    .min(1)
    .max(10)
    .optional(),
});

const copilotEtfsMarketSnapshotToolInputSchema = z.object({
  preset: z.enum(["broad_market", "thematic", "international", "fixed_income"]).default("broad_market"),
  symbols: z
    .array(z.string().trim().min(1).max(32).transform((value) => value.toUpperCase()))
    .min(1)
    .max(10)
    .optional(),
});

const copilotGlobalSectorsMarketSnapshotToolInputSchema = z.object({
  preset: z.enum(["us_sectors", "global_cyclicals", "defensives", "growth"]).default("us_sectors"),
  symbols: z
    .array(z.string().trim().min(1).max(32).transform((value) => value.toUpperCase()))
    .min(1)
    .max(10)
    .optional(),
});

const copilotMacroRatesMarketSnapshotToolInputSchema = z.object({
  preset: z.enum(["usd_rates", "global_rates", "inflation_proxies", "risk_regime"]).default("usd_rates"),
  symbols: z
    .array(z.string().trim().min(1).max(32).transform((value) => value.toUpperCase()))
    .min(1)
    .max(10)
    .optional(),
});

const copilotPortfolioRiskSnapshotToolInputSchema = z.object({
  positions: z
    .array(
      z.object({
        symbol: z.string().trim().min(1).max(32).transform((value) => value.toUpperCase()),
        weight: z.number().positive().max(1000),
      }),
    )
    .min(1)
    .max(10)
    .optional(),
  preset: z.enum(["conservative", "balanced", "growth", "crypto_tilt"]).default("balanced"),
});

const copilotB3MarketSnapshotToolInputSchema = z.object({
  preset: z.enum(["blue_chips", "indices", "dividendos", "mid_caps"]).default("blue_chips"),
  symbols: z
    .array(z.string().trim().min(2).max(24).transform((value) => value.toUpperCase()))
    .min(1)
    .max(10)
    .optional(),
});

const copilotFiisMarketSnapshotToolInputSchema = z.object({
  preset: z.enum(["high_liquidity", "tijolo", "papel", "global"]).default("high_liquidity"),
  symbols: z
    .array(z.string().trim().min(2).max(16).transform((value) => value.toUpperCase()))
    .min(1)
    .max(10)
    .optional(),
});

const copilotEquitiesMarketSnapshotToolInputSchema = z.object({
  preset: z.enum(["us_mega_caps", "global_brands", "innovation", "dividends"]).default("us_mega_caps"),
  symbols: z
    .array(z.string().trim().min(1).max(32).transform((value) => value.toUpperCase()))
    .min(1)
    .max(10)
    .optional(),
});

const copilotWallStreetMarketSnapshotToolInputSchema = z.object({
  preset: z.enum(["indices", "sectors", "rates", "risk_on"]).default("indices"),
  symbols: z
    .array(z.string().trim().min(1).max(32).transform((value) => value.toUpperCase()))
    .min(1)
    .max(10)
    .optional(),
});

const copilotDefiMarketSnapshotToolInputSchema = z.object({
  assetIds: z
    .array(z.string().trim().min(2).max(40).transform((value) => value.toLowerCase()))
    .min(1)
    .max(10)
    .optional(),
  preset: z.enum(["blue_chips", "dex", "lending", "infrastructure"]).default("blue_chips"),
});

type FinancialMarketPreset = z.infer<typeof copilotFinancialMarketSnapshotToolInputSchema>["preset"];

const copilotConversationHistoryLimit = 24;
const copilotConversationMaxChars = 12_000;
const copilotIntentContextUserTurns = 3;

interface MultiSpotPriceSuccessResult {
  assetId: string;
  cacheState: SpotPriceResponse["cache"]["state"];
  fetchedAt: string;
  price: number;
  stale: boolean;
}

interface MultiSpotPriceFailureResult {
  assetId: string;
  error: {
    code: string;
    message: string;
  };
}

interface MarketSnapshotSuccessResult {
  assetId: string;
  cacheState: SpotPriceResponse["cache"]["state"];
  price: number;
  stale: boolean;
}

interface MarketSnapshotFailureResult {
  assetId: string;
  code: string;
}

const marketSummaryAssetIds = ["bitcoin", "ethereum", "solana", "xrp", "bnb"];
const marketSummaryCurrency = "usd";
const financialMarketPresetSymbols: Record<FinancialMarketPreset, string[]> = {
  brazil: ["^BVSP", "BRL=X", "EWZ", "VALE3.SA", "PETR4.SA", "^TNX"],
  global: ["^GSPC", "^IXIC", "^DJI", "^BVSP", "EURUSD=X", "BRL=X", "GC=F", "CL=F", "^TNX", "BTC-USD", "ETH-USD"],
  risk: ["^VIX", "^TNX", "GC=F", "CL=F", "BTC-USD", "ETH-USD"],
  us: ["^GSPC", "^IXIC", "^DJI", "SPY", "QQQ", "IWM", "^TNX"],
};
const riskAssetAliases: Array<{ aliases: string[]; assetId: string }> = [
  {
    aliases: ["bitcoin", "btc"],
    assetId: "bitcoin",
  },
  {
    aliases: ["ethereum", "eth"],
    assetId: "ethereum",
  },
  {
    aliases: ["solana", "sol"],
    assetId: "solana",
  },
  {
    aliases: ["xrp", "ripple"],
    assetId: "xrp",
  },
  {
    aliases: ["bnb", "binance"],
    assetId: "bnb",
  },
  {
    aliases: ["dogecoin", "doge"],
    assetId: "dogecoin",
  },
  {
    aliases: ["cardano", "ada"],
    assetId: "cardano",
  },
  {
    aliases: ["chainlink", "link"],
    assetId: "chainlink",
  },
  {
    aliases: ["pi network", "pi-network", "pi"],
    assetId: "pi-network",
  },
];

const brokerWhereToBuyAliases = [
  "onde comprar",
  "aonde comprar",
  "onde compra",
  "aonde compra",
  "qual corretora",
  "qual broker",
  "qual exchange",
  "em qual corretora",
  "em qual exchange",
  "onde negocia",
  "onde negociar",
  "onde listar",
  "onde listado",
  "listado em qual",
];

const assetHintNoiseTokens = new Set([
  "token",
  "moeda",
  "coin",
  "cripto",
  "crypto",
  "essa",
  "esse",
  "isto",
  "isso",
  "onde",
  "aonde",
  "comprar",
  "corretora",
  "exchange",
  "broker",
  "qual",
  "como",
  "para",
  "com",
  "sobre",
  "hoje",
  "agora",
]);

const knownExchangeMatchers: Array<{ aliases: string[]; label: string }> = [
  {
    aliases: ["binance"],
    label: "Binance",
  },
  {
    aliases: ["bybit"],
    label: "Bybit",
  },
  {
    aliases: ["coinbase"],
    label: "Coinbase",
  },
  {
    aliases: ["kraken"],
    label: "Kraken",
  },
  {
    aliases: ["okx", "ok-ex", "ok ex"],
    label: "OKX",
  },
  {
    aliases: ["mexc"],
    label: "MEXC",
  },
  {
    aliases: ["gate.io", "gateio", "gate io"],
    label: "Gate.io",
  },
  {
    aliases: ["kucoin"],
    label: "KuCoin",
  },
  {
    aliases: ["bitget"],
    label: "Bitget",
  },
  {
    aliases: ["uniswap"],
    label: "Uniswap",
  },
  {
    aliases: ["pancakeswap"],
    label: "PancakeSwap",
  },
  {
    aliases: ["raydium"],
    label: "Raydium",
  },
];

const airdropNoiseTokens = new Set([
  "airdrop",
  "airdrops",
  "buscar",
  "busque",
  "campanha",
  "campanhas",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "fazer",
  "me",
  "na",
  "nas",
  "no",
  "nos",
  "para",
  "por",
  "quais",
  "quero",
  "retroativo",
  "retroativos",
  "semana",
  "sobre",
  "testnet",
]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasWhereToBuyIntent(normalizedMessage: string): boolean {
  if (brokerWhereToBuyAliases.some((alias) => normalizedMessage.includes(alias))) {
    return true;
  }

  return (
    /(?:onde|aonde)[^a-z0-9]{0,4}(?:eu\s+)?(?:posso\s+)?compr/.test(normalizedMessage) ||
    /(?:qual|em\s+qual)[^a-z0-9]{0,4}(?:a\s+)?(?:melhor\s+)?(?:corretora|broker|exchange)/.test(normalizedMessage)
  );
}

function extractAssetHintCandidates(message: string): string[] {
  const explicitCandidates: string[] = [];
  const explicitRegex = /(?:token|ticker|ativo|asset|moeda)\s*[:=-]\s*([a-zA-Z0-9-]{2,24})/gi;

  for (const match of message.matchAll(explicitRegex)) {
    const candidate = typeof match[1] === "string" ? match[1].trim().toLowerCase() : "";

    if (candidate.length > 1 && !assetHintNoiseTokens.has(candidate)) {
      explicitCandidates.push(candidate);
    }
  }

  const uppercaseCandidates = (message.match(/\b[A-Z][A-Z0-9]{2,14}\b/g) ?? [])
    .map((token) => token.trim().toLowerCase())
    .filter((token) => !assetHintNoiseTokens.has(token));

  const looseTagMatch = normalizeText(message).match(/(?:token|ticker|ativo|asset|moeda)\s+([a-z0-9-]{2,24})/);
  const looseCandidate =
    looseTagMatch && typeof looseTagMatch[1] === "string" ? looseTagMatch[1].trim().toLowerCase() : "";

  const mergedCandidates = [
    ...explicitCandidates,
    ...uppercaseCandidates,
    ...(looseCandidate.length > 0 && !assetHintNoiseTokens.has(looseCandidate) ? [looseCandidate] : []),
  ];

  return [...new Set(mergedCandidates)].slice(0, 8);
}

function resolvePrimaryAssetHint(message: string): string {
  const normalizedMessage = normalizeText(message);
  const mappedAlias = riskAssetAliases.find((assetAlias) =>
    assetAlias.aliases.some((alias) => hasExactAlias(normalizedMessage, alias)),
  );

  if (mappedAlias) {
    return mappedAlias.assetId;
  }

  const candidates = extractAssetHintCandidates(message);

  if (candidates.length > 0) {
    return candidates[0] ?? "bitcoin";
  }

  return resolvePrimaryAssetIdForChart(message);
}

function buildFocusedWebSearchQuery(
  query: string,
  focus: "general" | "news" | "token_lookup" | "where_to_buy",
): string {
  const trimmedQuery = query.trim();

  if (focus === "where_to_buy") {
    return `${trimmedQuery} token where to buy exchange listing liquidity`;
  }

  if (focus === "token_lookup") {
    return `${trimmedQuery} crypto token overview official website contract`;
  }

  if (focus === "news") {
    return `${trimmedQuery} crypto market latest news today`;
  }

  return trimmedQuery;
}

function extractExchangeMentionsFromWebResults(results: WebSearchResultItem[]): string[] {
  const mentions = new Set<string>();

  for (const result of results) {
    if (result.confidenceScore < 55) {
      continue;
    }

    const normalizedBlob = normalizeText(`${result.title} ${result.snippet} ${result.url}`);

    for (const exchangeMatcher of knownExchangeMatchers) {
      if (exchangeMatcher.aliases.some((alias) => normalizedBlob.includes(alias))) {
        mentions.add(exchangeMatcher.label);
      }
    }
  }

  return [...mentions].slice(0, 8);
}

const financialIntentKeywords = [
  "mercado",
  "cripto",
  "crypto",
  "bitcoin",
  "ethereum",
  "solana",
  "xrp",
  "bnb",
  "dogecoin",
  "cardano",
  "chainlink",
  "trade",
  "trading",
  "ticker",
  "cotacao",
  "preco",
  "ativo",
  "ativos",
  "acao",
  "acoes",
  "bolsa",
  "b3",
  "fii",
  "fiis",
  "etf",
  "etfs",
  "forex",
  "cambio",
  "dolar",
  "juros",
  "yield",
  "bond",
  "renda fixa",
  "futuro",
  "futuros",
  "opcao",
  "opcoes",
  "volatilidade",
  "carteira",
  "portfolio",
  "alocacao",
  "diversificacao",
  "wall street",
  "commodities",
  "commodity",
  "ouro",
  "petroleo",
  "airdrop",
  "defi",
  "macro rates",
  "comprar",
  "compra",
  "vender",
  "corretora",
  "broker",
  "exchange",
];

const financeFramingMarkers = [
  "copiloto financeiro",
  "mercado",
  "cripto",
  "cotacao",
  "carteira",
  "trade",
  "analise tecnica",
  "suporte",
  "resistencia",
  "spot",
  "futuros",
  "renda fixa",
  "etf",
  "airdrop",
  "recomendacao de investimento",
];

function hasKeywordAsWord(normalizedMessage: string, keyword: string): boolean {
  if (keyword.includes(" ")) {
    return normalizedMessage.includes(keyword);
  }

  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keywordPattern = new RegExp(`(^|[^a-z0-9])${escapedKeyword}([^a-z0-9]|$)`);

  return keywordPattern.test(normalizedMessage);
}

function hasFinancialIntent(message: string): boolean {
  const normalizedMessage = normalizeText(message);
  const hasKeyword = financialIntentKeywords.some((keyword) => hasKeywordAsWord(normalizedMessage, keyword));

  if (hasKeyword) {
    return true;
  }

  const uppercaseMessage = message.toUpperCase();
  return /\b([A-Z]{2,6}-USD|[A-Z]{3,12}USDT|\^[A-Z]{2,5}|[A-Z]{2,4}=X|[A-Z]{1,3}=F)\b/.test(uppercaseMessage);
}

function hasFinanceFramingAnswer(answer: string): boolean {
  const normalizedAnswer = normalizeText(answer);
  let matchedMarkers = 0;

  for (const marker of financeFramingMarkers) {
    if (normalizedAnswer.includes(marker)) {
      matchedMarkers += 1;

      if (matchedMarkers >= 2) {
        return true;
      }
    }
  }

  return false;
}

function hasMarketSummaryIntent(message: string): boolean {
  const normalizedMessage = normalizeText(message);
  const asksForSummary =
    normalizedMessage.includes("resum") ||
    normalizedMessage.includes("panorama") ||
    normalizedMessage.includes("visao geral") ||
    normalizedMessage.includes("overview") ||
    normalizedMessage.includes("cenario");
  const mentionsCryptoMarket =
    normalizedMessage.includes("mercado") ||
    normalizedMessage.includes("cripto") ||
    normalizedMessage.includes("crypto") ||
    normalizedMessage.includes("bitcoin") ||
    normalizedMessage.includes("ethereum") ||
    normalizedMessage.includes("altcoin");

  return asksForSummary && mentionsCryptoMarket;
}

function hasMonitoringPlanIntent(message: string): boolean {
  const normalizedMessage = normalizeText(message);
  const asksForPlan =
    normalizedMessage.includes("plano") ||
    normalizedMessage.includes("checkpoint") ||
    normalizedMessage.includes("check point") ||
    normalizedMessage.includes("checkpoints");
  const mentionsMonitoring =
    normalizedMessage.includes("monitoramento") ||
    normalizedMessage.includes("monitorar") ||
    normalizedMessage.includes("checkpoints");

  return asksForPlan && mentionsMonitoring;
}

function hasRiskAnalysisIntent(message: string): boolean {
  const normalizedMessage = normalizeText(message);
  const asksForRisk =
    normalizedMessage.includes("risco") ||
    normalizedMessage.includes("volatil") ||
    normalizedMessage.includes("drawdown") ||
    normalizedMessage.includes("cenario de queda") ||
    normalizedMessage.includes("stress");
  const mentionsMarketContext =
    normalizedMessage.includes("mercado") ||
    normalizedMessage.includes("cripto") ||
    normalizedMessage.includes("crypto") ||
    normalizedMessage.includes("bitcoin") ||
    normalizedMessage.includes("ethereum") ||
    normalizedMessage.includes("btc") ||
    normalizedMessage.includes("eth");
  const mentionsShortHorizon =
    normalizedMessage.includes("curto prazo") ||
    normalizedMessage.includes("24h") ||
    normalizedMessage.includes("hoje") ||
    normalizedMessage.includes("semana") ||
    normalizedMessage.includes("short term");

  return asksForRisk && (mentionsMarketContext || mentionsShortHorizon);
}

function hasChartAnalysisIntent(message: string): boolean {
  const normalizedMessage = normalizeText(message);
  const asksForChart =
    normalizedMessage.includes("grafico") ||
    normalizedMessage.includes("grafic") ||
    normalizedMessage.includes("chart") ||
    normalizedMessage.includes("candles") ||
    normalizedMessage.includes("candle") ||
    normalizedMessage.includes("suporte") ||
    normalizedMessage.includes("resistencia") ||
    normalizedMessage.includes("tendencia") ||
    normalizedMessage.includes("setup") ||
    normalizedMessage.includes("rompimento") ||
    normalizedMessage.includes("analise tecnica") ||
    normalizedMessage.includes("analise tecnic") ||
    normalizedMessage.includes("tecnicamente");
  const asksDirection =
    normalizedMessage.includes("vai subir") ||
    normalizedMessage.includes("vai cair") ||
    normalizedMessage.includes("subir ou cair") ||
    normalizedMessage.includes("alta ou baixa") ||
    normalizedMessage.includes("comprar") ||
    normalizedMessage.includes("vender") ||
    normalizedMessage.includes("buy") ||
    normalizedMessage.includes("sell") ||
    normalizedMessage.includes("entrada") ||
    normalizedMessage.includes("stop") ||
    normalizedMessage.includes("take profit");
  const mentionsAsset = riskAssetAliases.some((assetAlias) =>
    assetAlias.aliases.some((alias) => hasExactAlias(normalizedMessage, alias)),
  );

  return (asksForChart || asksDirection) && mentionsAsset;
}

function hasBrokerIntegrationIntent(message: string): boolean {
  const normalizedMessage = normalizeText(message);
  const mentionsBroker =
    normalizedMessage.includes("corretora") ||
    normalizedMessage.includes("broker") ||
    normalizedMessage.includes("binance") ||
    normalizedMessage.includes("bybit") ||
    normalizedMessage.includes("coinbase") ||
    normalizedMessage.includes("kraken") ||
    normalizedMessage.includes("okx") ||
    normalizedMessage.includes("iq option") ||
    normalizedMessage.includes("iqoption") ||
    normalizedMessage.includes("exchange");
  const asksForLiveQuote =
    normalizedMessage.includes("cotacao") ||
    normalizedMessage.includes("cotacao ao vivo") ||
    normalizedMessage.includes("preco ao vivo") ||
    normalizedMessage.includes("preco") ||
    normalizedMessage.includes("integracao") ||
    normalizedMessage.includes("conectar") ||
    normalizedMessage.includes("api");
  const asksWhereToBuy = hasWhereToBuyIntent(normalizedMessage);

  const hasTokenContext =
    normalizedMessage.includes("token") ||
    normalizedMessage.includes("moeda") ||
    normalizedMessage.includes("coin") ||
    normalizedMessage.includes("cripto") ||
    normalizedMessage.includes("crypto") ||
    normalizedMessage.includes("memecoin") ||
    extractAssetHintCandidates(message).length > 0 ||
    hasFinancialIntent(message);

  return (mentionsBroker && asksForLiveQuote) || (asksWhereToBuy && hasTokenContext);
}

function hasAirdropIntent(message: string): boolean {
  const normalizedMessage = normalizeText(message);
  const asksForAirdrops =
    normalizedMessage.includes("airdrop") ||
    normalizedMessage.includes("airdrops") ||
    normalizedMessage.includes("retroativo") ||
    normalizedMessage.includes("retroactive") ||
    normalizedMessage.includes("farming") ||
    normalizedMessage.includes("quest") ||
    normalizedMessage.includes("testnet") ||
    normalizedMessage.includes("drop") ||
    normalizedMessage.includes("eligibilidade") ||
    normalizedMessage.includes("elegivel");

  return asksForAirdrops;
}

function resolveAirdropFocusQuery(message: string): string | undefined {
  const normalizedMessage = normalizeText(message);
  const filteredTokens = normalizedMessage
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !airdropNoiseTokens.has(token));

  if (filteredTokens.length === 0) {
    return undefined;
  }

  return [...new Set(filteredTokens)].slice(0, 6).join(" ");
}

function hasExactAlias(normalizedMessage: string, alias: string): boolean {
  const normalizedAlias = normalizeText(alias);

  if (normalizedAlias.length <= 4 && /^[a-z0-9]+$/.test(normalizedAlias)) {
    const messageTokens = normalizedMessage.split(/[^a-z0-9]+/).filter((token) => token.length > 0);
    return messageTokens.includes(normalizedAlias);
  }

  return normalizedMessage.includes(normalizedAlias);
}

function resolveRiskAssetIds(message: string): string[] {
  const normalizedMessage = normalizeText(message);
  const selectedAssets = riskAssetAliases
    .filter((assetAlias) => assetAlias.aliases.some((alias) => hasExactAlias(normalizedMessage, alias)))
    .map((assetAlias) => assetAlias.assetId);

  if (selectedAssets.length === 0) {
    return ["bitcoin", "ethereum"];
  }

  return [...new Set(selectedAssets)].slice(0, 4);
}

function resolvePrimaryAssetIdForChart(message: string): string {
  const resolvedAssetIds = resolveRiskAssetIds(message);
  return resolvedAssetIds[0] ?? "bitcoin";
}

function resolveChartRangeFromMessage(message: string): CryptoChartRange {
  const normalizedMessage = normalizeText(message);

  if (
    normalizedMessage.includes("24h") ||
    normalizedMessage.includes("dia") ||
    normalizedMessage.includes("diario") ||
    normalizedMessage.includes("intraday")
  ) {
    return "24h";
  }

  if (
    normalizedMessage.includes("semana") ||
    normalizedMessage.includes("7d") ||
    normalizedMessage.includes("7 dias")
  ) {
    return "7d";
  }

  if (
    normalizedMessage.includes("90d") ||
    normalizedMessage.includes("90 dias") ||
    normalizedMessage.includes("trimestre")
  ) {
    return "90d";
  }

  if (
    normalizedMessage.includes("mes") ||
    normalizedMessage.includes("30d") ||
    normalizedMessage.includes("30 dias")
  ) {
    return "30d";
  }

  if (
    normalizedMessage.includes("ano") ||
    normalizedMessage.includes("1y") ||
    normalizedMessage.includes("365 dias")
  ) {
    return "1y";
  }

  return "7d";
}

function resolveChartModeFromMessage(message: string): "delayed" | "live" {
  const normalizedMessage = normalizeText(message);

  if (
    normalizedMessage.includes("ao vivo") ||
    normalizedMessage.includes("tempo real") ||
    normalizedMessage.includes("real time") ||
    normalizedMessage.includes("realtime") ||
    normalizedMessage.includes("intraday")
  ) {
    return "live";
  }

  return "delayed";
}

function resolveBrokerFromMessage(message: string): BrokerName {
  const normalizedMessage = normalizeText(message);

  if (normalizedMessage.includes("bybit")) {
    return "bybit";
  }

  if (normalizedMessage.includes("coinbase")) {
    return "coinbase";
  }

  if (normalizedMessage.includes("kraken")) {
    return "kraken";
  }

  if (normalizedMessage.includes("okx")) {
    return "okx";
  }

  if (normalizedMessage.includes("iq option") || normalizedMessage.includes("iqoption")) {
    return "iqoption";
  }

  return "binance";
}

function hasGenericLimitationAnswer(answer: string): boolean {
  const normalizedAnswer = normalizeText(answer);

  return (
    normalizedAnswer.includes("copiloto financeiro") ||
    normalizedAnswer.includes("nao tenho a capacidade") ||
    normalizedAnswer.includes("nao tenho capacidade") ||
    normalizedAnswer.includes("nao tenho informacoes") ||
    normalizedAnswer.includes("nao consigo fornecer") ||
    normalizedAnswer.includes("fora desse escopo") ||
    normalizedAnswer.includes("nao posso fornecer") ||
    normalizedAnswer.includes("nao posso fornecer analise de risco") ||
    normalizedAnswer.includes("sou um copiloto financeiro focado em dados e operacao") ||
    normalizedAnswer.includes("sinto muito") ||
    normalizedAnswer.includes("falha ao obter") ||
    normalizedAnswer.includes("panorama do mercado") ||
    normalizedAnswer.includes("dados do coincap") ||
    normalizedAnswer.includes("sem mais informacoes") ||
    normalizedAnswer.includes("dificil dizer") ||
    normalizedAnswer.includes("pesquise no google") ||
    normalizedAnswer.includes("pesquisar no google") ||
    normalizedAnswer.includes("procure no google") ||
    normalizedAnswer.includes("pesquise na internet") ||
    normalizedAnswer.includes("pesquisar na internet") ||
    normalizedAnswer.includes("voce pode tentar pesquisar") ||
    normalizedAnswer.includes("tente novamente mais tarde")
  );
}

function shouldForceChartFallback(message: string, completion: OpenRouterChatCompletion): boolean {
  if (!hasChartAnalysisIntent(message)) {
    return false;
  }

  const usedChartTool = completion.toolCallsUsed.includes("get_crypto_chart_insights");
  const normalizedAnswer = normalizeText(completion.answer);
  const hasTechnicalMarkers =
    normalizedAnswer.includes("suporte") ||
    normalizedAnswer.includes("resistencia") ||
    normalizedAnswer.includes("rsi") ||
    normalizedAnswer.includes("macd") ||
    normalizedAnswer.includes("atr") ||
    normalizedAnswer.includes("trend") ||
    normalizedAnswer.includes("tendencia") ||
    normalizedAnswer.includes("take profit") ||
    normalizedAnswer.includes("stop") ||
    normalizedAnswer.includes("confianca");

  const isRiskOnlyAnswer =
    normalizedAnswer.includes("risco de curto prazo") &&
    !normalizedAnswer.includes("suporte") &&
    !normalizedAnswer.includes("resistencia");

  return !usedChartTool || !hasTechnicalMarkers || isRiskOnlyAnswer;
}

function shouldForceGeneralAssistantFallback(message: string, completion: OpenRouterChatCompletion): boolean {
  const hasSpecializedFinancialIntent =
    hasMarketSummaryIntent(message) ||
    hasAirdropIntent(message) ||
    hasMonitoringPlanIntent(message) ||
    hasChartAnalysisIntent(message) ||
    hasBrokerIntegrationIntent(message) ||
    hasRiskAnalysisIntent(message);

  if (hasFinancialIntent(message) || hasSpecializedFinancialIntent) {
    return false;
  }

  if (hasGenericLimitationAnswer(completion.answer)) {
    return true;
  }

  return hasFinanceFramingAnswer(completion.answer);
}

function formatSpotPrice(price: number, currency: string): string {
  const maximumFractionDigits = price >= 1000 ? 2 : price >= 1 ? 4 : 6;

  return `${price.toLocaleString("pt-BR", {
    maximumFractionDigits,
  })} ${currency.toUpperCase()}`;
}

function formatCompactUsd(value: number | null): string {
  if (value === null) {
    return "n/d";
  }

  return `${value.toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
    notation: "compact",
  })} USD`;
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "n/d";
  }

  const signal = value > 0 ? "+" : "";
  return `${signal}${value.toFixed(2)}%`;
}

function formatQuotePrice(price: number, currency: string | null): string {
  const maximumFractionDigits = price >= 1000 ? 2 : price >= 1 ? 4 : 6;
  const formattedPrice = price.toLocaleString("pt-BR", {
    maximumFractionDigits,
  });

  if (!currency) {
    return formattedPrice;
  }

  return `${formattedPrice} ${currency.toUpperCase()}`;
}

function classifyVolatility(changePercent: number | null): string {
  if (changePercent === null) {
    return "indefinida";
  }

  const absoluteChange = Math.abs(changePercent);

  if (absoluteChange >= 8) {
    return "muito alta";
  }

  if (absoluteChange >= 5) {
    return "alta";
  }

  if (absoluteChange >= 2) {
    return "moderada";
  }

  return "baixa";
}

function classifyLiquidity(volumeUsd24h: number | null): string {
  if (volumeUsd24h === null) {
    return "indefinida";
  }

  if (volumeUsd24h >= 10_000_000_000) {
    return "alta";
  }

  if (volumeUsd24h >= 2_000_000_000) {
    return "media";
  }

  return "baixa";
}

function formatTrendLabel(trend: CryptoTrend): string {
  if (trend === "bullish") {
    return "viés de alta";
  }

  if (trend === "bearish") {
    return "viés de baixa";
  }

  return "viés lateral";
}

function formatTradeActionLabel(tradeAction: TradeAction): string {
  if (tradeAction === "buy") {
    return "compra tatica";
  }

  if (tradeAction === "sell") {
    return "venda tatica";
  }

  return "espera tatica";
}

function formatConfidenceScore(value: number): string {
  return `${Math.round(value)}%`;
}

function formatAirdropConfidenceLabel(confidence: AirdropConfidence): string {
  if (confidence === "high") {
    return "alta";
  }

  if (confidence === "medium") {
    return "media";
  }

  return "baixa";
}

function formatAirdropRewardTypeLabel(rewardType: AirdropRewardType): string {
  if (rewardType === "token") {
    return "token";
  }

  if (rewardType === "points") {
    return "points";
  }

  if (rewardType === "nft") {
    return "nft";
  }

  return "indefinido";
}

function formatRangeLabel(range: CryptoChartRange): string {
  if (range === "24h") {
    return "24h";
  }

  if (range === "7d") {
    return "7 dias";
  }

  if (range === "30d") {
    return "30 dias";
  }

  if (range === "90d") {
    return "90 dias";
  }

  return "1 ano";
}

function formatIntervalMinutes(intervalSeconds: number): number {
  return Math.max(1, Math.round(intervalSeconds / 60));
}

function capitalizeAssetId(assetId: string): string {
  if (assetId.length === 0) {
    return assetId;
  }

  return `${assetId.charAt(0).toUpperCase()}${assetId.slice(1)}`;
}

function buildPriceComparisonTable(
  currency: string,
  successes: MultiSpotPriceSuccessResult[],
  failures: MultiSpotPriceFailureResult[],
): string {
  const lines = ["| Ativo | Preco | Cache |", "| --- | ---: | --- |"];

  for (const item of successes) {
    lines.push(`| ${item.assetId} | ${item.price} ${currency.toUpperCase()} | ${item.cacheState}${item.stale ? " (stale)" : ""} |`);
  }

  for (const item of failures) {
    lines.push(`| ${item.assetId} | n/a | erro: ${item.error.code} |`);
  }

  return lines.join("\n");
}

function buildMarketOverviewTable(assets: CoinCapMarketAsset[]): string {
  const lines = [
    "| Ativo | Preco USD | 24h | Market Cap | Volume 24h |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];

  for (const asset of assets) {
    lines.push(
      `| ${asset.symbol.toUpperCase()} (${asset.assetId}) | ${formatSpotPrice(asset.priceUsd, "usd")} | ${formatPercent(asset.changePercent24h)} | ${formatCompactUsd(asset.marketCapUsd)} | ${formatCompactUsd(asset.volumeUsd24h)} |`,
    );
  }

  return lines.join("\n");
}

function buildFinancialQuotesTable(quotes: YahooMarketQuote[]): string {
  const lines = [
    "| Simbolo | Nome | Preco | Variacao | Estado |",
    "| --- | --- | ---: | ---: | --- |",
  ];

  for (const quote of quotes) {
    lines.push(
      `| ${quote.symbol} | ${quote.name} | ${formatQuotePrice(quote.price, quote.currency)} | ${formatPercent(quote.changePercent)} | ${quote.marketState ?? "n/d"} |`,
    );
  }

  return lines.join("\n");
}

function summarizeMacroRiskSignals(quotes: YahooMarketQuote[]): string {
  const quotesBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const macroSignals: string[] = [];
  const vix = quotesBySymbol.get("^VIX");
  const us10y = quotesBySymbol.get("^TNX");
  const gold = quotesBySymbol.get("GC=F");
  const oil = quotesBySymbol.get("CL=F");

  if (vix) {
    macroSignals.push(`VIX ${formatQuotePrice(vix.price, vix.currency)} (${formatPercent(vix.changePercent)})`);
  }

  if (us10y) {
    macroSignals.push(`US10Y ${formatQuotePrice(us10y.price, us10y.currency)} (${formatPercent(us10y.changePercent)})`);
  }

  if (gold) {
    macroSignals.push(`Gold ${formatQuotePrice(gold.price, gold.currency)} (${formatPercent(gold.changePercent)})`);
  }

  if (oil) {
    macroSignals.push(`Oil ${formatQuotePrice(oil.price, oil.currency)} (${formatPercent(oil.changePercent)})`);
  }

  if (macroSignals.length === 0) {
    return "dados macro indisponiveis no momento";
  }

  return macroSignals.join(" | ");
}

const copilotTools: OpenRouterToolDefinition[] = [
  {
    description:
      "Consulta preco spot atual de um ativo cripto em uma moeda fiat. Use para perguntas de preco, cotacao, quanto vale ou valor atual.",
    inputSchema: copilotSpotPriceToolInputSchema,
    name: "get_crypto_spot_price",
    parameters: {
      additionalProperties: false,
      properties: {
        assetId: {
          default: "bitcoin",
          description: "Identificador do ativo no CoinGecko, exemplo: bitcoin, ethereum, solana",
          type: "string",
        },
        currency: {
          default: "usd",
          description: "Moeda da cotacao, exemplo: usd, brl, eur",
          type: "string",
        },
      },
      type: "object",
    },
    run: (input: z.infer<typeof copilotSpotPriceToolInputSchema>) => {
      return cryptoSpotPriceService.getSpotPrice(input);
    },
  },
  {
    description:
      "Compara preco spot de varios ativos cripto na mesma moeda e retorna tabela. Use para perguntas de comparacao entre multiplos ativos.",
    inputSchema: copilotMultiSpotPriceToolInputSchema,
    name: "get_crypto_multi_spot_price",
    parameters: {
      additionalProperties: false,
      properties: {
        assetIds: {
          description: "Lista de ativos no padrao CoinGecko para comparar, exemplo: [bitcoin, ethereum, solana]",
          items: {
            type: "string",
          },
          maxItems: 8,
          minItems: 2,
          type: "array",
        },
        currency: {
          default: "usd",
          description: "Moeda da comparacao, exemplo: usd, brl, eur",
          type: "string",
        },
      },
      required: ["assetIds"],
      type: "object",
    },
    run: async (input: z.infer<typeof copilotMultiSpotPriceToolInputSchema>) => {
      const deduplicatedAssetIds = [...new Set(input.assetIds.map((assetId) => assetId.toLowerCase()))];
      const comparisonResults = await Promise.all(
        deduplicatedAssetIds.map(async (assetId) => {
          try {
            const spotPrice = await cryptoSpotPriceService.getSpotPrice({
              assetId,
              currency: input.currency,
            });

            const successResult: MultiSpotPriceSuccessResult = {
              assetId: spotPrice.assetId,
              cacheState: spotPrice.cache.state,
              fetchedAt: spotPrice.fetchedAt,
              price: spotPrice.price,
              stale: spotPrice.cache.stale,
            };

            return {
              ok: true as const,
              value: successResult,
            };
          } catch (error) {
            const failureResult: MultiSpotPriceFailureResult = {
              assetId,
              error: {
                code: error instanceof AppError ? error.code : "SPOT_PRICE_COMPARISON_ERROR",
                message: error instanceof Error ? error.message : "Unexpected spot price comparison error",
              },
            };

            return {
              ok: false as const,
              value: failureResult,
            };
          }
        }),
      );

      const successes = comparisonResults
        .filter((item) => item.ok)
        .map((item) => item.value)
        .sort((left, right) => right.price - left.price);
      const failures = comparisonResults.filter((item) => !item.ok).map((item) => item.value);

      return {
        comparedAssets: deduplicatedAssetIds.length,
        currency: input.currency.toLowerCase(),
        failures,
        ranking: successes.map((item, index) => ({
          assetId: item.assetId,
          position: index + 1,
          price: item.price,
        })),
        rows: successes,
        successCount: successes.length,
        tableMarkdown: buildPriceComparisonTable(input.currency, successes, failures),
      };
    },
  },
  {
    description:
      "Retorna panorama do mercado cripto com top ativos por market cap, variacao 24h e volume. Use para pedidos de resumo de mercado e contexto diario.",
    inputSchema: copilotMarketOverviewToolInputSchema,
    name: "get_crypto_market_overview",
    parameters: {
      additionalProperties: false,
      properties: {
        limit: {
          default: 8,
          description: "Quantidade de ativos para panorama (entre 3 e 15)",
          maximum: 15,
          minimum: 3,
          type: "number",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotMarketOverviewToolInputSchema>) => {
      const marketOverview = await coinCapMarketDataAdapter.getMarketOverview({
        limit: input.limit,
      });
      const assetsWithChange = marketOverview.assets.filter((asset) => asset.changePercent24h !== null);
      const strongest24h = [...assetsWithChange].sort(
        (left, right) => (right.changePercent24h ?? -Infinity) - (left.changePercent24h ?? -Infinity),
      )[0] ?? null;
      const weakest24h = [...assetsWithChange].sort(
        (left, right) => (left.changePercent24h ?? Infinity) - (right.changePercent24h ?? Infinity),
      )[0] ?? null;

      return {
        assets: marketOverview.assets,
        fetchedAt: marketOverview.fetchedAt,
        provider: marketOverview.provider,
        strongest24h,
        tableMarkdown: buildMarketOverviewTable(marketOverview.assets),
        weakest24h,
      };
    },
  },
  {
    description:
      "Retorna dados de grafico de cripto (historico + insights tecnicos) para analise de tendencia, momentum, suporte/resistencia e sinal tatico informativo (sem recomendacao de investimento).",
    inputSchema: copilotCryptoChartToolInputSchema,
    name: "get_crypto_chart_insights",
    parameters: {
      additionalProperties: false,
      properties: {
        assetId: {
          default: "bitcoin",
          description: "Ativo no padrao CoinGecko, exemplo: bitcoin, ethereum, solana, dogecoin",
          type: "string",
        },
        currency: {
          default: "usd",
          description: "Moeda de referencia do grafico, exemplo: usd, brl",
          type: "string",
        },
        exchange: {
          default: "binance",
          description: "Corretora para modo live: binance, bybit, coinbase, kraken ou okx",
          enum: ["binance", "bybit", "coinbase", "kraken", "okx"],
          type: "string",
        },
        mode: {
          default: "delayed",
          description: "Modo de consulta: delayed (historico padrao) ou live (snapshot quase em tempo real por exchange)",
          enum: ["delayed", "live"],
          type: "string",
        },
        range: {
          default: "7d",
          description: "Janela temporal do grafico: 24h, 7d, 30d, 90d ou 1y",
          enum: ["24h", "7d", "30d", "90d", "1y"],
          type: "string",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotCryptoChartToolInputSchema>) => {
      const chart =
        input.mode === "live"
          ? await cryptoChartService.getLiveChart({
              assetId: input.assetId,
              broker: input.exchange,
              range: input.range,
            })
          : await cryptoChartService.getChart({
              assetId: input.assetId,
              currency: input.currency,
              range: input.range,
            });

      return {
        assetId: chart.assetId,
        cache: chart.cache,
        currency: chart.currency,
        fetchedAt: chart.fetchedAt,
        insights: chart.insights,
        live: chart.live,
        mode: chart.mode,
        points: chart.points.slice(-160),
        provider: chart.provider,
        range: chart.range,
        textualSummary: `Modo ${chart.mode} | Faixa ${formatRangeLabel(chart.range)} | ${formatTrendLabel(chart.insights.trend)} | acao ${formatTradeActionLabel(chart.insights.tradeAction)} | confianca ${formatConfidenceScore(chart.insights.confidenceScore)} | variacao ${chart.insights.changePercent}% | volatilidade ${chart.insights.volatilityPercent}%`,
      };
    },
  },
  {
    description:
      "Retorna radar de oportunidades de airdrops em multiplas fontes (airdrops.io, airdropalert, DefiLlama e CoinGecko), com score, confianca e tarefas sugeridas.",
    inputSchema: copilotAirdropOpportunitiesToolInputSchema,
    name: "get_airdrop_opportunities",
    parameters: {
      additionalProperties: false,
      properties: {
        includeSpeculative: {
          default: true,
          description: "Quando true inclui oportunidades especulativas de menor confianca",
          type: "boolean",
        },
        limit: {
          default: 10,
          description: "Quantidade maxima de oportunidades retornadas",
          maximum: 25,
          minimum: 3,
          type: "number",
        },
        minScore: {
          default: 30,
          description: "Score minimo (0-100) para filtrar oportunidades",
          maximum: 100,
          minimum: 0,
          type: "number",
        },
        query: {
          description: "Filtro opcional por projeto/ecossistema (ex.: base, zksync, restaking)",
          type: "string",
        },
      },
      type: "object",
    },
    run: (input: z.infer<typeof copilotAirdropOpportunitiesToolInputSchema>) => {
      return airdropIntelligenceService.getOpportunities(input);
    },
  },
  {
    description:
      "Consulta status de integracao e cotacao ao vivo por corretora (Binance, Bybit, Coinbase, Kraken, OKX, IQ Option). Use para perguntas sobre corretoras, conectividade e preco em broker.",
    inputSchema: copilotBrokerLiveQuoteToolInputSchema,
    name: "get_broker_live_quote",
    parameters: {
      additionalProperties: false,
      properties: {
        assetId: {
          default: "bitcoin",
          description: "Ativo cripto para consulta no broker (ex.: bitcoin, ethereum, solana)",
          type: "string",
        },
        broker: {
          default: "binance",
          description: "Corretora alvo para cotacao: binance, bybit, coinbase, kraken, okx ou iqoption",
          enum: ["binance", "bybit", "coinbase", "kraken", "okx", "iqoption"],
          type: "string",
        },
      },
      type: "object",
    },
    run: (input: z.infer<typeof copilotBrokerLiveQuoteToolInputSchema>) => {
      return brokerMarketService.getLiveQuote(input);
    },
  },
  {
    description:
      "Consulta DexScreener em tempo real para descobrir em qual DEX/rede um token esta negociando. Priorize em perguntas de onde comprar memecoin/token desconhecido.",
    inputSchema: copilotDexScreenerTokenLookupToolInputSchema,
    name: "search_token_listings_dexscreener",
    parameters: {
      additionalProperties: false,
      properties: {
        maxResults: {
          default: 4,
          description: "Quantidade maxima de pares/venues retornados",
          maximum: 8,
          minimum: 1,
          type: "number",
        },
        query: {
          description: "Ticker, nome do token ou endereco de contrato",
          type: "string",
        },
      },
      required: ["query"],
      type: "object",
    },
    run: async (input: z.infer<typeof copilotDexScreenerTokenLookupToolInputSchema>) => {
      const response = await dexScreenerSearchAdapter.searchTokenListings(input);

      return {
        ...response,
        primaryVenue: response.venues[0] ?? null,
      };
    },
  },
  {
    description:
      "Executa busca web global em tempo real para descobrir informacoes fora da base local, incluindo listagem de tokens, onde comprar e contexto de projetos desconhecidos.",
    inputSchema: copilotWebSearchToolInputSchema,
    name: "search_web_realtime",
    parameters: {
      additionalProperties: false,
      properties: {
        focus: {
          default: "general",
          description: "Foco da busca: general, news, token_lookup ou where_to_buy",
          enum: ["general", "news", "token_lookup", "where_to_buy"],
          type: "string",
        },
        maxResults: {
          default: 6,
          description: "Quantidade maxima de resultados retornados",
          maximum: 10,
          minimum: 3,
          type: "number",
        },
        query: {
          description: "Consulta textual livre para pesquisa global",
          type: "string",
        },
      },
      required: ["query"],
      type: "object",
    },
    run: async (input: z.infer<typeof copilotWebSearchToolInputSchema>) => {
      const focusedQuery = buildFocusedWebSearchQuery(input.query, input.focus);
      const searchResponse = await webSearchAdapter.search({
        maxResults: input.maxResults,
        query: focusedQuery,
      });

      return {
        ...searchResponse,
        exchangeMentions: extractExchangeMentionsFromWebResults(searchResponse.results),
        focus: input.focus,
        focusedQuery,
      };
    },
  },
  {
    description:
      "Retorna snapshot de forex (pares de moedas) com cotacao, variacao 24h e estado de mercado. Use para perguntas de cambio, pares FX e dolar/real.",
    inputSchema: copilotForexMarketSnapshotToolInputSchema,
    name: "get_forex_market_snapshot",
    parameters: {
      additionalProperties: false,
      properties: {
        pairs: {
          description: "Lista opcional de pares (ex.: EURUSD, USDBRL, USDJPY). Quando informada, sobrescreve preset.",
          items: {
            type: "string",
          },
          maxItems: 10,
          minItems: 1,
          type: "array",
        },
        preset: {
          default: "majors",
          description: "Conjunto pre-definido de pares: majors, latam, europe, asia ou global",
          enum: ["majors", "latam", "europe", "asia", "global"],
          type: "string",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotForexMarketSnapshotToolInputSchema>) => {
      if (input.pairs && input.pairs.length > 0) {
        return forexMarketService.getSpotRateBatch({
          pairs: input.pairs,
        });
      }

      return forexMarketService.getMarketOverview({
        limit: 8,
        preset: input.preset,
      });
    },
  },
  {
    description:
      "Retorna snapshot de futuros (perpetuos) com preco, funding, open interest e metricas de derivativos. Use para perguntas de futuros cripto.",
    inputSchema: copilotFuturesMarketSnapshotToolInputSchema,
    name: "get_futures_market_snapshot",
    parameters: {
      additionalProperties: false,
      properties: {
        preset: {
          default: "crypto_majors",
          description: "Conjunto pre-definido de contratos: crypto_majors, layer1 ou defi",
          enum: ["crypto_majors", "layer1", "defi"],
          type: "string",
        },
        symbols: {
          description: "Lista opcional de contratos (ex.: BTCUSDT, ETHUSDT, SOLUSDT). Quando informada, sobrescreve preset.",
          items: {
            type: "string",
          },
          maxItems: 8,
          minItems: 1,
          type: "array",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotFuturesMarketSnapshotToolInputSchema>) => {
      if (input.symbols && input.symbols.length > 0) {
        return futuresMarketService.getSnapshotBatch({
          symbols: input.symbols,
        });
      }

      return futuresMarketService.getMarketOverview({
        limit: 8,
        preset: input.preset,
      });
    },
  },
  {
    description:
      "Retorna snapshot de opcoes por ativo-base com proxy de volatilidade implicita, move esperado e bias tatico.",
    inputSchema: copilotOptionsMarketSnapshotToolInputSchema,
    name: "get_options_market_snapshot",
    parameters: {
      additionalProperties: false,
      properties: {
        daysToExpiry: {
          default: 30,
          description: "Dias ate vencimento para projeção de move esperado",
          maximum: 365,
          minimum: 1,
          type: "number",
        },
        preset: {
          default: "us_indices",
          description: "Conjunto pre-definido de underlyings: us_indices, us_mega_caps, high_beta ou global",
          enum: ["us_indices", "us_mega_caps", "high_beta", "global"],
          type: "string",
        },
        underlyings: {
          description: "Lista opcional de ativos-base (ex.: SPY, QQQ, AAPL). Quando informada, sobrescreve preset.",
          items: {
            type: "string",
          },
          maxItems: 10,
          minItems: 1,
          type: "array",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotOptionsMarketSnapshotToolInputSchema>) => {
      if (input.underlyings && input.underlyings.length > 0) {
        return optionsMarketService.getSnapshotBatch({
          daysToExpiry: input.daysToExpiry,
          underlyings: input.underlyings,
        });
      }

      return optionsMarketService.getMarketOverview({
        daysToExpiry: input.daysToExpiry,
        limit: 8,
        preset: input.preset,
      });
    },
  },
  {
    description:
      "Retorna snapshot de commodities com foco em metais, energia e agro, incluindo variacao e estado de mercado.",
    inputSchema: copilotCommoditiesMarketSnapshotToolInputSchema,
    name: "get_commodities_market_snapshot",
    parameters: {
      additionalProperties: false,
      properties: {
        preset: {
          default: "global",
          description: "Conjunto pre-definido de commodities: metals, energy, agro ou global",
          enum: ["metals", "energy", "agro", "global"],
          type: "string",
        },
        symbols: {
          description: "Lista opcional de simbolos de commodities (ex.: GC=F, CL=F, ZC=F). Quando informada, sobrescreve preset.",
          items: {
            type: "string",
          },
          maxItems: 10,
          minItems: 1,
          type: "array",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotCommoditiesMarketSnapshotToolInputSchema>) => {
      if (input.symbols && input.symbols.length > 0) {
        return commoditiesMarketService.getSnapshotBatch({
          symbols: input.symbols,
        });
      }

      return commoditiesMarketService.getMarketOverview({
        limit: 8,
        preset: input.preset,
      });
    },
  },
  {
    description:
      "Retorna snapshot de renda fixa (curva de juros e proxies de crédito) com inclinação da curva e buckets de duration.",
    inputSchema: copilotFixedIncomeMarketSnapshotToolInputSchema,
    name: "get_fixed_income_market_snapshot",
    parameters: {
      additionalProperties: false,
      properties: {
        preset: {
          default: "us_curve",
          description: "Conjunto pre-definido para renda fixa: us_curve, credit_proxies, rates_risk ou global_macro",
          enum: ["us_curve", "credit_proxies", "rates_risk", "global_macro"],
          type: "string",
        },
        symbols: {
          description: "Lista opcional de simbolos de renda fixa (ex.: ^IRX, ^FVX, ^TNX, LQD). Quando informada, sobrescreve preset.",
          items: {
            type: "string",
          },
          maxItems: 10,
          minItems: 1,
          type: "array",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotFixedIncomeMarketSnapshotToolInputSchema>) => {
      if (input.symbols && input.symbols.length > 0) {
        return fixedIncomeMarketService.getSnapshotBatch({
          symbols: input.symbols,
        });
      }

      return fixedIncomeMarketService.getMarketOverview({
        limit: 8,
        preset: input.preset,
      });
    },
  },
  {
    description:
      "Retorna snapshot de ETFs globais (broad market, tematicos, internacionais e renda fixa) com variacao e contexto de mercado.",
    inputSchema: copilotEtfsMarketSnapshotToolInputSchema,
    name: "get_etfs_market_snapshot",
    parameters: {
      additionalProperties: false,
      properties: {
        preset: {
          default: "broad_market",
          description: "Conjunto pre-definido de ETFs: broad_market, thematic, international ou fixed_income",
          enum: ["broad_market", "thematic", "international", "fixed_income"],
          type: "string",
        },
        symbols: {
          description: "Lista opcional de ETFs (ex.: SPY, VTI, QQQ, EEM). Quando informada, sobrescreve preset.",
          items: {
            type: "string",
          },
          maxItems: 10,
          minItems: 1,
          type: "array",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotEtfsMarketSnapshotToolInputSchema>) => {
      if (input.symbols && input.symbols.length > 0) {
        return etfsMarketService.getSnapshotBatch({
          symbols: input.symbols,
        });
      }

      return etfsMarketService.getMarketOverview({
        limit: 8,
        preset: input.preset,
      });
    },
  },
  {
    description:
      "Retorna snapshot de rotacao setorial global com leitura de forca relativa por setor e breadth (advance/decline).",
    inputSchema: copilotGlobalSectorsMarketSnapshotToolInputSchema,
    name: "get_global_sectors_market_snapshot",
    parameters: {
      additionalProperties: false,
      properties: {
        preset: {
          default: "us_sectors",
          description: "Conjunto pre-definido setorial: us_sectors, global_cyclicals, defensives ou growth",
          enum: ["us_sectors", "global_cyclicals", "defensives", "growth"],
          type: "string",
        },
        symbols: {
          description: "Lista opcional de simbolos setoriais (ex.: XLK, XLF, XLE, XLV). Quando informada, sobrescreve preset.",
          items: {
            type: "string",
          },
          maxItems: 10,
          minItems: 1,
          type: "array",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotGlobalSectorsMarketSnapshotToolInputSchema>) => {
      if (input.symbols && input.symbols.length > 0) {
        return globalSectorsMarketService.getSnapshotBatch({
          symbols: input.symbols,
        });
      }

      return globalSectorsMarketService.getMarketOverview({
        limit: 8,
        preset: input.preset,
      });
    },
  },
  {
    description:
      "Retorna snapshot de macro rates com curva de juros, dolar, VIX e proxies de regime de risco.",
    inputSchema: copilotMacroRatesMarketSnapshotToolInputSchema,
    name: "get_macro_rates_market_snapshot",
    parameters: {
      additionalProperties: false,
      properties: {
        preset: {
          default: "usd_rates",
          description: "Conjunto pre-definido macro: usd_rates, global_rates, inflation_proxies ou risk_regime",
          enum: ["usd_rates", "global_rates", "inflation_proxies", "risk_regime"],
          type: "string",
        },
        symbols: {
          description: "Lista opcional de simbolos macro (ex.: ^TNX, ^FVX, DX-Y.NYB, ^VIX). Quando informada, sobrescreve preset.",
          items: {
            type: "string",
          },
          maxItems: 10,
          minItems: 1,
          type: "array",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotMacroRatesMarketSnapshotToolInputSchema>) => {
      if (input.symbols && input.symbols.length > 0) {
        return macroRatesMarketService.getSnapshotBatch({
          symbols: input.symbols,
        });
      }

      return macroRatesMarketService.getMarketOverview({
        limit: 8,
        preset: input.preset,
      });
    },
  },
  {
    description:
      "Retorna diagnostico de carteira com exposicao por classe, score de risco, variacao ponderada e regime tatico.",
    inputSchema: copilotPortfolioRiskSnapshotToolInputSchema,
    name: "get_portfolio_risk_snapshot",
    parameters: {
      additionalProperties: false,
      properties: {
        positions: {
          description: "Lista opcional de posicoes customizadas (symbol + weight). Quando informada, sobrescreve preset.",
          items: {
            additionalProperties: false,
            properties: {
              symbol: {
                description: "Ticker da posicao (ex.: SPY, QQQ, AGG, BTC-USD)",
                type: "string",
              },
              weight: {
                description: "Peso relativo da posicao (qualquer escala positiva, ex.: 30, 15.5)",
                maximum: 1000,
                minimum: 0.000001,
                type: "number",
              },
            },
            required: ["symbol", "weight"],
            type: "object",
          },
          maxItems: 10,
          minItems: 1,
          type: "array",
        },
        preset: {
          default: "balanced",
          description: "Preset de carteira: conservative, balanced, growth ou crypto_tilt",
          enum: ["conservative", "balanced", "growth", "crypto_tilt"],
          type: "string",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotPortfolioRiskSnapshotToolInputSchema>) => {
      if (input.positions && input.positions.length > 0) {
        return portfolioAnalyticsService.getSnapshot({
          positions: input.positions,
        });
      }

      return portfolioAnalyticsService.getSnapshot({
        preset: input.preset,
      });
    },
  },
  {
    description:
      "Retorna snapshot de B3 com acoes brasileiras e indices locais, incluindo variacao de 24h e estado de mercado.",
    inputSchema: copilotB3MarketSnapshotToolInputSchema,
    name: "get_b3_market_snapshot",
    parameters: {
      additionalProperties: false,
      properties: {
        preset: {
          default: "blue_chips",
          description: "Conjunto pre-definido de simbolos B3: blue_chips, indices, dividendos ou mid_caps",
          enum: ["blue_chips", "indices", "dividendos", "mid_caps"],
          type: "string",
        },
        symbols: {
          description: "Lista opcional de simbolos B3 (ex.: PETR4, VALE3, ITUB4). Quando informada, sobrescreve preset.",
          items: {
            type: "string",
          },
          maxItems: 10,
          minItems: 1,
          type: "array",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotB3MarketSnapshotToolInputSchema>) => {
      if (input.symbols && input.symbols.length > 0) {
        return b3MarketService.getSnapshotBatch({
          symbols: input.symbols,
        });
      }

      return b3MarketService.getMarketOverview({
        limit: 8,
        preset: input.preset,
      });
    },
  },
  {
    description:
      "Retorna snapshot de FIIs com cotacao e variacao para fundos imobiliarios listados.",
    inputSchema: copilotFiisMarketSnapshotToolInputSchema,
    name: "get_fiis_market_snapshot",
    parameters: {
      additionalProperties: false,
      properties: {
        preset: {
          default: "high_liquidity",
          description: "Conjunto pre-definido de FIIs: high_liquidity, tijolo, papel ou global",
          enum: ["high_liquidity", "tijolo", "papel", "global"],
          type: "string",
        },
        symbols: {
          description: "Lista opcional de tickers de FIIs (ex.: HGLG11, KNRI11, XPLG11). Quando informada, sobrescreve preset.",
          items: {
            type: "string",
          },
          maxItems: 10,
          minItems: 1,
          type: "array",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotFiisMarketSnapshotToolInputSchema>) => {
      if (input.symbols && input.symbols.length > 0) {
        return fiisMarketService.getSnapshotBatch({
          symbols: input.symbols,
        });
      }

      return fiisMarketService.getMarketOverview({
        limit: 8,
        preset: input.preset,
      });
    },
  },
  {
    description:
      "Retorna snapshot de acoes globais por ticker, com foco em mercado acionario internacional.",
    inputSchema: copilotEquitiesMarketSnapshotToolInputSchema,
    name: "get_equities_market_snapshot",
    parameters: {
      additionalProperties: false,
      properties: {
        preset: {
          default: "us_mega_caps",
          description: "Conjunto pre-definido de acoes: us_mega_caps, global_brands, innovation ou dividends",
          enum: ["us_mega_caps", "global_brands", "innovation", "dividends"],
          type: "string",
        },
        symbols: {
          description: "Lista opcional de tickers (ex.: AAPL, MSFT, NVDA, TSLA). Quando informada, sobrescreve preset.",
          items: {
            type: "string",
          },
          maxItems: 10,
          minItems: 1,
          type: "array",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotEquitiesMarketSnapshotToolInputSchema>) => {
      if (input.symbols && input.symbols.length > 0) {
        return equitiesMarketService.getSnapshotBatch({
          symbols: input.symbols,
        });
      }

      return equitiesMarketService.getMarketOverview({
        limit: 8,
        preset: input.preset,
      });
    },
  },
  {
    description:
      "Retorna snapshot de Wall Street para indices, setores, juros e fatores de risco em mercado americano.",
    inputSchema: copilotWallStreetMarketSnapshotToolInputSchema,
    name: "get_wall_street_market_snapshot",
    parameters: {
      additionalProperties: false,
      properties: {
        preset: {
          default: "indices",
          description: "Conjunto pre-definido: indices, sectors, rates ou risk_on",
          enum: ["indices", "sectors", "rates", "risk_on"],
          type: "string",
        },
        symbols: {
          description: "Lista opcional de simbolos (ex.: ^GSPC, ^IXIC, XLF, ^TNX). Quando informada, sobrescreve preset.",
          items: {
            type: "string",
          },
          maxItems: 10,
          minItems: 1,
          type: "array",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotWallStreetMarketSnapshotToolInputSchema>) => {
      if (input.symbols && input.symbols.length > 0) {
        return wallStreetMarketService.getSnapshotBatch({
          symbols: input.symbols,
        });
      }

      return wallStreetMarketService.getMarketOverview({
        limit: 8,
        preset: input.preset,
      });
    },
  },
  {
    description:
      "Retorna snapshot de tokens DeFi (DEX, lending e infraestrutura) com preco e contexto de mercado.",
    inputSchema: copilotDefiMarketSnapshotToolInputSchema,
    name: "get_defi_market_snapshot",
    parameters: {
      additionalProperties: false,
      properties: {
        assetIds: {
          description: "Lista opcional de ativos DeFi (ex.: aave, uniswap, chainlink). Quando informada, sobrescreve preset.",
          items: {
            type: "string",
          },
          maxItems: 10,
          minItems: 1,
          type: "array",
        },
        preset: {
          default: "blue_chips",
          description: "Conjunto pre-definido de ativos DeFi: blue_chips, dex, lending ou infrastructure",
          enum: ["blue_chips", "dex", "lending", "infrastructure"],
          type: "string",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotDefiMarketSnapshotToolInputSchema>) => {
      if (input.assetIds && input.assetIds.length > 0) {
        return defiMarketService.getSpotRateBatch({
          assetIds: input.assetIds,
        });
      }

      return defiMarketService.getMarketOverview({
        limit: 8,
        preset: input.preset,
      });
    },
  },
  {
    description:
      "Retorna snapshot de mercado global (indices, cambio, juros, commodities e cripto) via Yahoo Finance. Use para contexto macro e comparativo entre classes de ativos.",
    inputSchema: copilotFinancialMarketSnapshotToolInputSchema,
    name: "get_financial_market_snapshot",
    parameters: {
      additionalProperties: false,
      properties: {
        preset: {
          default: "global",
          description: "Conjunto pre-definido de simbolos: global, us, brazil ou risk",
          enum: ["global", "us", "brazil", "risk"],
          type: "string",
        },
        symbols: {
          description: "Lista opcional de simbolos do Yahoo Finance para sobrescrever o preset",
          items: {
            type: "string",
          },
          maxItems: 12,
          minItems: 1,
          type: "array",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotFinancialMarketSnapshotToolInputSchema>) => {
      const presetSymbols = financialMarketPresetSymbols[input.preset];
      const requestedSymbols =
        input.symbols && input.symbols.length > 0
          ? [...new Set(input.symbols.map((symbol) => symbol.toUpperCase()))]
          : presetSymbols;
      const marketSnapshot = await yahooMarketDataAdapter.getMarketSnapshot({
        symbols: requestedSymbols,
      });
      const quotesWithChange = marketSnapshot.quotes.filter((quote) => quote.changePercent !== null);
      const strongestMove = [...quotesWithChange].sort(
        (left, right) => (right.changePercent ?? -Infinity) - (left.changePercent ?? -Infinity),
      )[0] ?? null;
      const weakestMove = [...quotesWithChange].sort(
        (left, right) => (left.changePercent ?? Infinity) - (right.changePercent ?? Infinity),
      )[0] ?? null;
      const upMoves = quotesWithChange.filter((quote) => (quote.changePercent ?? 0) > 0).length;
      const downMoves = quotesWithChange.filter((quote) => (quote.changePercent ?? 0) < 0).length;

      return {
        breadth: {
          down: downMoves,
          flat: Math.max(0, quotesWithChange.length - upMoves - downMoves),
          up: upMoves,
        },
        fetchedAt: marketSnapshot.fetchedAt,
        missingSymbols: marketSnapshot.missingSymbols,
        preset: input.preset,
        provider: marketSnapshot.provider,
        quotes: marketSnapshot.quotes,
        requestedSymbols: marketSnapshot.requestedSymbols,
        strongestMove,
        tableMarkdown: buildFinancialQuotesTable(marketSnapshot.quotes),
        weakestMove,
      };
    },
  },
  {
    description:
      "Retorna o estado operacional do scheduler e diagnosticos de saude do sistema. Use para perguntas de saude operacional, alertas, circuito e budget.",
    inputSchema: copilotOperationalHealthToolInputSchema,
    name: "get_operational_health",
    parameters: {
      additionalProperties: false,
      properties: {},
      type: "object",
    },
    run: () => {
      return Promise.resolve(systemStatusService.getOperationalHealth());
    },
  },
  {
    description:
      "Retorna a politica de sincronizacao de cripto e intervalos por escopo. Use para perguntas de cadencia de sync e TTL de cache.",
    inputSchema: copilotSyncPolicyToolInputSchema,
    name: "get_crypto_sync_policy",
    parameters: {
      additionalProperties: false,
      properties: {
        scope: {
          description: "Escopo opcional da politica: hot, warm ou cold",
          enum: ["hot", "warm", "cold"],
          type: "string",
        },
      },
      type: "object",
    },
    run: (input: z.infer<typeof copilotSyncPolicyToolInputSchema>) => {
      if (input.scope) {
        return Promise.resolve(cryptoSyncPolicyService.getPolicy(input.scope));
      }

      return Promise.resolve(cryptoSyncPolicyService.getPolicy());
    },
  },
];

export class CopilotChatService {
  public async chat(input: CopilotChatInput): Promise<OpenRouterChatCompletion> {
    const preparedInput = this.withDefaultSystemPrompt(input);
    const conversationMessages = await this.buildConversationMessages(preparedInput, input.sessionId);
    const completion = await openRouterChatAdapter.createCompletionWithTools(
      {
        maxTokens: preparedInput.maxTokens,
        messages: conversationMessages,
        systemPrompt: preparedInput.systemPrompt,
        temperature: preparedInput.temperature,
      },
      copilotTools,
    );
    const intentContextMessage = this.buildIntentContextMessage(preparedInput.message, conversationMessages);
    const completionWithFallback = await this.applyIntentFallback(
      {
        ...preparedInput,
        message: intentContextMessage,
      },
      completion,
      conversationMessages,
    );

    try {
      await copilotChatAuditStore.append({
        completion: completionWithFallback,
        input: preparedInput,
        sessionId: input.sessionId,
      });
    } catch (error) {
      logger.warn(
        {
          err: error,
        },
        "Failed to append copilot chat audit record",
      );
    }

    return completionWithFallback;
  }

  public async getSessionHistory(input: {
    limit?: number;
    sessionId: string;
  }): Promise<CopilotChatSessionHistory> {
    return copilotChatAuditStore.getSessionHistory(input);
  }

  private withDefaultSystemPrompt(input: CopilotChatInput): CopilotChatInput {
    const trimmedCustomPrompt = input.systemPrompt?.trim();

    if (!trimmedCustomPrompt || trimmedCustomPrompt.length === 0) {
      return {
        ...input,
        systemPrompt: copilotDefaultSystemPrompt,
      };
    }

    return {
      ...input,
      systemPrompt: `${copilotDefaultSystemPrompt}\n\nContexto adicional do usuario:\n${trimmedCustomPrompt}`,
    };
  }

  private async buildConversationMessages(
    input: CopilotChatInput,
    sessionId?: string,
  ): Promise<OpenRouterConversationMessage[]> {
    const currentMessage = input.message.trim();
    const safeSessionId = typeof sessionId === "string" ? sessionId.trim() : "";

    if (safeSessionId.length < 8) {
      return [
        {
          content: currentMessage,
          role: "user",
        },
      ];
    }

    try {
      const sessionHistory = await copilotChatAuditStore.getSessionHistory({
        limit: copilotConversationHistoryLimit,
        sessionId: safeSessionId,
      });

      const historicalMessages = Array.isArray(sessionHistory.messages)
        ? sessionHistory.messages
            .filter((message) => message.role === "assistant" || message.role === "user")
            .map((message) => ({
              content: message.content.trim(),
              role: message.role,
            }))
            .filter((message) => message.content.length > 0)
        : [];
      const mergedMessages: OpenRouterConversationMessage[] = [
        ...historicalMessages,
        {
          content: currentMessage,
          role: "user",
        },
      ];
      const boundedMessages: OpenRouterConversationMessage[] = [];
      let usedChars = 0;

      for (let index = mergedMessages.length - 1; index >= 0; index -= 1) {
        const candidateMessage = mergedMessages[index];

        if (!candidateMessage) {
          continue;
        }

        const candidateChars = candidateMessage.content.length;

        if (boundedMessages.length > 0 && usedChars + candidateChars > copilotConversationMaxChars) {
          break;
        }

        boundedMessages.unshift(candidateMessage);
        usedChars += candidateChars;
      }

      while (boundedMessages.length > 1 && boundedMessages[0]?.role === "assistant") {
        boundedMessages.shift();
      }

      if (boundedMessages.length > 0) {
        return boundedMessages;
      }

      return [
        {
          content: currentMessage,
          role: "user",
        },
      ];
    } catch (error) {
      logger.warn(
        {
          err: error,
          sessionId: safeSessionId,
        },
        "Failed to load structured chat history, falling back to single-message mode",
      );

      return [
        {
          content: currentMessage,
          role: "user",
        },
      ];
    }
  }

  private buildIntentContextMessage(
    currentMessage: string,
    conversationMessages: OpenRouterConversationMessage[],
  ): string {
    const recentUserMessages = conversationMessages
      .filter((message) => message.role === "user")
      .slice(-copilotIntentContextUserTurns)
      .map((message) => message.content.trim())
      .filter((message) => message.length > 0);

    if (recentUserMessages.length === 0) {
      return currentMessage;
    }

    return recentUserMessages.join("\n");
  }

  private async applyIntentFallback(
    input: CopilotChatInput,
    completion: OpenRouterChatCompletion,
    conversationMessages: OpenRouterConversationMessage[],
  ): Promise<OpenRouterChatCompletion> {
    if (shouldForceChartFallback(input.message, completion)) {
      try {
        const fallbackAnswer = await this.buildChartAnalysisFallback(input.message);

        return {
          ...completion,
          answer: fallbackAnswer,
        };
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "Failed to force chart analysis fallback",
        );
      }
    }

    if (shouldForceGeneralAssistantFallback(input.message, completion)) {
      try {
        const fallbackAnswer = await this.buildGeneralAssistantFallback(input, conversationMessages);

        return {
          ...completion,
          answer: fallbackAnswer,
        };
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "Failed to build general assistant fallback",
        );
      }
    }

    if (!hasGenericLimitationAnswer(completion.answer)) {
      return completion;
    }

    if (hasMarketSummaryIntent(input.message)) {
      try {
        const fallbackAnswer = await this.buildMarketSummaryFallback();

        return {
          ...completion,
          answer: fallbackAnswer,
        };
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "Failed to build market summary fallback",
        );

        return completion;
      }
    }

    if (hasAirdropIntent(input.message)) {
      try {
        const fallbackAnswer = await this.buildAirdropIntelligenceFallback(input.message);

        return {
          ...completion,
          answer: fallbackAnswer,
        };
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "Failed to build airdrop intelligence fallback",
        );
      }
    }

    if (hasMonitoringPlanIntent(input.message)) {
      try {
        const fallbackAnswer = await this.buildMonitoringPlanFallback();

        return {
          ...completion,
          answer: fallbackAnswer,
        };
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "Failed to build monitoring plan fallback",
        );
      }
    }

    if (hasChartAnalysisIntent(input.message)) {
      try {
        const fallbackAnswer = await this.buildChartAnalysisFallback(input.message);

        return {
          ...completion,
          answer: fallbackAnswer,
        };
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "Failed to build chart analysis fallback",
        );
      }
    }

    if (hasBrokerIntegrationIntent(input.message)) {
      try {
        const fallbackAnswer = await this.buildBrokerIntegrationFallback(input.message);

        return {
          ...completion,
          answer: fallbackAnswer,
        };
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "Failed to build broker integration fallback",
        );
      }
    }

    if (hasRiskAnalysisIntent(input.message)) {
      try {
        const fallbackAnswer = await this.buildShortTermRiskFallback(input.message);

        return {
          ...completion,
          answer: fallbackAnswer,
        };
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "Failed to build short-term risk fallback",
        );
      }
    }

    return completion;
  }

  private async buildGeneralAssistantFallback(
    input: CopilotChatInput,
    conversationMessages: OpenRouterConversationMessage[],
  ): Promise<string> {
    const fallbackCompletion = await openRouterChatAdapter.createCompletion({
      maxTokens: input.maxTokens,
      messages: conversationMessages,
      systemPrompt: copilotGeneralAssistantSystemPrompt,
      temperature: typeof input.temperature === "number" ? Math.max(0.2, input.temperature) : 0.3,
    });

    return fallbackCompletion.answer;
  }

  private async buildMarketSummaryFallback(): Promise<string> {
    try {
      const marketOverview = await coinCapMarketDataAdapter.getMarketOverview({
        limit: 8,
      });

      return this.buildCoinCapSummaryFallback(marketOverview);
    } catch (error) {
      logger.warn(
        {
          err: error,
        },
        "CoinCap market overview failed, falling back to spot snapshot summary",
      );
    }

    return this.buildSpotSnapshotSummaryFallback();
  }

  private buildCoinCapSummaryFallback(marketOverview: CoinCapMarketOverview): string {
    const topAssets = marketOverview.assets.slice(0, 5);
    const assetsWithChange = topAssets.filter((asset) => asset.changePercent24h !== null);
    const strongest24h = [...assetsWithChange].sort(
      (left, right) => (right.changePercent24h ?? -Infinity) - (left.changePercent24h ?? -Infinity),
    )[0];
    const weakest24h = [...assetsWithChange].sort(
      (left, right) => (left.changePercent24h ?? Infinity) - (right.changePercent24h ?? Infinity),
    )[0];
    const avgChange24h =
      assetsWithChange.length > 0
        ? assetsWithChange.reduce((acc, asset) => acc + (asset.changePercent24h ?? 0), 0) /
          assetsWithChange.length
        : null;
    const riskReading =
      avgChange24h === null
        ? "indefinida"
        : avgChange24h > 2
          ? "apetite a risco"
          : avgChange24h < -2
            ? "aversao a risco"
            : "neutra";
    const highlights = topAssets
      .slice(0, 3)
      .map(
        (asset) =>
          `${asset.symbol.toUpperCase()} ${formatSpotPrice(asset.priceUsd, "usd")} (${formatPercent(asset.changePercent24h)})`,
      )
      .join(" | ");
    const totalMarketCapTop = topAssets.reduce(
      (acc, asset) => acc + (asset.marketCapUsd ?? 0),
      0,
    );
    const totalVolumeTop = topAssets.reduce(
      (acc, asset) => acc + (asset.volumeUsd24h ?? 0),
      0,
    );

    return [
      "Resumo rapido do mercado cripto (CoinCap, janela 24h).",
      `Destaques: ${highlights}.`,
      strongest24h && weakest24h
        ? `Melhor 24h: ${strongest24h.symbol.toUpperCase()} (${formatPercent(strongest24h.changePercent24h)}). Pior 24h: ${weakest24h.symbol.toUpperCase()} (${formatPercent(weakest24h.changePercent24h)}).`
        : "Variacao 24h: dados parciais para os ativos monitorados.",
      `Top ${topAssets.length} por market cap: cap combinado ${formatCompactUsd(totalMarketCapTop)}, volume 24h combinado ${formatCompactUsd(totalVolumeTop)}, leitura de risco ${riskReading}.`,
      "Nota: este resumo e informativo e nao constitui recomendacao de investimento.",
    ].join("\n");
  }

  private async buildSpotSnapshotSummaryFallback(): Promise<string> {
    const comparisonResults = await Promise.all(
      marketSummaryAssetIds.map(async (assetId) => {
        try {
          const spotPrice = await cryptoSpotPriceService.getSpotPrice({
            assetId,
            currency: marketSummaryCurrency,
          });

          const successResult: MarketSnapshotSuccessResult = {
            assetId: spotPrice.assetId,
            cacheState: spotPrice.cache.state,
            price: spotPrice.price,
            stale: spotPrice.cache.stale,
          };

          return {
            ok: true as const,
            value: successResult,
          };
        } catch (error) {
          const failureResult: MarketSnapshotFailureResult = {
            assetId,
            code: error instanceof AppError ? error.code : "MARKET_SNAPSHOT_ERROR",
          };

          return {
            ok: false as const,
            value: failureResult,
          };
        }
      }),
    );

    const successfulQuotes = comparisonResults.filter((item) => item.ok).map((item) => item.value);
    const failedQuotes = comparisonResults.filter((item) => !item.ok).map((item) => item.value);
    const operationalHealth = systemStatusService.getOperationalHealth();

    if (successfulQuotes.length === 0) {
      const affectedAssetsSummary = failedQuotes
        .map((item) => `${item.assetId} (${item.code})`)
        .join(", ");

      return [
        "Resumo rapido do mercado cripto indisponivel neste momento por falha de cotacao spot.",
        `Saude operacional: circuito CoinGecko ${operationalHealth.diagnostics.circuitState} e budget restante ${operationalHealth.diagnostics.budgetRemainingPercent}%.`,
        affectedAssetsSummary.length > 0
          ? `Ativos afetados: ${affectedAssetsSummary}.`
          : "Ativos afetados: indisponivel.",
        "Sugestao: tente novamente em cerca de 1 minuto para nova tentativa de coleta.",
        "Nota: este resumo local usa apenas preco spot e nao inclui noticias ou recomendacao de investimento.",
      ].join("\n");
    }

    const quoteSummary = successfulQuotes
      .map(
        (item) =>
          `${item.assetId} ${formatSpotPrice(item.price, marketSummaryCurrency)}${
            item.stale ? " (stale)" : ""
          }`,
      )
      .join(" | ");

    const failedSummary = failedQuotes
      .map((item) => `${item.assetId} (${item.code})`)
      .join(", ");

    return [
      "Resumo rapido do mercado cripto (snapshot de spot price).",
      `Precos monitorados: ${quoteSummary}.`,
      `Saude operacional: circuito CoinGecko ${operationalHealth.diagnostics.circuitState}, budget restante ${operationalHealth.diagnostics.budgetRemainingPercent}%.`,
      failedSummary.length > 0
        ? `Ativos sem cotacao no momento: ${failedSummary}.`
        : "Todos os ativos monitorados responderam sem erro de cotacao.",
      "Nota: este resumo local usa apenas preco spot, sem noticias e sem recomendacao de investimento.",
    ].join("\n");
  }

  private async buildMonitoringPlanFallback(): Promise<string> {
    const operationalHealth = systemStatusService.getOperationalHealth();
    const syncPolicy = cryptoSyncPolicyService.getPolicy();

    const monitoredAssets = ["bitcoin", "ethereum", "solana"] as const;
    const monitoredQuotes = await Promise.all(
      monitoredAssets.map(async (assetId) => {
        try {
          const spotPrice = await cryptoSpotPriceService.getSpotPrice({
            assetId,
            currency: "usd",
          });

          return `${capitalizeAssetId(assetId)} ${formatSpotPrice(spotPrice.price, "usd")}`;
        } catch {
          return `${capitalizeAssetId(assetId)} n/d`;
        }
      }),
    );

    return [
      "Plano de monitoramento para hoje (3 checkpoints).",
      `Checkpoint 1 (abertura): validar saude operacional (status ${operationalHealth.status}, circuito ${operationalHealth.diagnostics.circuitState}, budget ${operationalHealth.diagnostics.budgetRemainingPercent}%).`,
      `Checkpoint 2 (meio do dia): revisar os ativos chave (${monitoredQuotes.join(" | ")}) e abrir alerta se houver variacao brusca ou aumento de falhas por escopo.`,
      `Checkpoint 3 (fechamento): conferir politicas de sync (hot a cada ${formatIntervalMinutes(syncPolicy.policy.hot.intervalSeconds)} min, warm a cada ${formatIntervalMinutes(syncPolicy.policy.warm.intervalSeconds)} min, cold a cada ${formatIntervalMinutes(syncPolicy.policy.cold.intervalSeconds)} min) e registrar ajustes para o proximo ciclo.`,
      "Observacao: este plano e operacional e informativo, sem recomendacao de investimento.",
    ].join("\n");
  }

  private async buildAirdropIntelligenceFallback(message: string): Promise<string> {
    const focusQuery = resolveAirdropFocusQuery(message);
    const airdropRadar = await airdropIntelligenceService.getOpportunities({
      includeSpeculative: true,
      limit: 8,
      minScore: 28,
      query: focusQuery,
    });

    if (airdropRadar.opportunities.length === 0) {
      return [
        "Radar de airdrops (multi-fonte) sem oportunidades pontuadas no corte atual.",
        focusQuery ? `Filtro aplicado: ${focusQuery}.` : "Filtro aplicado: geral.",
        `Cobertura de fontes: ${airdropRadar.summary.sourcesHealthy}/${airdropRadar.summary.totalSources} (${airdropRadar.summary.sourceCoveragePercent}%).`,
        "Ajuste sugerido: reduza o minScore para 20-25, inclua oportunidades especulativas e amplie para ecossistemas especificos (Base, Arbitrum, zkSync, Solana).",
        "Aviso: oportunidades de airdrop nao sao garantia de recompensa; valide sempre regras oficiais e risco operacional.",
      ].join("\n");
    }

    const topOpportunities = airdropRadar.opportunities
      .slice(0, 5)
      .map((opportunity, index) => {
        const tasksLabel = opportunity.tasks.slice(0, 2).join("; ");
        const chainLabel = opportunity.chain ?? "multichain";

        return `${index + 1}. ${opportunity.project} | score ${opportunity.score} | confianca ${formatAirdropConfidenceLabel(opportunity.confidence)} | chain ${chainLabel} | reward ${formatAirdropRewardTypeLabel(opportunity.rewardType)} | tarefas: ${tasksLabel} | fontes: ${opportunity.sources.join(", ")} | link: ${opportunity.url}`;
      });

    return [
      "Radar de airdrops (multi-fonte, leitura objetiva e sem promessa de reward).",
      focusQuery ? `Filtro aplicado: ${focusQuery}.` : "Filtro aplicado: geral.",
      `Cobertura de fontes: ${airdropRadar.summary.sourcesHealthy}/${airdropRadar.summary.totalSources} (${airdropRadar.summary.sourceCoveragePercent}%).`,
      ...topOpportunities,
      "Checklist profissional: validar criterio oficial de elegibilidade, custo de gas/ponte, risco de contrato e prazo de snapshot antes de executar qualquer tarefa.",
    ].join("\n");
  }

  private async buildChartAnalysisFallback(message: string): Promise<string> {
    const assetId = resolvePrimaryAssetIdForChart(message);
    const range = resolveChartRangeFromMessage(message);
    const mode = resolveChartModeFromMessage(message);
    const resolvedBroker = resolveBrokerFromMessage(message);
    const broker = resolvedBroker === "iqoption" ? "binance" : resolvedBroker;
    const chart =
      mode === "live"
        ? await cryptoChartService.getLiveChart({
            assetId,
            broker,
            range,
          })
        : await cryptoChartService.getChart({
            assetId,
            currency: "usd",
            range,
          });
    const trendLabel = formatTrendLabel(chart.insights.trend);
    const tradeActionLabel = formatTradeActionLabel(chart.insights.tradeAction);
    const rsi14Label = chart.insights.rsi14 === null ? "n/d" : `${chart.insights.rsi14.toFixed(2)}`;
    const liveSummary =
      chart.mode === "live"
        ? ` | live 24h: ${formatPercent(chart.live?.changePercent24h ?? null)} | volume 24h: ${formatCompactUsd(chart.live?.volume24h ?? null)}`
        : "";

    return [
      `Analise tecnica objetiva de ${capitalizeAssetId(chart.assetId)} (${formatRangeLabel(chart.range)}, modo ${chart.mode}).`,
      `Preco atual: ${formatSpotPrice(chart.insights.currentPrice, chart.currency)} | variacao no periodo: ${chart.insights.changePercent}% | ${trendLabel}.`,
      `Sinal tatico atual: ${tradeActionLabel} com confianca ${formatConfidenceScore(chart.insights.confidenceScore)} (informativo, nao e recomendacao).`,
      `Momentum: ${chart.insights.momentumPercent}% | volatilidade: ${chart.insights.volatilityPercent}% | RSI14: ${rsi14Label} | MACD hist: ${chart.insights.macdHistogram}% | ATR: ${chart.insights.atrPercent}%.`,
      `Faixa tecnica: suporte ${formatSpotPrice(chart.insights.supportLevel, chart.currency)} | resistencia ${formatSpotPrice(chart.insights.resistanceLevel, chart.currency)} | entrada ${formatSpotPrice(chart.insights.tradeLevels.entryZoneLow, chart.currency)} - ${formatSpotPrice(chart.insights.tradeLevels.entryZoneHigh, chart.currency)} | stop ${formatSpotPrice(chart.insights.tradeLevels.stopLoss, chart.currency)} | TP1 ${formatSpotPrice(chart.insights.tradeLevels.takeProfit1, chart.currency)} | TP2 ${formatSpotPrice(chart.insights.tradeLevels.takeProfit2, chart.currency)}.`,
      `EMA rapida: ${formatSpotPrice(chart.insights.emaFast, chart.currency)} | EMA lenta: ${formatSpotPrice(chart.insights.emaSlow, chart.currency)} | provider ${chart.provider}${liveSummary} | cache ${chart.cache.state}${chart.cache.stale ? " (stale)" : ""}.`,
      "Leitura profissional: combine sinais tecnicos com gestao de risco, tamanho de posicao e confirmacao de liquidez antes de qualquer execucao.",
    ].join("\n");
  }

  private async buildBrokerIntegrationFallback(message: string): Promise<string> {
    const broker = resolveBrokerFromMessage(message);
    const normalizedMessage = normalizeText(message);
    const assetHint = resolvePrimaryAssetHint(message);
    const asksWhereToBuy = hasWhereToBuyIntent(normalizedMessage);

    if (asksWhereToBuy) {
      try {
        return await this.buildWebWhereToBuyFallback(message, assetHint);
      } catch (error) {
        logger.warn(
          {
            assetHint,
            err: error,
          },
          "Web where-to-buy fallback failed, trying broker quote fallback",
        );
      }
    }

    try {
      const quote = await brokerMarketService.getLiveQuote({
        assetId: assetHint,
        broker,
      });

      if (quote.market.price === null) {
        return [
          `Broker ${broker.toUpperCase()} mapeado no bot, mas ainda em modo ${quote.status}.`,
          `Ativo consultado: ${capitalizeAssetId(quote.assetId)} | cotacao ao vivo indisponivel nesta build.`,
          `Status tecnico: ${quote.notes}`,
          "Proximo passo de integracao: habilitar bridge privada autenticada da corretora para saldo, ordens e stream de preco em tempo real.",
        ].join("\n");
      }

      return [
        `Cotacao via broker ${quote.broker.toUpperCase()} para ${capitalizeAssetId(quote.assetId)}.`,
        `Preco: ${formatSpotPrice(quote.market.price, quote.currency)} | 24h: ${formatPercent(quote.market.changePercent24h)} | volume 24h: ${formatCompactUsd(quote.market.volume24h)} | simbolo: ${quote.market.symbol ?? "n/d"}.`,
        `Capacidades disponiveis nesta integracao: liveQuote=${quote.capabilities.liveQuote ? "sim" : "nao"}, orderExecution=${quote.capabilities.orderExecution ? "sim" : "nao"}, accountBalance=${quote.capabilities.accountBalance ? "sim" : "nao"}.`,
        `Observacao operacional: ${quote.notes}`,
        "Leitura profissional: use cotacao de broker como referencia de execucao e confirme liquidez/spread antes de qualquer decisao.",
      ].join("\n");
    } catch (error) {
      logger.warn(
        {
          assetHint,
          broker,
          err: error,
        },
        "Broker quote lookup failed, falling back to web where-to-buy discovery",
      );
    }

    try {
      return await this.buildWebWhereToBuyFallback(message, assetHint);
    } catch (error) {
      logger.warn(
        {
          assetHint,
          err: error,
        },
        "Web fallback for broker integration failed",
      );
    }

    return [
      `Nao foi possivel confirmar disponibilidade para ${assetHint.toUpperCase()} no momento.`,
      `Broker alvo: ${broker.toUpperCase()}.`,
      "Tente novamente em alguns instantes para nova varredura de fontes e cotacao.",
    ].join("\n");
  }

  private async buildDexScreenerWhereToBuyFallback(assetHint: string, message: string): Promise<string | null> {
    const normalizedAssetHint = assetHint.trim().length > 0 ? assetHint.trim().toLowerCase() : "token";
    const tokenLookupQuery = normalizedAssetHint === "token"
      ? message.trim()
      : `${normalizedAssetHint} ${message}`.trim();
    const lookupResponse = await dexScreenerSearchAdapter.searchTokenListings({
      maxResults: 5,
      query: tokenLookupQuery,
    });
    const topVenues = lookupResponse.venues.slice(0, 4);

    if (topVenues.length === 0) {
      return null;
    }

    const bestVenue = topVenues[0];
    const primaryTokenSymbol = bestVenue?.baseTokenSymbol ?? normalizedAssetHint.toUpperCase();
    const primaryBuyLine = bestVenue
      ? `Voce pode comprar ${primaryTokenSymbol} na ${bestVenue.dexName} (Rede ${bestVenue.chainName}).`
      : `Voce pode comprar ${primaryTokenSymbol} em DEX da rede identificada.`;
    const venueLines = topVenues
      .map((venue, index) => {
        const liquidityLabel = formatCompactUsd(venue.liquidityUsd);
        const volumeLabel = formatCompactUsd(venue.volume24hUsd);
        return `${index + 1}. ${venue.dexName} (Rede ${venue.chainName}) | par ${venue.baseTokenSymbol}/${venue.quoteTokenSymbol} | liquidez ${liquidityLabel} | volume 24h ${volumeLabel} | ${venue.pairUrl}`;
      })
      .join("\n");

    return [
      `DexScreener (API em tempo real) confirmou venues para ${primaryTokenSymbol}.`,
      primaryBuyLine,
      "Melhores pares encontrados agora:",
      venueLines,
      "Fallback inteligente habilitado: se DexScreener falhar ou nao tiver venues suficientes, eu complemento automaticamente com busca web global.",
      "Checklist profissional: valide contrato oficial, rede correta e liquidez antes de executar qualquer compra.",
    ].join("\n");
  }

  private async buildWebWhereToBuyFallback(message: string, assetHint: string): Promise<string> {
    const normalizedAssetHint = assetHint.trim().length > 0 ? assetHint.trim().toLowerCase() : "token";

    try {
      const dexScreenerFallback = await this.buildDexScreenerWhereToBuyFallback(normalizedAssetHint, message);

      if (dexScreenerFallback) {
        return dexScreenerFallback;
      }
    } catch (error) {
      logger.warn(
        {
          assetHint: normalizedAssetHint,
          err: error,
        },
        "DexScreener where-to-buy fallback failed, continuing with global web search",
      );
    }

    const focusedQuery = buildFocusedWebSearchQuery(
      `${normalizedAssetHint} ${message}`.trim(),
      "where_to_buy",
    );
    const searchResponse = await webSearchAdapter.search({
      maxResults: 6,
      query: focusedQuery,
    });
    const topResults = searchResponse.results.slice(0, 5);
    const exchangeMentions = extractExchangeMentionsFromWebResults(topResults);
    const highConfidenceSources = topResults.filter((result) => result.confidenceLabel === "high").length;
    const displayAssetHint = normalizedAssetHint.toUpperCase();

    if (topResults.length === 0) {
      return [
        `Pesquisa global em tempo real executada para ${displayAssetHint}, sem resultados estruturados nesta rodada.`,
        "Nao delego pesquisa para o usuario: posso continuar varrendo em nova tentativa imediatamente.",
      ].join("\n");
    }

    const sourceLines = topResults
      .map((result, index) => {
        const snippet = result.snippet.length > 0 ? result.snippet : "sem snippet relevante";
        return `${index + 1}. [${result.confidenceLabel.toUpperCase()} ${result.confidenceScore}] ${result.title} | dominio: ${result.domain || "n/d"} | ${result.url} | ${snippet}`;
      })
      .join("\n");

    return [
      `Pesquisa global em tempo real para ${displayAssetHint}.`,
      `Provider usado: ${searchResponse.provider}. Fontes de alta confianca: ${highConfidenceSources}/${topResults.length}.`,
      exchangeMentions.length > 0
        ? `Possiveis locais de compra/listagem identificados: ${exchangeMentions.join(", ")}.`
        : "Nao houve confirmacao clara de listagem em corretoras grandes nas fontes coletadas agora.",
      "Fontes verificadas agora:",
      sourceLines,
      "Checklist profissional: valide contrato oficial, rede correta, liquidez, volume real e risco de spoofing antes de qualquer execucao.",
    ].join("\n");
  }

  private async buildShortTermRiskFallback(message: string): Promise<string> {
    const selectedAssets = resolveRiskAssetIds(message);
    const [marketOverviewResult, macroSnapshotResult] = await Promise.allSettled([
      coinCapMarketDataAdapter.getMarketOverview({
        limit: 15,
      }),
      yahooMarketDataAdapter.getMarketSnapshot({
        symbols: financialMarketPresetSymbols.risk,
      }),
    ]);
    const overviewAssetsById =
      marketOverviewResult.status === "fulfilled"
        ? new Map(marketOverviewResult.value.assets.map((asset) => [asset.assetId, asset]))
        : new Map<string, CoinCapMarketAsset>();
    const spotSnapshots = await Promise.all(
      selectedAssets.map(async (assetId) => {
        try {
          const spotPrice = await cryptoSpotPriceService.getSpotPrice({
            assetId,
            currency: "usd",
          });

          return {
            assetId,
            price: spotPrice.price,
            stale: spotPrice.cache.stale,
          };
        } catch {
          return {
            assetId,
            price: null,
            stale: false,
          };
        }
      }),
    );
    const assetSignals = spotSnapshots.map((spotSnapshot) => {
      const marketOverviewAsset = overviewAssetsById.get(spotSnapshot.assetId) ?? null;
      const priceLabel =
        spotSnapshot.price === null ? "n/d" : `${formatSpotPrice(spotSnapshot.price, "usd")}${spotSnapshot.stale ? " (stale)" : ""}`;
      const changePercent24h = marketOverviewAsset?.changePercent24h ?? null;
      const volumeUsd24h = marketOverviewAsset?.volumeUsd24h ?? null;

      return `${capitalizeAssetId(spotSnapshot.assetId)} ${priceLabel}, 24h ${formatPercent(changePercent24h)}, volatilidade ${classifyVolatility(changePercent24h)}, liquidez ${classifyLiquidity(volumeUsd24h)}`;
    });
    const macroSummary =
      macroSnapshotResult.status === "fulfilled"
        ? summarizeMacroRiskSignals(macroSnapshotResult.value.quotes)
        : "dados macro indisponiveis no momento";
    const operationalHealth = systemStatusService.getOperationalHealth();

    return [
      "Analise objetiva de risco de curto prazo (janela 24h, sem recomendacao de investimento).",
      `Ativos analisados: ${selectedAssets.map((assetId) => capitalizeAssetId(assetId)).join(", ")}.`,
      `Sinais por ativo: ${assetSignals.join(" | ")}.`,
      `Sinais macro: ${macroSummary}.`,
      `Saude operacional de dados: status ${operationalHealth.status}, circuito ${operationalHealth.diagnostics.circuitState}, budget restante ${operationalHealth.diagnostics.budgetRemainingPercent}%.`,
      "Checklist rapido: acompanhar mudanca de volatilidade, deterioracao de volume e aumento de correlacao com choques macro.",
    ].join("\n");
  }
}