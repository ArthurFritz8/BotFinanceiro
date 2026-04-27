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
  type DexScreenerTokenLookupResponse,
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
  formatBundleRiskChecklistMarkdown,
  memeRadarService,
  type BundleRiskReport,
  type MemeRadarNotification,
} from "../../meme_radar/application/meme-radar-service.js";
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

type CopilotChartContextMode = "delayed" | "live";
type CopilotChartContextStrategy = "crypto" | "institutional_macro";

export interface CopilotChartContextInput {
  assetId?: string;
  broker?: string;
  exchange?: string;
  interval?: string;
  mode?: CopilotChartContextMode;
  operationalMode?: string;
  range?: CryptoChartRange;
  strategy?: CopilotChartContextStrategy;
  symbol?: string;
}

export interface CopilotChatInput {
  chartContext?: CopilotChartContextInput;
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
  "Persona de resposta: analista quant institucional, objetivo, metrico e rastreavel.",
  "Se a pergunta for geral e nao envolver mercado financeiro, responda normalmente de forma clara e direta, sem forcar contexto de mercado ou uso de tools.",
  "Regra de roteamento: use tools de cotacao/grafico somente com pedido explicito de preco, cotacao, grafico, analise tecnica ou vies.",
  "Diretiva de preco em cambio/FX: para dolar/euro/libra/iene ou par cambial, use get_forex_market_snapshot (ou get_financial_market_snapshot/get_macro_rates_market_snapshot) antes da resposta final e inclua fonte + timestamp.",
  "Para resumo de mercado cripto, use get_crypto_market_overview; para preco/comparacao use get_crypto_spot_price ou get_crypto_multi_spot_price; para grafico/TA/SMC use get_crypto_chart_insights.",
  "Framework institucional para grafico (obrigatorio): entregue SEMPRE Cenario Bull e Cenario Bear com probabilidades complementares somando 100%, gatilho de ativacao e alvos TP1/TP2.",
  "Formato obrigatorio para resposta de grafico: inclua explicitamente os blocos 'Cenario Bull:', 'Cenario Bear:' e 'Gestao de risco dinamica'.",
  "Apresente resposta de grafico em bloco Markdown premium, com secoes: '## Contexto Quantitativo', '## Cenarios Institucionais' e '## Gestao de Risco Dinamica'.",
  "No bloco SMC/Wyckoff, interprete suporte/resistencia e swing highs/lows como zonas de liquidez (Order Blocks) e explicite sinais de BOS/CHoCH quando presentes.",
  "No bloco de gestao de risco, assuma banca teorica de referencia e calcule Position Size maximo com risco conservador de 1% entre entrada e stop.",
  "Para airdrop, retroativo, testnet, quests/farming ou alerta de memecoin (Token/Chain/Hype Score), nao responda com cotacao generica de BTC/ETH/SOL; use contexto e get_airdrop_opportunities.",
  "Para corretoras use get_broker_live_quote; para forex/futuros/opcoes/commodities/renda fixa/ETFs/setores/macro use as tools especializadas; para snapshot amplo use get_financial_market_snapshot.",
  "Fluxo detetive: identificar intencao, investigar com tools e sintetizar resposta humana objetiva.",
  "Se o usuario nao pediu analise tecnica formal, evite template rigido de cotacao.",
  "Quando a pergunta envolver risco de curto prazo, entregue fatores de volatilidade, liquidez, macro e operacao com linguagem institucional, sem recomendacao de investimento.",
  "Diretiva severa para 'onde comprar': se a exchange nao estiver clara, use search_token_listings_dexscreener e, se necessario, search_web_realtime para descobrir contrato/listagem; se ainda ambiguo, peca nome/ticker/contrato exato. NUNCA devolva cotacao de ativo nao relacionado.",
  "Use links do historico como fonte primaria; para ativo desconhecido ou anafora, faca busca web antes de concluir.",
  "Nunca delegue com 'pesquise no Google' e nunca diga 'nao encontrei informacoes' sem investigacao web e nova tentativa on-chain.",
  "Ao usar busca web, cite URLs principais e explicite limitacoes dos dados.",
  "Diretiva Anti-Vamp: sempre cruze ticker na web; se encontrar contratos mortos/antigos com mesmo nome ou imagem, classifique como VAMP SCAM (Copia Parasita).",
  "Diretiva de relatorio: comece com [RISK SCORE: 0/100] e destaque suspeita de Multi-Wallet ou moderacao fraca.",
  "Checklist institucional PASS/FAIL: HIGH_CONCENTRATION_RISK, SYMMETRIC_BUNDLE_DETECTED, FAKE_HOLDERS_WARNING, COORDINATED_BUNDLE, EARLY_DUMP_TRAP, COMMUNITY_HEALTH_FAILURE.",
  "Regras: viewers menor que 30% de holders => FAKE_HOLDERS_WARNING; funding comum no Top 10 => COORDINATED_BUNDLE; market cap menor que 10000 com 2+ snipers/dev/fresh => EARLY_DUMP_TRAP com alerta de risco extremo.",
  "Formato: inclua tabela Markdown 'Checklist de Seguranca' com Status PASS/FAIL; para falhas criticas use destaque visual.",
  "Melhoria adicional: em search_web_realtime use apenas ticker ou contract address; se faltar entidade valida, solicite antes de concluir e gere checklist so apos validar evidencias das tools.",
].join(" ");

const copilotGeneralAssistantSystemPrompt = [
  "Voce e um assistente geral util, claro e objetivo.",
  "Responda em portugues do Brasil, com linguagem natural e direta.",
  "Nao force contexto financeiro se a pergunta for de outro assunto.",
  "Se nao souber algum fato, sinalize a limitacao de forma transparente e sugira como verificar.",
].join(" ");

const COPILOT_SYSTEM_PROMPT_MAX_LENGTH = 4000;
const copilotChartContextExchanges = new Set(["binance", "bybit", "coinbase", "kraken", "okx"]);
const copilotChartContextModes = new Set(["delayed", "live"]);
const copilotChartContextRanges = new Set(["24h", "7d", "30d", "90d", "1y"]);
const copilotChartContextStrategies = new Set(["crypto", "institutional_macro"]);

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
  chain: z
    .enum(["arbitrum", "avalanche", "base", "bsc", "celo", "ethereum", "optimism", "polygon", "solana"])
    .optional(),
  contractAddress: z
    .string()
    .trim()
    .regex(/^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/)
    .optional(),
  maxResults: z.number().int().min(1).max(8).default(4),
  query: z.string().trim().min(2).max(120).optional(),
}).superRefine((value, ctx) => {
  if (!value.query && !value.contractAddress) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "query or contractAddress is required",
      path: ["query"],
    });
  }
});

const copilotWebSearchToolInputSchema = z.object({
  focus: z.enum(["general", "news", "token_lookup", "where_to_buy"]).default("general"),
  maxResults: z.number().int().min(3).max(10).default(6),
  query: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(
      /^(0x[a-fA-F0-9]{40}|[A-Za-z][A-Za-z0-9._-]{1,23})$/,
      "query must be a single ticker symbol or contract address",
    ),
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
const copilotWhereToBuyToolNames = new Set([
  "get_broker_live_quote",
  "search_token_listings_dexscreener",
  "search_web_realtime",
]);
const copilotAirdropToolNames = new Set([
  "get_airdrop_opportunities",
  "search_web_realtime",
]);
const copilotInstitutionalRiskToolNames = new Set([
  "search_token_listings_dexscreener",
  "search_web_realtime",
]);
const copilotFiatFxQuoteToolNames = new Set([
  "get_forex_market_snapshot",
  "get_financial_market_snapshot",
  "get_macro_rates_market_snapshot",
]);

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

const fiatCurrencyCodes = new Set([
  "USD",
  "BRL",
  "EUR",
  "GBP",
  "JPY",
  "CHF",
  "CAD",
  "AUD",
  "NZD",
  "MXN",
  "CNY",
  "HKD",
  "CLP",
  "COP",
  "ARS",
  "PEN",
  "INR",
  "KRW",
  "THB",
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

function hasExplicitPriceOrChartIntent(message: string): boolean {
  const normalizedMessage = normalizeText(message);
  const asksPrice =
    normalizedMessage.includes("preco") ||
    normalizedMessage.includes("cotacao") ||
    normalizedMessage.includes("quanto vale") ||
    normalizedMessage.includes("valor atual") ||
    normalizedMessage.includes("price") ||
    normalizedMessage.includes("vies de mercado") ||
    normalizedMessage.includes("viés de mercado");
  const asksChart =
    normalizedMessage.includes("grafico") ||
    normalizedMessage.includes("grafic") ||
    normalizedMessage.includes("chart") ||
    normalizedMessage.includes("analise tecnica") ||
    normalizedMessage.includes("analise tecnic") ||
    normalizedMessage.includes("analise grafica") ||
    normalizedMessage.includes("suporte") ||
    normalizedMessage.includes("resistencia") ||
    normalizedMessage.includes("tendencia");

  return asksPrice || asksChart;
}

function extractFiatPairFromMessage(message: string): string | null {
  const upperCasedMessage = message.toUpperCase();
  const explicitPairMatches = upperCasedMessage.matchAll(/\b([A-Z]{3})\s*\/?\s*([A-Z]{3})\b/g);

  for (const pairMatch of explicitPairMatches) {
    const baseCode = pairMatch[1] ?? "";
    const quoteCode = pairMatch[2] ?? "";

    if (fiatCurrencyCodes.has(baseCode) && fiatCurrencyCodes.has(quoteCode)) {
      return `${baseCode}${quoteCode}`;
    }
  }

  const yahooSymbolMatch = upperCasedMessage.match(/\b([A-Z]{3})([A-Z]{3})=X\b/);

  if (yahooSymbolMatch) {
    const baseCode = yahooSymbolMatch[1] ?? "";
    const quoteCode = yahooSymbolMatch[2] ?? "";

    if (fiatCurrencyCodes.has(baseCode) && fiatCurrencyCodes.has(quoteCode)) {
      return `${baseCode}${quoteCode}`;
    }
  }

  return null;
}

function hasKnownCryptoAssetMention(message: string): boolean {
  const normalizedMessage = normalizeText(message);

  return riskAssetAliases.some((assetAlias) =>
    assetAlias.aliases.some((alias) => hasExactAlias(normalizedMessage, alias)),
  );
}

function hasFiatFxPriceIntent(message: string): boolean {
  const normalizedMessage = normalizeText(message);
  const hasExplicitFiatPair = extractFiatPairFromMessage(message) !== null;
  const asksQuoteOrPrice =
    hasExplicitPriceOrChartIntent(message) ||
    normalizedMessage.includes("quanto") ||
    normalizedMessage.includes("taxa") ||
    normalizedMessage.includes("hoje") ||
    normalizedMessage.includes("agora") ||
    normalizedMessage.includes("cambio") ||
    normalizedMessage.includes("forex") ||
    normalizedMessage.includes("fx");

  if (!asksQuoteOrPrice) {
    return false;
  }

  if (hasExplicitFiatPair) {
    return true;
  }

  const mentionsFxContext =
    normalizedMessage.includes("cambio") ||
    normalizedMessage.includes("forex") ||
    normalizedMessage.includes("par cambial") ||
    normalizedMessage.includes("dolar") ||
    normalizedMessage.includes("euro") ||
    normalizedMessage.includes("libra") ||
    normalizedMessage.includes("iene") ||
    normalizedMessage.includes("yen") ||
    normalizedMessage.includes("usd") ||
    normalizedMessage.includes("eur") ||
    normalizedMessage.includes("gbp") ||
    normalizedMessage.includes("jpy") ||
    normalizedMessage.includes("brl");

  if (!mentionsFxContext) {
    return false;
  }

  const hasCryptoMention = hasKnownCryptoAssetMention(message);

  if (
    hasCryptoMention &&
    !normalizedMessage.includes("cambio") &&
    !normalizedMessage.includes("forex") &&
    !normalizedMessage.includes("par cambial")
  ) {
    return false;
  }

  return true;
}

function resolveForexPairFromMessage(message: string): string {
  const explicitFiatPair = extractFiatPairFromMessage(message);

  if (explicitFiatPair) {
    return explicitFiatPair;
  }

  const normalizedMessage = normalizeText(message);

  if (
    normalizedMessage.includes("dolar") &&
    (normalizedMessage.includes("iene") ||
      normalizedMessage.includes("yen") ||
      normalizedMessage.includes("jpy") ||
      normalizedMessage.includes("japao"))
  ) {
    return "USDJPY";
  }

  if (
    normalizedMessage.includes("dolar") &&
    (normalizedMessage.includes("peso mexicano") ||
      normalizedMessage.includes("mxn") ||
      normalizedMessage.includes("mexico"))
  ) {
    return "USDMXN";
  }

  if (
    normalizedMessage.includes("euro") &&
    (normalizedMessage.includes("real") || normalizedMessage.includes("brl") || normalizedMessage.includes("brasil"))
  ) {
    return "EURBRL";
  }

  if (
    normalizedMessage.includes("euro") &&
    (normalizedMessage.includes("dolar") || normalizedMessage.includes("usd"))
  ) {
    return "EURUSD";
  }

  if (
    normalizedMessage.includes("libra") &&
    (normalizedMessage.includes("dolar") || normalizedMessage.includes("usd"))
  ) {
    return "GBPUSD";
  }

  if (
    normalizedMessage.includes("dolar canadense") ||
    (normalizedMessage.includes("dolar") && normalizedMessage.includes("canadense")) ||
    (normalizedMessage.includes("usd") && normalizedMessage.includes("cad"))
  ) {
    return "USDCAD";
  }

  if (
    (normalizedMessage.includes("dolar") || normalizedMessage.includes("usd")) &&
    (normalizedMessage.includes("real") || normalizedMessage.includes("brl") || normalizedMessage.includes("brasil"))
  ) {
    return "USDBRL";
  }

  if (normalizedMessage.includes("euro") || normalizedMessage.includes("eur")) {
    return "EURUSD";
  }

  return "USDBRL";
}

function hasMemeAlertPayloadIntent(message: string): boolean {
  const normalizedMessage = normalizeText(message);
  const hasTokenField = /(^|\n)\s*(token|ticker|ativo|asset)\s*[:=-]/m.test(normalizedMessage);
  const hasChainField = /(^|\n)\s*chain\s*[:=-]/m.test(normalizedMessage);
  const hasHypeField = /(^|\n)\s*hype\s*score\s*[:=-]/m.test(normalizedMessage) ||
    normalizedMessage.includes("hype score");

  return (hasTokenField && hasChainField) || (hasTokenField && hasHypeField) || (hasChainField && hasHypeField);
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
    return candidates[0] ?? "token";
  }

  return "token";
}

function extractSearchEntityFromQuery(rawQuery: string): string {
  const trimmedQuery = rawQuery.trim();

  if (trimmedQuery.length === 0) {
    return "";
  }

  const contractCandidates = extractContractAddressCandidatesFromText(trimmedQuery);

  if (contractCandidates.length > 0) {
    return contractCandidates[0] ?? "";
  }

  const assetHintCandidates = extractAssetHintCandidates(trimmedQuery);

  if (assetHintCandidates.length > 0) {
    return assetHintCandidates[0] ?? "";
  }

  if (/^[A-Za-z][A-Za-z0-9._-]{1,23}$/.test(trimmedQuery)) {
    return trimmedQuery.toLowerCase();
  }

  return "";
}

function buildFocusedWebSearchQuery(
  query: string,
  focus: "general" | "news" | "token_lookup" | "where_to_buy",
): string {
  void focus;

  return extractSearchEntityFromQuery(query);
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

function extractUrlsFromText(value: string): string[] {
  const rawMatches = value.match(/https?:\/\/[^\s<>"]+/gi) ?? [];
  const dedupe = new Set<string>();
  const sanitizedUrls: string[] = [];

  for (const rawMatch of rawMatches) {
    let normalizedUrl = rawMatch.trim();

    while (/[),.;!?]$/.test(normalizedUrl)) {
      normalizedUrl = normalizedUrl.slice(0, -1);
    }

    try {
      const validatedUrl = new URL(normalizedUrl).toString();

      if (!dedupe.has(validatedUrl)) {
        dedupe.add(validatedUrl);
        sanitizedUrls.push(validatedUrl);
      }
    } catch {
      continue;
    }
  }

  return sanitizedUrls;
}

function extractDomainsFromUrls(urls: string[]): string[] {
  const dedupe = new Set<string>();
  const domains: string[] = [];

  for (const url of urls) {
    try {
      const host = new URL(url).hostname.trim().toLowerCase().replace(/^www\./, "");

      if (host.length === 0 || dedupe.has(host)) {
        continue;
      }

      dedupe.add(host);
      domains.push(host);
    } catch {
      continue;
    }
  }

  return domains;
}

function extractLatestUserTurn(message: string): string {
  const turns = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (turns.length === 0) {
    return message.trim();
  }

  return turns[turns.length - 1] ?? message.trim();
}

function truncateForQuery(value: string, maxLength: number): string {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return trimmed.slice(0, maxLength).trim();
}

function extractContractAddressCandidatesFromText(value: string): string[] {
  const evmCandidates = value.match(/\b0x[a-fA-F0-9]{40}\b/g) ?? [];
  const dedupe = new Set<string>();
  const normalizedCandidates: string[] = [];

  for (const candidate of evmCandidates) {
    const normalizedCandidate = candidate.toLowerCase();

    if (!dedupe.has(normalizedCandidate)) {
      dedupe.add(normalizedCandidate);
      normalizedCandidates.push(normalizedCandidate);
    }
  }

  return normalizedCandidates;
}

function hasResolvableAssetHint(message: string): boolean {
  const normalizedMessage = normalizeText(message);

  if (extractContractAddressCandidatesFromText(message).length > 0) {
    return true;
  }

  if (extractAssetHintCandidates(message).length > 0) {
    return true;
  }

  return riskAssetAliases.some((assetAlias) =>
    assetAlias.aliases.some((alias) => hasExactAlias(normalizedMessage, alias)),
  );
}

function extractRecentUserLinks(conversationMessages: OpenRouterConversationMessage[]): string[] {
  const dedupe = new Set<string>();
  const collectedLinks: string[] = [];

  for (let index = conversationMessages.length - 1; index >= 0; index -= 1) {
    const message = conversationMessages[index];

    if (!message || message.role !== "user") {
      continue;
    }

    for (const url of extractUrlsFromText(message.content)) {
      if (!dedupe.has(url)) {
        dedupe.add(url);
        collectedLinks.push(url);

        if (collectedLinks.length >= 6) {
          return collectedLinks;
        }
      }
    }
  }

  return collectedLinks;
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

  if (!hasExplicitPriceOrChartIntent(message)) {
    return false;
  }

  if (hasWhereToBuyIntent(normalizedMessage) || hasAirdropIntent(message) || hasMemeAlertPayloadIntent(message)) {
    return false;
  }

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
  const mentionsAsset = riskAssetAliases.some((assetAlias) =>
    assetAlias.aliases.some((alias) => hasExactAlias(normalizedMessage, alias)),
  );

  return asksForChart && mentionsAsset;
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

function hasInstitutionalFraudIntent(message: string): boolean {
  const normalizedMessage = normalizeText(message);

  if (hasMemeAlertPayloadIntent(message)) {
    return true;
  }

  return (
    normalizedMessage.includes("anti-bundle") ||
    normalizedMessage.includes("anti bundle") ||
    normalizedMessage.includes("bundle") ||
    normalizedMessage.includes("vamp") ||
    normalizedMessage.includes("vamp scam") ||
    normalizedMessage.includes("fraude") ||
    normalizedMessage.includes("scam") ||
    normalizedMessage.includes("rug") ||
    normalizedMessage.includes("honeypot") ||
    normalizedMessage.includes("multi wallet") ||
    normalizedMessage.includes("multi-wallet") ||
    normalizedMessage.includes("holders") ||
    normalizedMessage.includes("sniper") ||
    normalizedMessage.includes("auditoria") ||
    normalizedMessage.includes("checklist de seguranca")
  );
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

function hasMisroutedQuoteTemplateAnswer(answer: string): boolean {
  const normalizedAnswer = normalizeText(answer);

  return (
    normalizedAnswer.includes("analise tecnica objetiva") ||
    normalizedAnswer.includes("preco atual") ||
    normalizedAnswer.includes("ema rapida") ||
    normalizedAnswer.includes("ema lenta")
  );
}

const portugueseLocaleHintTokens = new Set([
  "analise",
  "comprar",
  "como",
  "corretora",
  "cotacao",
  "dados",
  "explique",
  "defina",
  "grafico",
  "mercado",
  "onde",
  "plano",
  "resuma",
  "resumo",
  "risco",
  "vender",
  "voce",
]);

const englishLocaleHintTokens = new Set([
  "analysis",
  "buy",
  "chart",
  "first",
  "market",
  "next",
  "price",
  "response",
  "risk",
  "sell",
  "step",
  "summary",
  "then",
  "tool",
  "user",
]);

const internalReasoningLeakPatterns = [
  /\bwe need to\b/,
  /\bi need to\b/,
  /\bthe user\b/,
  /\buser asked\b/,
  /\buser wants?\b/,
  /\bi should\b/,
  /\blet'?s\b/,
  /\bcall (the )?tool\b/,
  /\btool call\b/,
  /\bmy plan\b/,
  /\bstep by step\b/,
  /\bfirst\s*,?\s*(we|i)\b/,
  /\bnext\s*,?\s*(we|i)\b/,
  /\bthen\s*,?\s*(we|i)\b/,
  /\bchain of thought\b/,
  /\binternal reasoning\b/,
];

function countKeywordHits(value: string, keywords: ReadonlySet<string>): number {
  return value
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1)
    .reduce((hits, token) => (keywords.has(token) ? hits + 1 : hits), 0);
}

function isLikelyPortugueseText(value: string): boolean {
  const normalizedValue = normalizeText(value);
  const portugueseHits = countKeywordHits(normalizedValue, portugueseLocaleHintTokens);
  const englishHits = countKeywordHits(normalizedValue, englishLocaleHintTokens);

  return portugueseHits >= 2 && portugueseHits >= englishHits;
}

function isLikelyEnglishAnswer(value: string): boolean {
  const normalizedValue = normalizeText(value);

  if (normalizedValue.length < 80) {
    return false;
  }

  const portugueseHits = countKeywordHits(normalizedValue, portugueseLocaleHintTokens);
  const englishHits = countKeywordHits(normalizedValue, englishLocaleHintTokens);

  return englishHits >= 8 && englishHits >= portugueseHits + 3;
}

function hasInternalReasoningLeakAnswer(answer: string): boolean {
  const normalizedAnswer = normalizeText(answer);

  return internalReasoningLeakPatterns.some((pattern) => pattern.test(normalizedAnswer));
}

function hasResponseQualityLeak(message: string, answer: string): boolean {
  if (hasInternalReasoningLeakAnswer(answer)) {
    return true;
  }

  return isLikelyPortugueseText(message) && isLikelyEnglishAnswer(answer);
}

function hasWhereToBuyAnswer(answer: string): boolean {
  const normalizedAnswer = normalizeText(answer);

  return (
    normalizedAnswer.includes("voce pode comprar") ||
    normalizedAnswer.includes("onde comprar") ||
    normalizedAnswer.includes("corretora") ||
    normalizedAnswer.includes("exchange") ||
    normalizedAnswer.includes("dex") ||
    normalizedAnswer.includes("fontes verificadas") ||
    normalizedAnswer.includes("contrato identificado") ||
    normalizedAnswer.includes("pares encontrados") ||
    normalizedAnswer.includes("pesquisa global em tempo real")
  );
}

function hasAirdropStructuredAnswer(answer: string): boolean {
  const normalizedAnswer = normalizeText(answer);

  return (
    normalizedAnswer.includes("airdrop") ||
    normalizedAnswer.includes("retroativo") ||
    normalizedAnswer.includes("elegibilidade") ||
    normalizedAnswer.includes("quest") ||
    normalizedAnswer.includes("radar de airdrops")
  );
}

function hasInstitutionalChartLayoutAnswer(answer: string): boolean {
  const normalizedAnswer = normalizeText(answer);
  const hasBullScenario = normalizedAnswer.includes("cenario bull");
  const hasBearScenario = normalizedAnswer.includes("cenario bear");
  const hasRiskBlock =
    normalizedAnswer.includes("gestao de risco dinamica") ||
    normalizedAnswer.includes("position size bull") ||
    normalizedAnswer.includes("position size bear") ||
    normalizedAnswer.includes("risco conservador de 1%");

  return hasBullScenario && hasBearScenario && hasRiskBlock;
}

function hasInstitutionalChartMarkdownAnswer(answer: string): boolean {
  const normalizedAnswer = normalizeText(answer);
  const hasContextSection =
    normalizedAnswer.includes("## contexto quantitativo") ||
    normalizedAnswer.includes("# framework institucional smc");
  const hasScenarioSection =
    normalizedAnswer.includes("## cenarios institucionais") ||
    (normalizedAnswer.includes("### cenario bull") && normalizedAnswer.includes("### cenario bear"));
  const hasRiskSection = normalizedAnswer.includes("## gestao de risco dinamica");

  return hasContextSection && hasScenarioSection && hasRiskSection;
}

function parseFlexibleLocalizedNumber(token: string): number | null {
  const compactToken = token.replace(/\s+/g, "").replace(/[^0-9,.-]/g, "");

  if (compactToken.length === 0) {
    return null;
  }

  const dotCount = (compactToken.match(/\./g) ?? []).length;
  const commaCount = (compactToken.match(/,/g) ?? []).length;
  let normalizedToken = compactToken;

  if (dotCount > 0 && commaCount > 0) {
    const lastDotIndex = compactToken.lastIndexOf(".");
    const lastCommaIndex = compactToken.lastIndexOf(",");
    const decimalSeparator = lastDotIndex > lastCommaIndex ? "." : ",";
    const thousandsSeparator = decimalSeparator === "." ? "," : ".";
    normalizedToken = compactToken.split(thousandsSeparator).join("");

    if (decimalSeparator === ",") {
      const decimalIndex = normalizedToken.lastIndexOf(",");

      if (decimalIndex >= 0) {
        normalizedToken = `${normalizedToken.slice(0, decimalIndex).replace(/,/g, "")}.${normalizedToken
          .slice(decimalIndex + 1)
          .replace(/,/g, "")}`;
      }
    }
  } else if (commaCount > 0) {
    if (commaCount > 1) {
      normalizedToken = compactToken.replace(/,/g, "");
    } else {
      const decimalPartLength = compactToken.split(",")[1]?.length ?? 0;
      normalizedToken = decimalPartLength === 3 ? compactToken.replace(/,/g, "") : compactToken.replace(",", ".");
    }
  } else if (dotCount > 0) {
    if (dotCount > 1) {
      normalizedToken = compactToken.replace(/\./g, "");
    } else {
      const decimalPartLength = compactToken.split(".")[1]?.length ?? 0;
      normalizedToken = decimalPartLength === 3 ? compactToken.replace(/\./g, "") : compactToken;
    }
  }

  const parsedValue = Number(normalizedToken);

  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return parsedValue;
}

function extractScenarioSlice(normalizedAnswer: string, scenario: "bear" | "bull"): string | null {
  const pattern =
    scenario === "bull"
      ? /(?:^|\n)\s*(?:#+\s*)?cenario\s+bull\s*:?([\s\S]*?)(?=(?:^|\n)\s*(?:#+\s*)?cenario\s+bear\s*:|$)/m
      : /(?:^|\n)\s*(?:#+\s*)?cenario\s+bear\s*:?([\s\S]*?)(?=(?:^|\n)\s*(?:#+\s*)?(?:gestao de risco dinamica|checklist de execucao|nota)\b|$)/m;
  const match = normalizedAnswer.match(pattern);
  const scenarioSlice = match?.[1]?.trim() ?? "";

  return scenarioSlice.length > 0 ? scenarioSlice : null;
}

function extractScenarioLevels(scenarioSlice: string): {
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
} | null {
  const entryToken = scenarioSlice.match(/gatilho[^0-9]{0,40}([0-9][0-9.,\s]{0,24})/)?.[1] ?? null;
  const stopToken = scenarioSlice.match(/invalida[^0-9]{0,40}([0-9][0-9.,\s]{0,24})/)?.[1] ?? null;
  const takeProfitToken = scenarioSlice.match(/tp1[^0-9]{0,40}([0-9][0-9.,\s]{0,24})/)?.[1] ?? null;

  if (entryToken === null || stopToken === null || takeProfitToken === null) {
    return null;
  }

  const entryPrice = parseFlexibleLocalizedNumber(entryToken);
  const stopLoss = parseFlexibleLocalizedNumber(stopToken);
  const takeProfit1 = parseFlexibleLocalizedNumber(takeProfitToken);

  if (entryPrice === null || stopLoss === null || takeProfit1 === null) {
    return null;
  }

  return {
    entryPrice,
    stopLoss,
    takeProfit1,
  };
}

function computeScenarioRiskRewardRatioFromAnswer(levels: {
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
}): number | null {
  const risk = Math.abs(levels.entryPrice - levels.stopLoss);

  if (!Number.isFinite(risk) || risk <= 0) {
    return null;
  }

  const reward = Math.abs(levels.takeProfit1 - levels.entryPrice);

  if (!Number.isFinite(reward)) {
    return null;
  }

  return reward / risk;
}

function hasMinimumInstitutionalRiskRewardAnswer(answer: string, minimumRatio = 1.5): boolean {
  const normalizedAnswer = normalizeText(answer);
  const bullScenario = extractScenarioSlice(normalizedAnswer, "bull");
  const bearScenario = extractScenarioSlice(normalizedAnswer, "bear");

  if (bullScenario === null || bearScenario === null) {
    return false;
  }

  const bullLevels = extractScenarioLevels(bullScenario);
  const bearLevels = extractScenarioLevels(bearScenario);

  if (bullLevels === null || bearLevels === null) {
    return false;
  }

  const bullRatio = computeScenarioRiskRewardRatioFromAnswer(bullLevels);
  const bearRatio = computeScenarioRiskRewardRatioFromAnswer(bearLevels);

  if (bullRatio === null || bearRatio === null) {
    return false;
  }

  return bullRatio + 0.001 >= minimumRatio && bearRatio + 0.001 >= minimumRatio;
}

function parseScenarioProbability(normalizedAnswer: string, scenario: "bear" | "bull"): number | null {
  const pattern =
    scenario === "bull"
      ? /cenario\s+bull[\s\S]{0,220}?probabilidade\s*([0-9]+(?:[.,][0-9]+)?)\s*%/
      : /cenario\s+bear[\s\S]{0,220}?probabilidade\s*([0-9]+(?:[.,][0-9]+)?)\s*%/;
  const match = normalizedAnswer.match(pattern);
  const valueToken = match?.[1] ?? null;

  if (valueToken === null) {
    return null;
  }

  const parsedValue = Number(valueToken.replace(",", "."));

  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return parsedValue;
}

function hasConsistentDualScenarioProbabilities(answer: string): boolean {
  const normalizedAnswer = normalizeText(answer);

  if (!normalizedAnswer.includes("cenario bull") || !normalizedAnswer.includes("cenario bear")) {
    return false;
  }

  const bullProbability = parseScenarioProbability(normalizedAnswer, "bull");
  const bearProbability = parseScenarioProbability(normalizedAnswer, "bear");

  if (bullProbability === null || bearProbability === null) {
    return false;
  }

  if (
    bullProbability < 0 ||
    bullProbability > 100 ||
    bearProbability < 0 ||
    bearProbability > 100
  ) {
    return false;
  }

  return Math.abs(bullProbability + bearProbability - 100) <= 1;
}

function shouldForceWhereToBuyFallback(message: string, completion: OpenRouterChatCompletion): boolean {
  const normalizedMessage = normalizeText(message);

  if (!hasWhereToBuyIntent(normalizedMessage)) {
    return false;
  }

  const usedDiscoveryTool =
    completion.toolCallsUsed.includes("search_token_listings_dexscreener") ||
    completion.toolCallsUsed.includes("search_web_realtime");

  if (usedDiscoveryTool && hasWhereToBuyAnswer(completion.answer)) {
    return false;
  }

  if (hasMisroutedQuoteTemplateAnswer(completion.answer) || hasGenericLimitationAnswer(completion.answer)) {
    return true;
  }

  return !hasWhereToBuyAnswer(completion.answer);
}

function shouldForceAirdropFallback(message: string, completion: OpenRouterChatCompletion): boolean {
  if (!hasAirdropIntent(message)) {
    return false;
  }

  if (hasExplicitPriceOrChartIntent(message)) {
    return false;
  }

  if (
    completion.toolCallsUsed.includes("get_airdrop_opportunities") &&
    hasAirdropStructuredAnswer(completion.answer) &&
    !hasMisroutedQuoteTemplateAnswer(completion.answer)
  ) {
    return false;
  }

  if (hasMisroutedQuoteTemplateAnswer(completion.answer) || hasGenericLimitationAnswer(completion.answer)) {
    return true;
  }

  return !hasAirdropStructuredAnswer(completion.answer);
}

function shouldForceChartFallback(message: string, completion: OpenRouterChatCompletion): boolean {
  if (!hasChartAnalysisIntent(message)) {
    return false;
  }

  const usedChartTool = completion.toolCallsUsed.includes("get_crypto_chart_insights");
  const normalizedAnswer = normalizeText(completion.answer);
  const hasInstitutionalLayout = hasInstitutionalChartLayoutAnswer(completion.answer);
  const hasInstitutionalMarkdown = hasInstitutionalChartMarkdownAnswer(completion.answer);
  const hasConsistentProbabilities = hasConsistentDualScenarioProbabilities(completion.answer);
  const hasMinimumRiskReward = hasMinimumInstitutionalRiskRewardAnswer(completion.answer);
  const hasTechnicalMarkers =
    normalizedAnswer.includes("suporte") ||
    normalizedAnswer.includes("resistencia") ||
    normalizedAnswer.includes("rsi") ||
    normalizedAnswer.includes("macd") ||
    normalizedAnswer.includes("atr") ||
    normalizedAnswer.includes("bos") ||
    normalizedAnswer.includes("choch") ||
    normalizedAnswer.includes("cenario bull") ||
    normalizedAnswer.includes("cenario bear") ||
    normalizedAnswer.includes("position size") ||
    normalizedAnswer.includes("confluencia") ||
    normalizedAnswer.includes("trend") ||
    normalizedAnswer.includes("tendencia") ||
    normalizedAnswer.includes("take profit") ||
    normalizedAnswer.includes("stop") ||
    normalizedAnswer.includes("confianca");

  const isRiskOnlyAnswer =
    normalizedAnswer.includes("risco de curto prazo") &&
    !normalizedAnswer.includes("suporte") &&
    !normalizedAnswer.includes("resistencia");

  return (
    !usedChartTool ||
    !hasTechnicalMarkers ||
    isRiskOnlyAnswer ||
    !hasInstitutionalLayout ||
    !hasInstitutionalMarkdown ||
    !hasConsistentProbabilities ||
    !hasMinimumRiskReward
  );
}

function shouldForceFiatFxFallback(message: string, completion: OpenRouterChatCompletion): boolean {
  if (!hasFiatFxPriceIntent(message)) {
    return false;
  }

  const usedFiatFxQuoteTool = completion.toolCallsUsed.some((toolName) =>
    copilotFiatFxQuoteToolNames.has(toolName),
  );

  if (usedFiatFxQuoteTool && !hasGenericLimitationAnswer(completion.answer)) {
    return false;
  }

  return true;
}

function hasInstitutionalRiskChecklistAnswer(answer: string): boolean {
  const normalizedAnswer = normalizeText(answer);

  return (
    normalizedAnswer.includes("[risk score:") &&
    normalizedAnswer.includes("checklist de seguranca")
  );
}

function shouldForceInstitutionalFraudFallback(
  message: string,
  completion: OpenRouterChatCompletion,
): boolean {
  if (!hasInstitutionalFraudIntent(message)) {
    return false;
  }

  return !hasInstitutionalRiskChecklistAnswer(completion.answer);
}

function shouldForceGeneralAssistantFallback(message: string, completion: OpenRouterChatCompletion): boolean {
  const hasSpecializedFinancialIntent =
    hasMarketSummaryIntent(message) ||
    hasAirdropIntent(message) ||
    hasMonitoringPlanIntent(message) ||
    hasChartAnalysisIntent(message) ||
    hasBrokerIntegrationIntent(message) ||
    hasInstitutionalFraudIntent(message) ||
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

function formatFallbackTimestampLabel(value: string | null): string {
  if (!value) {
    return "n/d";
  }

  const parsedValue = new Date(value);

  if (Number.isNaN(parsedValue.getTime())) {
    return value;
  }

  return parsedValue.toLocaleString("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  });
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

function formatMarketSessionLabel(session: string): string {
  if (session === "asia") {
    return "Asia";
  }

  if (session === "london") {
    return "London";
  }

  if (session === "new_york") {
    return "New York";
  }

  if (session === "overlap") {
    return "Overlap London/New York";
  }

  return "Fora das sessoes principais";
}

function formatLiquidityHeatLabel(heat: string): string {
  if (heat === "high") {
    return "alta";
  }

  if (heat === "medium") {
    return "media";
  }

  return "baixa";
}

function formatStructureBiasLabel(bias: string): string {
  if (bias === "bullish") {
    return "estrutura de alta";
  }

  if (bias === "bearish") {
    return "estrutura de baixa";
  }

  return "estrutura neutra";
}

function formatStructureSignalLabel(signal: string): string {
  if (signal === "bullish") {
    return "bullish";
  }

  if (signal === "bearish") {
    return "bearish";
  }

  return "none";
}

function formatConfluenceTierLabel(tier: string): string {
  if (tier === "high") {
    return "alta";
  }

  if (tier === "medium") {
    return "media";
  }

  return "baixa";
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function resolveDualScenarioProbabilities(insights: {
  confidenceScore: number;
  macdHistogram: number;
  momentumPercent: number;
  trend: CryptoTrend;
}): {
  bearProbability: number;
  bullProbability: number;
} {
  let bullProbability = 50;

  if (insights.trend === "bullish") {
    bullProbability += 8;
  } else if (insights.trend === "bearish") {
    bullProbability -= 8;
  }

  bullProbability += clampNumber(Math.round((insights.confidenceScore - 50) * 0.2), -6, 6);
  bullProbability += insights.macdHistogram > 0 ? 3 : insights.macdHistogram < 0 ? -3 : 0;
  bullProbability += insights.momentumPercent > 0 ? 2 : insights.momentumPercent < 0 ? -2 : 0;
  bullProbability = Math.round(clampNumber(bullProbability, 20, 80));

  return {
    bearProbability: 100 - bullProbability,
    bullProbability,
  };
}

function computePositionSize(referenceBankUsd: number, entryPrice: number, stopLoss: number): {
  notionalUsd: number;
  positionSizeUnits: number;
  priceRiskPerUnit: number;
  riskAmountUsd: number;
} {
  const riskAmountUsd = referenceBankUsd * 0.01;
  const priceRiskPerUnit = Math.abs(entryPrice - stopLoss);

  if (!Number.isFinite(priceRiskPerUnit) || priceRiskPerUnit <= 0 || !Number.isFinite(entryPrice) || entryPrice <= 0) {
    return {
      notionalUsd: 0,
      positionSizeUnits: 0,
      priceRiskPerUnit,
      riskAmountUsd,
    };
  }

  const positionSizeUnits = riskAmountUsd / priceRiskPerUnit;

  return {
    notionalUsd: positionSizeUnits * entryPrice,
    positionSizeUnits,
    priceRiskPerUnit,
    riskAmountUsd,
  };
}

function computeRiskRewardRatio(entryPrice: number, stopLoss: number, takeProfit: number): number | null {
  const risk = Math.abs(entryPrice - stopLoss);

  if (!Number.isFinite(risk) || risk <= 0) {
    return null;
  }

  const reward = Math.abs(takeProfit - entryPrice);

  if (!Number.isFinite(reward)) {
    return null;
  }

  return reward / risk;
}

function formatRiskRewardRatio(ratio: number | null): string {
  if (ratio === null) {
    return "n/d";
  }

  return `${ratio.toFixed(2)}R`;
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
      "Retorna dados de grafico cripto com leitura institucional (historico + SMC): tendencia, momentum, suporte/resistencia, swing highs/lows, sinais BOS/CHoCH e contexto de sessao de liquidez para cenarios bull/bear e gestao de risco.",
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
        textualSummary: `Modo ${chart.mode} | Faixa ${formatRangeLabel(chart.range)} | ${formatTrendLabel(chart.insights.trend)} | sessao ${formatMarketSessionLabel(chart.insights.marketSession.session)} (${formatLiquidityHeatLabel(chart.insights.marketSession.liquidityHeat)}) | estrutura ${formatStructureBiasLabel(chart.insights.marketStructure.bias)} | BOS ${formatStructureSignalLabel(chart.insights.marketStructure.bosSignal)} | CHoCH ${formatStructureSignalLabel(chart.insights.marketStructure.chochSignal)} | confluencia SMC ${chart.insights.smcConfluence.score}/100 (${formatConfluenceTierLabel(chart.insights.smcConfluence.tier)}) | acao ${formatTradeActionLabel(chart.insights.tradeAction)} | confianca ${formatConfidenceScore(chart.insights.confidenceScore)} | variacao ${chart.insights.changePercent}% | volatilidade ${chart.insights.volatilityPercent}%`,
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
        chain: {
          description: "Chain alvo opcional para priorizar a busca (ex: base, ethereum, solana)",
          enum: ["arbitrum", "avalanche", "base", "bsc", "celo", "ethereum", "optimism", "polygon", "solana"],
          type: "string",
        },
        contractAddress: {
          description: "Contract address opcional para resolver holders e venues com maior precisao",
          type: "string",
        },
        maxResults: {
          default: 4,
          description: "Quantidade maxima de pares/venues retornados",
          maximum: 8,
          minimum: 1,
          type: "number",
        },
        query: {
          description: "Ticker ou nome do token (opcional quando contractAddress for informado)",
          type: "string",
        },
      },
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
      "Executa busca web global em tempo real para descobrir informacoes fora da base local, incluindo listagem de tokens, onde comprar e contexto de projetos desconhecidos. Nao use para cotacao de cambio quando get_forex_market_snapshot estiver disponivel.",
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
          description: "Ticker oficial (ex: SANAET) ou Contract Address (ex: 0x...) sem texto adicional",
          type: "string",
        },
      },
      required: ["query"],
      type: "object",
    },
    run: async (input: z.infer<typeof copilotWebSearchToolInputSchema>) => {
      const focusedQuery = buildFocusedWebSearchQuery(input.query, input.focus);

      if (focusedQuery.length === 0) {
        throw new AppError({
          code: "WEB_SEARCH_INVALID_QUERY_ENTITY",
          details: {
            focus: input.focus,
            query: input.query,
          },
          message: "Web search query must contain only a ticker symbol or contract address",
          statusCode: 422,
        });
      }

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
      "Retorna snapshot de forex (pares de moedas) com cotacao, variacao 24h e estado de mercado. Tool obrigatoria para perguntas de cambio, pares FX e dolar/real em tempo real.",
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
    const intentContextMessage = this.buildIntentContextMessage(preparedInput.message, conversationMessages);
    const latestUserMessage = this.resolveLatestUserMessage(intentContextMessage, conversationMessages);
    const scopedTools = this.resolveToolsForMessage(latestUserMessage);
    let completion: OpenRouterChatCompletion;

    try {
      completion = await openRouterChatAdapter.createCompletionWithTools(
        {
          maxTokens: preparedInput.maxTokens,
          messages: conversationMessages,
          systemPrompt: preparedInput.systemPrompt,
          temperature: preparedInput.temperature,
        },
        scopedTools,
      );
    } catch (error) {
      if (!this.shouldUseEmergencyLocalFallback(error)) {
        throw error;
      }

      completion = await this.buildEmergencyLocalCompletion(
        latestUserMessage,
        conversationMessages,
        "chat",
      );
    }

    const completionWithFallback = await this.applyIntentFallback(
      {
        ...preparedInput,
        message: latestUserMessage,
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

  public async chatStream(
    input: CopilotChatInput,
    onChunk: (chunk: string) => void | Promise<void>,
  ): Promise<OpenRouterChatCompletion> {
    const preparedInput = this.withDefaultSystemPrompt(input);
    const conversationMessages = await this.buildConversationMessages(preparedInput, input.sessionId);
    const intentContextMessage = this.buildIntentContextMessage(preparedInput.message, conversationMessages);
    const latestUserMessage = this.resolveLatestUserMessage(intentContextMessage, conversationMessages);
    const scopedTools = this.resolveToolsForMessage(latestUserMessage);
    let completion: OpenRouterChatCompletion;

    try {
      completion = await openRouterChatAdapter.createCompletionStreamWithTools(
        {
          maxTokens: preparedInput.maxTokens,
          messages: conversationMessages,
          systemPrompt: preparedInput.systemPrompt,
          temperature: preparedInput.temperature,
        },
        scopedTools,
        onChunk,
      );
    } catch (error) {
      if (!this.shouldUseEmergencyLocalFallback(error)) {
        throw error;
      }

      completion = await this.buildEmergencyLocalCompletion(
        latestUserMessage,
        conversationMessages,
        "stream",
        onChunk,
      );
    }

    const completionWithFallback = await this.applyIntentFallback(
      {
        ...preparedInput,
        message: latestUserMessage,
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
        "Failed to append copilot streaming chat audit record",
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

  private shouldUseEmergencyLocalFallback(error: unknown): boolean {
    void error;
    return false;
  }

  private async buildEmergencyLocalCompletion(
    operativeMessage: string,
    conversationMessages: OpenRouterConversationMessage[],
    mode: "chat" | "stream",
    onChunk?: (chunk: string) => void | Promise<void>,
  ): Promise<OpenRouterChatCompletion> {
    const fallbackAnswer = await this.buildEmergencyLocalFallbackAnswer(
      operativeMessage,
      conversationMessages,
    );

    if (mode === "stream" && typeof onChunk === "function" && fallbackAnswer.length > 0) {
      await onChunk(fallbackAnswer);
    }

    return {
      answer: fallbackAnswer,
      fetchedAt: new Date().toISOString(),
      model: "fallback/local-intent-router",
      provider: "openrouter",
      responseId: `fallback-${Date.now()}`,
      toolCallsUsed: [],
      usage: {},
    };
  }

  private async buildEmergencyLocalFallbackAnswer(
    operativeMessage: string,
    conversationMessages: OpenRouterConversationMessage[],
  ): Promise<string> {
    const normalizedMessage = normalizeText(operativeMessage);

    try {
      if (hasWhereToBuyIntent(normalizedMessage) || hasBrokerIntegrationIntent(operativeMessage)) {
        return await this.buildBrokerIntegrationFallback(operativeMessage, conversationMessages);
      }

      if (hasFiatFxPriceIntent(operativeMessage)) {
        return await this.buildFiatFxPriceFallback(operativeMessage);
      }

      if (hasAirdropIntent(operativeMessage)) {
        return await this.buildAirdropIntelligenceFallback(operativeMessage);
      }

      if (hasInstitutionalFraudIntent(operativeMessage) || hasMemeAlertPayloadIntent(operativeMessage)) {
        return await this.buildInstitutionalFraudFallback(operativeMessage, conversationMessages);
      }

      if (hasChartAnalysisIntent(operativeMessage)) {
        return await this.buildChartAnalysisFallback(operativeMessage);
      }

      if (hasMonitoringPlanIntent(operativeMessage)) {
        return await this.buildMonitoringPlanFallback();
      }

      if (hasRiskAnalysisIntent(operativeMessage)) {
        return await this.buildShortTermRiskFallback(operativeMessage);
      }

      if (hasMarketSummaryIntent(operativeMessage) || hasFinancialIntent(operativeMessage)) {
        return await this.buildMarketSummaryFallback();
      }
    } catch (error) {
      logger.warn(
        {
          err: error,
          messagePreview: operativeMessage.slice(0, 120),
        },
        "Emergency local fallback failed on intent-specific path",
      );
    }

    if (!hasFinancialIntent(operativeMessage)) {
      return [
        "Estou em modo de contingencia temporaria para o provedor principal de IA.",
        "Posso continuar te ajudando com perguntas de mercado, risco, corretoras e leitura de sinais sem interromper o fluxo.",
        "Se quiser, envie um ativo especifico (ticker/contrato) para analise objetiva agora.",
      ].join("\n");
    }

    return [
      "Modo de contingencia ativo: analise por IA externa indisponivel neste instante.",
      "Posso seguir com leitura operacional baseada em dados de mercado do proprio backend.",
      "Envie o ativo e horizonte (ex.: BTC 24h, ETH 7d, ou token+contrato) para resposta direta.",
    ].join("\n");
  }

  private withDefaultSystemPrompt(input: CopilotChatInput): CopilotChatInput {
    const trimmedCustomPrompt = input.systemPrompt?.trim();
    const basePrompt = !trimmedCustomPrompt || trimmedCustomPrompt.length === 0
      ? copilotDefaultSystemPrompt
      : `${copilotDefaultSystemPrompt}\n\nContexto adicional do usuario:\n${trimmedCustomPrompt}`;
    const chartContextPrompt = this.buildChartContextPrompt(input.chartContext);

    return {
      ...input,
      systemPrompt: this.composeSystemPrompt(basePrompt, chartContextPrompt),
    };
  }

  private composeSystemPrompt(basePrompt: string, chartContextPrompt: string): string {
    const safeBasePrompt = basePrompt.slice(0, COPILOT_SYSTEM_PROMPT_MAX_LENGTH);

    if (chartContextPrompt.length === 0) {
      return safeBasePrompt;
    }

    const contextSuffix = `\n\nContexto de terminal atual:\n${chartContextPrompt}`;

    if (contextSuffix.length >= COPILOT_SYSTEM_PROMPT_MAX_LENGTH) {
      return contextSuffix.slice(0, COPILOT_SYSTEM_PROMPT_MAX_LENGTH);
    }

    const baseBudget = COPILOT_SYSTEM_PROMPT_MAX_LENGTH - contextSuffix.length;

    return `${safeBasePrompt.slice(0, baseBudget)}${contextSuffix}`;
  }

  private normalizeChartContextValue(value: unknown, maxLength = 64): string {
    if (typeof value !== "string") {
      return "";
    }

    const trimmed = value.trim().toLowerCase();

    if (trimmed.length === 0) {
      return "";
    }

    return trimmed.slice(0, maxLength);
  }

  private buildChartContextPrompt(chartContext?: CopilotChartContextInput): string {
    if (!chartContext || typeof chartContext !== "object") {
      return "";
    }

    const contextParts: string[] = [];
    const assetId = this.normalizeChartContextValue(chartContext.assetId, 64);
    const symbol = this.normalizeChartContextValue(chartContext.symbol, 32);
    const broker = this.normalizeChartContextValue(chartContext.broker, 24);
    const exchange = this.normalizeChartContextValue(chartContext.exchange, 24);
    const interval = this.normalizeChartContextValue(chartContext.interval, 16);
    const mode = this.normalizeChartContextValue(chartContext.mode, 10);
    const range = this.normalizeChartContextValue(chartContext.range, 8);
    const strategy = this.normalizeChartContextValue(chartContext.strategy, 24);
    const operationalMode = this.normalizeChartContextValue(chartContext.operationalMode, 40);

    if (assetId.length > 0) {
      contextParts.push(`asset=${assetId}`);
    }

    if (symbol.length > 0) {
      contextParts.push(`symbol=${symbol.toUpperCase()}`);
    }

    if (broker.length > 0) {
      contextParts.push(`broker=${broker}`);
    }

    if (exchange.length > 0 && copilotChartContextExchanges.has(exchange)) {
      contextParts.push(`exchange=${exchange}`);
    }

    if (interval.length > 0) {
      contextParts.push(`interval=${interval}`);
    }

    if (mode.length > 0 && copilotChartContextModes.has(mode)) {
      contextParts.push(`mode=${mode}`);
    }

    if (range.length > 0 && copilotChartContextRanges.has(range)) {
      contextParts.push(`range=${range}`);
    }

    if (strategy.length > 0 && copilotChartContextStrategies.has(strategy)) {
      contextParts.push(`strategy=${strategy}`);
    }

    if (operationalMode.length > 0) {
      contextParts.push(`operationalMode=${operationalMode}`);
    }

    if (contextParts.length === 0) {
      return "";
    }

    return [
      "Use este contexto como padrao para tools de mercado apenas quando o usuario nao explicitar ativo/corretora/faixa.",
      contextParts.join(" | "),
    ].join(" ");
  }

  private resolveLatestUserMessage(
    fallbackMessage: string,
    conversationMessages: OpenRouterConversationMessage[],
  ): string {
    for (let index = conversationMessages.length - 1; index >= 0; index -= 1) {
      const message = conversationMessages[index];

      if (message?.role === "user" && message.content.trim().length > 0) {
        return message.content.trim();
      }
    }

    return fallbackMessage.trim();
  }

  private resolveToolsForMessage(message: string): OpenRouterToolDefinition[] {
    const normalizedMessage = normalizeText(message);
    const hasExplicitPriceIntent = hasExplicitPriceOrChartIntent(message);

    if (hasWhereToBuyIntent(normalizedMessage)) {
      return copilotTools.filter((tool) => copilotWhereToBuyToolNames.has(tool.name));
    }

    if (hasAirdropIntent(message) && !hasExplicitPriceIntent) {
      return copilotTools.filter((tool) => copilotAirdropToolNames.has(tool.name));
    }

    if ((hasMemeAlertPayloadIntent(message) || hasInstitutionalFraudIntent(message)) && !hasExplicitPriceIntent) {
      return copilotTools.filter((tool) => copilotInstitutionalRiskToolNames.has(tool.name));
    }

    return copilotTools;
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
    const operativeMessage = this.resolveLatestUserMessage(input.message, conversationMessages);

    if (hasResponseQualityLeak(operativeMessage, completion.answer)) {
      try {
        const hasFinancialOrSpecializedIntent =
          hasFinancialIntent(operativeMessage)
          || hasAirdropIntent(operativeMessage)
          || hasMonitoringPlanIntent(operativeMessage)
          || hasChartAnalysisIntent(operativeMessage)
          || hasBrokerIntegrationIntent(operativeMessage)
          || hasInstitutionalFraudIntent(operativeMessage)
          || hasRiskAnalysisIntent(operativeMessage)
          || hasWhereToBuyIntent(normalizeText(operativeMessage));
        const fallbackAnswer = hasFinancialOrSpecializedIntent
          ? await this.buildEmergencyLocalFallbackAnswer(operativeMessage, conversationMessages)
          : await this.buildGeneralAssistantFallback(input, conversationMessages);

        return {
          ...completion,
          answer: fallbackAnswer,
        };
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "Failed to replace low-quality completion with fallback",
        );
      }
    }

    if (shouldForceWhereToBuyFallback(operativeMessage, completion)) {
      try {
        const fallbackAnswer = await this.buildBrokerIntegrationFallback(operativeMessage, conversationMessages);

        return {
          ...completion,
          answer: fallbackAnswer,
        };
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "Failed to force where-to-buy fallback",
        );
      }
    }

    if (shouldForceAirdropFallback(operativeMessage, completion)) {
      try {
        const fallbackAnswer = await this.buildAirdropIntelligenceFallback(operativeMessage);

        return {
          ...completion,
          answer: fallbackAnswer,
        };
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "Failed to force airdrop fallback",
        );
      }
    }

    if (shouldForceInstitutionalFraudFallback(operativeMessage, completion)) {
      try {
        const fallbackAnswer = await this.buildInstitutionalFraudFallback(
          operativeMessage,
          conversationMessages,
        );

        return {
          ...completion,
          answer: fallbackAnswer,
        };
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "Failed to force institutional fraud fallback",
        );
      }
    }

    if (shouldForceChartFallback(operativeMessage, completion)) {
      try {
        const fallbackAnswer = await this.buildChartAnalysisFallback(operativeMessage);

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

    if (shouldForceFiatFxFallback(operativeMessage, completion)) {
      try {
        const fallbackAnswer = await this.buildFiatFxPriceFallback(operativeMessage);

        return {
          ...completion,
          answer: fallbackAnswer,
        };
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "Failed to force fiat FX fallback",
        );
      }
    }

    if (shouldForceGeneralAssistantFallback(operativeMessage, completion)) {
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

    if (hasMarketSummaryIntent(operativeMessage)) {
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

    if (hasAirdropIntent(operativeMessage)) {
      try {
        const fallbackAnswer = await this.buildAirdropIntelligenceFallback(operativeMessage);

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

    if (hasMonitoringPlanIntent(operativeMessage)) {
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

    if (hasChartAnalysisIntent(operativeMessage)) {
      try {
        const fallbackAnswer = await this.buildChartAnalysisFallback(operativeMessage);

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

    if (hasBrokerIntegrationIntent(operativeMessage)) {
      try {
        const fallbackAnswer = await this.buildBrokerIntegrationFallback(operativeMessage, conversationMessages);

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

    if (hasRiskAnalysisIntent(operativeMessage)) {
      try {
        const fallbackAnswer = await this.buildShortTermRiskFallback(operativeMessage);

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

  private async buildFiatFxPriceFallback(message: string): Promise<string> {
    const targetPair = resolveForexPairFromMessage(message);

    try {
      const quote = await forexMarketService.getSpotRate({
        pair: targetPair,
      });

      return [
        "Cotacao FX em tempo real (fallback deterministico anti-alucinacao).",
        `Par monitorado: ${quote.pair} (${quote.baseCurrency}/${quote.quoteCurrency}).`,
        `Taxa atual: ${formatQuotePrice(quote.rate, null)}.`,
        `Variacao 24h: ${formatPercent(quote.changePercent24h)} | estado de mercado: ${quote.marketState ?? "n/d"}.`,
        `Fonte: Yahoo Finance via get_forex_market_snapshot | atualizado em ${formatFallbackTimestampLabel(quote.regularMarketTime ?? quote.fetchedAt)}.`,
        "Se quiser, comparo com EURUSD, USDJPY e USDMXN com leitura operacional no mesmo formato.",
      ].join("\n");
    } catch (error) {
      logger.warn(
        {
          err: error,
          pair: targetPair,
        },
        "Failed to fetch direct forex pair for fiat FX fallback",
      );
    }

    try {
      const overview = await forexMarketService.getMarketOverview({
        limit: 6,
        preset: targetPair === "USDBRL" ? "latam" : "majors",
      });
      const firstAvailableQuote = overview.quotes.find((quoteItem) => quoteItem.status === "ok");

      if (firstAvailableQuote && firstAvailableQuote.status === "ok") {
        return [
          "Cotacao FX com fallback de panorama (par especifico indisponivel no instante).",
          `Par solicitado: ${targetPair}. Proxy disponivel: ${firstAvailableQuote.quote.pair} em ${formatQuotePrice(firstAvailableQuote.quote.rate, null)}.`,
          `Variacao 24h do proxy: ${formatPercent(firstAvailableQuote.quote.changePercent24h)}.`,
          `Fonte: Yahoo Finance | atualizado em ${formatFallbackTimestampLabel(overview.fetchedAt)}.`,
          `Tabela resumida:\n${overview.tableMarkdown}`,
        ].join("\n");
      }
    } catch (error) {
      logger.warn(
        {
          err: error,
          pair: targetPair,
        },
        "Failed to fetch forex overview fallback",
      );
    }

    return [
      "Nao foi possivel coletar cotacao FX em tempo real neste instante.",
      `Par solicitado: ${targetPair}.`,
      "Tente novamente em alguns segundos ou informe o par explicitamente (ex.: USDBRL, EURUSD, USDJPY).",
    ].join("\n");
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
    const normalizedMessage = normalizeText(message);
    const wantsFourBlocks = /(?:^|\s)(4|quatro)\s+blocos?/.test(normalizedMessage);
    const focusQuery = resolveAirdropFocusQuery(message);
    const airdropRadar = await airdropIntelligenceService.getOpportunities({
      includeSpeculative: true,
      limit: 8,
      minScore: 28,
      query: focusQuery,
    });

    if (airdropRadar.opportunities.length === 0) {
      if (wantsFourBlocks) {
        return [
          "Leitura em 4 blocos para airdrops (sem oportunidades pontuadas no corte atual).",
          "Bloco 1 - Leitura de momentum: sem tendencia forte confirmada nas fontes desta rodada.",
          "Bloco 2 - Risco de liquidez: sem dados suficientes para estimativa confiavel de profundidade.",
          "Bloco 3 - Elegibilidade: nenhum projeto com criterio claro de snapshot confirmado.",
          "Bloco 4 - Plano de execucao: reduzir minScore para 20-25, ampliar universo de chains e revalidar em nova varredura.",
        ].join("\n");
      }

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

    if (wantsFourBlocks) {
      const momentumHighlights = airdropRadar.opportunities
        .slice(0, 3)
        .map((opportunity) => `${opportunity.project} (score ${opportunity.score})`)
        .join(" | ");
      const liquidityHighlights = airdropRadar.opportunities
        .slice(0, 3)
        .map((opportunity) => {
          const tasksCount = opportunity.tasks.length;
          return `${opportunity.project}: ${tasksCount} tarefa(s) com friccao operacional ${tasksCount >= 4 ? "alta" : "moderada"}`;
        })
        .join(" | ");
      const eligibilityHighlights = airdropRadar.opportunities
        .slice(0, 3)
        .map((opportunity) => `${opportunity.project}: confianca ${formatAirdropConfidenceLabel(opportunity.confidence)}`)
        .join(" | ");
      const executionHighlights = airdropRadar.opportunities
        .slice(0, 3)
        .map((opportunity) => `${opportunity.project}: ${opportunity.url}`)
        .join(" | ");

      return [
        "Leitura em 4 blocos para airdrops.",
        `Bloco 1 - Leitura de momentum: ${momentumHighlights}.`,
        `Bloco 2 - Risco de liquidez: ${liquidityHighlights}.`,
        `Bloco 3 - Elegibilidade: ${eligibilityHighlights}.`,
        `Bloco 4 - Plano de execucao: priorize as 2 maiores notas, valide fonte oficial e execute tarefas com menor custo de gas primeiro. Referencias: ${executionHighlights}.`,
      ].join("\n");
    }

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
    const structure = chart.insights.marketStructure;
    const session = chart.insights.marketSession;
    const dualScenario = resolveDualScenarioProbabilities(chart.insights);
    const structuralHigh = Math.max(chart.insights.resistanceLevel, structure.lastSwingHigh);
    const structuralLow = Math.min(chart.insights.supportLevel, structure.lastSwingLow);
    const atrBand = Math.max(
      0.006,
      chart.insights.atrPercent > 0
        ? chart.insights.atrPercent / 100
        : Math.max(0.004, chart.insights.volatilityPercent / 100),
    );
    const bullTrigger = Math.max(
      chart.insights.tradeLevels.entryZoneHigh,
      structuralHigh * 1.0005,
    );
    const bullInvalidation = Math.min(
      chart.insights.tradeLevels.stopLoss,
      structuralLow * (1 - atrBand * 0.35),
    );
    const bullRiskPerUnit = Math.abs(bullTrigger - bullInvalidation);
    const bullMinimumTp1 = bullTrigger + bullRiskPerUnit * 1.5;
    const bullMinimumTp2 = bullTrigger + bullRiskPerUnit * 2.3;
    const bullTp1 = Math.max(
      chart.insights.tradeLevels.takeProfit1,
      bullTrigger * (1 + atrBand * 0.85),
      bullMinimumTp1,
    );
    const bullTp2 = Math.max(
      chart.insights.tradeLevels.takeProfit2,
      bullTrigger * (1 + atrBand * 1.45),
      bullMinimumTp2,
    );
    const bearTrigger = Math.min(
      chart.insights.tradeLevels.entryZoneLow,
      structuralLow * 0.9995,
    );
    const bearInvalidation = Math.max(
      chart.insights.resistanceLevel,
      structuralHigh * (1 + atrBand * 0.35),
    );
    const bearRiskPerUnit = Math.abs(bearInvalidation - bearTrigger);
    const bearMinimumTp1 = bearTrigger - bearRiskPerUnit * 1.5;
    const bearMinimumTp2 = bearTrigger - bearRiskPerUnit * 2.3;
    const bearTp1 = Math.min(
      chart.insights.supportLevel,
      bearTrigger * (1 - atrBand * 0.85),
      bearMinimumTp1,
    );
    const bearTp2 = Math.min(
      chart.insights.lowPrice,
      bearTrigger * (1 - atrBand * 1.45),
      bearMinimumTp2,
    );
    const referenceBankUsd = 10_000;
    const bullPositionSizing = computePositionSize(referenceBankUsd, bullTrigger, bullInvalidation);
    const bearPositionSizing = computePositionSize(referenceBankUsd, bearTrigger, bearInvalidation);
    const bullRiskReward = computeRiskRewardRatio(bullTrigger, bullInvalidation, bullTp1);
    const bearRiskReward = computeRiskRewardRatio(bearTrigger, bearInvalidation, bearTp1);
    const liveSummary =
      chart.mode === "live"
        ? ` | live 24h: ${formatPercent(chart.live?.changePercent24h ?? null)} | volume 24h: ${formatCompactUsd(chart.live?.volume24h ?? null)}`
        : "";

    return [
      `# Framework institucional SMC para ${capitalizeAssetId(chart.assetId)} (${formatRangeLabel(chart.range)}, modo ${chart.mode})`,
      "",
      "## Contexto Quantitativo",
      `- Preco atual: ${formatSpotPrice(chart.insights.currentPrice, chart.currency)} | variacao ${chart.insights.changePercent}% | ${trendLabel}.`,
      `- Sinal base: ${tradeActionLabel} | confianca ${formatConfidenceScore(chart.insights.confidenceScore)} | provider ${chart.provider}${liveSummary}.`,
      `- Osciladores de apoio: RSI14 ${rsi14Label} | MACD hist ${chart.insights.macdHistogram}% | ATR ${chart.insights.atrPercent}% | momentum ${chart.insights.momentumPercent}% | volatilidade ${chart.insights.volatilityPercent}%.`,
      `- Cache: ${chart.cache.state}${chart.cache.stale ? " (stale)" : ""}.`,
      "",
      "## Sessao de Liquidez",
      `- Sessao ativa: ${formatMarketSessionLabel(session.session)} (${session.utcWindow}, ${session.utcHour}h UTC).`,
      `- Intensidade de liquidez: ${formatLiquidityHeatLabel(session.liquidityHeat)}.`,
      "",
      "## Leitura SMC & Wyckoff:",
      `- Estrutura: ${formatStructureBiasLabel(structure.bias)} | BOS ${formatStructureSignalLabel(structure.bosSignal)} | CHoCH ${formatStructureSignalLabel(structure.chochSignal)}.`,
      `- Swing high: ${formatSpotPrice(structure.lastSwingHigh, chart.currency)} | swing low: ${formatSpotPrice(structure.lastSwingLow, chart.currency)}.`,
      `- Order Blocks de referencia: suporte ${formatSpotPrice(chart.insights.supportLevel, chart.currency)} e resistencia ${formatSpotPrice(chart.insights.resistanceLevel, chart.currency)}.`,
      `- Confluencia SMC: ${chart.insights.smcConfluence.score}/100 (${formatConfluenceTierLabel(chart.insights.smcConfluence.tier)}) | estrutura ${chart.insights.smcConfluence.components.marketStructure}/45 | sessao ${chart.insights.smcConfluence.components.sessionLiquidity}/30 | volatilidade ${chart.insights.smcConfluence.components.volatilityRegime}/25.`,
      "",
      "## Cenarios Institucionais",
      "### Cenario Bull:",
      `- Probabilidade ${dualScenario.bullProbability}%.`,
      `- Gatilho acima de ${formatSpotPrice(bullTrigger, chart.currency)}.`,
      `- Invalida abaixo de ${formatSpotPrice(bullInvalidation, chart.currency)}.`,
      `- Alvos: TP1 ${formatSpotPrice(bullTp1, chart.currency)} | TP2 ${formatSpotPrice(bullTp2, chart.currency)}.`,
      `- Relacao risco/retorno (TP1): ${formatRiskRewardRatio(bullRiskReward)}.`,
      "### Cenario Bear:",
      `- Probabilidade ${dualScenario.bearProbability}%.`,
      `- Gatilho abaixo de ${formatSpotPrice(bearTrigger, chart.currency)}.`,
      `- Invalida acima de ${formatSpotPrice(bearInvalidation, chart.currency)}.`,
      `- Alvos: TP1 ${formatSpotPrice(bearTp1, chart.currency)} | TP2 ${formatSpotPrice(bearTp2, chart.currency)}.`,
      `- Relacao risco/retorno (TP1): ${formatRiskRewardRatio(bearRiskReward)}.`,
      "",
      "## Gestao de risco dinamica",
      `- Banca teorica: ${formatSpotPrice(referenceBankUsd, "usd")} | risco conservador de 1% = ${formatSpotPrice(bullPositionSizing.riskAmountUsd, "usd")}.`,
      `- Position Size Bull: max ${bullPositionSizing.positionSizeUnits.toFixed(6)} unidades (nocional ~ ${formatSpotPrice(bullPositionSizing.notionalUsd, "usd")}), risco por unidade ${formatSpotPrice(bullPositionSizing.priceRiskPerUnit, chart.currency)}.`,
      `- Position Size Bear: max ${bearPositionSizing.positionSizeUnits.toFixed(6)} unidades (nocional ~ ${formatSpotPrice(bearPositionSizing.notionalUsd, "usd")}), risco por unidade ${formatSpotPrice(bearPositionSizing.priceRiskPerUnit, chart.currency)}.`,
      "- Regra institucional: operar apenas cenarios com relacao risco/retorno minima de 1.5.",
      "",
      "## Checklist de Execucao",
      "- [ ] Confirmar gatilho em fechamento do candle da janela analisada.",
      "- [ ] Validar liquidez da sessao antes de enviar ordens.",
      "- [ ] Rejeitar setup com relacao risco/retorno inferior a 1.5.",
      "",
      "> Nota: leitura institucional informativa, sem recomendacao de investimento.",
    ].join("\n");
  }

  private async buildBrokerIntegrationFallback(
    message: string,
    conversationMessages: OpenRouterConversationMessage[],
  ): Promise<string> {
    const operativeMessage = extractLatestUserTurn(message);
    const broker = resolveBrokerFromMessage(operativeMessage);
    const normalizedMessage = normalizeText(operativeMessage);
    const hasAssetHint = hasResolvableAssetHint(operativeMessage);
    const assetHint = hasAssetHint ? resolvePrimaryAssetHint(operativeMessage) : "token";
    const asksWhereToBuy = hasWhereToBuyIntent(normalizedMessage);
    const historyLinks = extractRecentUserLinks(conversationMessages);

    if (asksWhereToBuy && !hasAssetHint && historyLinks.length === 0) {
      return [
        "Para te dizer exatamente onde comprar, preciso do nome do ativo, ticker ou contrato.",
        "Envie no formato: nome/ticker (ex.: ROBOTMONEY) ou contrato (ex.: 0x...).",
      ].join("\n");
    }

    if (asksWhereToBuy) {
      try {
        return await this.buildWebWhereToBuyFallback(operativeMessage, assetHint, conversationMessages);
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
      return await this.buildWebWhereToBuyFallback(operativeMessage, assetHint, conversationMessages);
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

  private formatDexWhereToBuyResolution(
    lookupResponse: DexScreenerTokenLookupResponse,
    options: {
      contractAddress?: string;
      introLine: string;
      sourceLinks?: string[];
    },
  ): string {
    const topVenues = lookupResponse.venues.slice(0, 4);
    const bestVenue = topVenues[0];
    const primaryTokenSymbol = bestVenue?.baseTokenSymbol ?? lookupResponse.query.toUpperCase();
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
    const sourceLine =
      options.sourceLinks && options.sourceLinks.length > 0
        ? `Fontes da investigacao: ${options.sourceLinks.slice(0, 2).join(" | ")}.`
        : "";

    return [
      options.introLine,
      options.contractAddress ? `Contrato identificado: ${options.contractAddress}.` : "",
      primaryBuyLine,
      "Melhores pares encontrados agora:",
      venueLines,
      sourceLine,
      "Checklist profissional: valide contrato oficial, rede correta e liquidez antes de executar qualquer compra.",
    ]
      .filter((line): line is string => typeof line === "string" && line.length > 0)
      .join("\n");
  }

  private async tryDexByContractCandidates(
    contractCandidates: string[],
    sourceLinks: string[],
    introLineBuilder: (lookupResponse: DexScreenerTokenLookupResponse, contractAddress: string) => string,
  ): Promise<string | null> {
    for (const contractAddress of contractCandidates.slice(0, 4)) {
      try {
        const contractLookup = await dexScreenerSearchAdapter.searchTokenListings({
          maxResults: 5,
          query: contractAddress,
        });

        if (contractLookup.venues.length === 0) {
          continue;
        }

        return this.formatDexWhereToBuyResolution(contractLookup, {
          contractAddress,
          introLine: introLineBuilder(contractLookup, contractAddress),
          sourceLinks,
        });
      } catch (error) {
        logger.warn(
          {
            contractAddress,
            err: error,
          },
          "Contract-address lookup on DexScreener failed during where-to-buy investigation",
        );
      }
    }

    return null;
  }

  private async buildDexScreenerWhereToBuyFallback(
    assetHint: string,
    message: string,
    conversationMessages: OpenRouterConversationMessage[],
  ): Promise<string | null> {
    const normalizedAssetHint = assetHint.trim().length > 0 ? assetHint.trim().toLowerCase() : "token";
    const resolvedEntitySeed = normalizedAssetHint === "token"
      ? message.trim()
      : `${normalizedAssetHint}`.trim();
    const tokenLookupQuery = truncateForQuery(
      buildFocusedWebSearchQuery(resolvedEntitySeed, "where_to_buy"),
      80,
    );

    if (tokenLookupQuery.length === 0) {
      return null;
    }

    const directLookupResponse = await dexScreenerSearchAdapter.searchTokenListings({
      maxResults: 5,
      query: tokenLookupQuery,
    });

    if (directLookupResponse.venues.length > 0) {
      const tokenSymbol = directLookupResponse.venues[0]?.baseTokenSymbol ?? normalizedAssetHint.toUpperCase();
      return this.formatDexWhereToBuyResolution(directLookupResponse, {
        introLine: `DexScreener (API on-chain em tempo real) confirmou venues para ${tokenSymbol}.`,
      });
    }

    const historyLinks = extractRecentUserLinks(conversationMessages);
    const historyContracts = extractContractAddressCandidatesFromText(`${message}\n${historyLinks.join("\n")}`);

    if (historyContracts.length > 0) {
      const historyResolution = await this.tryDexByContractCandidates(
        historyContracts,
        historyLinks,
        (lookupResponse) => {
          const tokenSymbol = lookupResponse.venues[0]?.baseTokenSymbol ?? normalizedAssetHint.toUpperCase();
          const chainName = lookupResponse.venues[0]?.chainName ?? "detectada";
          return `Encontrei os detalhes da ${tokenSymbol} usando o link enviado anteriormente na rede ${chainName}.`;
        },
      );

      if (historyResolution) {
        return historyResolution;
      }
    }

    return null;
  }

  private async buildWebWhereToBuyFallback(
    message: string,
    assetHint: string,
    conversationMessages: OpenRouterConversationMessage[],
  ): Promise<string> {
    const normalizedAssetHint = assetHint.trim().length > 0 ? assetHint.trim().toLowerCase() : "token";
    const historyLinks = extractRecentUserLinks(conversationMessages);

    try {
      const dexScreenerFallback = await this.buildDexScreenerWhereToBuyFallback(
        normalizedAssetHint,
        message,
        conversationMessages,
      );

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

    const domainHint = extractDomainsFromUrls(historyLinks).slice(0, 2).join(" ");
    const entitySeed = [
      normalizedAssetHint !== "token" ? normalizedAssetHint : "",
      message,
      domainHint,
    ]
      .filter((item) => item.trim().length > 0)
      .join("\n");
    const focusedQuery = truncateForQuery(
      buildFocusedWebSearchQuery(entitySeed, "where_to_buy"),
      80,
    );

    if (focusedQuery.length === 0) {
      return [
        "Nao foi possivel extrair ticker oficial ou contract address para a busca.",
        "Envie somente o ticker (ex.: SANAET) ou o contract address (0x...) para eu continuar a investigacao on-chain.",
      ].join("\n");
    }

    const searchResponse = await webSearchAdapter.search({
      maxResults: 6,
      query: focusedQuery,
    });
    const topResults = searchResponse.results.slice(0, 5);
    const contractCandidates = extractContractAddressCandidatesFromText(
      `${message}\n${historyLinks.join("\n")}\n${topResults
        .map((result) => `${result.title}\n${result.snippet}\n${result.url}`)
        .join("\n")}`,
    );

    if (contractCandidates.length > 0) {
      const dexResolutionFromWebDiscovery = await this.tryDexByContractCandidates(
        contractCandidates,
        topResults.map((result) => result.url),
        (lookupResponse) => {
          const tokenSymbol = lookupResponse.venues[0]?.baseTokenSymbol ?? normalizedAssetHint.toUpperCase();
          const chainName = lookupResponse.venues[0]?.chainName ?? "detectada";
          return `Encontrei os detalhes da ${tokenSymbol} atraves de uma busca em tempo real na rede ${chainName}.`;
        },
      );

      if (dexResolutionFromWebDiscovery) {
        return dexResolutionFromWebDiscovery;
      }
    }

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
      contractCandidates.length > 0
        ? `Foram identificados candidatos de contrato (${contractCandidates.length}), mas sem confirmacao on-chain final no DexScreener nesta rodada.`
        : "Nao foi identificado contrato valido nas fontes desta rodada.",
      exchangeMentions.length > 0
        ? `Possiveis locais de compra/listagem identificados: ${exchangeMentions.join(", ")}.`
        : "Nao houve confirmacao clara de listagem em corretoras grandes nas fontes coletadas agora.",
      "Fontes verificadas agora:",
      sourceLines,
      "Checklist profissional: valide contrato oficial, rede correta, liquidez, volume real e risco de spoofing antes de qualquer execucao.",
    ].join("\n");
  }

  private resolveMemeRadarNotificationByAssetHint(
    notifications: MemeRadarNotification[],
    assetHint: string,
  ): MemeRadarNotification | null {
    const normalizedHint = normalizeText(assetHint);

    for (const notification of notifications) {
      const symbol = normalizeText(notification.token.symbol);
      const name = normalizeText(notification.token.name);

      if (symbol === normalizedHint || name.includes(normalizedHint)) {
        return notification;
      }
    }

    return null;
  }

  private hasOnlyUnknownBundleChecklist(report: BundleRiskReport): boolean {
    return (
      report.checklist.highConcentration.status === "unknown"
      && report.checklist.symmetricBundle.status === "unknown"
      && report.checklist.fakeHolders.status === "unknown"
      && report.checklist.coordinatedFunding.status === "unknown"
      && report.checklist.earlyDumpTrap.status === "unknown"
      && report.checklist.communityHealth.status === "unknown"
    );
  }

  private buildStandaloneFraudChecklistMarkdown(input: {
    assetLabel: string;
    contractCandidates: string[];
    sourceUrls: string[];
    vampDetected: boolean;
  }): string {
    const riskScore = input.vampDetected ? 38 : 62;
    const vampStatus = input.vampDetected ? "**<span style=\"color:red\">FAIL</span>**" : "PASS";
    const pendingStatus = "**EM ANALISE**";
    const insufficientOnChainData = "Evidencia on-chain insuficiente nesta rodada; manter monitoramento ativo.";

    return [
      `[RISK SCORE: ${riskScore}/100]`,
      "",
      "| Checklist de Seguranca | Status | Evidencia |",
      "| --- | --- | --- |",
      `| High concentration (>4%) | ${pendingStatus} | ${insufficientOnChainData} |`,
      `| Symmetric bundle | ${pendingStatus} | ${insufficientOnChainData} |`,
      `| Viewers vs Holders anomaly | ${pendingStatus} | ${insufficientOnChainData} |`,
      `| Coordinated funding ping | ${pendingStatus} | ${insufficientOnChainData} |`,
      `| Early dump trap (<10k MC) | ${pendingStatus} | ${insufficientOnChainData} |`,
      `| Community health | ${pendingStatus} | ${insufficientOnChainData} |`,
      `| VAMP SCAM (ticker cruzado) | ${vampStatus} | ${input.vampDetected
        ? "Contratos antigos/mortos com mesmo ticker/imagem detectados."
        : "Nenhum marcador forte de copia parasita detectado agora."} |`,
      "",
      input.vampDetected
        ? "**<span style=\"color:red\">ALERTA: suspeita de VAMP SCAM (Copia Parasita).</span>**"
        : "Diretiva Anti-Vamp: nenhuma evidencia forte de copia parasita nesta leitura.",
      input.contractCandidates.length > 0
        ? `Contratos candidatos encontrados: ${input.contractCandidates.slice(0, 3).join(", ")}.`
        : "Contratos candidatos encontrados: n/d.",
      input.sourceUrls.length > 0
        ? `Fontes verificadas: ${input.sourceUrls.slice(0, 3).join(" | ")}.`
        : "Fontes verificadas: n/d.",
      `Auditoria institucional concluida para ${input.assetLabel}.`,
    ].join("\n");
  }

  private async buildInstitutionalFraudFallback(
    message: string,
    conversationMessages: OpenRouterConversationMessage[],
  ): Promise<string> {
    const operativeMessage = extractLatestUserTurn(message);
    const assetHint = resolvePrimaryAssetHint(operativeMessage);
    const assetLabel = assetHint.toUpperCase();

    const board = await memeRadarService.getNotificationBoard({
      chain: "all",
      limit: 80,
      pinnedOnly: false,
      priority: "all",
      refresh: false,
    });
    const matchedNotification = this.resolveMemeRadarNotificationByAssetHint(
      board.notifications,
      assetHint,
    );

    const historyLinks = extractRecentUserLinks(conversationMessages);
    const entitySeed = assetHint === "token" ? operativeMessage : `${assetHint}`;
    const focusedQuery = truncateForQuery(
      buildFocusedWebSearchQuery(entitySeed, "token_lookup"),
      80,
    );

    let webProvider = "n/d";
    let topResults: WebSearchResultItem[] = [];

    try {
      if (focusedQuery.length > 0) {
        const webResponse = await webSearchAdapter.search({
          maxResults: 6,
          query: focusedQuery,
        });

        webProvider = webResponse.provider;
        topResults = webResponse.results.slice(0, 5);
      }
    } catch (error) {
      logger.warn(
        {
          assetHint,
          err: error,
        },
        "Institutional fraud fallback web search failed",
      );
    }

    const sourceUrls = topResults.map((result) => result.url).slice(0, 4);
    const searchBlob = `${operativeMessage}\n${historyLinks.join("\n")}\n${topResults
      .map((result) => `${result.title}\n${result.snippet}\n${result.url}`)
      .join("\n")}`;
    const contractCandidates = extractContractAddressCandidatesFromText(searchBlob);
    const hasLegacyContractMentions = topResults.some((result) => {
      const normalizedBlob = normalizeText(`${result.title} ${result.snippet}`);

      return (
        normalizedBlob.includes("old contract") ||
        normalizedBlob.includes("dead contract") ||
        normalizedBlob.includes("deprecated") ||
        normalizedBlob.includes("migrat") ||
        normalizedBlob.includes("abandon") ||
        normalizedBlob.includes("v1") ||
        normalizedBlob.includes("rug")
      );
    });
    const vampDetected = contractCandidates.length >= 2 && hasLegacyContractMentions;

    if (matchedNotification?.bundleRiskReport) {
      const baseReport = matchedNotification.bundleRiskReport;
      const flags = new Set(baseReport.flags);

      if (vampDetected) {
        flags.add("VAMP_SCAM");
      }

      const report: BundleRiskReport = {
        ...baseReport,
        flags: [...flags],
        riskScore: vampDetected ? Math.max(0, baseReport.riskScore - 22) : baseReport.riskScore,
        summary:
          vampDetected && !baseReport.summary.some((line) => line.toLowerCase().includes("vamp scam"))
            ? [...baseReport.summary, "VAMP SCAM: ticker cruzado com contratos antigos/mortos."]
            : baseReport.summary,
        warningMessage:
          baseReport.warningMessage ??
          (vampDetected ? "VAMP SCAM detectado no cruzamento de ticker/contrato." : null),
      };

      if (this.hasOnlyUnknownBundleChecklist(report)) {
        return this.buildStandaloneFraudChecklistMarkdown({
          assetLabel,
          contractCandidates,
          sourceUrls,
          vampDetected,
        });
      }

      const multiWalletDetected =
        report.flags.includes("HIGH_CONCENTRATION_RISK") ||
        report.flags.includes("SYMMETRIC_BUNDLE_DETECTED") ||
        report.flags.includes("COORDINATED_BUNDLE") ||
        report.flags.includes("FAKE_HOLDERS_WARNING");
      const moderationDetected = report.flags.includes("COMMUNITY_HEALTH_FAILURE");

      return [
        `Auditoria anti-fraude institucional para ${assetLabel}.`,
        formatBundleRiskChecklistMarkdown(report),
        multiWalletDetected
          ? "**<span style=\"color:red\">ALERTA: suspeita de Multi-Wallet detectada.</span>**"
          : "Sem alerta forte de Multi-Wallet nesta rodada.",
        moderationDetected
          ? "**<span style=\"color:red\">ALERTA: falta de moderacao na comunidade detectada.</span>**"
          : "Sem alerta forte de abandono de moderacao nesta rodada.",
        vampDetected
          ? "**<span style=\"color:red\">VAMP SCAM (Copia Parasita): contratos antigos/mortos com mesmo ticker/imagem.</span>**"
          : "Diretiva Anti-Vamp: nenhuma evidencia forte de copia parasita nesta leitura.",
        contractCandidates.length > 0
          ? `Contratos candidatos encontrados: ${contractCandidates.slice(0, 3).join(", ")}.`
          : "Contratos candidatos encontrados: n/d.",
        sourceUrls.length > 0
          ? `Fontes verificadas (${webProvider}): ${sourceUrls.join(" | ")}.`
          : `Fontes verificadas (${webProvider}): n/d.`,
      ].join("\n");
    }

    return this.buildStandaloneFraudChecklistMarkdown({
      assetLabel,
      contractCandidates,
      sourceUrls,
      vampDetected,
    });
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