import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
} from "lightweight-charts";
import { isSupabaseConfigured, supabase } from "./shared/supabase-client.js";
import "./styles.css";

const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const sendButton = document.querySelector("#send-button");
const messagesContainer = document.querySelector("#messages");
const appSidebarElement = document.querySelector("#app-sidebar");
const appRouteNavElement = document.querySelector("#app-route-nav");
const sidebarToggleButton = document.querySelector("#sidebar-toggle");
const statusPill = document.querySelector("#connection-status");
const quickPromptsContainer = document.querySelector("#quick-prompts");
const activeModelElement = document.querySelector("#active-model");
const recentHistoryElement = document.querySelector("#recent-history");
const clearLocalHistoryButton = document.querySelector("#clear-local-history");
const conversationListElement = document.querySelector("#conversation-list");
const authUserEmailElement = document.querySelector("#auth-user-email");
const authLogoutButton = document.querySelector("#auth-logout-button");
const authGateElement = document.querySelector("#auth-gate");
const authForm = document.querySelector("#auth-form");
const authEmailInput = document.querySelector("#auth-email");
const authPasswordInput = document.querySelector("#auth-password");
const authSubmitButton = document.querySelector("#auth-submit-button");
const authToggleModeButton = document.querySelector("#auth-toggle-mode");
const authFeedbackElement = document.querySelector("#auth-feedback");
const authStatusElement = document.querySelector("#auth-status");
const marketNavigatorSection = document.querySelector(".market-navigator");
const workspaceStageSection = document.querySelector(".workspace-stage");
const chartDeskSection = document.querySelector(".chart-desk");
const layoutGridSection = document.querySelector(".layout-grid");
const intelligenceStageSection = document.querySelector(".intelligence-stage");
const intelligenceSideColumnSection = document.querySelector(".intelligence-side-column");
const chartControlsForm = document.querySelector("#chart-controls");
const chartAssetSelect = document.querySelector("#chart-asset");
const chartModeSelect = document.querySelector("#chart-mode");
const chartRangeSelect = document.querySelector("#chart-range");
const chartRefreshButton = document.querySelector("#chart-refresh-button");
const chartStyleSelect = document.querySelector("#chart-style");
const chartAutoRefreshSelect = document.querySelector("#chart-auto-refresh");
const chartExchangeSelect = document.querySelector("#chart-exchange");
const chartSymbolInput = document.querySelector("#chart-symbol");
const chartOverlayEmaToggle = document.querySelector("#chart-overlay-ema");
const chartOverlayLevelsToggle = document.querySelector("#chart-overlay-levels");
const chartFitButton = document.querySelector("#chart-fit-button");
const chartViewSwitch = document.querySelector("#chart-view-switch");
const chartIntervalSwitch = document.querySelector("#chart-interval-switch");
const chartStatusElement = document.querySelector("#chart-status");
const chartLegendElement = document.querySelector("#chart-legend");
const chartCopilotStage = document.querySelector("#chart-copilot-stage");
const tvStage = document.querySelector("#tv-stage");
const tvWidgetContainer = document.querySelector("#tv-widget");
const watchlistGrid = document.querySelector("#watchlist-grid");
const watchlistRefreshButton = document.querySelector("#watchlist-refresh");
const watchlistStatusElement = document.querySelector("#watchlist-status");
const watchlistDiagnosticsElement = document.querySelector("#watchlist-diagnostics");
const chartViewport = document.querySelector("#chart-viewport");
const chartMetricsElement = document.querySelector("#chart-metrics");
const chartAnalyzeButton = document.querySelector("#chart-analyze-button");
const analysisPanel = document.querySelector("#analysis-panel");
const analysisStatusElement = document.querySelector("#analysis-status");
const analysisSignalCardElement = document.querySelector("#analysis-signal-card");
const analysisContextCardElement = document.querySelector("#analysis-context-card");
const analysisTabsElement = document.querySelector("#analysis-tabs");
const analysisTabContentElement = document.querySelector("#analysis-tab-content");
const airdropRefreshButton = document.querySelector("#airdrop-refresh-button");
const airdropFiltersForm = document.querySelector("#airdrop-filters");
const airdropChainFilter = document.querySelector("#airdrop-chain-filter");
const airdropConfidenceFilter = document.querySelector("#airdrop-confidence-filter");
const airdropScoreFilter = document.querySelector("#airdrop-score-filter");
const airdropScoreFilterValue = document.querySelector("#airdrop-score-filter-value");
const airdropQueryFilter = document.querySelector("#airdrop-query-filter");
const airdropIncludeSpeculativeToggle = document.querySelector("#airdrop-include-speculative");
const airdropSummaryElement = document.querySelector("#airdrop-summary");
const airdropListElement = document.querySelector("#airdrop-list");
const memecoinRefreshButton = document.querySelector("#memecoin-refresh-button");
const memecoinFiltersForm = document.querySelector("#memecoin-filters");
const memecoinChainFilter = document.querySelector("#memecoin-chain-filter");
const memecoinPriorityFilter = document.querySelector("#memecoin-priority-filter");
const memecoinPinnedOnlyToggle = document.querySelector("#memecoin-pinned-only");
const memecoinSummaryElement = document.querySelector("#memecoin-summary");
const memecoinCriticalListElement = document.querySelector("#memecoin-column-critical");
const memecoinHighListElement = document.querySelector("#memecoin-column-high");
const memecoinWatchListElement = document.querySelector("#memecoin-column-watch");
const memecoinCountCriticalElement = document.querySelector("#memecoin-count-critical");
const memecoinCountHighElement = document.querySelector("#memecoin-count-high");
const memecoinCountWatchElement = document.querySelector("#memecoin-count-watch");
const marketNavigatorRefreshButton = document.querySelector("#market-navigator-refresh");
const marketScopeListElement = document.querySelector("#market-scope-list");
const marketCategoryListElement = document.querySelector("#market-category-list");
const marketPresetListElement = document.querySelector("#market-preset-list");
const marketFeedListElement = document.querySelector("#market-feed-list");
const marketActiveCategoryTitleElement = document.querySelector("#market-active-category-title");
const marketActivePresetTitleElement = document.querySelector("#market-active-preset-title");
const marketNavigatorDescriptionElement = document.querySelector("#market-navigator-description");
const marketFeedStatusElement = document.querySelector("#market-feed-status");
const marketFeedMetaElement = document.querySelector("#market-feed-meta");
const marketSearchInput = document.querySelector("#market-search-input");
const marketRegionFilter = document.querySelector("#market-region-filter");
const marketFavoritesOnlyToggle = document.querySelector("#market-favorites-only");
const marketSearchFeedbackElement = document.querySelector("#market-search-feedback");

const CHAT_HISTORY_STORAGE_KEY = "botfinanceiro.copilot.history.v1";
const CHAT_SESSION_STORAGE_KEY = "botfinanceiro.copilot.session.v1";
const CHAT_CONVERSATION_STORAGE_KEY = "botfinanceiro.copilot.conversation.v1";
const APP_ROUTE_STORAGE_KEY = "botfinanceiro.app.route.v1";
const SIDEBAR_COLLAPSE_STORAGE_KEY = "botfinanceiro.app.sidebarCollapsed.v1";
const CHART_PREFERENCES_STORAGE_KEY = "botfinanceiro.chart.preferences.v1";
const AIRDROP_PREFERENCES_STORAGE_KEY = "botfinanceiro.airdrop.preferences.v1";
const MEMECOIN_PREFERENCES_STORAGE_KEY = "botfinanceiro.memecoin.preferences.v1";
const MARKET_NAVIGATOR_FAVORITES_STORAGE_KEY = "botfinanceiro.marketNavigator.favorites.v1";
const MAX_STORED_MESSAGES = 60;
const MAX_RECENT_HISTORY_ITEMS = 8;
const MAX_CONVERSATIONS = 60;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const APP_ROUTE_CHAT = "chat";
const APP_ROUTE_CHART_LAB = "chart-lab";
const APP_ROUTE_RADAR = "radar";
const APP_ROUTES = new Set([APP_ROUTE_CHAT, APP_ROUTE_CHART_LAB, APP_ROUTE_RADAR]);
const APP_ROUTE_LABELS = {
  [APP_ROUTE_CHAT]: "Chat",
  [APP_ROUTE_CHART_LAB]: "Chart Lab",
  [APP_ROUTE_RADAR]: "Radar",
};
const APP_ROUTE_SHORTCUTS = {
  Digit7: APP_ROUTE_CHAT,
  Digit8: APP_ROUTE_CHART_LAB,
  Digit9: APP_ROUTE_RADAR,
};
const AUTH_MODE_SIGN_IN = "signin";
const AUTH_MODE_SIGN_UP = "signup";
const SUPABASE_CONVERSATIONS_TABLE = "copilot_user_conversations";
const SUPABASE_MESSAGES_TABLE = "copilot_user_messages";
const WATCHLIST_REFRESH_MIN_INTERVAL_MS = 20000;
const TERMINAL_INTERVALS = ["1", "5", "60", "240", "1D", "1W"];
const TERMINAL_INTERVAL_SET = new Set(TERMINAL_INTERVALS);
const TERMINAL_INTERVAL_SHORTCUTS = {
  Digit1: "1",
  Digit2: "5",
  Digit3: "60",
  Digit4: "240",
  Digit5: "1D",
  Digit6: "1W",
};
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
const CHART_RANGE_LABELS = {
  "1y": "1 ano",
  "24h": "24h",
  "30d": "30 dias",
  "7d": "7 dias",
  "90d": "90 dias",
};
const CHART_MODE_LABELS = {
  delayed: "delay",
  live: "ao vivo",
};
const CHART_STYLE_LABELS = {
  area: "area",
  bars: "barras",
  candles: "candles",
  heikin: "heikin ashi",
  line: "linha",
};
const MARKET_NAVIGATOR_SCOPE_OPTIONS = [
  {
    description: "Leitura cross-asset",
    id: "global",
    label: "Todo o mundo",
  },
  {
    description: "Recorte geografico",
    id: "countries",
    label: "Paises",
  },
  {
    description: "Eventos e manchetes",
    id: "news",
    label: "Noticias",
  },
];
const MARKET_NAVIGATOR_REGION_OPTIONS = [
  {
    id: "all",
    label: "Todas",
  },
  {
    id: "global",
    label: "Global",
  },
  {
    id: "americas",
    label: "Americas",
  },
  {
    id: "latam",
    label: "Latam",
  },
  {
    id: "europe",
    label: "Europa",
  },
  {
    id: "asia",
    label: "Asia",
  },
  {
    id: "mea",
    label: "Oriente Medio/Africa",
  },
];
const MARKET_NAVIGATOR_CATEGORY_DEFINITIONS = [
  {
    description: "Indices globais, setores e regime de risco.",
    id: "indices",
    label: "Indices",
    views: [
      {
        id: "indices-global",
        label: "Todos os indices",
        limit: 8,
        module: "wall-street",
        preset: "indices",
      },
      {
        id: "indices-setores",
        label: "Setores S&P",
        limit: 8,
        module: "wall-street",
        preset: "sectors",
      },
      {
        id: "indices-brasil",
        label: "Indices Brasil",
        limit: 8,
        module: "b3",
        preset: "indices",
      },
      {
        id: "indices-moedas",
        label: "Indices de moedas",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
    ],
  },
  {
    description: "Acoes globais, Brasil e FIIs em uma unica mesa.",
    id: "acoes",
    label: "Acoes",
    views: [
      {
        id: "acoes-todas",
        label: "Todas as acoes",
        limit: 8,
        module: "equities",
        preset: "us_mega_caps",
      },
      {
        id: "acoes-large-cap",
        label: "Large-cap",
        limit: 8,
        module: "equities",
        preset: "global_brands",
      },
      {
        id: "acoes-brasil",
        label: "Acoes Brasil",
        limit: 8,
        module: "b3",
        preset: "blue_chips",
      },
      {
        id: "acoes-fii",
        label: "FIIs liquidos",
        limit: 8,
        module: "fiis",
        preset: "high_liquidity",
      },
    ],
  },
  {
    description: "Cripto spot, DeFi e derivativos de maior liquidez.",
    id: "cripto",
    label: "Cripto",
    views: [
      {
        id: "cripto-spot",
        label: "Spot principal",
        limit: 10,
        module: "crypto",
      },
      {
        id: "cripto-layer1",
        label: "Layer 1 futuros",
        limit: 8,
        module: "futures",
        preset: "layer1",
      },
      {
        id: "cripto-defi",
        label: "Tokens DeFi",
        limit: 8,
        module: "defi",
        preset: "blue_chips",
      },
      {
        id: "cripto-noticias",
        label: "Noticias cripto",
        limit: 8,
        type: "news",
        assetId: "bitcoin",
      },
    ],
  },
  {
    description: "Futuros cripto e contratos de commodities.",
    id: "futuros",
    label: "Futuros",
    views: [
      {
        id: "futuros-cripto",
        label: "Todos os futuros",
        limit: 8,
        module: "futures",
        preset: "crypto_majors",
      },
      {
        id: "futuros-agro",
        label: "Agricolas",
        limit: 8,
        module: "commodities",
        preset: "agro",
      },
      {
        id: "futuros-energia",
        label: "Energia",
        limit: 8,
        module: "commodities",
        preset: "energy",
      },
      {
        id: "futuros-metais",
        label: "Metais",
        limit: 8,
        module: "commodities",
        preset: "metals",
      },
    ],
  },
  {
    description: "Pares de moedas por bloco geografico.",
    id: "forex",
    label: "Forex",
    views: [
      {
        id: "forex-global",
        label: "Todos os pares",
        limit: 8,
        module: "forex",
        preset: "global",
      },
      {
        id: "forex-principal",
        label: "Principal",
        limit: 8,
        module: "forex",
        preset: "majors",
      },
      {
        id: "forex-latam",
        label: "Latam",
        limit: 8,
        module: "forex",
        preset: "latam",
      },
      {
        id: "forex-europa",
        label: "Europa",
        limit: 8,
        module: "forex",
        preset: "europe",
      },
      {
        id: "forex-asia",
        label: "Asia",
        limit: 8,
        module: "forex",
        preset: "asia",
      },
    ],
  },
  {
    description: "Curva de juros soberana e term structure.",
    id: "titulos_governo",
    label: "Titulos do Governo",
    views: [
      {
        id: "gov-curve",
        label: "Curva EUA",
        limit: 8,
        module: "fixed-income",
        preset: "us_curve",
      },
      {
        id: "gov-global",
        label: "Rates globais",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
      {
        id: "gov-risco",
        label: "Regime de risco",
        limit: 8,
        module: "macro-rates",
        preset: "risk_regime",
      },
    ],
  },
  {
    description: "Credito corporativo e proxies de spread/risco.",
    id: "titulos_corporativos",
    label: "Titulos corporativos",
    views: [
      {
        id: "corp-credito",
        label: "Credito global",
        limit: 8,
        module: "fixed-income",
        preset: "credit_proxies",
      },
      {
        id: "corp-risco",
        label: "Taxas x risco",
        limit: 8,
        module: "fixed-income",
        preset: "rates_risk",
      },
      {
        id: "corp-macro",
        label: "Proxies inflacao",
        limit: 8,
        module: "macro-rates",
        preset: "inflation_proxies",
      },
    ],
  },
  {
    description: "ETFs de beta, tema, internacional e renda fixa.",
    id: "etfs",
    label: "ETFs",
    views: [
      {
        id: "etf-broad",
        label: "Broad market",
        limit: 8,
        module: "etfs",
        preset: "broad_market",
      },
      {
        id: "etf-thematic",
        label: "Tematicos",
        limit: 8,
        module: "etfs",
        preset: "thematic",
      },
      {
        id: "etf-international",
        label: "Internacional",
        limit: 8,
        module: "etfs",
        preset: "international",
      },
      {
        id: "etf-renda-fixa",
        label: "Renda fixa",
        limit: 8,
        module: "etfs",
        preset: "fixed_income",
      },
    ],
  },
  {
    description: "Macro global com commodities, FX e risco.",
    id: "economia_mundial",
    label: "Economia mundial",
    views: [
      {
        id: "eco-macro",
        label: "Macro rates",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
      {
        id: "eco-commodities",
        label: "Commodities globais",
        limit: 8,
        module: "commodities",
        preset: "global",
      },
      {
        id: "eco-metais",
        label: "Metais e ouro",
        limit: 8,
        module: "commodities",
        preset: "metals",
      },
      {
        id: "eco-energia",
        label: "Petroleo e energia",
        limit: 8,
        module: "commodities",
        preset: "energy",
      },
    ],
  },
  {
    description: "Volatilidade implicita e vies tatico de opcoes.",
    id: "opcoes",
    label: "Opcoes",
    views: [
      {
        id: "opcoes-indices",
        label: "Indices EUA",
        limit: 8,
        module: "options",
        preset: "us_indices",
        daysToExpiry: 30,
      },
      {
        id: "opcoes-mega-caps",
        label: "Mega caps",
        limit: 8,
        module: "options",
        preset: "us_mega_caps",
        daysToExpiry: 30,
      },
      {
        id: "opcoes-high-beta",
        label: "High beta",
        limit: 8,
        module: "options",
        preset: "high_beta",
        daysToExpiry: 30,
      },
    ],
  },
  {
    description: "Radar DeFi por vertical de protocolo.",
    id: "defi",
    label: "DeFi",
    views: [
      {
        id: "defi-blue-chips",
        label: "Blue chips",
        limit: 8,
        module: "defi",
        preset: "blue_chips",
      },
      {
        id: "defi-lending",
        label: "Lending",
        limit: 8,
        module: "defi",
        preset: "lending",
      },
      {
        id: "defi-dex",
        label: "DEX",
        limit: 8,
        module: "defi",
        preset: "dex",
      },
      {
        id: "defi-infra",
        label: "Infra",
        limit: 8,
        module: "defi",
        preset: "infrastructure",
      },
    ],
  },
  {
    description: "Noticias estruturadas com score de relevancia e impacto.",
    id: "noticias",
    label: "Noticias",
    views: [
      {
        id: "noticias-btc",
        label: "Noticias BTC",
        limit: 8,
        type: "news",
        assetId: "bitcoin",
      },
      {
        id: "noticias-eth",
        label: "Noticias ETH",
        limit: 8,
        type: "news",
        assetId: "ethereum",
      },
      {
        id: "noticias-sol",
        label: "Noticias SOL",
        limit: 8,
        type: "news",
        assetId: "solana",
      },
    ],
  },
];
const MARKET_NAVIGATOR_DEFAULT_SCOPE_ID = "global";
const MARKET_NAVIGATOR_DEFAULT_CATEGORY_ID = "indices";
const NEWS_INTELLIGENCE_REFRESH_INTERVAL_MS = 180000;
const ANALYSIS_TAB_DEFINITIONS = [
  {
    id: "resumo",
    label: "Resumo",
  },
  {
    id: "tecnica",
    label: "Tecnica",
  },
  {
    id: "smc",
    label: "SMC",
  },
  {
    id: "harmonicos",
    label: "Harmonicos",
  },
  {
    id: "wegd",
    label: "WEGD",
  },
  {
    id: "probabilistica",
    label: "Probabilistica",
  },
  {
    id: "calculadora",
    label: "Calculadora",
  },
  {
    id: "timing",
    label: "Timing",
  },
  {
    id: "visual_ia",
    label: "Visual IA",
  },
  {
    id: "noticias",
    label: "Noticias",
  },
];
const TERMINAL_STYLE_TO_TV = {
  area: "3",
  bars: "0",
  candles: "1",
  heikin: "8",
  line: "2",
};
const TRADINGVIEW_EMBED_BASE_URL = "https://s.tradingview.com/widgetembed/";
const EXCHANGE_TO_BROKER = {
  BINANCE: "binance",
  BYBIT: "bybit",
  COINBASE: "coinbase",
  KRAKEN: "kraken",
  OKX: "okx",
};
const EXCHANGES_WITH_NATIVE_LIVE = new Set(["BINANCE", "BYBIT", "COINBASE", "KRAKEN", "OKX"]);
const TERMINAL_WATCHLIST = [
  {
    assetId: "bitcoin",
    exchange: "BINANCE",
    label: "Bitcoin",
    symbol: "BTCUSDT",
  },
  {
    assetId: "ethereum",
    exchange: "BINANCE",
    label: "Ethereum",
    symbol: "ETHUSDT",
  },
  {
    assetId: "solana",
    exchange: "BINANCE",
    label: "Solana",
    symbol: "SOLUSDT",
  },
  {
    assetId: "xrp",
    exchange: "BINANCE",
    label: "XRP",
    symbol: "XRPUSDT",
  },
  {
    assetId: "cardano",
    exchange: "BINANCE",
    label: "Cardano",
    symbol: "ADAUSDT",
  },
  {
    assetId: "dogecoin",
    exchange: "BINANCE",
    label: "Dogecoin",
    symbol: "DOGEUSDT",
  },
  {
    assetId: "chainlink",
    exchange: "BINANCE",
    label: "Chainlink",
    symbol: "LINKUSDT",
  },
  {
    assetId: "avalanche-2",
    exchange: "BINANCE",
    label: "Avalanche",
    symbol: "AVAXUSDT",
  },
  {
    assetId: "binancecoin",
    exchange: "BINANCE",
    label: "BNB",
    symbol: "BNBUSDT",
  },
  {
    assetId: "uniswap",
    exchange: "BINANCE",
    label: "Uniswap",
    symbol: "UNIUSDT",
  },
  {
    assetId: "aave",
    exchange: "BINANCE",
    label: "Aave",
    symbol: "AAVEUSDT",
  },
  {
    assetId: "polygon-pos",
    exchange: "BINANCE",
    label: "Polygon",
    symbol: "MATICUSDT",
  },
  {
    assetId: "litecoin",
    exchange: "BINANCE",
    label: "Litecoin",
    symbol: "LTCUSDT",
  },
  {
    assetId: "tron",
    exchange: "BINANCE",
    label: "TRON",
    symbol: "TRXUSDT",
  },
  {
    assetId: "polkadot",
    exchange: "BINANCE",
    label: "Polkadot",
    symbol: "DOTUSDT",
  },
];
const ASSET_TO_TERMINAL_SYMBOL = Object.fromEntries(
  TERMINAL_WATCHLIST.map((entry) => [entry.assetId, entry.symbol]),
);

const messages = [];
let isSending = false;
let isChatLockedByAuth = false;
let chatSessionId = getOrCreateSessionId();
let activeConversationId = getStoredConversationId();
let activeAppRoute = APP_ROUTE_CHAT;
let isSidebarCollapsed = false;
let authMode = AUTH_MODE_SIGN_IN;
let activeAuthUser = null;
let conversationItems = [];
let currentChartSnapshot = null;
let chartAutoRefreshTimer = null;
let isChartLoading = false;
let chartApi = null;
let chartBaseSeries = null;
let chartBaseSeriesStyle = "";
let chartEmaFastSeries = null;
let chartEmaSlowSeries = null;
let chartPriceLines = [];
let chartResizeObserver = null;
let chartLatestCandles = [];
let chartCandleByTime = new Map();
let chartHasInitialFit = false;
let chartViewMode = "tv";
let tvMountIdCounter = 0;
let terminalRefreshTimer = null;
let watchlistAutoRefreshTimer = null;
let watchlistStream = null;
let watchlistStreamBackoffTimer = null;
let watchlistStreamReconnectAttempt = 0;
let watchlistStreamBroker = "";
let watchlistMarketByAsset = new Map();
let watchlistLastUpdatedAt = "";
let isWatchlistLoading = false;
let watchlistDiagnostics = {
  broker: "binance",
  errorCount: 0,
  fallbackCount: 0,
  latencyMs: null,
  mode: "polling",
  providerMode: "public",
  successCount: 0,
  unavailableCount: 0,
};
let activeAnalysisTabId = "resumo";
let newsIntelligencePayload = null;
let newsIntelligenceLastAssetId = "";
let newsIntelligenceLastFetchedAtMs = 0;
let newsIntelligenceRequestToken = 0;
let airdropRadarPayload = null;
let isAirdropRadarLoading = false;
let airdropQueryDebounceTimer = null;
let airdropPersistedChainPreference = "all";
let memecoinRadarPayload = null;
let isMemecoinRadarLoading = false;
let memecoinAutoRefreshTimer = null;
let activeMarketScopeId = MARKET_NAVIGATOR_DEFAULT_SCOPE_ID;
let activeMarketCategoryId = MARKET_NAVIGATOR_DEFAULT_CATEGORY_ID;
let activeMarketViewId = "";
let isMarketNavigatorLoading = false;
let marketNavigatorRequestToken = 0;
let activeMarketNavigatorItems = [];
let marketNavigatorViewCache = new Map();
let marketNavigatorViewStats = new Map();
let marketNavigatorSearchQuery = "";
let marketNavigatorSearchRemoteItems = [];
let marketNavigatorSearchToken = 0;
let marketNavigatorSearchDebounceTimer = null;
let marketNavigatorSearchInFlight = false;
let marketNavigatorRegionFilter = "all";
let marketNavigatorFavoritesOnly = false;
let marketNavigatorFavoriteKeys = new Set();

function mapSymbolToExchange(symbol, exchange) {
  const normalizedSymbol = sanitizeTerminalSymbol(symbol);
  const normalizedExchange = typeof exchange === "string" ? exchange.toUpperCase() : "BINANCE";

  if (normalizedSymbol.length < 5) {
    return normalizedSymbol;
  }

  if ((normalizedExchange === "COINBASE" || normalizedExchange === "KRAKEN") && normalizedSymbol.endsWith("USDT")) {
    return `${normalizedSymbol.slice(0, -4)}USD`;
  }

  if (normalizedExchange === "BINANCE" && normalizedSymbol.endsWith("USD") && !normalizedSymbol.endsWith("USDT")) {
    return `${normalizedSymbol.slice(0, -3)}USDT`;
  }

  return normalizedSymbol;
}

function getSelectedBroker() {
  const exchange = getSelectedTerminalExchange();
  return EXCHANGE_TO_BROKER[exchange] ?? "binance";
}

function isNativeLiveModeSupported() {
  const exchange = getSelectedTerminalExchange();
  return EXCHANGES_WITH_NATIVE_LIVE.has(exchange);
}

function buildApiUrl(path) {
  return API_BASE_URL.length > 0 ? `${API_BASE_URL}${path}` : path;
}

function createSessionId() {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateSessionId() {
  try {
    const storedValue = localStorage.getItem(CHAT_SESSION_STORAGE_KEY)?.trim();

    if (storedValue && SESSION_ID_PATTERN.test(storedValue)) {
      return storedValue;
    }
  } catch {
    // Ignore storage errors and create an ephemeral session id.
  }

  const generatedSessionId = createSessionId();

  try {
    localStorage.setItem(CHAT_SESSION_STORAGE_KEY, generatedSessionId);
  } catch {
    // Ignore storage errors and keep session id in memory.
  }

  return generatedSessionId;
}

function rotateSessionId() {
  chatSessionId = createSessionId();

  try {
    localStorage.setItem(CHAT_SESSION_STORAGE_KEY, chatSessionId);
  } catch {
    // Ignore storage errors and keep session id in memory.
  }
}

function getStoredConversationId() {
  try {
    const storedValue = localStorage.getItem(CHAT_CONVERSATION_STORAGE_KEY)?.trim();
    return storedValue && storedValue.length > 0 ? storedValue : "";
  } catch {
    return "";
  }
}

function normalizePathname(pathname) {
  if (typeof pathname !== "string" || pathname.length === 0) {
    return "/";
  }

  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function normalizeAppRoute(value) {
  if (typeof value !== "string") {
    return APP_ROUTE_CHAT;
  }

  const normalized = value.trim().toLowerCase();
  return APP_ROUTES.has(normalized) ? normalized : APP_ROUTE_CHAT;
}

function getBasePathForRouting() {
  const base = String(import.meta.env.BASE_URL ?? "/").trim();

  if (base.length === 0 || base === "/") {
    return "";
  }

  return normalizePathname(base.startsWith("/") ? base : `/${base}`);
}

function buildPathForRoute(route) {
  const basePath = getBasePathForRouting();

  if (route === APP_ROUTE_CHAT) {
    return basePath.length > 0 ? basePath : "/";
  }

  return `${basePath}/${route}`;
}

function resolveRouteFromLocation() {
  const pathname = normalizePathname(window.location.pathname.toLowerCase());
  const hash = String(window.location.hash ?? "").toLowerCase();

  if (pathname.endsWith(`/${APP_ROUTE_CHART_LAB}`) || hash === "#/chart-lab") {
    return APP_ROUTE_CHART_LAB;
  }

  if (pathname.endsWith(`/${APP_ROUTE_RADAR}`) || hash === "#/radar") {
    return APP_ROUTE_RADAR;
  }

  return APP_ROUTE_CHAT;
}

function getStoredAppRoute() {
  try {
    return normalizeAppRoute(localStorage.getItem(APP_ROUTE_STORAGE_KEY) ?? "");
  } catch {
    return APP_ROUTE_CHAT;
  }
}

function persistAppRoute(route) {
  try {
    localStorage.setItem(APP_ROUTE_STORAGE_KEY, route);
  } catch {
    // Ignore storage errors and keep route state in memory.
  }
}

function getStoredSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistSidebarCollapsed(nextValue) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, nextValue ? "1" : "0");
  } catch {
    // Ignore storage errors and keep collapse state in memory.
  }
}

function setRouteVisibility(route) {
  const showChartDesk = route === APP_ROUTE_CHART_LAB;
  const showLayoutGrid = route === APP_ROUTE_CHAT;
  const showMarketNavigator = route === APP_ROUTE_RADAR;
  const showAnalysisPanel = route === APP_ROUTE_CHART_LAB;
  const showIntelligenceColumn = route === APP_ROUTE_RADAR;

  if (chartDeskSection instanceof HTMLElement) {
    chartDeskSection.classList.toggle("route-hidden", !showChartDesk);
  }

  if (layoutGridSection instanceof HTMLElement) {
    layoutGridSection.classList.toggle("route-hidden", !showLayoutGrid);
  }

  if (marketNavigatorSection instanceof HTMLElement) {
    marketNavigatorSection.classList.toggle("route-hidden", !showMarketNavigator);
  }

  if (analysisPanel instanceof HTMLElement) {
    analysisPanel.classList.toggle("route-hidden", !showAnalysisPanel);
  }

  if (intelligenceSideColumnSection instanceof HTMLElement) {
    intelligenceSideColumnSection.classList.toggle("route-hidden", !showIntelligenceColumn);
  }

  if (workspaceStageSection instanceof HTMLElement) {
    workspaceStageSection.classList.toggle("route-hidden", !(showChartDesk || showLayoutGrid));
  }

  if (intelligenceStageSection instanceof HTMLElement) {
    intelligenceStageSection.classList.toggle("route-hidden", !(showAnalysisPanel || showIntelligenceColumn));
  }
}

function setSidebarCollapsed(nextValue) {
  isSidebarCollapsed = nextValue;
  document.body.classList.toggle("sidebar-collapsed", nextValue);

  if (appSidebarElement instanceof HTMLElement) {
    appSidebarElement.classList.toggle("is-collapsed", nextValue);
  }

  if (sidebarToggleButton instanceof HTMLButtonElement) {
    sidebarToggleButton.setAttribute("aria-expanded", String(!nextValue));
  }

  persistSidebarCollapsed(nextValue);
}

function updateActiveRouteButton(route) {
  if (!(appRouteNavElement instanceof HTMLElement)) {
    return;
  }

  const buttons = appRouteNavElement.querySelectorAll("button[data-route]");

  for (const button of buttons) {
    if (!(button instanceof HTMLButtonElement)) {
      continue;
    }

    const buttonRoute = normalizeAppRoute(button.dataset.route ?? "");
    button.classList.toggle("is-active", buttonRoute === route);
  }
}

function navigateToRoute(route, options = {}) {
  const safeRoute = normalizeAppRoute(route);
  activeAppRoute = safeRoute;
  setRouteVisibility(safeRoute);
  updateActiveRouteButton(safeRoute);

  if (options.persist !== false) {
    persistAppRoute(safeRoute);
  }

  if (options.pushHistory === false) {
    return;
  }

  const targetPath = normalizePathname(buildPathForRoute(safeRoute));
  const currentPath = normalizePathname(window.location.pathname);

  if (targetPath === currentPath) {
    return;
  }

  if (options.replaceHistory === true) {
    window.history.replaceState({
      appRoute: safeRoute,
    }, "", targetPath);
    return;
  }

  window.history.pushState({
    appRoute: safeRoute,
  }, "", targetPath);
}

function setupAppShellRouting() {
  const routeFromLocation = resolveRouteFromLocation();
  const storedRoute = getStoredAppRoute();
  const initialRoute = routeFromLocation === APP_ROUTE_CHAT ? storedRoute : routeFromLocation;

  setSidebarCollapsed(getStoredSidebarCollapsed());
  navigateToRoute(initialRoute, {
    replaceHistory: true,
  });

  if (sidebarToggleButton instanceof HTMLButtonElement) {
    sidebarToggleButton.addEventListener("click", () => {
      setSidebarCollapsed(!isSidebarCollapsed);
    });
  }

  if (appRouteNavElement instanceof HTMLElement) {
    appRouteNavElement.addEventListener("click", (event) => {
      const target = event.target;
      const button = target instanceof HTMLElement ? target.closest("button[data-route]") : null;

      if (!(button instanceof HTMLButtonElement)) {
        return;
      }

      const nextRoute = normalizeAppRoute(button.dataset.route ?? APP_ROUTE_CHAT);

      if (nextRoute === activeAppRoute) {
        return;
      }

      navigateToRoute(nextRoute);
    });
  }

  window.addEventListener("popstate", () => {
    navigateToRoute(resolveRouteFromLocation(), {
      pushHistory: false,
    });
  });
}

function persistActiveConversationId(conversationId) {
  const safeConversationId = typeof conversationId === "string" ? conversationId.trim() : "";
  activeConversationId = safeConversationId;

  try {
    if (safeConversationId.length === 0) {
      localStorage.removeItem(CHAT_CONVERSATION_STORAGE_KEY);
      return;
    }

    localStorage.setItem(CHAT_CONVERSATION_STORAGE_KEY, safeConversationId);
  } catch {
    // Ignore storage errors and keep conversation id in memory.
  }
}

function isCloudHistoryEnabled() {
  return Boolean(isSupabaseConfigured && supabase && activeAuthUser?.id);
}

function setAuthFeedback(message, mode = "") {
  if (!(authFeedbackElement instanceof HTMLElement)) {
    return;
  }

  authFeedbackElement.textContent = message;

  if (mode.length > 0) {
    authFeedbackElement.setAttribute("data-mode", mode);
  } else {
    authFeedbackElement.removeAttribute("data-mode");
  }
}

function setAuthStatusMessage(message) {
  if (!(authStatusElement instanceof HTMLElement)) {
    return;
  }

  authStatusElement.textContent = message;
}

function setAuthGateVisible(isVisible) {
  if (!(authGateElement instanceof HTMLElement)) {
    return;
  }

  authGateElement.classList.toggle("is-hidden", !isVisible);
}

function setAuthMode(nextMode) {
  authMode = nextMode === AUTH_MODE_SIGN_UP ? AUTH_MODE_SIGN_UP : AUTH_MODE_SIGN_IN;

  if (authSubmitButton instanceof HTMLButtonElement) {
    authSubmitButton.textContent = authMode === AUTH_MODE_SIGN_UP ? "Criar conta" : "Entrar";
  }

  if (authToggleModeButton instanceof HTMLButtonElement) {
    authToggleModeButton.textContent = authMode === AUTH_MODE_SIGN_UP
      ? "Tenho conta"
      : "Criar conta";
  }

  if (authMode === AUTH_MODE_SIGN_UP) {
    setAuthStatusMessage("Crie sua conta para iniciar com multiplas conversas.");
  } else {
    setAuthStatusMessage("Entre para sincronizar historico e threads por usuario.");
  }
}

function setChatLockState(nextValue) {
  isChatLockedByAuth = nextValue;

  if (chatInput instanceof HTMLTextAreaElement) {
    chatInput.disabled = nextValue || isSending;
  }

  if (sendButton instanceof HTMLButtonElement) {
    sendButton.disabled = nextValue || isSending;
  }

  if (chartAnalyzeButton instanceof HTMLButtonElement) {
    chartAnalyzeButton.disabled = nextValue;
  }
}

function setAuthUserLabel(label) {
  if (!(authUserEmailElement instanceof HTMLElement)) {
    return;
  }

  authUserEmailElement.textContent = label;
}

function formatConversationTimeLabel(value) {
  if (typeof value !== "string" || value.length === 0) {
    return "--";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "--";
  }

  return parsedDate.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildConversationId() {
  return `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildConversationTitleFromPrompt(prompt) {
  if (typeof prompt !== "string") {
    return "Nova conversa";
  }

  const compact = prompt.replace(/\s+/g, " ").trim();

  if (compact.length === 0) {
    return "Nova conversa";
  }

  if (compact.length <= 64) {
    return compact;
  }

  return `${compact.slice(0, 61)}...`;
}

function normalizeConversationRow(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const id = typeof value.id === "string" ? value.id.trim() : "";

  if (id.length < 8) {
    return null;
  }

  const title = typeof value.title === "string" && value.title.trim().length > 0
    ? value.title.trim()
    : "Nova conversa";
  const createdAt = typeof value.created_at === "string" ? value.created_at : "";
  const updatedAt = typeof value.updated_at === "string" ? value.updated_at : "";
  const lastMessageAt = typeof value.last_message_at === "string"
    ? value.last_message_at
    : (updatedAt || createdAt);

  return {
    createdAt,
    id,
    lastMessageAt,
    title,
    updatedAt,
  };
}

function sortConversations(items) {
  return [...items].sort((left, right) => {
    const leftDate = Date.parse(left.lastMessageAt || left.updatedAt || left.createdAt || "");
    const rightDate = Date.parse(right.lastMessageAt || right.updatedAt || right.createdAt || "");
    const safeLeft = Number.isNaN(leftDate) ? 0 : leftDate;
    const safeRight = Number.isNaN(rightDate) ? 0 : rightDate;

    return safeRight - safeLeft;
  });
}

function renderConversationList() {
  if (!(conversationListElement instanceof HTMLElement)) {
    return;
  }

  conversationListElement.innerHTML = "";

  if (!isCloudHistoryEnabled()) {
    const localModeItem = document.createElement("li");
    localModeItem.textContent = isSupabaseConfigured
      ? "Faca login para carregar suas conversas da conta."
      : "Supabase nao configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.";
    conversationListElement.append(localModeItem);
    return;
  }

  if (conversationItems.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "Nenhuma conversa ainda. Clique em Nova para iniciar.";
    conversationListElement.append(emptyItem);
    return;
  }

  for (const conversation of conversationItems) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "conversation-list-item-button";
    button.dataset.conversationId = conversation.id;

    if (conversation.id === activeConversationId) {
      button.classList.add("is-active");
    }

    const titleElement = document.createElement("span");
    titleElement.className = "conversation-list-item-title";
    titleElement.textContent = conversation.title;

    const timeElement = document.createElement("span");
    timeElement.className = "conversation-list-item-time";
    timeElement.textContent = formatConversationTimeLabel(conversation.lastMessageAt);

    button.append(titleElement, timeElement);
    item.append(button);
    conversationListElement.append(item);
  }
}

function upsertConversationState(conversation) {
  const existingIndex = conversationItems.findIndex((item) => item.id === conversation.id);

  if (existingIndex === -1) {
    conversationItems.push(conversation);
  } else {
    conversationItems[existingIndex] = {
      ...conversationItems[existingIndex],
      ...conversation,
    };
  }

  conversationItems = sortConversations(conversationItems);
  renderConversationList();
}

async function loadConversationsFromCloud() {
  if (!isCloudHistoryEnabled() || !supabase) {
    conversationItems = [];
    renderConversationList();
    return [];
  }

  const { data, error } = await supabase
    .from(SUPABASE_CONVERSATIONS_TABLE)
    .select("id, title, created_at, updated_at, last_message_at")
    .eq("user_id", activeAuthUser.id)
    .order("last_message_at", {
      ascending: false,
    })
    .limit(MAX_CONVERSATIONS);

  if (error) {
    throw new Error(error.message || "Falha ao carregar conversas");
  }

  conversationItems = (Array.isArray(data) ? data : [])
    .map((item) => normalizeConversationRow(item))
    .filter((item) => item !== null);
  conversationItems = sortConversations(conversationItems);
  renderConversationList();
  return conversationItems;
}

function normalizeCloudMessageRow(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const role = value.role === "assistant" || value.role === "user" ? value.role : null;
  const content = typeof value.content === "string" ? value.content : null;

  if (!role || !content) {
    return null;
  }

  const parsedDate = typeof value.created_at === "string" ? new Date(value.created_at) : null;
  const formattedTime = parsedDate && !Number.isNaN(parsedDate.getTime())
    ? parsedDate.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })
    : undefined;

  const normalized = {
    content,
    error: value.is_error === true,
    role,
  };

  const model = typeof value.model === "string" ? value.model : undefined;
  const totalTokens = typeof value.total_tokens === "number" ? value.total_tokens : undefined;

  if (model || formattedTime || totalTokens !== undefined) {
    normalized.meta = {
      model,
      time: formattedTime,
      totalTokens,
    };
  }

  return normalized;
}

async function loadConversationMessagesFromCloud(conversationId) {
  if (!isCloudHistoryEnabled() || !supabase || conversationId.trim().length < 8) {
    return false;
  }

  const { data, error } = await supabase
    .from(SUPABASE_MESSAGES_TABLE)
    .select("role, content, model, total_tokens, is_error, created_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", activeAuthUser.id)
    .order("created_at", {
      ascending: true,
    })
    .limit(MAX_STORED_MESSAGES);

  if (error) {
    throw new Error(error.message || "Falha ao carregar mensagens da conversa");
  }

  const normalizedMessages = (Array.isArray(data) ? data : [])
    .map((item) => normalizeCloudMessageRow(item))
    .filter((item) => item !== null);

  replaceMessages(normalizedMessages);
  return normalizedMessages.length > 0;
}

async function createConversationInCloud(initialTitle = "Nova conversa") {
  if (!isCloudHistoryEnabled() || !supabase) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const conversationId = buildConversationId();
  const title = initialTitle.trim().length > 0 ? initialTitle.trim() : "Nova conversa";

  const { data, error } = await supabase
    .from(SUPABASE_CONVERSATIONS_TABLE)
    .insert({
      created_at: nowIso,
      id: conversationId,
      last_message_at: nowIso,
      title,
      updated_at: nowIso,
      user_id: activeAuthUser.id,
    })
    .select("id, title, created_at, updated_at, last_message_at")
    .single();

  if (error) {
    throw new Error(error.message || "Falha ao criar conversa");
  }

  const normalizedConversation = normalizeConversationRow(data);

  if (!normalizedConversation) {
    throw new Error("Falha ao normalizar conversa criada");
  }

  upsertConversationState(normalizedConversation);
  return normalizedConversation;
}

async function updateConversationInCloud(conversationId, updates = {}) {
  if (!isCloudHistoryEnabled() || !supabase || conversationId.trim().length < 8) {
    return;
  }

  const payload = {
    updated_at: new Date().toISOString(),
    ...updates,
  };

  const { data, error } = await supabase
    .from(SUPABASE_CONVERSATIONS_TABLE)
    .update(payload)
    .eq("id", conversationId)
    .eq("user_id", activeAuthUser.id)
    .select("id, title, created_at, updated_at, last_message_at")
    .single();

  if (error) {
    throw new Error(error.message || "Falha ao atualizar conversa");
  }

  const normalizedConversation = normalizeConversationRow(data);

  if (normalizedConversation) {
    upsertConversationState(normalizedConversation);
  }
}

async function persistCloudMessage(conversationId, message) {
  if (!isCloudHistoryEnabled() || !supabase || conversationId.trim().length < 8) {
    return;
  }

  const totalTokens = typeof message?.meta?.totalTokens === "number"
    ? Math.max(0, Math.round(message.meta.totalTokens))
    : null;

  const { error } = await supabase
    .from(SUPABASE_MESSAGES_TABLE)
    .insert({
      content: message.content,
      conversation_id: conversationId,
      is_error: message.error === true,
      model: typeof message?.meta?.model === "string" ? message.meta.model : null,
      role: message.role,
      total_tokens: totalTokens,
      user_id: activeAuthUser.id,
    });

  if (error) {
    throw new Error(error.message || "Falha ao persistir mensagem");
  }
}

async function setActiveConversation(conversationId, options = {}) {
  const safeConversationId = typeof conversationId === "string" ? conversationId.trim() : "";

  if (safeConversationId.length < 8) {
    return;
  }

  persistActiveConversationId(safeConversationId);
  renderConversationList();

  if (options.hydrateMessages === false) {
    replaceMessages([]);
    return;
  }

  const loaded = await loadConversationMessagesFromCloud(safeConversationId);

  if (!loaded) {
    replaceMessages([]);
  }
}

async function createAndActivateConversation() {
  const createdConversation = await createConversationInCloud("Nova conversa");

  if (!createdConversation) {
    return null;
  }

  await setActiveConversation(createdConversation.id, {
    hydrateMessages: false,
  });

  setStatus("", "Nova conversa iniciada");
  return createdConversation;
}

function normalizeStoredMessage(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const role = value.role === "assistant" || value.role === "user" ? value.role : null;
  const content = typeof value.content === "string" ? value.content : null;

  if (!role || !content) {
    return null;
  }

  const normalized = {
    content,
    error: value.error === true,
    role,
  };

  if (value.meta && typeof value.meta === "object") {
    normalized.meta = {
      model: typeof value.meta.model === "string" ? value.meta.model : undefined,
      time: typeof value.meta.time === "string" ? value.meta.time : undefined,
      totalTokens:
        typeof value.meta.totalTokens === "number" ? value.meta.totalTokens : undefined,
    };
  }

  return normalized;
}

function saveMessagesToLocalStorage() {
  if (isCloudHistoryEnabled()) {
    return;
  }

  try {
    const compactMessages = messages.slice(-MAX_STORED_MESSAGES);
    localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(compactMessages));
  } catch {
    // Ignore storage errors to keep chat interaction working.
  }
}

function loadMessagesFromLocalStorage() {
  if (isCloudHistoryEnabled()) {
    return [];
  }

  try {
    const raw = localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeStoredMessage(item))
      .filter((item) => item !== null)
      .slice(-MAX_STORED_MESSAGES);
  } catch {
    return [];
  }
}

function normalizeRemoteHistoryMessage(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const role = value.role === "assistant" || value.role === "user" ? value.role : null;
  const content = typeof value.content === "string" ? value.content : null;

  if (!role || !content) {
    return null;
  }

  const timestamp = typeof value.timestamp === "string" ? value.timestamp : "";
  const parsedTimestamp = timestamp ? new Date(timestamp) : null;
  const time = parsedTimestamp && !Number.isNaN(parsedTimestamp.getTime())
    ? parsedTimestamp.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })
    : undefined;

  const meta = {
    model: typeof value.model === "string" ? value.model : undefined,
    time,
    totalTokens: typeof value.totalTokens === "number" ? value.totalTokens : undefined,
  };

  const normalized = {
    content,
    error: false,
    role,
  };

  if (meta.model || meta.time || meta.totalTokens !== undefined) {
    normalized.meta = meta;
  }

  return normalized;
}

function replaceMessages(nextMessages) {
  messages.splice(0, messages.length, ...nextMessages);
  saveMessagesToLocalStorage();
  renderMessages();
  renderRecentHistory();
}

function renderRecentHistory() {
  if (!recentHistoryElement) {
    return;
  }

  recentHistoryElement.innerHTML = "";

  const recentMessages = [...messages].reverse().slice(0, MAX_RECENT_HISTORY_ITEMS);

  if (recentMessages.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "Sem conversas recentes.";
    recentHistoryElement.append(emptyItem);
    return;
  }

  for (const message of recentMessages) {
    const item = document.createElement("li");
    const roleLabel = message.role === "user" ? "Voce" : "Copiloto";
    const preview = message.content.length > 90
      ? `${message.content.slice(0, 90)}...`
      : message.content;
    const timeLabel = message.meta?.time ? ` (${message.meta.time})` : "";

    item.textContent = `${roleLabel}${timeLabel}: ${preview}`;
    recentHistoryElement.append(item);
  }
}

function setStatus(mode, label) {
  if (!statusPill) {
    return;
  }

  if (!mode) {
    statusPill.removeAttribute("data-mode");
  } else {
    statusPill.setAttribute("data-mode", mode);
  }

  statusPill.textContent = label;
}

function formatMeta(meta) {
  if (!meta) {
    return "";
  }

  const chunks = [];

  if (meta.model) {
    chunks.push(`Modelo: ${meta.model}`);
  }

  if (meta.totalTokens !== undefined) {
    chunks.push(`Tokens: ${meta.totalTokens}`);
  }

  if (meta.time) {
    chunks.push(`Hora: ${meta.time}`);
  }

  return chunks.join(" • ");
}

function formatPrice(value, currency = "usd") {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/d";
  }

  const maximumFractionDigits = value >= 1000 ? 2 : value >= 1 ? 4 : 6;

  return `${value.toLocaleString("pt-BR", {
    maximumFractionDigits,
  })} ${String(currency).toUpperCase()}`;
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/d";
  }

  const signal = value > 0 ? "+" : "";
  return `${signal}${value.toFixed(2)}%`;
}

function formatCompactUsd(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/d";
  }

  const maximumFractionDigits = value >= 1000 ? 2 : value >= 1 ? 3 : 6;
  return `$ ${value.toLocaleString("pt-BR", {
    maximumFractionDigits,
  })}`;
}

function formatShortTime(isoDate) {
  if (typeof isoDate !== "string" || isoDate.length === 0) {
    return "--";
  }

  const parsedDate = new Date(isoDate);

  if (Number.isNaN(parsedDate.getTime())) {
    return "--";
  }

  return parsedDate.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatAirdropDate(isoDate) {
  if (typeof isoDate !== "string" || isoDate.length === 0) {
    return "n/d";
  }

  const parsedDate = new Date(isoDate);

  if (Number.isNaN(parsedDate.getTime())) {
    return "n/d";
  }

  return parsedDate.toLocaleString("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  });
}

function formatAirdropConfidenceLabel(value) {
  if (value === "high") {
    return "Confianca alta";
  }

  if (value === "medium") {
    return "Confianca media";
  }

  return "Confianca baixa";
}

function formatAirdropRewardTypeLabel(value) {
  if (value === "token") {
    return "Reward token";
  }

  if (value === "points") {
    return "Reward points";
  }

  if (value === "nft") {
    return "Reward NFT";
  }

  return "Reward indefinido";
}

function buildAirdropChatPrompt(input) {
  const project = typeof input.project === "string" ? input.project : "Projeto n/d";
  const chain = typeof input.chain === "string" ? input.chain : "Global";
  const score = typeof input.score === "string" ? input.score : "n/d";
  const confidence = typeof input.confidence === "string"
    ? formatAirdropConfidenceLabel(input.confidence)
    : "Confianca n/d";
  const rewardType = typeof input.rewardType === "string"
    ? formatAirdropRewardTypeLabel(input.rewardType)
    : "Reward indefinido";
  const sources = typeof input.sources === "string" ? input.sources : "n/d";
  const tasks = typeof input.tasks === "string" ? input.tasks : "Acompanhar regras oficiais";
  const sourceUrl = typeof input.url === "string" ? input.url : "";

  return [
    "Analise esta oportunidade de airdrop e monte um plano de execucao objetivo.",
    `Projeto: ${project}`,
    `Chain: ${chain}`,
    `Score: ${score}`,
    `Confianca: ${confidence}`,
    `Reward: ${rewardType}`,
    `Tarefas iniciais: ${tasks}`,
    `Fontes: ${sources}`,
    sourceUrl.length > 0 ? `Link: ${sourceUrl}` : "Link: n/d",
    "Quero retorno em 4 blocos: elegibilidade, risco operacional/gas, checklist por prioridade e red flags de golpe.",
  ].join("\n");
}

async function copyTextToClipboard(value) {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }

  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fallback abaixo para navegadores mais restritos.
    }
  }

  const temporaryTextArea = document.createElement("textarea");
  temporaryTextArea.value = value;
  temporaryTextArea.setAttribute("readonly", "");
  temporaryTextArea.style.position = "fixed";
  temporaryTextArea.style.opacity = "0";
  document.body.append(temporaryTextArea);
  temporaryTextArea.select();

  let copied = false;

  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    temporaryTextArea.remove();
  }

  return copied;
}

function normalizeAirdropChain(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

function formatAirdropChainLabel(value) {
  const normalized = normalizeAirdropChain(value);

  if (normalized.length === 0) {
    return "Global";
  }

  return normalized
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function setAirdropRefreshLoadingState(isLoading) {
  if (!(airdropRefreshButton instanceof HTMLButtonElement)) {
    return;
  }

  airdropRefreshButton.disabled = isLoading;
  airdropRefreshButton.textContent = isLoading ? "Atualizando..." : "Atualizar radar";
}

function setAirdropSummary(message, mode = "") {
  if (!(airdropSummaryElement instanceof HTMLElement)) {
    return;
  }

  airdropSummaryElement.textContent = message;

  if (mode.length > 0) {
    airdropSummaryElement.setAttribute("data-mode", mode);
  } else {
    airdropSummaryElement.removeAttribute("data-mode");
  }
}

function setAirdropScoreFilterLabel() {
  if (!(airdropScoreFilterValue instanceof HTMLElement)) {
    return;
  }

  const scoreValue = airdropScoreFilter instanceof HTMLInputElement
    ? Number.parseInt(airdropScoreFilter.value, 10)
    : 35;

  airdropScoreFilterValue.textContent = Number.isFinite(scoreValue)
    ? String(Math.max(0, Math.min(100, scoreValue)))
    : "35";
}

function getAirdropFilterState() {
  const chain = airdropChainFilter instanceof HTMLSelectElement ? airdropChainFilter.value : "all";
  const confidence = airdropConfidenceFilter instanceof HTMLSelectElement
    ? airdropConfidenceFilter.value
    : "all";
  const score = airdropScoreFilter instanceof HTMLInputElement
    ? Number.parseInt(airdropScoreFilter.value, 10)
    : 35;

  return {
    chain,
    confidence,
    includeSpeculative:
      !(airdropIncludeSpeculativeToggle instanceof HTMLInputElement)
      || airdropIncludeSpeculativeToggle.checked,
    query:
      airdropQueryFilter instanceof HTMLInputElement
        ? airdropQueryFilter.value.trim()
        : "",
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 35,
  };
}

async function requestAirdropRadar(queryState) {
  const minScore =
    typeof queryState.score === "number" && Number.isFinite(queryState.score)
      ? Math.max(0, Math.min(100, Math.floor(queryState.score)))
      : 0;
  const params = new URLSearchParams({
    includeSpeculative: queryState.includeSpeculative ? "true" : "false",
    limit: "24",
    minScore: String(minScore),
  });

  if (queryState.query.length > 0) {
    params.set("query", queryState.query);
  }

  const response = await fetch(buildApiUrl(`/v1/airdrops/opportunities?${params.toString()}`), {
    method: "GET",
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error?.message;
    throw new Error(typeof message === "string" ? message : "Falha ao carregar radar de airdrops");
  }

  return payload?.data ?? null;
}

function ensureAirdropChainFilterOptions(opportunities) {
  if (!(airdropChainFilter instanceof HTMLSelectElement)) {
    return;
  }

  const previousValue = normalizeAirdropChain(
    airdropChainFilter.value || airdropPersistedChainPreference || "all",
  );
  const chainValues = [...new Set(
    opportunities
      .map((opportunity) => normalizeAirdropChain(opportunity?.chain))
      .filter((chain) => chain.length > 0),
  )].sort((left, right) => left.localeCompare(right));

  airdropChainFilter.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "all";
  defaultOption.textContent = "Todas";
  airdropChainFilter.append(defaultOption);

  for (const chain of chainValues) {
    const option = document.createElement("option");
    option.value = chain;
    option.textContent = formatAirdropChainLabel(chain);
    airdropChainFilter.append(option);
  }

  if (previousValue !== "all" && chainValues.includes(previousValue)) {
    airdropChainFilter.value = previousValue;
    airdropPersistedChainPreference = previousValue;
    return;
  }

  airdropChainFilter.value = "all";
  airdropPersistedChainPreference = "all";
}

function getFilteredAirdropOpportunities(opportunities) {
  const filterState = getAirdropFilterState();

  return opportunities
    .filter((opportunity) => {
      if (typeof opportunity?.score !== "number" || Number.isNaN(opportunity.score)) {
        return false;
      }

      return opportunity.score >= filterState.score;
    })
    .filter((opportunity) => {
      if (filterState.confidence === "all") {
        return true;
      }

      return opportunity?.confidence === filterState.confidence;
    })
    .filter((opportunity) => {
      if (filterState.chain === "all") {
        return true;
      }

      return normalizeAirdropChain(opportunity?.chain) === filterState.chain;
    })
    .sort((left, right) => right.score - left.score);
}

function renderAirdropList(opportunities) {
  if (!(airdropListElement instanceof HTMLElement)) {
    return;
  }

  airdropListElement.innerHTML = "";

  if (opportunities.length === 0) {
    const emptyElement = document.createElement("div");
    emptyElement.className = "airdrop-empty";
    emptyElement.textContent =
      "Nenhuma oportunidade atende aos filtros atuais. Ajuste chain, score minimo ou confianca.";
    airdropListElement.append(emptyElement);
    return;
  }

  for (const opportunity of opportunities.slice(0, 12)) {
    const card = document.createElement("article");
    card.className = "airdrop-card";
    card.dataset.confidence = opportunity.confidence;

    const header = document.createElement("div");
    header.className = "airdrop-card-header";

    const title = document.createElement("h4");
    title.textContent = opportunity.project;

    const chainPill = document.createElement("span");
    chainPill.className = "airdrop-chain-pill";
    chainPill.textContent = formatAirdropChainLabel(opportunity.chain);

    header.append(title, chainPill);

    const meta = document.createElement("div");
    meta.className = "airdrop-card-meta";

    const scoreChip = document.createElement("span");
    scoreChip.className = "airdrop-meta-chip";
    scoreChip.textContent = `Score ${Math.round(opportunity.score)}`;

    const confidenceChip = document.createElement("span");
    confidenceChip.className = "airdrop-meta-chip";
    confidenceChip.textContent = formatAirdropConfidenceLabel(opportunity.confidence);

    const rewardChip = document.createElement("span");
    rewardChip.className = "airdrop-meta-chip";
    rewardChip.textContent = formatAirdropRewardTypeLabel(opportunity.rewardType);

    meta.append(scoreChip, confidenceChip, rewardChip);

    const description = document.createElement("p");
    description.textContent = opportunity.description;

    const tags = document.createElement("div");
    tags.className = "airdrop-tags";
    tags.textContent = opportunity.tags.length > 0
      ? `Tags: ${opportunity.tags.slice(0, 5).join(" • ")}`
      : "Tags: monitoramento geral";

    const taskList = document.createElement("ul");
    taskList.className = "airdrop-task-list";

    for (const task of opportunity.tasks.slice(0, 2)) {
      const taskItem = document.createElement("li");
      taskItem.textContent = task;
      taskList.append(taskItem);
    }

    const footer = document.createElement("div");
    footer.className = "airdrop-card-footer";

    const sourceLine = document.createElement("span");
    sourceLine.className = "airdrop-source-line";
    sourceLine.textContent = `${opportunity.sources.join(" + ")} • ${formatAirdropDate(opportunity.discoveredAt)}`;

    const actions = document.createElement("div");
    actions.className = "airdrop-card-actions";

    const chatButton = document.createElement("button");
    chatButton.type = "button";
    chatButton.className = "airdrop-chat-button";
    chatButton.dataset.action = "send-to-chat";
    chatButton.dataset.project = opportunity.project;
    chatButton.dataset.chain = formatAirdropChainLabel(opportunity.chain);
    chatButton.dataset.score = String(Math.round(opportunity.score));
    chatButton.dataset.confidence = opportunity.confidence;
    chatButton.dataset.rewardType = opportunity.rewardType;
    chatButton.dataset.tasks = opportunity.tasks.slice(0, 3).join("; ");
    chatButton.dataset.sources = opportunity.sources.join(", ");
    chatButton.dataset.url = opportunity.url;
    chatButton.textContent = "Levar ao chat";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "airdrop-copy-button";
    copyButton.dataset.action = "copy-prompt";
    copyButton.dataset.project = opportunity.project;
    copyButton.dataset.chain = formatAirdropChainLabel(opportunity.chain);
    copyButton.dataset.score = String(Math.round(opportunity.score));
    copyButton.dataset.confidence = opportunity.confidence;
    copyButton.dataset.rewardType = opportunity.rewardType;
    copyButton.dataset.tasks = opportunity.tasks.slice(0, 3).join("; ");
    copyButton.dataset.sources = opportunity.sources.join(", ");
    copyButton.dataset.url = opportunity.url;
    copyButton.textContent = "Copiar prompt";

    const link = document.createElement("a");
    link.href = opportunity.url;
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    link.textContent = "Abrir fonte";

    actions.append(chatButton, copyButton, link);
    footer.append(sourceLine, actions);
    card.append(header, meta, description, tags, taskList, footer);
    airdropListElement.append(card);
  }
}

function renderAirdropRadarFromState() {
  if (!airdropRadarPayload) {
    renderAirdropList([]);
    setAirdropSummary("Sem dados de radar no momento.", "error");
    return;
  }

  const opportunities = Array.isArray(airdropRadarPayload.opportunities)
    ? airdropRadarPayload.opportunities
    : [];
  const filteredOpportunities = getFilteredAirdropOpportunities(opportunities);
  const summary = airdropRadarPayload.summary ?? {};
  const fetchedAt = formatShortTime(airdropRadarPayload.fetchedAt);

  setAirdropSummary(
    `Fontes saudaveis ${summary.sourcesHealthy ?? 0}/${summary.totalSources ?? 0} • cobertura ${summary.sourceCoveragePercent ?? 0}% • filtradas ${filteredOpportunities.length}/${opportunities.length} • atualizado ${fetchedAt}`,
  );
  renderAirdropList(filteredOpportunities);
}

async function loadAirdropRadar() {
  if (isAirdropRadarLoading) {
    return;
  }

  isAirdropRadarLoading = true;
  setAirdropRefreshLoadingState(true);
  setAirdropSummary("Atualizando radar de airdrops...", "");

  try {
    const filterState = getAirdropFilterState();
    const payload = await requestAirdropRadar({
      includeSpeculative: filterState.includeSpeculative,
      query: filterState.query,
      score: filterState.score,
    });

    if (!payload || !Array.isArray(payload.opportunities)) {
      throw new Error("Resposta de airdrops invalida");
    }

    airdropRadarPayload = payload;
    ensureAirdropChainFilterOptions(payload.opportunities);
    renderAirdropRadarFromState();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar radar de airdrops";
    airdropRadarPayload = null;
    renderAirdropList([]);
    setAirdropSummary(message, "error");
  } finally {
    isAirdropRadarLoading = false;
    setAirdropRefreshLoadingState(false);
  }
}

function setupAirdropRadarPanel() {
  if (!(airdropListElement instanceof HTMLElement)) {
    return;
  }

  hydrateAirdropPreferences();
  setAirdropScoreFilterLabel();

  if (airdropRefreshButton instanceof HTMLButtonElement) {
    airdropRefreshButton.addEventListener("click", () => {
      void loadAirdropRadar();
    });
  }

  if (airdropFiltersForm instanceof HTMLFormElement) {
    airdropFiltersForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveAirdropPreferences();
      void loadAirdropRadar();
    });
  }

  if (airdropChainFilter instanceof HTMLSelectElement) {
    airdropChainFilter.addEventListener("change", () => {
      airdropPersistedChainPreference = normalizeAirdropChain(airdropChainFilter.value || "all");
      saveAirdropPreferences();
      renderAirdropRadarFromState();
    });
  }

  if (airdropConfidenceFilter instanceof HTMLSelectElement) {
    airdropConfidenceFilter.addEventListener("change", () => {
      saveAirdropPreferences();
      renderAirdropRadarFromState();
    });
  }

  if (airdropScoreFilter instanceof HTMLInputElement) {
    airdropScoreFilter.addEventListener("input", () => {
      setAirdropScoreFilterLabel();
      saveAirdropPreferences();
      renderAirdropRadarFromState();
    });
  }

  if (airdropIncludeSpeculativeToggle instanceof HTMLInputElement) {
    airdropIncludeSpeculativeToggle.addEventListener("change", () => {
      saveAirdropPreferences();
      void loadAirdropRadar();
    });
  }

  if (airdropQueryFilter instanceof HTMLInputElement) {
    airdropQueryFilter.addEventListener("input", () => {
      saveAirdropPreferences();

      if (airdropQueryDebounceTimer !== null) {
        window.clearTimeout(airdropQueryDebounceTimer);
      }

      airdropQueryDebounceTimer = window.setTimeout(() => {
        airdropQueryDebounceTimer = null;
        void loadAirdropRadar();
      }, 550);
    });
  }

  airdropListElement.addEventListener("click", (event) => {
    const target = event.target;
    const actionButton = target instanceof HTMLElement
      ? target.closest("button[data-action]")
      : null;

    if (!(actionButton instanceof HTMLButtonElement)) {
      return;
    }

    if (!(chatInput instanceof HTMLTextAreaElement)) {
      return;
    }

    const prompt = buildAirdropChatPrompt({
      chain: actionButton.dataset.chain,
      confidence: actionButton.dataset.confidence,
      project: actionButton.dataset.project,
      rewardType: actionButton.dataset.rewardType,
      score: actionButton.dataset.score,
      sources: actionButton.dataset.sources,
      tasks: actionButton.dataset.tasks,
      url: actionButton.dataset.url,
    });

    if (actionButton.dataset.action === "copy-prompt") {
      void (async () => {
        const copied = await copyTextToClipboard(prompt);
        setStatus(copied ? "" : "Nao foi possivel copiar o prompt", copied ? "Prompt copiado" : "error");
      })();
      return;
    }

    if (actionButton.dataset.action !== "send-to-chat") {
      return;
    }

    chatInput.value = prompt;
    chatInput.focus();
    chatInput.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setStatus("", "Prompt de airdrop pronto");
  });

  renderAirdropList([]);
  void loadAirdropRadar();
}

function formatMemePriorityLabel(priority) {
  if (priority === "critical") {
    return "Critico";
  }

  if (priority === "high") {
    return "Alta";
  }

  return "Watch";
}

function formatMemeChainLabel(chain) {
  if (chain === "solana") {
    return "Solana";
  }

  if (chain === "base") {
    return "Base";
  }

  return "Global";
}

function formatMemeMetricUsd(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/d";
  }

  return formatCompactUsd(value);
}

function setMemecoinRefreshLoadingState(isLoading) {
  if (!(memecoinRefreshButton instanceof HTMLButtonElement)) {
    return;
  }

  memecoinRefreshButton.disabled = isLoading;
  memecoinRefreshButton.textContent = isLoading ? "Atualizando..." : "Atualizar wall";
}

function setMemecoinSummary(message, mode = "") {
  if (!(memecoinSummaryElement instanceof HTMLElement)) {
    return;
  }

  memecoinSummaryElement.textContent = message;

  if (mode.length > 0) {
    memecoinSummaryElement.setAttribute("data-mode", mode);
  } else {
    memecoinSummaryElement.removeAttribute("data-mode");
  }
}

function getMemecoinFilterState() {
  const chain = memecoinChainFilter instanceof HTMLSelectElement
    ? memecoinChainFilter.value
    : "all";
  const priority = memecoinPriorityFilter instanceof HTMLSelectElement
    ? memecoinPriorityFilter.value
    : "all";
  const pinnedOnly = memecoinPinnedOnlyToggle instanceof HTMLInputElement
    ? memecoinPinnedOnlyToggle.checked
    : false;

  return {
    chain,
    pinnedOnly,
    priority,
  };
}

function buildMemecoinChatPrompt(notification) {
  const tokenSymbol = typeof notification?.token?.symbol === "string"
    ? notification.token.symbol
    : "TOKEN";
  const tokenName = typeof notification?.token?.name === "string"
    ? notification.token.name
    : "Projeto n/d";
  const chain = formatMemeChainLabel(notification?.chain);
  const priority = formatMemePriorityLabel(notification?.priority);
  const score = typeof notification?.sentiment?.hypeScore === "number"
    ? Math.round(notification.sentiment.hypeScore)
    : "n/d";
  const confidence = typeof notification?.sentiment?.confidence === "number"
    ? Math.round(notification.sentiment.confidence)
    : "n/d";
  const catalysts = Array.isArray(notification?.catalysts)
    ? notification.catalysts.slice(0, 3).join("; ")
    : "n/d";
  const risks = Array.isArray(notification?.riskFlags)
    ? notification.riskFlags.slice(0, 3).join("; ")
    : "n/d";
  const pairUrl = typeof notification?.pairUrl === "string" ? notification.pairUrl : "";

  return [
    "Analise este alerta de MemeCoin Radar e gere um plano tatico de acompanhamento sem recomendacao financeira.",
    `Token: ${tokenSymbol} (${tokenName})`,
    `Chain: ${chain}`,
    `Prioridade: ${priority}`,
    `Hype score: ${score}`,
    `Confianca do sinal: ${confidence}`,
    `Catalisadores: ${catalysts}`,
    `Riscos: ${risks}`,
    pairUrl.length > 0 ? `Link da pool: ${pairUrl}` : "Link da pool: n/d",
    "Quero resposta em 4 blocos: leitura de momentum, risco de liquidez, gatilhos de entrada/saida para monitoramento e red flags de manipulacao.",
  ].join("\n");
}

async function requestMemecoinRadar(filterState, forceRefresh) {
  const params = new URLSearchParams({
    chain: filterState.chain,
    limit: "42",
    pinnedOnly: filterState.pinnedOnly ? "true" : "false",
    priority: filterState.priority,
    refresh: forceRefresh ? "true" : "false",
  });

  const response = await fetch(buildApiUrl(`/v1/meme-radar/notifications?${params.toString()}`), {
    method: "GET",
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error?.message;
    throw new Error(typeof message === "string" ? message : "Falha ao carregar MemeCoin Radar");
  }

  return payload?.data ?? null;
}

function setMemecoinCount(element, value) {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  element.textContent = String(value);
}

function renderMemecoinEmpty(listElement, message) {
  if (!(listElement instanceof HTMLElement)) {
    return;
  }

  const empty = document.createElement("div");
  empty.className = "memecoin-empty";
  empty.textContent = message;
  listElement.append(empty);
}

function createMemecoinCard(notification) {
  const card = document.createElement("article");
  card.className = "memecoin-card";
  card.dataset.priority = notification.priority;

  const top = document.createElement("div");
  top.className = "memecoin-card-top";

  const title = document.createElement("h5");
  title.textContent = `${notification.token.symbol} • ${notification.token.name}`;

  const chainPill = document.createElement("span");
  chainPill.className = "memecoin-card-chain";
  chainPill.textContent = formatMemeChainLabel(notification.chain);

  top.append(title, chainPill);

  const metrics = document.createElement("div");
  metrics.className = "memecoin-card-metrics";

  const scoreChip = document.createElement("span");
  scoreChip.className = "memecoin-chip";
  scoreChip.textContent = `Hype ${Math.round(notification.sentiment.hypeScore)}`;

  const confidenceChip = document.createElement("span");
  confidenceChip.className = "memecoin-chip";
  confidenceChip.textContent = `Conf ${Math.round(notification.sentiment.confidence)}`;

  const liquidityChip = document.createElement("span");
  liquidityChip.className = "memecoin-chip";
  liquidityChip.textContent = `Liq ${formatMemeMetricUsd(notification.metrics.liquidityUsd)}`;

  const priorityChip = document.createElement("span");
  priorityChip.className = "memecoin-chip";
  priorityChip.textContent = formatMemePriorityLabel(notification.priority);

  metrics.append(scoreChip, confidenceChip, liquidityChip, priorityChip);

  const summary = document.createElement("p");
  summary.className = "memecoin-card-summary";
  summary.textContent = notification.summary || notification.sentiment.oneLineSummary;

  const details = document.createElement("div");
  details.className = "memecoin-card-list";

  const catalystLine = document.createElement("div");
  const catalystLabel = document.createElement("strong");
  catalystLabel.textContent = "Catalisadores: ";
  const catalystText = document.createElement("span");
  catalystText.textContent = notification.catalysts.length > 0
    ? notification.catalysts.join(" • ")
    : "n/d";
  catalystLine.append(catalystLabel, catalystText);

  const riskLine = document.createElement("div");
  const riskLabel = document.createElement("strong");
  riskLabel.textContent = "Riscos: ";
  const riskText = document.createElement("span");
  riskText.textContent = notification.riskFlags.length > 0
    ? notification.riskFlags.join(" • ")
    : "n/d";
  riskLine.append(riskLabel, riskText);

  details.append(catalystLine, riskLine);

  const footer = document.createElement("div");
  footer.className = "memecoin-card-footer";

  const source = document.createElement("span");
  source.className = "memecoin-card-source";
  source.textContent = `${notification.sources.join(" + ")} • ${formatAirdropDate(notification.updatedAt)}`;

  const actions = document.createElement("div");
  actions.className = "memecoin-card-actions";

  const pinButton = document.createElement("button");
  pinButton.type = "button";
  pinButton.className = "memecoin-pin-button";
  pinButton.dataset.action = "toggle-pin";
  pinButton.dataset.notificationId = notification.id;
  pinButton.dataset.pinned = notification.pinned ? "true" : "false";
  pinButton.textContent = notification.pinned ? "Desfixar" : "Fixar";

  const chatButton = document.createElement("button");
  chatButton.type = "button";
  chatButton.className = "memecoin-chat-button";
  chatButton.dataset.action = "send-to-chat";
  chatButton.dataset.notificationId = notification.id;
  chatButton.textContent = "Levar ao chat";

  actions.append(pinButton, chatButton);

  if (notification.pairUrl) {
    const link = document.createElement("a");
    link.className = "memecoin-card-link";
    link.href = notification.pairUrl;
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    link.textContent = "Pool";
    actions.append(link);
  }

  footer.append(source, actions);
  card.append(top, metrics, summary, details, footer);

  return card;
}

function renderMemecoinBoard(notifications) {
  const listEntries = [
    ["critical", memecoinCriticalListElement, memecoinCountCriticalElement],
    ["high", memecoinHighListElement, memecoinCountHighElement],
    ["watch", memecoinWatchListElement, memecoinCountWatchElement],
  ];

  for (const [, listElement] of listEntries) {
    if (listElement instanceof HTMLElement) {
      listElement.innerHTML = "";
    }
  }

  for (const [priority, listElement, countElement] of listEntries) {
    const bucket = notifications.filter((notification) => notification.priority === priority);
    setMemecoinCount(countElement, bucket.length);

    if (!(listElement instanceof HTMLElement)) {
      continue;
    }

    if (bucket.length === 0) {
      renderMemecoinEmpty(listElement, "Sem sinais nesta faixa agora.");
      continue;
    }

    for (const notification of bucket) {
      listElement.append(createMemecoinCard(notification));
    }
  }
}

function renderMemecoinFromState() {
  if (!memecoinRadarPayload) {
    renderMemecoinBoard([]);
    setMemecoinSummary("Sem dados de MemeCoin Radar no momento.", "error");
    return;
  }

  const notifications = Array.isArray(memecoinRadarPayload.notifications)
    ? memecoinRadarPayload.notifications
    : [];
  const sources = Array.isArray(memecoinRadarPayload.sources)
    ? memecoinRadarPayload.sources
    : [];
  const healthySources = sources.filter((source) => source?.status === "ok").length;
  const fetchedAt = formatShortTime(memecoinRadarPayload.fetchedAt);
  const board = memecoinRadarPayload.board ?? {};

  setMemecoinSummary(
    `Fontes ${healthySources}/${sources.length} • total ${board.total ?? notifications.length} • fixados ${board.pinned ?? 0} • atualizado ${fetchedAt}`,
  );
  renderMemecoinBoard(notifications);
}

async function loadMemecoinRadar({ forceRefresh = false } = {}) {
  if (isMemecoinRadarLoading) {
    return;
  }

  isMemecoinRadarLoading = true;
  setMemecoinRefreshLoadingState(true);
  setMemecoinSummary("Atualizando MemeCoin Radar...", "");

  try {
    const filterState = getMemecoinFilterState();
    const payload = await requestMemecoinRadar(filterState, forceRefresh);

    if (!payload || !Array.isArray(payload.notifications)) {
      throw new Error("Resposta de MemeCoin Radar invalida");
    }

    memecoinRadarPayload = payload;
    renderMemecoinFromState();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar MemeCoin Radar";
    memecoinRadarPayload = null;
    renderMemecoinBoard([]);
    setMemecoinSummary(message, "error");
  } finally {
    isMemecoinRadarLoading = false;
    setMemecoinRefreshLoadingState(false);
  }
}

async function toggleMemecoinPinned(notificationId, currentPinned) {
  const response = await fetch(
    buildApiUrl(`/v1/meme-radar/notifications/${encodeURIComponent(notificationId)}/pin`),
    {
      body: JSON.stringify({
        pinned: !currentPinned,
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
  );

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error?.message;
    throw new Error(typeof message === "string" ? message : "Falha ao atualizar pin");
  }

  return payload?.data ?? null;
}

function startMemecoinAutoRefresh() {
  if (memecoinAutoRefreshTimer !== null) {
    window.clearInterval(memecoinAutoRefreshTimer);
    memecoinAutoRefreshTimer = null;
  }

  memecoinAutoRefreshTimer = window.setInterval(() => {
    void loadMemecoinRadar({
      forceRefresh: false,
    });
  }, 180000);
}

function stopMemecoinAutoRefresh() {
  if (memecoinAutoRefreshTimer === null) {
    return;
  }

  window.clearInterval(memecoinAutoRefreshTimer);
  memecoinAutoRefreshTimer = null;
}

function setupMemecoinRadarPanel() {
  if (
    !(memecoinCriticalListElement instanceof HTMLElement)
    || !(memecoinHighListElement instanceof HTMLElement)
    || !(memecoinWatchListElement instanceof HTMLElement)
  ) {
    return;
  }

  hydrateMemecoinPreferences();

  if (memecoinRefreshButton instanceof HTMLButtonElement) {
    memecoinRefreshButton.addEventListener("click", () => {
      void loadMemecoinRadar({
        forceRefresh: true,
      });
    });
  }

  if (memecoinFiltersForm instanceof HTMLFormElement) {
    memecoinFiltersForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveMemecoinPreferences();
      void loadMemecoinRadar({
        forceRefresh: false,
      });
    });
  }

  if (memecoinChainFilter instanceof HTMLSelectElement) {
    memecoinChainFilter.addEventListener("change", () => {
      saveMemecoinPreferences();
      void loadMemecoinRadar({
        forceRefresh: false,
      });
    });
  }

  if (memecoinPriorityFilter instanceof HTMLSelectElement) {
    memecoinPriorityFilter.addEventListener("change", () => {
      saveMemecoinPreferences();
      void loadMemecoinRadar({
        forceRefresh: false,
      });
    });
  }

  if (memecoinPinnedOnlyToggle instanceof HTMLInputElement) {
    memecoinPinnedOnlyToggle.addEventListener("change", () => {
      saveMemecoinPreferences();
      void loadMemecoinRadar({
        forceRefresh: false,
      });
    });
  }

  const handleListClick = (event) => {
    const target = event.target;
    const actionButton = target instanceof HTMLElement
      ? target.closest("button[data-action]")
      : null;

    if (!(actionButton instanceof HTMLButtonElement)) {
      return;
    }

    const action = actionButton.dataset.action;
    const notificationId = actionButton.dataset.notificationId ?? "";

    if (notificationId.length < 6) {
      return;
    }

    if (action === "toggle-pin") {
      const currentPinned = actionButton.dataset.pinned === "true";

      void (async () => {
        try {
          await toggleMemecoinPinned(notificationId, currentPinned);
          setStatus("", currentPinned ? "Sinal desfixado" : "Sinal fixado");
          void loadMemecoinRadar({
            forceRefresh: false,
          });
        } catch (error) {
          setStatus("error", error instanceof Error ? error.message : "Falha ao atualizar pin");
        }
      })();

      return;
    }

    if (action !== "send-to-chat") {
      return;
    }

    if (!(chatInput instanceof HTMLTextAreaElement) || !memecoinRadarPayload) {
      return;
    }

    const notifications = Array.isArray(memecoinRadarPayload.notifications)
      ? memecoinRadarPayload.notifications
      : [];
    const notification = notifications.find((item) => item?.id === notificationId);

    if (!notification) {
      return;
    }

    chatInput.value = buildMemecoinChatPrompt(notification);
    chatInput.focus();
    chatInput.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    setStatus("", "Prompt MemeCoin pronto");
  };

  memecoinCriticalListElement.addEventListener("click", handleListClick);
  memecoinHighListElement.addEventListener("click", handleListClick);
  memecoinWatchListElement.addEventListener("click", handleListClick);

  renderMemecoinBoard([]);
  startMemecoinAutoRefresh();
  void loadMemecoinRadar({
    forceRefresh: true,
  });
}

function normalizeMarketSearchText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildMarketNavigatorFavoriteKey(item) {
  const moduleName = typeof item?.module === "string" && item.module.length > 0
    ? item.module
    : "market";
  const itemId = typeof item?.id === "string" && item.id.length > 0
    ? item.id
    : (typeof item?.ticker === "string" ? item.ticker : "item");

  return `${moduleName}:${itemId}`.toLowerCase();
}

function hydrateMarketNavigatorFavorites() {
  try {
    const raw = localStorage.getItem(MARKET_NAVIGATOR_FAVORITES_STORAGE_KEY);

    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return;
    }

    marketNavigatorFavoriteKeys = new Set(
      parsed
        .filter((item) => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0),
    );
  } catch {
    marketNavigatorFavoriteKeys = new Set();
  }
}

function saveMarketNavigatorFavorites() {
  try {
    localStorage.setItem(
      MARKET_NAVIGATOR_FAVORITES_STORAGE_KEY,
      JSON.stringify([...marketNavigatorFavoriteKeys]),
    );
  } catch {
    // Ignore storage errors and keep favorite behavior in memory.
  }
}

function isMarketNavigatorFavorite(item) {
  return marketNavigatorFavoriteKeys.has(buildMarketNavigatorFavoriteKey(item));
}

function toggleMarketNavigatorFavorite(item) {
  const key = buildMarketNavigatorFavoriteKey(item);

  if (marketNavigatorFavoriteKeys.has(key)) {
    marketNavigatorFavoriteKeys.delete(key);
  } else {
    marketNavigatorFavoriteKeys.add(key);
  }

  saveMarketNavigatorFavorites();
}

function setMarketSearchFeedback(message) {
  if (!(marketSearchFeedbackElement instanceof HTMLElement)) {
    return;
  }

  marketSearchFeedbackElement.textContent = message;
}

function inferMarketRegionFromSymbol(symbol) {
  if (typeof symbol !== "string" || symbol.length === 0) {
    return "global";
  }

  const normalizedSymbol = symbol.toUpperCase();

  if (normalizedSymbol.includes(".SA")
    || /(BRL|MXN|CLP|COP|ARS|PEN)/.test(normalizedSymbol)) {
    return "latam";
  }

  if (/(EUR|GBP|CHF|FTSE|DAX|CAC|STOXX)/.test(normalizedSymbol)) {
    return "europe";
  }

  if (/(JPY|CNH|CNY|HKD|KRW|INR|N225|NIKKEI|ASX|SGD|THB)/.test(normalizedSymbol)) {
    return "asia";
  }

  if (/(AED|SAR|QAR|ILS|BHD|ZAR|EGP)/.test(normalizedSymbol)) {
    return "mea";
  }

  return "global";
}

function inferMarketRegionForItem(view, item) {
  if (view?.type === "news") {
    return "global";
  }

  if (view?.module === "b3" || view?.module === "fiis") {
    return "latam";
  }

  if (view?.module === "wall-street" || view?.module === "equities" || view?.module === "options") {
    return "americas";
  }

  if (view?.module === "forex") {
    if (view?.preset === "latam") {
      return "latam";
    }

    if (view?.preset === "europe") {
      return "europe";
    }

    if (view?.preset === "asia") {
      return "asia";
    }
  }

  if (view?.module === "futures" || view?.module === "crypto" || view?.module === "defi") {
    return "global";
  }

  if (view?.module === "etfs" && view?.preset !== "international") {
    return "americas";
  }

  const symbol = typeof item?.symbol === "string" && item.symbol.length > 0
    ? item.symbol
    : (typeof item?.ticker === "string" ? item.ticker : "");

  const inferredRegion = inferMarketRegionFromSymbol(symbol);

  if (inferredRegion !== "global") {
    return inferredRegion;
  }

  return "global";
}

function buildMarketNavigatorSearchText(item) {
  const chunks = [
    item?.id,
    item?.ticker,
    item?.symbol,
    item?.name,
    item?.assetId,
    item?.source,
    item?.tags,
    item?.viewLabel,
    item?.module,
  ]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join(" ");

  return normalizeMarketSearchText(chunks);
}

function createMarketNavigatorItem(input, view) {
  const moduleName = view?.type === "news"
    ? "news"
    : (typeof view?.module === "string" ? view.module : "market");
  const result = {
    ...input,
    module: moduleName,
    viewId: typeof view?.id === "string" ? view.id : "",
    viewLabel: typeof view?.label === "string" ? view.label : "Visao",
  };

  result.favoriteKey = buildMarketNavigatorFavoriteKey(result);
  result.region = inferMarketRegionForItem(view, result);
  result.searchText = buildMarketNavigatorSearchText(result);
  return result;
}

function fillMarketRegionFilterOptions() {
  if (!(marketRegionFilter instanceof HTMLSelectElement)) {
    return;
  }

  marketRegionFilter.innerHTML = "";

  for (const optionData of MARKET_NAVIGATOR_REGION_OPTIONS) {
    const option = document.createElement("option");
    option.value = optionData.id;
    option.textContent = optionData.label;
    marketRegionFilter.append(option);
  }

  marketRegionFilter.value = marketNavigatorRegionFilter;
}

function doesMarketNavigatorItemMatchQuery(item, query) {
  if (typeof query !== "string" || query.length === 0) {
    return true;
  }

  const searchableText = typeof item?.searchText === "string"
    ? item.searchText
    : buildMarketNavigatorSearchText(item);
  const tokens = query.split(" ").filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return true;
  }

  return tokens.every((token) => searchableText.includes(token));
}

function dedupeMarketNavigatorItems(items) {
  const map = new Map();

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const key = typeof item.favoriteKey === "string" && item.favoriteKey.length > 0
      ? item.favoriteKey
      : buildMarketNavigatorFavoriteKey(item);

    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return [...map.values()];
}

function getMarketNavigatorCachedItemsByViewId(viewId) {
  if (typeof viewId !== "string" || viewId.length === 0) {
    return [];
  }

  const cachedItems = marketNavigatorViewCache.get(viewId);
  return Array.isArray(cachedItems) ? cachedItems : [];
}

function getMarketNavigatorSearchPool(activeViewId) {
  const pool = [];

  for (const [viewId, viewItems] of marketNavigatorViewCache.entries()) {
    if (!Array.isArray(viewItems)) {
      continue;
    }

    if (viewId === activeViewId) {
      pool.unshift(...viewItems);
      continue;
    }

    pool.push(...viewItems);
  }

  if (Array.isArray(marketNavigatorSearchRemoteItems) && marketNavigatorSearchRemoteItems.length > 0) {
    pool.push(...marketNavigatorSearchRemoteItems);
  }

  return dedupeMarketNavigatorItems(pool);
}

function applyMarketNavigatorFilters(items, options = {}) {
  const searchQuery = normalizeMarketSearchText(marketNavigatorSearchQuery);
  const regionFilter = marketNavigatorRegionFilter;
  const favoritesOnly = marketNavigatorFavoritesOnly;
  const forceSearch = options.forceSearch === true;

  return items
    .filter((item) => {
      if (regionFilter === "all") {
        return true;
      }

      const itemRegion = typeof item?.region === "string" ? item.region : "global";
      return itemRegion === regionFilter;
    })
    .filter((item) => {
      if (!favoritesOnly) {
        return true;
      }

      return isMarketNavigatorFavorite(item);
    })
    .filter((item) => {
      if (!forceSearch && searchQuery.length === 0) {
        return true;
      }

      return doesMarketNavigatorItemMatchQuery(item, searchQuery);
    });
}

function queueMarketNavigatorSearchProbe() {
  const trimmedQuery = marketNavigatorSearchQuery.trim();
  marketNavigatorSearchToken += 1;
  const searchToken = marketNavigatorSearchToken;

  if (marketNavigatorSearchDebounceTimer !== null) {
    window.clearTimeout(marketNavigatorSearchDebounceTimer);
    marketNavigatorSearchDebounceTimer = null;
  }

  if (trimmedQuery.length < 2) {
    marketNavigatorSearchRemoteItems = [];
    marketNavigatorSearchInFlight = false;
    renderMarketNavigatorFromState();
    return;
  }

  marketNavigatorSearchInFlight = true;
  renderMarketNavigatorFromState();

  marketNavigatorSearchDebounceTimer = window.setTimeout(() => {
    marketNavigatorSearchDebounceTimer = null;

    void probeMarketNavigatorSearch(trimmedQuery, searchToken)
      .catch(() => {
        if (searchToken !== marketNavigatorSearchToken) {
          return;
        }

        marketNavigatorSearchRemoteItems = [];
        marketNavigatorSearchInFlight = false;
      })
      .finally(() => {
        if (searchToken !== marketNavigatorSearchToken) {
          return;
        }

        renderMarketNavigatorFromState();
      });
  }, 420);
}

function renderMarketNavigatorFromState() {
  const activeView = getActiveMarketNavigatorView();

  if (!activeView) {
    renderMarketNavigatorFeed([], null);
    setMarketNavigatorStatus("Sem dados", "error");
    setMarketNavigatorMeta("Selecione uma visao para carregar ativos.");
    setMarketSearchFeedback("");
    return;
  }

  if (marketActivePresetTitleElement instanceof HTMLElement) {
    marketActivePresetTitleElement.textContent = activeView.label;
  }

  const normalizedQuery = normalizeMarketSearchText(marketNavigatorSearchQuery);
  const isSearchMode = normalizedQuery.length > 0;
  const baseItems = getMarketNavigatorCachedItemsByViewId(activeView.id);
  const sourceItems = isSearchMode ? getMarketNavigatorSearchPool(activeView.id) : baseItems;
  const filteredItems = applyMarketNavigatorFilters(sourceItems, {
    forceSearch: isSearchMode,
  });
  const visibleItems = filteredItems.slice(0, isSearchMode ? 24 : 16);

  renderMarketNavigatorFeed(visibleItems, activeView);

  const viewStats = marketNavigatorViewStats.get(activeView.id);
  const baseStatusLabel = typeof viewStats?.statusLabel === "string"
    ? viewStats.statusLabel
    : (baseItems.length > 0 ? "Carregado" : "Sem dados");
  const baseStatusMode = typeof viewStats?.statusMode === "string"
    ? viewStats.statusMode
    : (baseItems.length > 0 ? "" : "error");
  const baseMeta = typeof viewStats?.meta === "string" && viewStats.meta.length > 0
    ? viewStats.meta
    : "Selecione uma visao para carregar ativos.";
  const regionSuffix = marketNavigatorRegionFilter !== "all"
    ? ` • regiao ${formatMarketNavigatorRegionLabel(marketNavigatorRegionFilter)}`
    : "";
  const favoritesSuffix = marketNavigatorFavoritesOnly ? " • somente favoritos" : "";

  if (isSearchMode) {
    const queryLabel = marketNavigatorSearchQuery.trim();
    const remoteCount = marketNavigatorSearchRemoteItems.length;
    const statusLabel = marketNavigatorSearchInFlight
      ? "Buscando"
      : (filteredItems.length > 0 ? "Busca ativa" : "Sem resultados");
    const statusMode = marketNavigatorSearchInFlight
      ? "loading"
      : (filteredItems.length > 0 ? "" : "error");

    setMarketNavigatorStatus(statusLabel, statusMode);
    setMarketNavigatorMeta(
      `Busca "${queryLabel}" • exibindo ${visibleItems.length}/${filteredItems.length} • universo ${sourceItems.length} • remotos ${remoteCount}${regionSuffix}${favoritesSuffix}`,
    );

    if (marketNavigatorSearchInFlight) {
      setMarketSearchFeedback(`Buscando "${queryLabel}" em fontes locais e remotas...`);
    } else if (filteredItems.length > 0) {
      setMarketSearchFeedback(`${filteredItems.length} resultado(s) para "${queryLabel}".`);
    } else {
      setMarketSearchFeedback(`Nenhum resultado para "${queryLabel}".`);
    }

    return;
  }

  setMarketNavigatorStatus(baseStatusLabel, baseStatusMode);

  if (marketNavigatorRegionFilter !== "all" || marketNavigatorFavoritesOnly) {
    setMarketNavigatorMeta(
      `${baseMeta} • exibindo ${visibleItems.length}/${baseItems.length}${regionSuffix}${favoritesSuffix}`,
    );
  } else {
    setMarketNavigatorMeta(baseMeta);
  }

  setMarketSearchFeedback("");
}

function formatMarketNavigatorRegionLabel(regionId) {
  const option = MARKET_NAVIGATOR_REGION_OPTIONS.find((item) => item.id === regionId);
  return option?.label ?? "Regiao";
}

function buildMarketNavigatorProbeItem(moduleName, sourceData, fallbackName, fallbackTicker) {
  if (!sourceData || typeof sourceData !== "object") {
    return null;
  }

  const marketData = sourceData.market && typeof sourceData.market === "object" ? sourceData.market : null;
  const id = typeof sourceData.assetId === "string"
    ? sourceData.assetId
    : typeof sourceData.pair === "string"
      ? sourceData.pair
      : typeof sourceData.symbol === "string"
        ? sourceData.symbol
        : typeof sourceData.underlying === "string"
          ? sourceData.underlying
          : fallbackTicker;
  const ticker = typeof sourceData.symbol === "string"
    ? sourceData.symbol
    : typeof sourceData.pair === "string"
      ? sourceData.pair
      : typeof sourceData.underlying === "string"
        ? sourceData.underlying
        : fallbackTicker;
  const price = pickFirstFiniteNumber([
    sourceData.price,
    sourceData.rate,
    sourceData.priceUsd,
    sourceData.spotPrice,
    marketData?.lastPrice,
    sourceData.yieldPercent,
  ]);

  if (price === null) {
    return null;
  }

  const changePercent = pickFirstFiniteNumber([
    sourceData.changePercent24h,
    sourceData.underlyingChangePercent24h,
    marketData?.changePercent24h,
  ]);
  const currency = normalizeMarketNavigatorCurrency(sourceData.currency ?? sourceData.quoteCurrency ?? "")
    || (moduleName === "crypto" || moduleName === "defi" || moduleName === "futures" || moduleName === "options"
      ? "usd"
      : "");
  const details = [];

  if (typeof sourceData.provider === "string" && sourceData.provider.length > 0) {
    details.push(sourceData.provider);
  }

  if (typeof sourceData.optionsBias === "string" && sourceData.optionsBias.length > 0) {
    details.push(`bias ${sourceData.optionsBias}`);
  }

  if (typeof sourceData.impliedVolatility === "number" && Number.isFinite(sourceData.impliedVolatility)) {
    details.push(`iv ${(sourceData.impliedVolatility * 100).toFixed(2)}%`);
  }

  if (typeof sourceData.yieldPercent === "number" && Number.isFinite(sourceData.yieldPercent)) {
    details.push(`yield ${sourceData.yieldPercent.toFixed(2)}%`);
  }

  if (marketData && typeof marketData.openInterest === "number" && Number.isFinite(marketData.openInterest)) {
    details.push(`oi ${marketData.openInterest.toFixed(0)}`);
  }

  return createMarketNavigatorItem(
    {
      assetId: typeof sourceData.assetId === "string" ? sourceData.assetId : "",
      changePercent,
      currency,
      extraLabel: details.join(" • "),
      id,
      kind: "overview",
      name: typeof sourceData.name === "string" && sourceData.name.length > 0 ? sourceData.name : fallbackName,
      price,
      symbol: ticker,
      ticker,
    },
    {
      id: `search-${moduleName}`,
      label: `Busca ${moduleName}`,
      module: moduleName,
    },
  );
}

async function probeMarketNavigatorSearch(query, token) {
  const normalizedQuery = query.trim();

  if (normalizedQuery.length < 2) {
    marketNavigatorSearchRemoteItems = [];
    marketNavigatorSearchInFlight = false;
    return;
  }

  const queryLower = normalizedQuery.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const queryUpper = normalizedQuery.toUpperCase();
  const queryPair = queryUpper.replace(/[^A-Z]/g, "");
  const querySymbol = queryUpper.replace(/[^A-Z0-9.=^/-]/g, "");
  const requests = [];

  const pushProbeRequest = (url, mapper) => {
    requests.push(
      fetch(buildApiUrl(url), {
        method: "GET",
      })
        .then(async (response) => {
          if (!response.ok) {
            return null;
          }

          const payload = await response.json();
          return mapper(payload?.data ?? null);
        })
        .catch(() => null),
    );
  };

  if (queryLower.length >= 2) {
    pushProbeRequest(`/v1/crypto/spot-price?assetId=${encodeURIComponent(queryLower)}&currency=usd`, (data) =>
      buildMarketNavigatorProbeItem("crypto", data, "Crypto", queryUpper)
    );
    pushProbeRequest(`/v1/defi/spot-rate?assetId=${encodeURIComponent(queryLower)}`, (data) =>
      buildMarketNavigatorProbeItem("defi", data, "DeFi", queryUpper)
    );
  }

  if (queryPair.length === 6) {
    pushProbeRequest(`/v1/forex/spot-rate?pair=${encodeURIComponent(queryPair)}`, (data) =>
      buildMarketNavigatorProbeItem("forex", data, "Forex", queryPair)
    );
  }

  if (querySymbol.length >= 1) {
    pushProbeRequest(`/v1/futures/snapshot?symbol=${encodeURIComponent(querySymbol)}`, (data) =>
      buildMarketNavigatorProbeItem("futures", data, "Futuros", querySymbol)
    );
    pushProbeRequest(`/v1/options/snapshot?underlying=${encodeURIComponent(querySymbol)}&daysToExpiry=30`, (data) =>
      buildMarketNavigatorProbeItem("options", data, "Opcoes", querySymbol)
    );
    pushProbeRequest(`/v1/equities/snapshot?symbol=${encodeURIComponent(querySymbol)}`, (data) =>
      buildMarketNavigatorProbeItem("equities", data, "Acoes", querySymbol)
    );
    pushProbeRequest(`/v1/wall-street/snapshot?symbol=${encodeURIComponent(querySymbol)}`, (data) =>
      buildMarketNavigatorProbeItem("wall-street", data, "Wall Street", querySymbol)
    );
    pushProbeRequest(`/v1/etfs/snapshot?symbol=${encodeURIComponent(querySymbol)}`, (data) =>
      buildMarketNavigatorProbeItem("etfs", data, "ETF", querySymbol)
    );
    pushProbeRequest(`/v1/b3/snapshot?symbol=${encodeURIComponent(querySymbol)}`, (data) =>
      buildMarketNavigatorProbeItem("b3", data, "B3", querySymbol)
    );
    pushProbeRequest(`/v1/fiis/snapshot?symbol=${encodeURIComponent(querySymbol)}`, (data) =>
      buildMarketNavigatorProbeItem("fiis", data, "FII", querySymbol)
    );
    pushProbeRequest(`/v1/commodities/snapshot?symbol=${encodeURIComponent(querySymbol)}`, (data) =>
      buildMarketNavigatorProbeItem("commodities", data, "Commodity", querySymbol)
    );
    pushProbeRequest(`/v1/fixed-income/snapshot?symbol=${encodeURIComponent(querySymbol)}`, (data) =>
      buildMarketNavigatorProbeItem("fixed-income", data, "Renda fixa", querySymbol)
    );
    pushProbeRequest(`/v1/macro-rates/snapshot?symbol=${encodeURIComponent(querySymbol)}`, (data) =>
      buildMarketNavigatorProbeItem("macro-rates", data, "Macro rates", querySymbol)
    );
  }

  const results = await Promise.all(requests);

  if (token !== marketNavigatorSearchToken) {
    return;
  }

  marketNavigatorSearchRemoteItems = dedupeMarketNavigatorItems(results.filter((item) => item !== null));
  marketNavigatorSearchInFlight = false;
}

function getMarketNavigatorScopeById(scopeId) {
  return MARKET_NAVIGATOR_SCOPE_OPTIONS.find((scope) => scope.id === scopeId)
    ?? MARKET_NAVIGATOR_SCOPE_OPTIONS[0]
    ?? null;
}

function getMarketNavigatorCategoryById(categoryId) {
  return MARKET_NAVIGATOR_CATEGORY_DEFINITIONS.find((category) => category.id === categoryId)
    ?? MARKET_NAVIGATOR_CATEGORY_DEFINITIONS[0]
    ?? null;
}

function getMarketNavigatorViewById(category, viewId) {
  if (!category || !Array.isArray(category.views) || category.views.length === 0) {
    return null;
  }

  return category.views.find((view) => view.id === viewId) ?? category.views[0] ?? null;
}

function getActiveMarketNavigatorCategory() {
  return getMarketNavigatorCategoryById(activeMarketCategoryId);
}

function getActiveMarketNavigatorView() {
  const category = getActiveMarketNavigatorCategory();
  return getMarketNavigatorViewById(category, activeMarketViewId);
}

function setMarketNavigatorStatus(label, mode = "") {
  if (!(marketFeedStatusElement instanceof HTMLElement)) {
    return;
  }

  marketFeedStatusElement.textContent = label;

  if (mode.length > 0) {
    marketFeedStatusElement.setAttribute("data-mode", mode);
  } else {
    marketFeedStatusElement.removeAttribute("data-mode");
  }
}

function setMarketNavigatorMeta(message) {
  if (!(marketFeedMetaElement instanceof HTMLElement)) {
    return;
  }

  marketFeedMetaElement.textContent = message;
}

function setMarketNavigatorLoadingState(isLoading) {
  if (!(marketNavigatorRefreshButton instanceof HTMLButtonElement)) {
    return;
  }

  marketNavigatorRefreshButton.disabled = isLoading;
  marketNavigatorRefreshButton.textContent = isLoading ? "Atualizando..." : "Atualizar painel";
}

function pickFirstFiniteNumber(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizeMarketNavigatorCurrency(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

function formatMarketNavigatorSentiment(value) {
  if (value === "positive") {
    return "sentimento positivo";
  }

  if (value === "negative") {
    return "sentimento negativo";
  }

  return "sentimento neutro";
}

function buildMarketNavigatorUrl(view) {
  const limit = typeof view?.limit === "number" && Number.isFinite(view.limit)
    ? Math.max(1, Math.min(20, Math.floor(view.limit)))
    : 8;

  if (view?.type === "news") {
    const assetId = typeof view.assetId === "string" && view.assetId.length > 0
      ? view.assetId
      : "bitcoin";
    const params = new URLSearchParams({
      assetId,
      limit: String(limit),
    });

    return buildApiUrl(`/v1/crypto/news-intelligence?${params.toString()}`);
  }

  const moduleName = typeof view?.module === "string" ? view.module : "crypto";
  const params = new URLSearchParams({
    limit: String(limit),
  });

  if (typeof view?.preset === "string" && view.preset.length > 0) {
    params.set("preset", view.preset);
  }

  if (typeof view?.daysToExpiry === "number" && Number.isFinite(view.daysToExpiry)) {
    params.set("daysToExpiry", String(Math.max(1, Math.min(365, Math.floor(view.daysToExpiry)))));
  }

  return buildApiUrl(`/v1/${moduleName}/market-overview?${params.toString()}`);
}

async function requestMarketNavigatorPayload(view) {
  const response = await fetch(buildMarketNavigatorUrl(view), {
    method: "GET",
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error?.message;
    throw new Error(typeof message === "string" ? message : "Falha ao carregar visao de mercado");
  }

  return payload?.data ?? null;
}

function normalizeOverviewItems(view, data) {
  const normalizedItems = [];

  if (Array.isArray(data?.assets)) {
    for (const asset of data.assets) {
      if (!asset || typeof asset !== "object") {
        continue;
      }

      const price = pickFirstFiniteNumber([asset.priceUsd]);

      if (price === null) {
        continue;
      }

      normalizedItems.push(createMarketNavigatorItem({
        assetId: typeof asset.assetId === "string" ? asset.assetId : "",
        changePercent: pickFirstFiniteNumber([asset.changePercent24h]),
        currency: "usd",
        extraLabel:
          typeof asset.marketCapUsd === "number"
            ? `cap ${formatCompactUsd(asset.marketCapUsd)}`
            : "cap n/d",
        id: typeof asset.assetId === "string" ? asset.assetId : `${asset.symbol ?? "asset"}-${normalizedItems.length}`,
        kind: "overview",
        name: typeof asset.name === "string" ? asset.name : (typeof asset.symbol === "string" ? asset.symbol : "Ativo"),
        price,
        symbol: typeof asset.symbol === "string" ? asset.symbol : "",
        ticker: typeof asset.symbol === "string" ? asset.symbol : (typeof asset.assetId === "string" ? asset.assetId : "ATIVO"),
      }, view));
    }
  }

  const bucket = [];

  if (Array.isArray(data?.quotes)) {
    bucket.push(...data.quotes);
  }

  if (Array.isArray(data?.snapshots)) {
    bucket.push(...data.snapshots);
  }

  for (const entry of bucket) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    if ("status" in entry && entry.status !== "ok") {
      continue;
    }

    const source = entry.quote && typeof entry.quote === "object"
      ? entry.quote
      : entry.snapshot && typeof entry.snapshot === "object"
        ? entry.snapshot
        : entry;

    const marketDetails = source?.market && typeof source.market === "object" ? source.market : null;
    const itemId = typeof entry.assetId === "string"
      ? entry.assetId
      : typeof entry.pair === "string"
        ? entry.pair
        : typeof entry.symbol === "string"
          ? entry.symbol
          : typeof entry.underlying === "string"
            ? entry.underlying
            : typeof source.assetId === "string"
              ? source.assetId
              : typeof source.pair === "string"
                ? source.pair
                : typeof source.symbol === "string"
                  ? source.symbol
                  : typeof source.underlying === "string"
                    ? source.underlying
                    : "";

    if (itemId.length === 0) {
      continue;
    }

    const price = pickFirstFiniteNumber([
      source.priceUsd,
      source.price,
      source.rate,
      source.spotPrice,
      marketDetails?.lastPrice,
      source.yieldPercent,
    ]);

    if (price === null) {
      continue;
    }

    const ticker = typeof source.symbol === "string"
      ? source.symbol
      : typeof source.pair === "string"
        ? source.pair
        : typeof source.underlying === "string"
          ? source.underlying
          : itemId;
    const assetId = typeof source.assetId === "string"
      ? source.assetId
      : (typeof entry.assetId === "string" ? entry.assetId : "");
    const changePercent = pickFirstFiniteNumber([
      source.changePercent24h,
      source.underlyingChangePercent24h,
      marketDetails?.changePercent24h,
    ]);
    const yieldPercent = pickFirstFiniteNumber([source.yieldPercent]);
    const impliedVolatility = pickFirstFiniteNumber([source.impliedVolatility]);
    const currencyFromData = normalizeMarketNavigatorCurrency(source.currency ?? source.quoteCurrency ?? "");
    const fallbackCurrency = view?.module === "crypto"
      || view?.module === "defi"
      || view?.module === "futures"
      || view?.module === "options"
      ? "usd"
      : "";
    const currency = currencyFromData.length > 0 ? currencyFromData : fallbackCurrency;
    const extraDetails = [];

    if (yieldPercent !== null) {
      extraDetails.push(`yield ${yieldPercent.toFixed(2)}%`);
    }

    if (impliedVolatility !== null) {
      extraDetails.push(`iv ${(impliedVolatility * 100).toFixed(2)}%`);
    }

    if (typeof source.optionsBias === "string" && source.optionsBias.length > 0) {
      extraDetails.push(`bias ${source.optionsBias}`);
    }

    if (typeof source.durationBucket === "string" && source.durationBucket.length > 0) {
      extraDetails.push(`dur ${source.durationBucket}`);
    }

    if (typeof source.rateBucket === "string" && source.rateBucket.length > 0) {
      extraDetails.push(`bucket ${source.rateBucket}`);
    }

    if (typeof source.marketState === "string" && source.marketState.length > 0) {
      extraDetails.push(`estado ${source.marketState.toLowerCase()}`);
    }

    if (marketDetails && typeof marketDetails.openInterest === "number" && Number.isFinite(marketDetails.openInterest)) {
      extraDetails.push(`oi ${marketDetails.openInterest.toFixed(0)}`);
    }

    normalizedItems.push(createMarketNavigatorItem({
      assetId,
      changePercent,
      currency,
      extraLabel: extraDetails.join(" • "),
      id: itemId,
      kind: "overview",
      name: typeof source.name === "string" && source.name.length > 0 ? source.name : ticker,
      price,
      symbol: ticker,
      ticker,
    }, view));
  }

  return normalizedItems.slice(0, 16);
}

function normalizeNewsItems(view, data) {
  if (!Array.isArray(data?.items)) {
    return [];
  }

  return data.items
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const relevanceScore = typeof item.relevanceScore === "number" ? item.relevanceScore : null;
      const impactScore = typeof item.impactScore === "number" ? item.impactScore : null;
      const sentimentLabel = formatMarketNavigatorSentiment(item.sentiment);
      const tags = Array.isArray(item.tags) ? item.tags.slice(0, 4).join(" • ") : "";

      return createMarketNavigatorItem({
        assetId: typeof data.assetId === "string" ? data.assetId : (typeof view.assetId === "string" ? view.assetId : ""),
        changePercent: null,
        currency: "",
        extraLabel: [
          impactScore !== null ? `impacto ${impactScore.toFixed(1)}` : "impacto n/d",
          relevanceScore !== null ? `relevancia ${relevanceScore.toFixed(1)}` : "relevancia n/d",
          sentimentLabel,
        ].join(" • "),
        id: typeof item.id === "string" && item.id.length > 0 ? item.id : `${view.id}-news-${index}`,
        kind: "news",
        name: typeof item.title === "string" && item.title.length > 0 ? item.title : "Noticia sem titulo",
        price: null,
        publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : "",
        source: typeof item.source === "string" ? item.source : "Fonte n/d",
        summary: typeof item.summary === "string" ? item.summary : "",
        symbol: "",
        tags,
        ticker: typeof item.source === "string" ? item.source : "NEWS",
        url: typeof item.url === "string" ? item.url : "",
      }, view);
    })
    .slice(0, 12);
}

function formatMarketNavigatorPrice(item) {
  if (typeof item?.price !== "number" || Number.isNaN(item.price)) {
    return "n/d";
  }

  if (typeof item.extraLabel === "string" && item.extraLabel.includes("yield ")) {
    return `${item.price.toFixed(2)}%`;
  }

  const currency = typeof item.currency === "string" && item.currency.length > 0
    ? item.currency
    : "usd";

  return formatPrice(item.price, currency);
}

function resolveChartTargetFromMarketItem(item) {
  if (!(chartAssetSelect instanceof HTMLSelectElement)) {
    return null;
  }

  const hasAssetOption = (assetId) => {
    for (const option of chartAssetSelect.options) {
      if (option.value === assetId) {
        return true;
      }
    }

    return false;
  };

  if (typeof item.assetId === "string" && item.assetId.length > 0 && hasAssetOption(item.assetId)) {
    return {
      assetId: item.assetId,
      symbol: ASSET_TO_TERMINAL_SYMBOL[item.assetId] ?? "",
    };
  }

  if (typeof item.id === "string" && item.id.length > 0 && hasAssetOption(item.id)) {
    return {
      assetId: item.id,
      symbol: ASSET_TO_TERMINAL_SYMBOL[item.id] ?? "",
    };
  }

  const normalizedSymbol = typeof item.symbol === "string" ? sanitizeTerminalSymbol(item.symbol) : "";

  if (normalizedSymbol.length > 0) {
    const watchItem = TERMINAL_WATCHLIST.find((candidate) => {
      if (candidate.symbol === normalizedSymbol) {
        return true;
      }

      if (`${candidate.symbol.replace(/USDT$/, "")}` === normalizedSymbol) {
        return true;
      }

      return false;
    });

    if (watchItem) {
      return {
        assetId: watchItem.assetId,
        symbol: watchItem.symbol,
      };
    }
  }

  return null;
}

function openMarketItemInChart(item) {
  if (!(chartAssetSelect instanceof HTMLSelectElement)) {
    return false;
  }

  const target = resolveChartTargetFromMarketItem(item);

  if (!target) {
    return false;
  }

  chartAssetSelect.value = target.assetId;

  if (chartSymbolInput instanceof HTMLInputElement && target.symbol.length > 0) {
    chartSymbolInput.value = mapSymbolToExchange(target.symbol, getSelectedTerminalExchange());
  }

  renderWatchlist();
  chartHasInitialFit = false;
  void loadChart();
  void refreshWatchlistMarket({
    silent: true,
  });
  scheduleTradingViewRefresh();
  saveChartPreferences();
  return true;
}

function sendMarketItemToChat(item, view) {
  if (!(chatInput instanceof HTMLTextAreaElement)) {
    return;
  }

  const viewLabel = typeof item?.viewLabel === "string" && item.viewLabel.length > 0
    ? item.viewLabel
    : (view?.label ?? "visao de mercado");

  if (item.kind === "news") {
    chatInput.value = [
      `Analise esta noticia para ${item.assetId || "cripto"} em formato operacional:`,
      `Titulo: ${item.name}`,
      `Fonte: ${item.source || "n/d"}`,
      `Resumo: ${item.summary || "n/d"}`,
      `Contexto: ${item.extraLabel || "n/d"}`,
      item.url ? `Link: ${item.url}` : "Link: n/d",
      "Quero impacto no preco, vies (bull/bear/neutral), niveis relevantes e plano de risco em 4 passos.",
    ].join("\n");
  } else {
    chatInput.value = [
      `Monte uma leitura profissional para ${item.ticker} (${viewLabel}).`,
      `Nome: ${item.name}`,
      `Preco atual: ${formatMarketNavigatorPrice(item)}`,
      `Variacao 24h: ${formatPercent(item.changePercent)}`,
      `Contexto adicional: ${item.extraLabel || "n/d"}`,
      "Quero: regime atual, suporte/resistencia, gatilhos de entrada/saida, invalidacao e gestao de risco.",
    ].join("\n");
  }

  chatInput.focus();
  chatInput.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
  setStatus("", "Insight pronto no chat");
}

function renderMarketNavigatorScopes() {
  if (!(marketScopeListElement instanceof HTMLElement)) {
    return;
  }

  marketScopeListElement.innerHTML = "";

  for (const scope of MARKET_NAVIGATOR_SCOPE_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "market-scope-button";
    button.dataset.scope = scope.id;

    if (scope.id === activeMarketScopeId) {
      button.classList.add("is-active");
    }

    button.innerHTML = `<span>${escapeHtml(scope.label)}<small>${escapeHtml(scope.description)}</small></span><span>›</span>`;
    marketScopeListElement.append(button);
  }
}

function renderMarketNavigatorCategories() {
  if (!(marketCategoryListElement instanceof HTMLElement)) {
    return;
  }

  marketCategoryListElement.innerHTML = "";

  for (const category of MARKET_NAVIGATOR_CATEGORY_DEFINITIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "market-category-button";
    button.dataset.category = category.id;
    button.textContent = category.label;

    if (category.id === activeMarketCategoryId) {
      button.classList.add("is-active");
    }

    marketCategoryListElement.append(button);
  }
}

function renderMarketNavigatorViews() {
  const category = getActiveMarketNavigatorCategory();

  if (!(marketPresetListElement instanceof HTMLElement) || !category) {
    return;
  }

  if (marketActiveCategoryTitleElement instanceof HTMLElement) {
    marketActiveCategoryTitleElement.textContent = category.label;
  }

  const activeScope = getMarketNavigatorScopeById(activeMarketScopeId);

  if (marketNavigatorDescriptionElement instanceof HTMLElement) {
    const scopeLabel = activeScope ? `Escopo ${activeScope.label.toLowerCase()}` : "Escopo global";
    marketNavigatorDescriptionElement.textContent = `${category.description} ${scopeLabel}.`;
  }

  marketPresetListElement.innerHTML = "";
  const selectedView = getMarketNavigatorViewById(category, activeMarketViewId);

  if (selectedView) {
    activeMarketViewId = selectedView.id;
  }

  for (const view of category.views) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "market-preset-button";
    button.dataset.view = view.id;

    if (view.id === activeMarketViewId) {
      button.classList.add("is-active");
    }

    const sourceLabel = view.type === "news" ? "Inteligencia de noticias" : `Fonte /v1/${view.module}`;
    button.innerHTML = `<span>${escapeHtml(view.label)}<small>${escapeHtml(sourceLabel)}</small></span><span>›</span>`;
    marketPresetListElement.append(button);
  }
}

function renderMarketNavigatorFeed(items, view) {
  if (!(marketFeedListElement instanceof HTMLElement)) {
    return;
  }

  activeMarketNavigatorItems = items;
  marketFeedListElement.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "airdrop-empty";
    const hasSearch = normalizeMarketSearchText(marketNavigatorSearchQuery).length > 0;
    const hasSecondaryFilters = marketNavigatorRegionFilter !== "all" || marketNavigatorFavoritesOnly;

    if (hasSearch) {
      empty.textContent = "Nenhum resultado encontrado para a busca atual.";
    } else if (hasSecondaryFilters) {
      empty.textContent = "Nenhum ativo atende aos filtros selecionados.";
    } else {
      empty.textContent = "Sem ativos disponiveis para esta visao no momento.";
    }

    marketFeedListElement.append(empty);
    return;
  }

  for (const [index, item] of items.entries()) {
    const card = document.createElement("article");
    card.className = "market-feed-card";

    const head = document.createElement("div");
    head.className = "market-feed-card-head";

    const identity = document.createElement("div");
    const ticker = document.createElement("strong");
    ticker.textContent = item.ticker;
    const name = document.createElement("span");
    name.textContent = item.name;

    identity.append(ticker, name);

    const pricing = document.createElement("div");
    const price = document.createElement("span");
    price.className = "market-feed-price";
    price.textContent = formatMarketNavigatorPrice(item);

    const change = document.createElement("span");
    change.className = "market-feed-change";

    if (typeof item.changePercent === "number" && Number.isFinite(item.changePercent)) {
      change.textContent = formatPercent(item.changePercent);

      if (item.changePercent > 0) {
        change.classList.add("is-up");
      }

      if (item.changePercent < 0) {
        change.classList.add("is-down");
      }
    } else {
      change.textContent = "n/d";
    }

    pricing.append(price, change);
    head.append(identity, pricing);

    const extra = document.createElement("p");
    extra.className = "market-feed-extra";
    const originLabel =
      marketNavigatorSearchQuery.length > 0
      && typeof item.viewLabel === "string"
      && item.viewLabel.length > 0
      && item.viewLabel !== view?.label
        ? `origem ${item.viewLabel.toLowerCase()} • `
        : "";
    extra.textContent = `${originLabel}${item.extraLabel || "Sem metrica adicional para esta visao."}`;

    const actions = document.createElement("div");
    actions.className = "market-feed-actions";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "market-open-button";
    openButton.dataset.action = "open-chart";
    openButton.dataset.index = String(index);
    openButton.textContent = "Abrir no chart";

    if (!resolveChartTargetFromMarketItem(item)) {
      openButton.disabled = true;
      openButton.textContent = "Chart indisponivel";
    }

    const chatButton = document.createElement("button");
    chatButton.type = "button";
    chatButton.className = "market-chat-button";
    chatButton.dataset.action = "send-chat";
    chatButton.dataset.index = String(index);
    chatButton.textContent = "Levar ao chat";

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "market-favorite-button";
    favoriteButton.dataset.action = "toggle-favorite";
    favoriteButton.dataset.index = String(index);

    if (isMarketNavigatorFavorite(item)) {
      favoriteButton.classList.add("is-active");
      favoriteButton.textContent = "Favorito";
    } else {
      favoriteButton.textContent = "Favoritar";
    }

    actions.append(openButton, chatButton, favoriteButton);

    if (item.kind === "news" && typeof item.url === "string" && item.url.length > 0) {
      const newsLink = document.createElement("a");
      newsLink.href = item.url;
      newsLink.rel = "noopener noreferrer";
      newsLink.target = "_blank";
      newsLink.className = "market-chat-button";
      newsLink.textContent = "Abrir fonte";
      actions.append(newsLink);
    }

    card.append(head, extra, actions);
    marketFeedListElement.append(card);
  }
}

function renderMarketNavigatorPayload(view, payloadData) {
  if (!view || typeof view.id !== "string" || view.id.length === 0) {
    return;
  }

  if (!payloadData || typeof payloadData !== "object") {
    marketNavigatorViewCache.set(view.id, []);
    marketNavigatorViewStats.set(view.id, {
      meta: "Nao foi possivel interpretar a resposta da API para esta visao.",
      statusLabel: "Erro",
      statusMode: "error",
    });
    renderMarketNavigatorFromState();
    return;
  }

  if (view.type === "news") {
    const newsItems = normalizeNewsItems(view, payloadData);
    const summary = payloadData.summary ?? {};
    const fetchedAt = formatShortTime(payloadData.fetchedAt);

    marketNavigatorViewCache.set(view.id, newsItems);
    marketNavigatorViewStats.set(view.id, {
      meta: `Cobertura ${summary.sourcesHealthy ?? 0}/${summary.totalSources ?? 0} • impacto medio ${summary.averageImpactScore ?? 0} • relevancia media ${summary.averageRelevanceScore ?? 0} • atualizado ${fetchedAt}`,
      statusLabel: newsItems.length > 0 ? "Noticias" : "Sem dados",
      statusMode: newsItems.length > 0 ? "" : "error",
    });
    renderMarketNavigatorFromState();
    return;
  }

  const normalizedItems = normalizeOverviewItems(view, payloadData);
  const successCount = typeof payloadData.successCount === "number"
    ? payloadData.successCount
    : normalizedItems.length;
  const failureCount = typeof payloadData.failureCount === "number" ? payloadData.failureCount : 0;
  const fetchedAt = formatShortTime(payloadData.fetchedAt);
  const statusLabel = failureCount > 0 ? "Parcial" : "Carregado";

  marketNavigatorViewCache.set(view.id, normalizedItems);
  marketNavigatorViewStats.set(view.id, {
    meta: `Ativos ${normalizedItems.length} • ok ${successCount} • falhas ${failureCount} • atualizado ${fetchedAt}`,
    statusLabel,
    statusMode: failureCount > 0 ? "loading" : "",
  });
  renderMarketNavigatorFromState();
}

async function loadMarketNavigator() {
  const activeView = getActiveMarketNavigatorView();

  if (!activeView || isMarketNavigatorLoading) {
    return;
  }

  const requestToken = marketNavigatorRequestToken + 1;
  marketNavigatorRequestToken = requestToken;
  isMarketNavigatorLoading = true;
  setMarketNavigatorLoadingState(true);
  setMarketNavigatorStatus("Atualizando", "loading");
  setMarketNavigatorMeta("Coletando dados de mercado em tempo real...");

  try {
    const payloadData = await requestMarketNavigatorPayload(activeView);

    if (requestToken !== marketNavigatorRequestToken) {
      return;
    }

    renderMarketNavigatorPayload(activeView, payloadData);
  } catch (error) {
    if (requestToken !== marketNavigatorRequestToken) {
      return;
    }

    const message = error instanceof Error ? error.message : "Falha ao carregar visao de mercado";
    const cachedItems = getMarketNavigatorCachedItemsByViewId(activeView.id);

    if (cachedItems.length === 0) {
      marketNavigatorViewCache.set(activeView.id, []);
    }

    marketNavigatorViewStats.set(activeView.id, {
      meta: message,
      statusLabel: "Erro",
      statusMode: "error",
    });
    renderMarketNavigatorFromState();
  } finally {
    if (requestToken === marketNavigatorRequestToken) {
      isMarketNavigatorLoading = false;
      setMarketNavigatorLoadingState(false);
    }
  }
}

function setMarketNavigatorCategory(categoryId) {
  const category = getMarketNavigatorCategoryById(categoryId);

  if (!category) {
    return;
  }

  activeMarketCategoryId = category.id;
  activeMarketViewId = category.views[0]?.id ?? "";
  renderMarketNavigatorCategories();
  renderMarketNavigatorViews();
  renderMarketNavigatorFromState();
  void loadMarketNavigator();
}

function setMarketNavigatorScope(scopeId) {
  const scope = getMarketNavigatorScopeById(scopeId);

  if (!scope) {
    return;
  }

  activeMarketScopeId = scope.id;

  if (scope.id === "news") {
    setMarketNavigatorCategory("noticias");
    renderMarketNavigatorScopes();
    return;
  }

  if (scope.id === "countries") {
    if (["noticias", "cripto", "defi", "opcoes"].includes(activeMarketCategoryId)) {
      renderMarketNavigatorScopes();
      setMarketNavigatorCategory("acoes");
      return;
    }
  }

  renderMarketNavigatorScopes();
  renderMarketNavigatorCategories();
  renderMarketNavigatorViews();
  renderMarketNavigatorFromState();
  void loadMarketNavigator();
}

function setupMarketNavigator() {
  if (!(marketScopeListElement instanceof HTMLElement)
    || !(marketCategoryListElement instanceof HTMLElement)
    || !(marketPresetListElement instanceof HTMLElement)
    || !(marketFeedListElement instanceof HTMLElement)) {
    return;
  }

  const defaultCategory = getMarketNavigatorCategoryById(activeMarketCategoryId);
  activeMarketViewId = defaultCategory?.views?.[0]?.id ?? "";
  hydrateMarketNavigatorFavorites();
  fillMarketRegionFilterOptions();

  if (marketSearchInput instanceof HTMLInputElement) {
    marketSearchInput.value = marketNavigatorSearchQuery;
    marketSearchInput.addEventListener("input", () => {
      marketNavigatorSearchQuery = marketSearchInput.value;
      queueMarketNavigatorSearchProbe();
    });
  }

  if (marketRegionFilter instanceof HTMLSelectElement) {
    marketRegionFilter.value = marketNavigatorRegionFilter;
    marketRegionFilter.addEventListener("change", () => {
      const nextRegion = marketRegionFilter.value;
      const isValidRegion = MARKET_NAVIGATOR_REGION_OPTIONS.some((option) => option.id === nextRegion);
      marketNavigatorRegionFilter = isValidRegion ? nextRegion : "all";

      if (marketRegionFilter.value !== marketNavigatorRegionFilter) {
        marketRegionFilter.value = marketNavigatorRegionFilter;
      }

      renderMarketNavigatorFromState();
    });
  }

  if (marketFavoritesOnlyToggle instanceof HTMLInputElement) {
    marketFavoritesOnlyToggle.checked = marketNavigatorFavoritesOnly;
    marketFavoritesOnlyToggle.addEventListener("change", () => {
      marketNavigatorFavoritesOnly = marketFavoritesOnlyToggle.checked;
      renderMarketNavigatorFromState();
    });
  }

  renderMarketNavigatorScopes();
  renderMarketNavigatorCategories();
  renderMarketNavigatorViews();
  renderMarketNavigatorFromState();

  marketScopeListElement.addEventListener("click", (event) => {
    const target = event.target;
    const button = target instanceof HTMLElement ? target.closest("button[data-scope]") : null;

    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const scopeId = button.dataset.scope;

    if (!scopeId || scopeId === activeMarketScopeId) {
      return;
    }

    setMarketNavigatorScope(scopeId);
  });

  marketCategoryListElement.addEventListener("click", (event) => {
    const target = event.target;
    const button = target instanceof HTMLElement ? target.closest("button[data-category]") : null;

    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const categoryId = button.dataset.category;

    if (!categoryId || categoryId === activeMarketCategoryId) {
      return;
    }

    setMarketNavigatorCategory(categoryId);
  });

  marketPresetListElement.addEventListener("click", (event) => {
    const target = event.target;
    const button = target instanceof HTMLElement ? target.closest("button[data-view]") : null;

    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const viewId = button.dataset.view;

    if (!viewId || viewId === activeMarketViewId) {
      return;
    }

    activeMarketViewId = viewId;
    renderMarketNavigatorViews();
    renderMarketNavigatorFromState();
    void loadMarketNavigator();
  });

  marketFeedListElement.addEventListener("click", (event) => {
    const target = event.target;
    const button = target instanceof HTMLElement ? target.closest("button[data-action]") : null;

    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const itemIndex = Number.parseInt(button.dataset.index ?? "", 10);

    if (!Number.isInteger(itemIndex) || itemIndex < 0) {
      return;
    }

    const item = activeMarketNavigatorItems[itemIndex];

    if (!item) {
      return;
    }

    if (button.dataset.action === "toggle-favorite") {
      toggleMarketNavigatorFavorite(item);
      const isFavorite = isMarketNavigatorFavorite(item);
      setStatus("", isFavorite ? "Ativo adicionado aos favoritos" : "Ativo removido dos favoritos");
      renderMarketNavigatorFromState();
      return;
    }

    if (button.dataset.action === "open-chart") {
      const opened = openMarketItemInChart(item);
      setStatus(opened ? "" : "error", opened ? "Ativo carregado no chart" : "Este ativo nao e compativel com o chart atual");
      return;
    }

    if (button.dataset.action === "send-chat") {
      sendMarketItemToChat(item, getActiveMarketNavigatorView());
    }
  });

  if (marketNavigatorRefreshButton instanceof HTMLButtonElement) {
    marketNavigatorRefreshButton.addEventListener("click", () => {
      void loadMarketNavigator();
    });
  }

  renderMarketNavigatorFromState();
  void loadMarketNavigator();
}

function formatTrendLabel(trend) {
  if (trend === "bullish") {
    return "Viés de alta";
  }

  if (trend === "bearish") {
    return "Viés de baixa";
  }

  return "Viés lateral";
}

function formatTradeActionLabel(action) {
  if (action === "buy") {
    return "Compra tatica";
  }

  if (action === "sell") {
    return "Venda tatica";
  }

  return "Aguardar";
}

function clampNumber(value, minimum, maximum) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

function toFiniteNumber(value, fallback = 0) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return value;
}

function roundNumber(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function computeRiskReward(entry, stopLoss, takeProfit, side) {
  const risk = side === "buy" ? entry - stopLoss : stopLoss - entry;
  const reward = side === "buy" ? takeProfit - entry : entry - takeProfit;

  if (risk <= 0 || reward <= 0) {
    return null;
  }

  return roundNumber(reward / risk, 2);
}

function labelFearGreed(score) {
  if (score <= 20) {
    return "Medo extremo";
  }

  if (score <= 40) {
    return "Medo";
  }

  if (score < 60) {
    return "Neutro";
  }

  if (score < 80) {
    return "Ganancia";
  }

  return "Ganancia extrema";
}

function labelMarketZone(position) {
  if (position <= 0.33) {
    return "Zona de desconto";
  }

  if (position >= 0.67) {
    return "Zona premium";
  }

  return "Zona de equilibrio";
}

function resolveNearestHarmonicPattern(position) {
  const candidates = [
    {
      label: "AB=CD simetrico (0.50)",
      ratio: 0.5,
    },
    {
      label: "Bat / 0.618 classico",
      ratio: 0.618,
    },
    {
      label: "Gartley / 0.786",
      ratio: 0.786,
    },
    {
      label: "Deep retracement / 0.886",
      ratio: 0.886,
    },
  ];

  let best = candidates[0] ?? {
    label: "AB=CD simetrico (0.50)",
    ratio: 0.5,
  };
  let shortestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = Math.abs(position - candidate.ratio);

    if (distance < shortestDistance) {
      shortestDistance = distance;
      best = candidate;
    }
  }

  return {
    confidence: clampNumber(roundNumber(100 - shortestDistance * 240, 1), 30, 92),
    distance: shortestDistance,
    pattern: best.label,
    ratio: best.ratio,
  };
}

function buildQuantitativeAnalysis(snapshot) {
  const insights = snapshot?.insights;

  if (!insights) {
    return null;
  }

  const currentPrice = toFiniteNumber(insights.currentPrice, 0);
  const supportLevel = toFiniteNumber(insights.supportLevel, currentPrice);
  const resistanceLevel = toFiniteNumber(insights.resistanceLevel, currentPrice);
  const lowPrice = toFiniteNumber(insights.lowPrice, currentPrice);
  const highPrice = toFiniteNumber(insights.highPrice, currentPrice);
  const rangeAmplitude = Math.max(1e-6, highPrice - lowPrice);
  const rangePosition = clampNumber((currentPrice - lowPrice) / rangeAmplitude, 0, 1);

  const trendBias = insights.trend === "bullish" ? 1 : insights.trend === "bearish" ? -1 : 0;
  const actionBias = insights.tradeAction === "buy" ? 0.9 : insights.tradeAction === "sell" ? -0.9 : 0;
  const emaBias = insights.emaFast >= insights.emaSlow ? 0.9 : -0.9;
  const macdBias = insights.macdHistogram > 0 ? 0.8 : insights.macdHistogram < 0 ? -0.8 : 0;
  const momentumBias = clampNumber(insights.momentumPercent / 4, -1, 1);
  const rsiValue = typeof insights.rsi14 === "number" ? insights.rsi14 : 50;
  const rsiBias = rsiValue <= 35 ? 0.65 : rsiValue >= 65 ? -0.65 : (50 - rsiValue) / 40;
  const volatilityPenalty = clampNumber((insights.volatilityPercent - 3) / 4, 0, 1);

  const compositeScore = clampNumber(
    roundNumber(
      50
        + trendBias * 12
        + actionBias * 9
        + emaBias * 10
        + macdBias * 8
        + momentumBias * 10
        + rsiBias * 6
        - volatilityPenalty * 10,
      1,
    ),
    5,
    95,
  );

  const neutralRaw = clampNumber(24 + volatilityPenalty * 18 - Math.abs(compositeScore - 50) * 0.24, 5, 38);
  const buyRaw = clampNumber(compositeScore + (insights.tradeAction === "buy" ? 8 : 0), 5, 95);
  const sellRaw = clampNumber(100 - compositeScore + (insights.tradeAction === "sell" ? 8 : 0), 5, 95);
  const rawTotal = buyRaw + sellRaw + neutralRaw;
  let buyProbability = roundNumber((buyRaw / rawTotal) * 100, 1);
  let sellProbability = roundNumber((sellRaw / rawTotal) * 100, 1);
  let neutralProbability = roundNumber(100 - buyProbability - sellProbability, 1);

  if (neutralProbability < 0) {
    neutralProbability = 0;
    const normalization = buyProbability + sellProbability;
    buyProbability = roundNumber((buyProbability / normalization) * 100, 1);
    sellProbability = roundNumber(100 - buyProbability, 1);
  }

  const fearGreedScore = clampNumber(
    roundNumber(
      50
        + insights.changePercent * 1.4
        + insights.momentumPercent * 1.8
        + (rsiValue - 50) * 0.55
        + trendBias * 7
        - insights.volatilityPercent * 1.7,
      1,
    ),
    5,
    95,
  );
  const fearGreedDelta7d = roundNumber(insights.changePercent - insights.volatilityPercent * 0.35, 2);
  const fearGreedAvg7d = clampNumber(roundNumber(fearGreedScore - fearGreedDelta7d / 2, 1), 5, 95);

  const harmonic = resolveNearestHarmonicPattern(rangePosition);
  const equilibriumPrice = roundNumber(lowPrice + rangeAmplitude * 0.5, 2);
  const signalTone = insights.tradeAction === "buy"
    ? "buy"
    : insights.tradeAction === "sell"
      ? "sell"
      : "neutral";
  const signalTitle =
    insights.tradeAction === "buy"
      ? compositeScore >= 66
        ? "COMPRA FORTE"
        : "COMPRA TATICA"
      : insights.tradeAction === "sell"
        ? compositeScore <= 34
          ? "VENDA FORTE"
          : "VENDA TATICA"
        : "ESPERA QUALIFICADA";

  const buyRiskReward = computeRiskReward(
    insights.tradeLevels.entryZoneLow,
    insights.tradeLevels.stopLoss,
    insights.tradeLevels.takeProfit2,
    "buy",
  );
  const sellRiskReward = computeRiskReward(
    insights.tradeLevels.entryZoneHigh,
    insights.tradeLevels.stopLoss,
    insights.tradeLevels.takeProfit2,
    "sell",
  );

  const smcStructure = insights.trend === "bullish"
    ? "Estrutura HH/HL (maximos e minimos ascendentes)"
    : insights.trend === "bearish"
      ? "Estrutura LH/LL (maximos e minimos descendentes)"
      : "Estrutura lateral (range com equilibrio de fluxo)";
  const sweepRisk =
    rangePosition <= 0.18 || rangePosition >= 0.82
      ? "Alto risco de sweep em extremos"
      : rangePosition <= 0.28 || rangePosition >= 0.72
        ? "Risco moderado de sweep"
        : "Risco baixo de sweep imediato";
  const liquidityNarrative =
    rangePosition >= 0.68
      ? "Preco operando proximo da liquidez de topo"
      : rangePosition <= 0.32
        ? "Preco operando proximo da liquidez de fundo"
        : "Preco no miolo do range, liquidez bilateral";

  const wegdGradient = roundNumber(((insights.emaFast - insights.emaSlow) / Math.max(currentPrice, 1e-6)) * 100, 3);
  const wegdEnergy = clampNumber(
    roundNumber(Math.abs(insights.momentumPercent) * 6 + Math.abs(insights.macdHistogram) * 11 + Math.abs(insights.changePercent) * 3.5, 1),
    6,
    99,
  );
  const wegdPressure = roundNumber(buyProbability - sellProbability, 1);

  const proxyNews = [];

  if (Math.abs(insights.changePercent) >= 4) {
    proxyNews.push("Movimento direcional forte no periodo, monitorar eventos de fluxo e macro");
  }

  if (insights.volatilityPercent >= 5) {
    proxyNews.push("Regime de volatilidade elevado; reduzir tamanho e exigir confirmacao extra");
  }

  if (typeof insights.rsi14 === "number" && insights.rsi14 >= 70) {
    proxyNews.push("RSI em sobrecompra: risco de exaustao local em topos intraday");
  }

  if (typeof insights.rsi14 === "number" && insights.rsi14 <= 30) {
    proxyNews.push("RSI em sobrevenda: chance de repique tecnico em suporte relevante");
  }

  if (snapshot.mode === "live" && typeof snapshot.live?.changePercent24h === "number" && Math.abs(snapshot.live.changePercent24h) >= 3) {
    proxyNews.push("Fluxo de 24h no live acima da media: monitorar aceleracao e falsa ruptura");
  }

  if (proxyNews.length === 0) {
    proxyNews.push("Fluxo tecnico estavel sem anomalias de risco extremo no momento");
  }

  return {
    buyProbability,
    confluences: [
      {
        detail: `EMA9 ${formatPrice(insights.emaFast)} x EMA21 ${formatPrice(insights.emaSlow)}`,
        label: "Estrutura de medias",
        score: emaBias > 0 ? "+" : "-",
        value: emaBias > 0 ? "bullish" : "bearish",
      },
      {
        detail: `RSI14 ${typeof insights.rsi14 === "number" ? insights.rsi14.toFixed(2) : "n/d"}`,
        label: "Momentum oscilador",
        score: rsiBias >= 0 ? "+" : "-",
        value: rsiBias >= 0 ? "favoravel" : "cautela",
      },
      {
        detail: `Hist ${formatPercent(insights.macdHistogram)} • Mom ${formatPercent(insights.momentumPercent)}`,
        label: "MACD e impulso",
        score: macdBias >= 0 ? "+" : "-",
        value: macdBias >= 0 ? "expansao" : "compressao",
      },
      {
        detail: `Vol ${formatPercent(insights.volatilityPercent)} • ATR ${formatPercent(insights.atrPercent)}`,
        label: "Regime de risco",
        score: volatilityPenalty < 0.45 ? "+" : "-",
        value: volatilityPenalty < 0.45 ? "controlado" : "elevado",
      },
    ],
    compositeScore,
    context: {
      equilibriumPrice,
      rangeHigh: highPrice,
      rangeLow: lowPrice,
      resistanceLevel,
      supportLevel,
      trend: formatTrendLabel(insights.trend),
      zone: labelMarketZone(rangePosition),
      zonePositionPercent: roundNumber(rangePosition * 100, 1),
    },
    fearGreed: {
      average7d: fearGreedAvg7d,
      delta7d: fearGreedDelta7d,
      label: labelFearGreed(fearGreedScore),
      score: fearGreedScore,
    },
    harmonic: {
      confidence: harmonic.confidence,
      pattern: harmonic.pattern,
      ratio: harmonic.ratio,
    },
    neutralProbability,
    newsProxy: proxyNews,
    scenarios: {
      buy: {
        probability: buyProbability,
        riskReward: buyRiskReward,
        stopLoss: insights.tradeLevels.stopLoss,
        targets: [
          insights.tradeLevels.takeProfit1,
          insights.tradeLevels.takeProfit2,
          roundNumber(insights.tradeLevels.takeProfit2 * 1.018, 2),
        ],
        trigger: insights.tradeLevels.entryZoneLow,
      },
      sell: {
        probability: sellProbability,
        riskReward: sellRiskReward,
        stopLoss: insights.tradeLevels.stopLoss,
        targets: [
          roundNumber(insights.tradeLevels.takeProfit1 * 0.985, 2),
          roundNumber(insights.tradeLevels.takeProfit2 * 0.97, 2),
          roundNumber(insights.tradeLevels.takeProfit2 * 0.955, 2),
        ],
        trigger: insights.tradeLevels.entryZoneHigh,
      },
    },
    sellProbability,
    signal: {
      confidence: insights.confidenceScore,
      entryHigh: insights.tradeLevels.entryZoneHigh,
      entryLow: insights.tradeLevels.entryZoneLow,
      riskReward:
        signalTone === "buy"
          ? buyRiskReward
          : signalTone === "sell"
            ? sellRiskReward
            : null,
      stopLoss: insights.tradeLevels.stopLoss,
      takeProfit1: insights.tradeLevels.takeProfit1,
      takeProfit2: insights.tradeLevels.takeProfit2,
      title: signalTitle,
      tone: signalTone,
    },
    smc: {
      liquidity: liquidityNarrative,
      structure: smcStructure,
      sweepRisk,
    },
    timing: {
      executionWindow:
        insights.volatilityPercent >= 5
          ? "Operar somente em janelas de maior liquidez (abertura EUA/Londres)"
          : "Janela intraday regular, com confirmacao em fechamento de candle",
      invalidationLevel: insights.tradeLevels.stopLoss,
      note:
        signalTone === "buy"
          ? "Priorize pullback para zona de entrada e confirme com candle de continuidade"
          : signalTone === "sell"
            ? "Priorize falha de rompimento e candle de rejeicao para entrada"
            : "Aguardar rompimento limpo ou retorno a zonas extremas para melhorar assimetria",
    },
    visualChecklist: [
      `Trend: ${formatTrendLabel(insights.trend)}`,
      `RSI14: ${typeof insights.rsi14 === "number" ? insights.rsi14.toFixed(2) : "n/d"}`,
      `MACD hist: ${formatPercent(insights.macdHistogram)}`,
      `Zona: ${labelMarketZone(rangePosition)} (${roundNumber(rangePosition * 100, 1)}%)`,
      `Confianca do setup: ${Math.round(insights.confidenceScore)}%`,
    ],
    wegd: {
      direction:
        wegdGradient > 0
          ? "gradiente comprador"
          : wegdGradient < 0
            ? "gradiente vendedor"
            : "gradiente neutro",
      energy: wegdEnergy,
      gradient: wegdGradient,
      pressure: wegdPressure,
    },
  };
}

function renderAnalysisTabs() {
  if (!(analysisTabsElement instanceof HTMLElement)) {
    return;
  }

  analysisTabsElement.innerHTML = "";

  for (const tab of ANALYSIS_TAB_DEFINITIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `analysis-tab-button${activeAnalysisTabId === tab.id ? " is-active" : ""}`;
    button.dataset.tab = tab.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", activeAnalysisTabId === tab.id ? "true" : "false");
    button.textContent = tab.label;
    analysisTabsElement.append(button);
  }
}

function buildScenarioHtml(label, scenario, currency) {
  const riskRewardLabel = typeof scenario.riskReward === "number"
    ? `${scenario.riskReward.toFixed(2)}:1`
    : "n/d";

  return `
    <article class="analysis-scenario-card">
      <h5>${escapeHtml(label)} • ${scenario.probability.toFixed(1)}%</h5>
      <p>Gatilho: ${escapeHtml(formatPrice(scenario.trigger, currency))}</p>
      <p>Stop: ${escapeHtml(formatPrice(scenario.stopLoss, currency))}</p>
      <p>Alvos: ${escapeHtml(scenario.targets.map((target) => formatPrice(target, currency)).join(" • "))}</p>
      <p>Risco/Retorno: ${escapeHtml(riskRewardLabel)}</p>
    </article>
  `;
}

function renderAnalysisTabContent(analysis, snapshot) {
  if (!(analysisTabContentElement instanceof HTMLElement)) {
    return;
  }

  const currency = snapshot?.currency ?? "usd";

  if (activeAnalysisTabId === "resumo") {
    analysisTabContentElement.innerHTML = `
      <div class="analysis-grid">
        <article class="analysis-block">
          <h4>Leitura executiva</h4>
          <p>Score de confluencia ${analysis.compositeScore.toFixed(1)} / 100 com ${analysis.signal.title.toLowerCase()}.</p>
          <p>Probabilidade atual: compra ${analysis.buyProbability.toFixed(1)}%, venda ${analysis.sellProbability.toFixed(1)}%, neutro ${analysis.neutralProbability.toFixed(1)}%.</p>
          <p>${escapeHtml(analysis.timing.note)}</p>
        </article>
        <article class="analysis-block">
          <h4>Confluencias ativas</h4>
          <ul class="analysis-list">
            ${analysis.confluences.map((item) => `<li><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)} (${escapeHtml(item.detail)})</li>`).join("")}
          </ul>
        </article>
      </div>
    `;
    return;
  }

  if (activeAnalysisTabId === "tecnica") {
    analysisTabContentElement.innerHTML = `
      <div class="analysis-grid">
        <article class="analysis-block">
          <h4>Estrutura tecnica</h4>
          <p>Zona de mercado: ${escapeHtml(analysis.context.zone)} (${analysis.context.zonePositionPercent.toFixed(1)}% do range).</p>
          <p>Suporte: ${escapeHtml(formatPrice(analysis.context.supportLevel, currency))}</p>
          <p>Resistencia: ${escapeHtml(formatPrice(analysis.context.resistanceLevel, currency))}</p>
          <p>Equilibrio: ${escapeHtml(formatPrice(analysis.context.equilibriumPrice, currency))}</p>
        </article>
        <article class="analysis-block">
          <h4>Indicadores-chave</h4>
          <p>Fear & Greed quant: ${analysis.fearGreed.score.toFixed(1)} (${escapeHtml(analysis.fearGreed.label)})</p>
          <p>Delta 7d: ${escapeHtml(formatPercent(analysis.fearGreed.delta7d))}</p>
          <p>Media 7d: ${analysis.fearGreed.average7d.toFixed(1)}</p>
          <p>Direcao dominante: ${escapeHtml(analysis.context.trend)}</p>
        </article>
      </div>
    `;
    return;
  }

  if (activeAnalysisTabId === "smc") {
    analysisTabContentElement.innerHTML = `
      <div class="analysis-grid">
        <article class="analysis-block">
          <h4>Estrutura e liquidez (SMC)</h4>
          <p>${escapeHtml(analysis.smc.structure)}</p>
          <p>${escapeHtml(analysis.smc.liquidity)}</p>
          <p>${escapeHtml(analysis.smc.sweepRisk)}</p>
        </article>
        <article class="analysis-block">
          <h4>Invalidação estrutural</h4>
          <p>Nivel de invalidacao: ${escapeHtml(formatPrice(analysis.timing.invalidationLevel, currency))}</p>
          <p>Se houver fechamento alem desse nivel, o setup atual perde validade.</p>
        </article>
      </div>
    `;
    return;
  }

  if (activeAnalysisTabId === "harmonicos") {
    analysisTabContentElement.innerHTML = `
      <div class="analysis-grid">
        <article class="analysis-block">
          <h4>Leitura harmonica</h4>
          <p>Padrao mais proximo: ${escapeHtml(analysis.harmonic.pattern)}</p>
          <p>Razao candidata: ${analysis.harmonic.ratio.toFixed(3)}</p>
          <p>Confianca harmonica: ${analysis.harmonic.confidence.toFixed(1)}%</p>
        </article>
        <article class="analysis-block">
          <h4>Como interpretar</h4>
          <p>Use padrao harmonico apenas com confirmacao de candle e volume. Sem confirmacao, tratar como contexto e nao gatilho.</p>
        </article>
      </div>
    `;
    return;
  }

  if (activeAnalysisTabId === "wegd") {
    analysisTabContentElement.innerHTML = `
      <div class="analysis-grid">
        <article class="analysis-block">
          <h4>WEGD (Weighted Edge Gradient Direction)</h4>
          <p>Direcao: ${escapeHtml(analysis.wegd.direction)}</p>
          <p>Gradiente: ${escapeHtml(formatPercent(analysis.wegd.gradient))}</p>
          <p>Energia: ${analysis.wegd.energy.toFixed(1)} / 99</p>
          <p>Pressao liquida: ${escapeHtml(formatPercent(analysis.wegd.pressure))}</p>
        </article>
        <article class="analysis-block">
          <h4>Regra operacional</h4>
          <p>Gradiente alto + energia alta reforca continuidade. Gradiente invertendo com energia baixa sinaliza exaustao e possivel lateralizacao.</p>
        </article>
      </div>
    `;
    return;
  }

  if (activeAnalysisTabId === "probabilistica") {
    analysisTabContentElement.innerHTML = `
      <div class="analysis-block">
        <h4>Cenarios probabilisticos</h4>
        <div class="analysis-probability-rows">
          <div class="analysis-probability-row">
            <span>Compra</span>
            <div class="analysis-probability-track"><div class="analysis-probability-fill buy" style="width: ${analysis.buyProbability.toFixed(1)}%"></div></div>
            <strong>${analysis.buyProbability.toFixed(1)}%</strong>
          </div>
          <div class="analysis-probability-row">
            <span>Venda</span>
            <div class="analysis-probability-track"><div class="analysis-probability-fill sell" style="width: ${analysis.sellProbability.toFixed(1)}%"></div></div>
            <strong>${analysis.sellProbability.toFixed(1)}%</strong>
          </div>
          <div class="analysis-probability-row">
            <span>Neutro</span>
            <div class="analysis-probability-track"><div class="analysis-probability-fill neutral" style="width: ${analysis.neutralProbability.toFixed(1)}%"></div></div>
            <strong>${analysis.neutralProbability.toFixed(1)}%</strong>
          </div>
        </div>
      </div>
      <div class="analysis-grid">
        ${buildScenarioHtml("Cenario compra", analysis.scenarios.buy, currency)}
        ${buildScenarioHtml("Cenario venda", analysis.scenarios.sell, currency)}
      </div>
    `;
    return;
  }

  if (activeAnalysisTabId === "calculadora") {
    const capitalRef = 10000;
    const riskBudget = capitalRef * 0.01;
    const stopDistancePercent = clampNumber(
      Math.abs((analysis.signal.entryLow - analysis.signal.stopLoss) / Math.max(analysis.signal.entryLow, 1e-6)) * 100,
      0.01,
      100,
    );
    const suggestedNotional = roundNumber(riskBudget / (stopDistancePercent / 100), 2);

    analysisTabContentElement.innerHTML = `
      <div class="analysis-grid">
        <article class="analysis-block">
          <h4>Calculadora de risco (referencia)</h4>
          <p>Capital de referencia: ${escapeHtml(formatPrice(capitalRef, "usd"))}</p>
          <p>Risco por trade (1%): ${escapeHtml(formatPrice(riskBudget, "usd"))}</p>
          <p>Distancia ao stop: ${escapeHtml(formatPercent(stopDistancePercent))}</p>
          <p>Notional sugerido: ${escapeHtml(formatPrice(suggestedNotional, "usd"))}</p>
        </article>
        <article class="analysis-block">
          <h4>Parametros atuais</h4>
          <p>Entrada: ${escapeHtml(formatPrice(analysis.signal.entryLow, currency))} - ${escapeHtml(formatPrice(analysis.signal.entryHigh, currency))}</p>
          <p>Stop: ${escapeHtml(formatPrice(analysis.signal.stopLoss, currency))}</p>
          <p>TP1/TP2: ${escapeHtml(formatPrice(analysis.signal.takeProfit1, currency))} • ${escapeHtml(formatPrice(analysis.signal.takeProfit2, currency))}</p>
        </article>
      </div>
    `;
    return;
  }

  if (activeAnalysisTabId === "timing") {
    analysisTabContentElement.innerHTML = `
      <div class="analysis-grid">
        <article class="analysis-block">
          <h4>Janela de execucao</h4>
          <p>${escapeHtml(analysis.timing.executionWindow)}</p>
          <p>Invalidação: ${escapeHtml(formatPrice(analysis.timing.invalidationLevel, currency))}</p>
          <p>${escapeHtml(analysis.timing.note)}</p>
        </article>
        <article class="analysis-block">
          <h4>Ritmo operacional</h4>
          <ul class="analysis-list">
            <li>Confirmar direcao no fechamento da vela do timeframe selecionado.</li>
            <li>Executar apenas quando risco/retorno minimo estiver acima de 1.5:1.</li>
            <li>Evitar perseguir movimento apos candle de extensao acima da media.</li>
          </ul>
        </article>
      </div>
    `;
    return;
  }

  if (activeAnalysisTabId === "visual_ia") {
    analysisTabContentElement.innerHTML = `
      <article class="analysis-block">
        <h4>Checklist visual inteligente</h4>
        <ul class="analysis-list">
          ${analysis.visualChecklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </article>
    `;
    return;
  }

  const hasLiveNews =
    newsIntelligencePayload
    && newsIntelligenceLastAssetId === snapshot?.assetId
    && Array.isArray(newsIntelligencePayload.items)
    && newsIntelligencePayload.items.length > 0;

  if (hasLiveNews) {
    const newsItems = newsIntelligencePayload.items.slice(0, 6);
    const summary = newsIntelligencePayload.summary ?? {};
    const updatedAt = formatShortTime(newsIntelligencePayload.fetchedAt);

    analysisTabContentElement.innerHTML = `
      <article class="analysis-block">
        <h4>Noticias e eventos reais (multi-fonte)</h4>
        <p>Cobertura: ${summary.sourcesHealthy ?? 0}/${summary.totalSources ?? 0} fontes • impacto medio ${(summary.averageImpactScore ?? 0).toFixed(1)} • relevancia media ${(summary.averageRelevanceScore ?? 0).toFixed(1)} • atualizado ${updatedAt}</p>
        <div class="analysis-news-list">
          ${newsItems
            .map(
              (item) => `
            <article class="analysis-news-card">
              <div class="analysis-news-top">
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.source)}</span>
              </div>
              <p>${escapeHtml(item.summary)}</p>
              <div class="analysis-news-meta">
                <span>Impacto ${Number(item.impactScore).toFixed(1)}</span>
                <span>Relevancia ${Number(item.relevanceScore).toFixed(1)}</span>
                <span>Sentimento ${escapeHtml(item.sentiment)}</span>
                <span>${escapeHtml(formatShortTime(item.publishedAt))}</span>
              </div>
              <div class="analysis-news-tags">${Array.isArray(item.tags) ? item.tags.map((tag) => escapeHtml(tag)).join(" • ") : ""}</div>
              <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Abrir fonte</a>
            </article>`,
            )
            .join("")}
        </div>
      </article>
    `;
    return;
  }

  analysisTabContentElement.innerHTML = `
    <article class="analysis-block">
      <h4>Noticias e eventos (proxy quantitativo)</h4>
      <p>Sem feed externo oficial integrado no momento. Bloco abaixo usa sinais quantitativos reais do ativo para alertas operacionais:</p>
      <ul class="analysis-list">
        ${analysis.newsProxy.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </article>
  `;
}

function renderDeepAnalysisPanel(snapshot) {
  if (!(analysisPanel instanceof HTMLElement)) {
    return;
  }

  const analysis = buildQuantitativeAnalysis(snapshot);

  if (!analysis) {
    if (analysisStatusElement instanceof HTMLElement) {
      analysisStatusElement.textContent = "Aguardando dados de grafico para montar analise profunda.";
    }

    if (analysisSignalCardElement instanceof HTMLElement) {
      analysisSignalCardElement.innerHTML = "";
      analysisSignalCardElement.removeAttribute("data-tone");
    }

    if (analysisContextCardElement instanceof HTMLElement) {
      analysisContextCardElement.innerHTML = "";
    }

    if (analysisTabsElement instanceof HTMLElement) {
      analysisTabsElement.innerHTML = "";
    }

    if (analysisTabContentElement instanceof HTMLElement) {
      analysisTabContentElement.innerHTML = "";
    }

    return;
  }

  if (analysisStatusElement instanceof HTMLElement) {
    analysisStatusElement.textContent =
      "Modelagem quantitativa desbloqueada: tecnica + SMC + harmonicos + WEGD + probabilidades + timing, sem bloqueio de plano.";
  }

  if (analysisSignalCardElement instanceof HTMLElement) {
    const riskRewardLabel = typeof analysis.signal.riskReward === "number"
      ? `${analysis.signal.riskReward.toFixed(2)}:1`
      : "n/d";

    analysisSignalCardElement.dataset.tone = analysis.signal.tone;
    analysisSignalCardElement.innerHTML = `
      <div class="analysis-signal-head">
        <span class="analysis-signal-kicker">Sinal identificado</span>
        <strong>${escapeHtml(analysis.signal.title)}</strong>
      </div>
      <div class="analysis-level-grid">
        <article><span>Entrada</span><strong>${escapeHtml(formatPrice(analysis.signal.entryLow, snapshot.currency))} - ${escapeHtml(formatPrice(analysis.signal.entryHigh, snapshot.currency))}</strong></article>
        <article><span>Stop</span><strong>${escapeHtml(formatPrice(analysis.signal.stopLoss, snapshot.currency))}</strong></article>
        <article><span>TP1</span><strong>${escapeHtml(formatPrice(analysis.signal.takeProfit1, snapshot.currency))}</strong></article>
        <article><span>TP2</span><strong>${escapeHtml(formatPrice(analysis.signal.takeProfit2, snapshot.currency))}</strong></article>
        <article><span>Risco/Retorno</span><strong>${escapeHtml(riskRewardLabel)}</strong></article>
        <article><span>Confianca</span><strong>${Math.round(analysis.signal.confidence)}%</strong></article>
      </div>
    `;
  }

  if (analysisContextCardElement instanceof HTMLElement) {
    analysisContextCardElement.innerHTML = `
      <div class="analysis-context-grid">
        <article>
          <h4>Contexto de mercado</h4>
          <p>${escapeHtml(analysis.context.zone)} • ${analysis.context.zonePositionPercent.toFixed(1)}% do range</p>
          <p>Min ${escapeHtml(formatPrice(analysis.context.rangeLow, snapshot.currency))} • Max ${escapeHtml(formatPrice(analysis.context.rangeHigh, snapshot.currency))}</p>
          <p>Suporte ${escapeHtml(formatPrice(analysis.context.supportLevel, snapshot.currency))} • Resistencia ${escapeHtml(formatPrice(analysis.context.resistanceLevel, snapshot.currency))}</p>
        </article>
        <article>
          <h4>Fear & Greed quant</h4>
          <p>${analysis.fearGreed.score.toFixed(1)} • ${escapeHtml(analysis.fearGreed.label)}</p>
          <p>Delta 7d ${escapeHtml(formatPercent(analysis.fearGreed.delta7d))} • Media 7d ${analysis.fearGreed.average7d.toFixed(1)}</p>
          <p>Tendencia dominante: ${escapeHtml(analysis.context.trend)}</p>
        </article>
      </div>
    `;
  }

  renderAnalysisTabs();
  renderAnalysisTabContent(analysis, snapshot);
}

function setChartStatus(message, mode = "") {
  if (!chartStatusElement) {
    return;
  }

  chartStatusElement.textContent = message;

  if (mode) {
    chartStatusElement.setAttribute("data-mode", mode);
  } else {
    chartStatusElement.removeAttribute("data-mode");
  }
}

function setChartLegend(message, mode = "") {
  if (!chartLegendElement) {
    return;
  }

  chartLegendElement.textContent = message;

  if (mode) {
    chartLegendElement.setAttribute("data-mode", mode);
  } else {
    chartLegendElement.removeAttribute("data-mode");
  }
}

function sanitizeTerminalSymbol(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function isValueInSelect(select, value) {
  return Array.from(select.options).some((option) => option.value === value);
}

function readStoredChartPreferences() {
  try {
    const raw = localStorage.getItem(CHART_PREFERENCES_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveChartPreferences() {
  const payload = {
    assetId: chartAssetSelect instanceof HTMLSelectElement ? chartAssetSelect.value : "bitcoin",
    autoRefresh:
      chartAutoRefreshSelect instanceof HTMLSelectElement ? chartAutoRefreshSelect.value : "5000",
    exchange: chartExchangeSelect instanceof HTMLSelectElement ? chartExchangeSelect.value : "BINANCE",
    interval: getSelectedTerminalInterval(),
    mode: chartModeSelect instanceof HTMLSelectElement ? chartModeSelect.value : "delayed",
    overlayEma:
      chartOverlayEmaToggle instanceof HTMLInputElement ? chartOverlayEmaToggle.checked : true,
    overlayLevels:
      chartOverlayLevelsToggle instanceof HTMLInputElement ? chartOverlayLevelsToggle.checked : true,
    range: chartRangeSelect instanceof HTMLSelectElement ? chartRangeSelect.value : "7d",
    style: chartStyleSelect instanceof HTMLSelectElement ? chartStyleSelect.value : "candles",
    symbol:
      chartSymbolInput instanceof HTMLInputElement
        ? sanitizeTerminalSymbol(chartSymbolInput.value)
        : "BTCUSDT",
    viewMode: chartViewMode,
  };

  try {
    localStorage.setItem(CHART_PREFERENCES_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors and keep UX stateless.
  }
}

function hydrateChartPreferences() {
  const preferences = readStoredChartPreferences();

  if (!preferences) {
    return;
  }

  if (
    chartAssetSelect instanceof HTMLSelectElement
    && typeof preferences.assetId === "string"
    && isValueInSelect(chartAssetSelect, preferences.assetId)
  ) {
    chartAssetSelect.value = preferences.assetId;
  }

  if (
    chartModeSelect instanceof HTMLSelectElement
    && typeof preferences.mode === "string"
    && isValueInSelect(chartModeSelect, preferences.mode)
  ) {
    chartModeSelect.value = preferences.mode;
  }

  if (
    chartRangeSelect instanceof HTMLSelectElement
    && typeof preferences.range === "string"
    && isValueInSelect(chartRangeSelect, preferences.range)
  ) {
    chartRangeSelect.value = preferences.range;
  }

  if (
    chartStyleSelect instanceof HTMLSelectElement
    && typeof preferences.style === "string"
    && isValueInSelect(chartStyleSelect, preferences.style)
  ) {
    chartStyleSelect.value = preferences.style;
  }

  if (
    chartAutoRefreshSelect instanceof HTMLSelectElement
    && typeof preferences.autoRefresh === "string"
    && isValueInSelect(chartAutoRefreshSelect, preferences.autoRefresh)
  ) {
    chartAutoRefreshSelect.value = preferences.autoRefresh;
  }

  if (
    chartExchangeSelect instanceof HTMLSelectElement
    && typeof preferences.exchange === "string"
    && isValueInSelect(chartExchangeSelect, preferences.exchange)
  ) {
    chartExchangeSelect.value = preferences.exchange;
  }

  if (chartOverlayEmaToggle instanceof HTMLInputElement && typeof preferences.overlayEma === "boolean") {
    chartOverlayEmaToggle.checked = preferences.overlayEma;
  }

  if (
    chartOverlayLevelsToggle instanceof HTMLInputElement
    && typeof preferences.overlayLevels === "boolean"
  ) {
    chartOverlayLevelsToggle.checked = preferences.overlayLevels;
  }

  if (chartSymbolInput instanceof HTMLInputElement && typeof preferences.symbol === "string") {
    const sanitized = sanitizeTerminalSymbol(preferences.symbol);

    if (sanitized.length >= 5) {
      chartSymbolInput.value = sanitized;
    }
  }

  if (typeof preferences.interval === "string" && TERMINAL_INTERVAL_SET.has(preferences.interval)) {
    setActiveTerminalInterval(preferences.interval);
  }

  if (preferences.viewMode === "copilot" || preferences.viewMode === "tv") {
    chartViewMode = preferences.viewMode;
  }
}

function readStoredAirdropPreferences() {
  try {
    const raw = localStorage.getItem(AIRDROP_PREFERENCES_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveAirdropPreferences() {
  const filterState = getAirdropFilterState();
  const payload = {
    chain: normalizeAirdropChain(filterState.chain || "all") || "all",
    confidence: typeof filterState.confidence === "string" ? filterState.confidence : "all",
    includeSpeculative: filterState.includeSpeculative,
    query: filterState.query,
    score: filterState.score,
  };

  airdropPersistedChainPreference = payload.chain;

  try {
    localStorage.setItem(AIRDROP_PREFERENCES_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors and keep UX stateless.
  }
}

function hydrateAirdropPreferences() {
  const preferences = readStoredAirdropPreferences();

  if (!preferences) {
    return;
  }

  if (typeof preferences.chain === "string") {
    const normalizedChain = normalizeAirdropChain(preferences.chain);
    airdropPersistedChainPreference = normalizedChain.length > 0 ? normalizedChain : "all";

    if (
      airdropChainFilter instanceof HTMLSelectElement
      && isValueInSelect(airdropChainFilter, airdropPersistedChainPreference)
    ) {
      airdropChainFilter.value = airdropPersistedChainPreference;
    }
  }

  if (
    airdropConfidenceFilter instanceof HTMLSelectElement
    && typeof preferences.confidence === "string"
    && isValueInSelect(airdropConfidenceFilter, preferences.confidence)
  ) {
    airdropConfidenceFilter.value = preferences.confidence;
  }

  if (airdropIncludeSpeculativeToggle instanceof HTMLInputElement && typeof preferences.includeSpeculative === "boolean") {
    airdropIncludeSpeculativeToggle.checked = preferences.includeSpeculative;
  }

  if (airdropQueryFilter instanceof HTMLInputElement && typeof preferences.query === "string") {
    airdropQueryFilter.value = preferences.query.slice(0, 80);
  }

  if (airdropScoreFilter instanceof HTMLInputElement && typeof preferences.score === "number" && Number.isFinite(preferences.score)) {
    const boundedScore = Math.max(0, Math.min(100, Math.floor(preferences.score)));
    airdropScoreFilter.value = String(boundedScore);
  }
}

function readStoredMemecoinPreferences() {
  try {
    const raw = localStorage.getItem(MEMECOIN_PREFERENCES_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveMemecoinPreferences() {
  const filterState = getMemecoinFilterState();
  const payload = {
    chain: typeof filterState.chain === "string" ? filterState.chain : "all",
    pinnedOnly: filterState.pinnedOnly === true,
    priority: typeof filterState.priority === "string" ? filterState.priority : "all",
  };

  try {
    localStorage.setItem(MEMECOIN_PREFERENCES_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors and keep UX stateless.
  }
}

function hydrateMemecoinPreferences() {
  const preferences = readStoredMemecoinPreferences();

  if (!preferences) {
    return;
  }

  if (
    memecoinChainFilter instanceof HTMLSelectElement
    && typeof preferences.chain === "string"
    && isValueInSelect(memecoinChainFilter, preferences.chain)
  ) {
    memecoinChainFilter.value = preferences.chain;
  }

  if (
    memecoinPriorityFilter instanceof HTMLSelectElement
    && typeof preferences.priority === "string"
    && isValueInSelect(memecoinPriorityFilter, preferences.priority)
  ) {
    memecoinPriorityFilter.value = preferences.priority;
  }

  if (memecoinPinnedOnlyToggle instanceof HTMLInputElement && typeof preferences.pinnedOnly === "boolean") {
    memecoinPinnedOnlyToggle.checked = preferences.pinnedOnly;
  }
}

function setWatchlistStatus(message, mode = "") {
  if (!(watchlistStatusElement instanceof HTMLElement)) {
    return;
  }

  watchlistStatusElement.textContent = message;

  if (mode) {
    watchlistStatusElement.setAttribute("data-mode", mode);
  } else {
    watchlistStatusElement.removeAttribute("data-mode");
  }
}

function resolveDiagnosticState(value, warnThreshold, errorThreshold) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "warn";
  }

  if (value >= errorThreshold) {
    return "error";
  }

  if (value >= warnThreshold) {
    return "warn";
  }

  return "ok";
}

function renderWatchlistDiagnostics() {
  if (!(watchlistDiagnosticsElement instanceof HTMLElement)) {
    return;
  }

  const successTotal = Math.max(1, TERMINAL_WATCHLIST.length);
  const missRatePercent = Number(
    (((watchlistDiagnostics.errorCount + watchlistDiagnostics.unavailableCount) / successTotal) * 100).toFixed(1),
  );
  const fallbackRatePercent = Number(
    ((watchlistDiagnostics.fallbackCount / successTotal) * 100).toFixed(1),
  );
  const latencyValue =
    typeof watchlistDiagnostics.latencyMs === "number" && Number.isFinite(watchlistDiagnostics.latencyMs)
      ? `${watchlistDiagnostics.latencyMs.toFixed(0)} ms`
      : "n/d";
  const syncLabel = watchlistLastUpdatedAt.length > 0 ? formatShortTime(watchlistLastUpdatedAt) : "--:--:--";

  const chips = [
    {
      label: "Transporte",
      state: watchlistDiagnostics.mode === "stream" ? "ok" : "warn",
      value: watchlistDiagnostics.mode === "stream" ? "stream ativo" : "polling",
    },
    {
      label: "Latencia",
      state: resolveDiagnosticState(
        typeof watchlistDiagnostics.latencyMs === "number" ? watchlistDiagnostics.latencyMs : Number.NaN,
        450,
        900,
      ),
      value: latencyValue,
    },
    {
      label: "Provider",
      state: watchlistDiagnostics.providerMode === "public" ? "ok" : "warn",
      value: `${watchlistDiagnostics.broker}/${watchlistDiagnostics.providerMode}`,
    },
    {
      label: "Fallback",
      state: resolveDiagnosticState(fallbackRatePercent, 20, 45),
      value: `${watchlistDiagnostics.fallbackCount} (${fallbackRatePercent}%)`,
    },
    {
      label: "Falhas",
      state: resolveDiagnosticState(missRatePercent, 10, 25),
      value: `${watchlistDiagnostics.errorCount + watchlistDiagnostics.unavailableCount} (${missRatePercent}%)`,
    },
    {
      label: "Ultimo sync",
      state: "ok",
      value: syncLabel,
    },
  ];

  watchlistDiagnosticsElement.innerHTML = `
    <div class="watchlist-diagnostic-row">
      ${chips.slice(0, 3).map((chip) => `
        <div class="watchlist-diagnostic-chip" data-state="${chip.state}">
          ${chip.label}
          <strong>${chip.value}</strong>
        </div>
      `).join("")}
    </div>
    <div class="watchlist-diagnostic-row">
      ${chips.slice(3).map((chip) => `
        <div class="watchlist-diagnostic-chip" data-state="${chip.state}">
          ${chip.label}
          <strong>${chip.value}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function getSelectedTerminalSymbol() {
  const selectedExchange = getSelectedTerminalExchange();
  const symbolFromInput = sanitizeTerminalSymbol(
    chartSymbolInput instanceof HTMLInputElement ? chartSymbolInput.value : "",
  );

  if (symbolFromInput.length >= 5) {
    return mapSymbolToExchange(symbolFromInput, selectedExchange);
  }

  const selectedAsset = chartAssetSelect instanceof HTMLSelectElement
    ? chartAssetSelect.value
    : "bitcoin";
  const defaultSymbol = ASSET_TO_TERMINAL_SYMBOL[selectedAsset] ?? "BTCUSDT";
  return mapSymbolToExchange(defaultSymbol, selectedExchange);
}

function getSelectedTerminalExchange() {
  if (chartExchangeSelect instanceof HTMLSelectElement) {
    return chartExchangeSelect.value.toUpperCase();
  }

  return "BINANCE";
}

function getSelectedTerminalInterval() {
  if (!(chartIntervalSwitch instanceof HTMLElement)) {
    return "60";
  }

  const activeButton = chartIntervalSwitch.querySelector(".interval-chip.is-active");

  if (activeButton instanceof HTMLButtonElement && activeButton.dataset.interval) {
    return activeButton.dataset.interval;
  }

  return "60";
}

function setActiveTerminalInterval(interval) {
  if (!(chartIntervalSwitch instanceof HTMLElement)) {
    return;
  }

  const normalizedInterval = TERMINAL_INTERVAL_SET.has(interval) ? interval : "60";

  const buttons = chartIntervalSwitch.querySelectorAll(".interval-chip");

  buttons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.classList.toggle("is-active", button.dataset.interval === normalizedInterval);
  });
}

function getSelectedTerminalStyle() {
  const rawStyle = chartStyleSelect instanceof HTMLSelectElement ? chartStyleSelect.value : "candles";

  if (rawStyle in TERMINAL_STYLE_TO_TV) {
    return rawStyle;
  }

  return "candles";
}

function buildTradingViewSymbol() {
  return `${getSelectedTerminalExchange()}:${getSelectedTerminalSymbol()}`;
}

function syncTerminalSymbolWithAsset() {
  if (!(chartSymbolInput instanceof HTMLInputElement)) {
    return;
  }

  const selectedAsset = chartAssetSelect instanceof HTMLSelectElement
    ? chartAssetSelect.value
    : "bitcoin";
  const mappedSymbol = ASSET_TO_TERMINAL_SYMBOL[selectedAsset];

  if (!mappedSymbol) {
    return;
  }

  chartSymbolInput.value = mapSymbolToExchange(mappedSymbol, getSelectedTerminalExchange());
}

function getWatchlistSymbol(item) {
  return mapSymbolToExchange(item.symbol, getSelectedTerminalExchange());
}

function renderWatchlist() {
  if (!(watchlistGrid instanceof HTMLElement)) {
    return;
  }

  const activeSymbol = getSelectedTerminalSymbol();
  watchlistGrid.innerHTML = "";

  for (const item of TERMINAL_WATCHLIST) {
    const itemSymbol = getWatchlistSymbol(item);
    const marketSnapshot = watchlistMarketByAsset.get(item.assetId) ?? null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `watch-item${itemSymbol === activeSymbol ? " is-active" : ""}`;

    if (marketSnapshot?.changePercent24h > 0) {
      button.classList.add("is-up");
    } else if (marketSnapshot?.changePercent24h < 0) {
      button.classList.add("is-down");
    }

    if (marketSnapshot?.status === "fallback") {
      button.classList.add("is-fallback");
    }

    if (marketSnapshot?.status === "error") {
      button.classList.add("is-error");
    }

    if (marketSnapshot?.status === "unavailable") {
      button.classList.add("is-unavailable");
    }

    button.dataset.assetId = item.assetId;
    button.dataset.exchange = getSelectedTerminalExchange();
    button.dataset.symbol = itemSymbol;

    const identityElement = document.createElement("div");
    identityElement.className = "watch-identity";

    const symbolElement = document.createElement("strong");
    symbolElement.textContent = itemSymbol;

    const labelElement = document.createElement("span");
    labelElement.textContent = item.label;

    identityElement.append(symbolElement, labelElement);

    const marketElement = document.createElement("div");
    marketElement.className = "watch-market";

    const priceElement = document.createElement("span");
    priceElement.className = "watch-price";
    priceElement.textContent = formatCompactUsd(marketSnapshot?.price ?? Number.NaN);

    const changeElement = document.createElement("span");
    changeElement.className = "watch-change";

    if (typeof marketSnapshot?.changePercent24h === "number" && !Number.isNaN(marketSnapshot.changePercent24h)) {
      changeElement.textContent = formatPercent(marketSnapshot.changePercent24h);
      changeElement.classList.add(marketSnapshot.changePercent24h >= 0 ? "is-up" : "is-down");
    } else {
      changeElement.textContent = "24h n/d";
    }

    const sourceElement = document.createElement("span");
    sourceElement.className = "watch-source";

    if (marketSnapshot?.status === "fallback") {
      sourceElement.textContent = "spot fallback";
    } else if (marketSnapshot?.status === "unavailable") {
      sourceElement.textContent = "config";
    } else if (marketSnapshot?.status === "error") {
      sourceElement.textContent = "indisponivel";
    } else if (marketSnapshot?.status === "ok") {
      sourceElement.textContent = "live";
    } else {
      sourceElement.textContent = "--";
    }

    marketElement.append(priceElement, changeElement, sourceElement);

    button.append(identityElement, marketElement);
    watchlistGrid.append(button);
  }
}

function setWatchlistLoadingState(isLoading) {
  if (!(watchlistRefreshButton instanceof HTMLButtonElement)) {
    return;
  }

  watchlistRefreshButton.disabled = isLoading;
  watchlistRefreshButton.textContent = isLoading ? "Sync..." : "Sync";
}

function normalizeAssetIds(assetIds) {
  if (!Array.isArray(assetIds)) {
    return [];
  }

  const normalized = assetIds
    .map((assetId) => (typeof assetId === "string" ? assetId.trim().toLowerCase() : ""))
    .filter((assetId) => assetId.length > 0);

  return [...new Set(normalized)];
}

async function requestBrokerLiveQuoteBatch(assetIds, broker) {
  const normalizedAssetIds = normalizeAssetIds(assetIds);
  const normalizedBroker = typeof broker === "string" && broker.length > 0 ? broker : "binance";

  if (normalizedAssetIds.length === 0) {
    return {
      quotes: [],
      summary: {
        failed: 0,
        ok: 0,
        total: 0,
        unavailable: 0,
      },
    };
  }

  const response = await fetch(
    buildApiUrl(
      `/v1/brokers/live-quote/batch?broker=${encodeURIComponent(normalizedBroker)}&assetIds=${encodeURIComponent(normalizedAssetIds.join(","))}`,
    ),
    {
      method: "GET",
    },
  );

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error?.message;
    throw new Error(typeof message === "string" ? message : "Falha ao consultar batch do broker");
  }

  return payload?.data ?? null;
}

function buildBrokerLiveQuoteStreamUrl(assetIds, broker, intervalMs) {
  const normalizedAssetIds = normalizeAssetIds(assetIds);
  const normalizedBroker = typeof broker === "string" && broker.length > 0 ? broker : "binance";
  const safeIntervalMs = Number.isFinite(intervalMs) ? Math.max(2000, Math.min(60000, intervalMs)) : 10000;
  const params = new URLSearchParams({
    assetIds: normalizedAssetIds.join(","),
    broker: normalizedBroker,
    intervalMs: String(Math.floor(safeIntervalMs)),
  });

  return buildApiUrl(`/v1/brokers/live-quote/stream?${params.toString()}`);
}

async function requestSpotPriceBatch(assetIds) {
  const normalizedAssetIds = normalizeAssetIds(assetIds);

  if (normalizedAssetIds.length === 0) {
    return {
      quotes: [],
      summary: {
        failed: 0,
        ok: 0,
        total: 0,
      },
    };
  }

  const response = await fetch(
    buildApiUrl(
      `/v1/crypto/spot-price/batch?assetIds=${encodeURIComponent(normalizedAssetIds.join(","))}&currency=usd`,
    ),
    {
      method: "GET",
    },
  );

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error?.message;
    throw new Error(typeof message === "string" ? message : "Falha ao consultar batch spot fallback");
  }

  return payload?.data ?? null;
}

async function applyWatchlistBatchSnapshot(brokerBatch, options = {}) {
  const silent = options.silent === true;
  const transportMode = options.transport === "stream" ? "stream" : "polling";
  const measuredLatencyMs =
    typeof options.latencyMs === "number" && Number.isFinite(options.latencyMs)
      ? Math.max(0, options.latencyMs)
      : null;

  const nextMarketByAsset = new Map();
  let successCount = 0;
  let fallbackCount = 0;
  let errorCount = 0;
  let unavailableCount = 0;

  const brokerQuotes = Array.isArray(brokerBatch?.quotes) ? brokerBatch.quotes : [];
  const brokerQuoteByAsset = new Map(
    brokerQuotes
      .map((quoteItem) => {
        const assetId = typeof quoteItem?.assetId === "string" ? quoteItem.assetId.toLowerCase() : "";

        return [assetId, quoteItem];
      })
      .filter(([assetId]) => assetId.length > 0),
  );
  const fallbackAssetIds = [];

  for (const watchItem of TERMINAL_WATCHLIST) {
    const quoteItem = brokerQuoteByAsset.get(watchItem.assetId.toLowerCase()) ?? null;
    const quoteStatus = typeof quoteItem?.status === "string" ? quoteItem.status : "error";
    const quotePrice = quoteItem?.quote?.market?.price;

    if (quoteStatus === "ok" && typeof quotePrice === "number" && Number.isFinite(quotePrice)) {
      nextMarketByAsset.set(watchItem.assetId, {
        changePercent24h:
          typeof quoteItem?.quote?.market?.changePercent24h === "number"
            ? quoteItem.quote.market.changePercent24h
            : Number.NaN,
        fetchedAt: typeof quoteItem?.quote?.fetchedAt === "string" ? quoteItem.quote.fetchedAt : "",
        price: quotePrice,
        status: "ok",
      });
      successCount += 1;
      continue;
    }

    if (quoteStatus === "unavailable") {
      nextMarketByAsset.set(watchItem.assetId, {
        changePercent24h: Number.NaN,
        fetchedAt: "",
        price: Number.NaN,
        status: "unavailable",
      });
      unavailableCount += 1;
      continue;
    }

    fallbackAssetIds.push(watchItem.assetId);
  }

  if (fallbackAssetIds.length > 0) {
    try {
      const spotBatch = await requestSpotPriceBatch(fallbackAssetIds);
      const spotQuotes = Array.isArray(spotBatch?.quotes) ? spotBatch.quotes : [];
      const spotQuoteByAsset = new Map(
        spotQuotes
          .map((quoteItem) => {
            const assetId = typeof quoteItem?.assetId === "string" ? quoteItem.assetId.toLowerCase() : "";

            return [assetId, quoteItem];
          })
          .filter(([assetId]) => assetId.length > 0),
      );

      for (const assetId of fallbackAssetIds) {
        const quoteItem = spotQuoteByAsset.get(assetId.toLowerCase()) ?? null;
        const spotPrice = quoteItem?.quote?.price;

        if (quoteItem?.status === "ok" && typeof spotPrice === "number" && Number.isFinite(spotPrice)) {
          nextMarketByAsset.set(assetId, {
            changePercent24h: Number.NaN,
            fetchedAt: typeof quoteItem.quote?.fetchedAt === "string" ? quoteItem.quote.fetchedAt : "",
            price: spotPrice,
            status: "fallback",
          });
          fallbackCount += 1;
          continue;
        }

        nextMarketByAsset.set(assetId, {
          changePercent24h: Number.NaN,
          fetchedAt: "",
          price: Number.NaN,
          status: "error",
        });
        errorCount += 1;
      }
    } catch {
      for (const assetId of fallbackAssetIds) {
        nextMarketByAsset.set(assetId, {
          changePercent24h: Number.NaN,
          fetchedAt: "",
          price: Number.NaN,
          status: "error",
        });
        errorCount += 1;
      }
    }
  }

  watchlistMarketByAsset = nextMarketByAsset;
  watchlistLastUpdatedAt = new Date().toISOString();
  renderWatchlist();

  const selectedBroker = getSelectedBroker();
  const statusLabel = `${successCount}/${TERMINAL_WATCHLIST.length} live • fb ${fallbackCount} • cfg ${unavailableCount} • err ${errorCount} • broker ${selectedBroker} • ${formatShortTime(watchlistLastUpdatedAt)}`;
  setWatchlistStatus(statusLabel);

  watchlistDiagnostics = {
    ...watchlistDiagnostics,
    broker: selectedBroker,
    errorCount,
    fallbackCount,
    latencyMs:
      measuredLatencyMs
      ?? (typeof brokerBatch?.diagnostics?.latencyMs === "number" ? brokerBatch.diagnostics.latencyMs : null),
    mode: transportMode,
    providerMode: typeof brokerBatch?.diagnostics?.providerMode === "string"
      ? brokerBatch.diagnostics.providerMode
      : "public",
    successCount,
    unavailableCount,
  };
  renderWatchlistDiagnostics();

  if (!silent) {
    setChartLegend(`Watchlist sincronizada: ${statusLabel}`);
  }
}

async function refreshWatchlistMarket(options = {}) {
  if (isWatchlistLoading) {
    return;
  }

  const silent = options.silent === true;
  isWatchlistLoading = true;
  setWatchlistLoadingState(true);

  try {
    const requestedAssetIds = TERMINAL_WATCHLIST.map((item) => item.assetId);
    const selectedBroker = getSelectedBroker();
    const startedAt = performance.now();
    const brokerBatch = await requestBrokerLiveQuoteBatch(requestedAssetIds, selectedBroker);
    await applyWatchlistBatchSnapshot(brokerBatch, {
      latencyMs: performance.now() - startedAt,
      silent,
      transport: "polling",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na sincronizacao da watchlist";
    setWatchlistStatus(message, "error");
    watchlistDiagnostics = {
      ...watchlistDiagnostics,
      broker: getSelectedBroker(),
      mode: "polling",
    };
    renderWatchlistDiagnostics();

    if (!silent) {
      setChartLegend(message, "error");
    }
  } finally {
    isWatchlistLoading = false;
    setWatchlistLoadingState(false);
  }
}

function stopWatchlistStream() {
  if (watchlistStreamBackoffTimer !== null) {
    window.clearTimeout(watchlistStreamBackoffTimer);
    watchlistStreamBackoffTimer = null;
  }

  if (watchlistStream) {
    watchlistStream.close();
    watchlistStream = null;
  }
}

function stopWatchlistAutoRefresh() {
  stopWatchlistStream();

  if (watchlistAutoRefreshTimer !== null) {
    window.clearInterval(watchlistAutoRefreshTimer);
    watchlistAutoRefreshTimer = null;
  }
}

function connectWatchlistStream(intervalMs) {
  if (typeof EventSource !== "function") {
    return false;
  }

  const selectedBroker = getSelectedBroker();
  watchlistStreamBroker = selectedBroker;
  const streamUrl = buildBrokerLiveQuoteStreamUrl(
    TERMINAL_WATCHLIST.map((item) => item.assetId),
    selectedBroker,
    intervalMs,
  );

  const eventSource = new EventSource(streamUrl);
  watchlistStream = eventSource;

  eventSource.addEventListener("snapshot", (event) => {
    let payload = null;

    try {
      payload = JSON.parse(event.data);
    } catch {
      payload = null;
    }

    const batch = payload?.batch ?? null;

    if (!batch || !Array.isArray(batch.quotes)) {
      return;
    }

    watchlistStreamReconnectAttempt = 0;
    const generatedAtMs = typeof payload?.generatedAt === "string" ? Date.parse(payload.generatedAt) : Number.NaN;
    const latencyMs = Number.isFinite(generatedAtMs) ? Date.now() - generatedAtMs : null;

    void applyWatchlistBatchSnapshot(batch, {
      latencyMs,
      silent: true,
      transport: "stream",
    });
  });

  eventSource.addEventListener("stream-error", (event) => {
    let payload = null;

    try {
      payload = JSON.parse(event.data);
    } catch {
      payload = null;
    }

    const message = typeof payload?.message === "string"
      ? payload.message
      : "Stream de watchlist reportou falha";
    setWatchlistStatus(message, "error");
  });

  eventSource.onerror = () => {
    if (!watchlistStream || watchlistStreamBroker !== getSelectedBroker()) {
      return;
    }

    stopWatchlistStream();
    watchlistDiagnostics = {
      ...watchlistDiagnostics,
      mode: "polling",
    };
    renderWatchlistDiagnostics();

    watchlistStreamReconnectAttempt += 1;
    const backoffMs = Math.min(30000, 1200 * 2 ** watchlistStreamReconnectAttempt);
    watchlistStreamBackoffTimer = window.setTimeout(() => {
      watchlistStreamBackoffTimer = null;
      connectWatchlistStream(intervalMs);
    }, backoffMs);
  };

  return true;
}

function configureWatchlistAutoRefresh() {
  stopWatchlistAutoRefresh();

  const baseInterval = resolveAutoRefreshIntervalMs();

  if (baseInterval <= 0) {
    watchlistDiagnostics = {
      ...watchlistDiagnostics,
      mode: "polling",
    };
    renderWatchlistDiagnostics();
    return;
  }

  const refreshIntervalMs = baseInterval > 0
    ? Math.max(WATCHLIST_REFRESH_MIN_INTERVAL_MS, baseInterval * 2)
    : WATCHLIST_REFRESH_MIN_INTERVAL_MS;

  if (connectWatchlistStream(refreshIntervalMs)) {
    watchlistDiagnostics = {
      ...watchlistDiagnostics,
      mode: "stream",
    };
    renderWatchlistDiagnostics();
    return;
  }

  watchlistDiagnostics = {
    ...watchlistDiagnostics,
    mode: "polling",
  };
  renderWatchlistDiagnostics();

  watchlistAutoRefreshTimer = window.setInterval(() => {
    void refreshWatchlistMarket({
      silent: true,
    });
  }, refreshIntervalMs);
}

function setChartViewMode(nextMode) {
  chartViewMode = nextMode === "copilot" ? "copilot" : "tv";

  if (chartViewSwitch instanceof HTMLElement) {
    const buttons = chartViewSwitch.querySelectorAll(".view-chip");

    buttons.forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }

      const isActive = button.dataset.view === chartViewMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  if (tvStage instanceof HTMLElement) {
    tvStage.classList.toggle("is-hidden", chartViewMode !== "tv");
  }

  if (chartCopilotStage instanceof HTMLElement) {
    chartCopilotStage.classList.toggle("is-hidden", chartViewMode !== "copilot");
  }

  if (chartViewMode === "tv") {
    setChartLegend(
      "Modo Terminal PRO ativo. Use a barra lateral para desenhar linha, texto, fibo e anotacoes.",
    );
    saveChartPreferences();
    void mountTradingViewWidget();
    return;
  }

  if (currentChartSnapshot) {
    renderInteractiveChart(currentChartSnapshot);
  }

  saveChartPreferences();
}

function createTradingViewMountId() {
  tvMountIdCounter += 1;
  return `tv-widget-mount-${tvMountIdCounter}`;
}

function buildTradingViewWatchlist() {
  const exchange = getSelectedTerminalExchange();

  return TERMINAL_WATCHLIST.map((entry) => `${exchange}:${getWatchlistSymbol(entry)}`);
}

function buildTradingViewEmbedUrl(input) {
  const query = new URLSearchParams({
    allow_symbol_change: "1",
    calendar: "1",
    details: "1",
    hide_side_toolbar: "0",
    hide_top_toolbar: "0",
    hotlist: "1",
    interval: input.interval,
    locale: "br",
    save_image: "1",
    studies: JSON.stringify(["Volume@tv-basicstudies", "RSI@tv-basicstudies", "MACD@tv-basicstudies"]),
    style: input.style,
    symbol: input.symbol,
    theme: "dark",
    timezone: "Etc/UTC",
    toolbarbg: "#0f2138",
    watchlist: JSON.stringify(buildTradingViewWatchlist()),
    withdateranges: "1",
  });

  return `${TRADINGVIEW_EMBED_BASE_URL}?${query.toString()}`;
}

async function mountTradingViewWidget() {
  if (chartViewMode !== "tv" || !(tvWidgetContainer instanceof HTMLElement)) {
    return;
  }

  try {
    setChartStatus("Carregando terminal profissional...", "loading");
    const mountId = createTradingViewMountId();
    tvWidgetContainer.innerHTML = "";

    const symbol = buildTradingViewSymbol();
    const interval = getSelectedTerminalInterval();
    const selectedStyle = getSelectedTerminalStyle();
    const style = TERMINAL_STYLE_TO_TV[selectedStyle] ?? "1";
    const iframe = document.createElement("iframe");
    iframe.id = mountId;
    iframe.className = "tv-widget-frame";
    iframe.loading = "lazy";
    iframe.referrerPolicy = "origin";
    iframe.src = buildTradingViewEmbedUrl({
      interval,
      style,
      symbol,
    });
    iframe.title = `Terminal PRO ${symbol}`;
    iframe.allowFullscreen = true;

    tvWidgetContainer.append(iframe);

    setChartStatus(
      `Terminal ${symbol} (${interval}) pronto • desenho liberado na barra lateral`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao montar terminal";
    setChartStatus(message, "error");
    setChartLegend("Nao foi possivel abrir o terminal. Voltando para Insights IA.", "error");
    setChartViewMode("copilot");
  }
}

function scheduleTradingViewRefresh() {
  if (chartViewMode !== "tv") {
    return;
  }

  if (terminalRefreshTimer !== null) {
    window.clearTimeout(terminalRefreshTimer);
  }

  terminalRefreshTimer = window.setTimeout(() => {
    terminalRefreshTimer = null;
    void mountTradingViewWidget();
  }, 160);
}

function parseTimeToUnixSeconds(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const parsedMs = Date.parse(value);

    if (Number.isFinite(parsedMs)) {
      return Math.floor(parsedMs / 1000);
    }
  }

  if (value && typeof value === "object") {
    const maybeBusinessDay = value;

    if (
      typeof maybeBusinessDay.year === "number" &&
      typeof maybeBusinessDay.month === "number" &&
      typeof maybeBusinessDay.day === "number"
    ) {
      return Math.floor(
        Date.UTC(maybeBusinessDay.year, maybeBusinessDay.month - 1, maybeBusinessDay.day) / 1000,
      );
    }
  }

  return fallback;
}

function formatLegendTime(unixSeconds) {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) {
    return "n/d";
  }

  return new Date(unixSeconds * 1000).toLocaleString("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  });
}

function normalizeChartPoints(snapshot) {
  const points = Array.isArray(snapshot?.points) ? snapshot.points : [];
  const initialFallback = Math.floor(Date.now() / 1000) - points.length * 300;
  let previousTime = initialFallback;

  return points
    .map((point, index) => {
      const close =
        typeof point?.close === "number"
          ? point.close
          : typeof point?.price === "number"
            ? point.price
            : Number.NaN;
      const open = typeof point?.open === "number" ? point.open : close;
      const high = typeof point?.high === "number" ? point.high : Math.max(open, close);
      const low = typeof point?.low === "number" ? point.low : Math.min(open, close);

      if (
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
      ) {
        return null;
      }

      let time = parseTimeToUnixSeconds(
        point?.timestamp,
        initialFallback + index * 300,
      );

      if (time <= previousTime) {
        time = previousTime + 60;
      }

      previousTime = time;

      return {
        close,
        high: Math.max(high, open, close),
        low: Math.min(low, open, close),
        open,
        time,
        volume: typeof point?.volume === "number" ? point.volume : null,
      };
    })
    .filter((point) => point !== null);
}

function computeEmaSeries(candles, period) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return [];
  }

  const smoothing = 2 / (period + 1);
  let ema = candles[0].close;

  return candles.map((candle, index) => {
    ema = index === 0 ? candle.close : candle.close * smoothing + ema * (1 - smoothing);

    return {
      time: candle.time,
      value: Number(ema.toFixed(6)),
    };
  });
}

function computeHeikinAshiCandles(candles) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return [];
  }

  const result = [];
  let previousHaOpen = candles[0].open;
  let previousHaClose = candles[0].close;

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const haClose = (candle.open + candle.high + candle.low + candle.close) / 4;
    const haOpen = index === 0
      ? (candle.open + candle.close) / 2
      : (previousHaOpen + previousHaClose) / 2;
    const haHigh = Math.max(candle.high, haOpen, haClose);
    const haLow = Math.min(candle.low, haOpen, haClose);

    result.push({
      close: Number(haClose.toFixed(6)),
      high: Number(haHigh.toFixed(6)),
      low: Number(haLow.toFixed(6)),
      open: Number(haOpen.toFixed(6)),
      time: candle.time,
      volume: candle.volume,
    });

    previousHaOpen = haOpen;
    previousHaClose = haClose;
  }

  return result;
}

function resolveChartStyle() {
  const style = chartStyleSelect instanceof HTMLSelectElement ? chartStyleSelect.value : "candles";

  if (style === "line" || style === "area" || style === "bars" || style === "heikin") {
    return style;
  }

  return "candles";
}

function resolveAutoRefreshIntervalMs() {
  if (!(chartAutoRefreshSelect instanceof HTMLSelectElement)) {
    return 5000;
  }

  const value = Number.parseInt(chartAutoRefreshSelect.value, 10);

  if (Number.isFinite(value) && value >= 0) {
    return value;
  }

  return 5000;
}

function resizeChartToViewport() {
  if (!chartApi || !(chartViewport instanceof HTMLElement)) {
    return;
  }

  const width = Math.max(320, Math.floor(chartViewport.clientWidth));
  const height = Math.max(280, Math.floor(chartViewport.clientHeight));

  chartApi.applyOptions({
    height,
    width,
  });
}

function ensureChartOverlaySeries() {
  if (!chartApi || chartEmaFastSeries || chartEmaSlowSeries) {
    return;
  }

  chartEmaFastSeries = chartApi.addSeries(LineSeries, {
    color: "#f7c948",
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    lineWidth: 1.4,
    priceLineVisible: false,
  });

  chartEmaSlowSeries = chartApi.addSeries(LineSeries, {
    color: "#4fa3ff",
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    lineWidth: 1.4,
    priceLineVisible: false,
  });
}

function clearChartPriceLines() {
  if (!chartBaseSeries || chartPriceLines.length === 0) {
    return;
  }

  for (const priceLine of chartPriceLines) {
    chartBaseSeries.removePriceLine(priceLine);
  }

  chartPriceLines = [];
}

function createBaseSeries(style) {
  if (!chartApi) {
    return null;
  }

  if (style === "line") {
    return chartApi.addSeries(LineSeries, {
      color: "#36bffa",
      lineWidth: 2.2,
      priceLineVisible: false,
    });
  }

  if (style === "area") {
    return chartApi.addSeries(AreaSeries, {
      bottomColor: "rgba(54, 191, 250, 0.02)",
      lineColor: "#36bffa",
      lineWidth: 2.1,
      priceLineVisible: false,
      topColor: "rgba(54, 191, 250, 0.34)",
    });
  }

  if (style === "bars") {
    return chartApi.addSeries(BarSeries, {
      downColor: "#ff6b80",
      priceLineVisible: false,
      thinBars: false,
      upColor: "#33d9b2",
    });
  }

  return chartApi.addSeries(CandlestickSeries, {
    borderDownColor: "#ff6b80",
    borderUpColor: "#33d9b2",
    downColor: "#ff6b80",
    priceLineVisible: false,
    upColor: "#33d9b2",
    wickDownColor: "#ff6b80",
    wickUpColor: "#33d9b2",
  });
}

function ensureBaseSeries(style) {
  if (!chartApi) {
    return;
  }

  if (chartBaseSeries && chartBaseSeriesStyle === style) {
    return;
  }

  clearChartPriceLines();

  if (chartBaseSeries) {
    chartApi.removeSeries(chartBaseSeries);
    chartBaseSeries = null;
  }

  chartBaseSeries = createBaseSeries(style);
  chartBaseSeriesStyle = style;
}

function updateChartLegendFromCandle(candle, snapshot, isCursor = false) {
  if (!candle) {
    setChartLegend("Passe o mouse no grafico para detalhes.");
    return;
  }

  const prefix = isCursor ? "Cursor" : "Ultimo";
  const timeLabel = formatLegendTime(candle.time);
  const volumeLabel =
    typeof candle.volume === "number" && Number.isFinite(candle.volume)
      ? ` • Vol ${candle.volume.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`
      : "";

  setChartLegend(
    `${prefix} ${timeLabel} • O ${formatPrice(candle.open, snapshot.currency)} • H ${formatPrice(candle.high, snapshot.currency)} • L ${formatPrice(candle.low, snapshot.currency)} • C ${formatPrice(candle.close, snapshot.currency)}${volumeLabel}`,
  );
}

function applyChartLevels(snapshot, enabled) {
  clearChartPriceLines();

  if (!enabled || !chartBaseSeries || !snapshot?.insights) {
    return;
  }

  const insights = snapshot.insights;
  const levels = [
    { color: "#16d6b3", price: insights.supportLevel, title: "SUP" },
    { color: "#ff8fab", price: insights.resistanceLevel, title: "RES" },
    { color: "#ffd166", price: insights.tradeLevels?.entryZoneLow, title: "ENT LO" },
    { color: "#ffd166", price: insights.tradeLevels?.entryZoneHigh, title: "ENT HI" },
    { color: "#f94144", price: insights.tradeLevels?.stopLoss, title: "STOP" },
    { color: "#90be6d", price: insights.tradeLevels?.takeProfit1, title: "TP1" },
    { color: "#43aa8b", price: insights.tradeLevels?.takeProfit2, title: "TP2" },
  ];

  for (const level of levels) {
    if (typeof level.price !== "number" || Number.isNaN(level.price)) {
      continue;
    }

    const priceLine = chartBaseSeries.createPriceLine({
      axisLabelVisible: true,
      color: level.color,
      lineVisible: true,
      lineWidth: 1,
      price: level.price,
      title: level.title,
    });

    chartPriceLines.push(priceLine);
  }
}

function ensureInteractiveChart() {
  if (!(chartViewport instanceof HTMLElement)) {
    return false;
  }

  if (chartApi) {
    return true;
  }

  chartApi = createChart(chartViewport, {
    crosshair: {
      horzLine: {
        color: "rgba(119, 161, 255, 0.32)",
        labelBackgroundColor: "#142035",
      },
      mode: 0,
      vertLine: {
        color: "rgba(119, 161, 255, 0.32)",
        labelBackgroundColor: "#142035",
      },
    },
    grid: {
      horzLines: {
        color: "rgba(100, 128, 166, 0.2)",
      },
      vertLines: {
        color: "rgba(100, 128, 166, 0.12)",
      },
    },
    height: Math.max(280, chartViewport.clientHeight || 380),
    layout: {
      attributionLogo: false,
      background: {
        bottomColor: "#060b14",
        topColor: "#111e33",
        type: ColorType.VerticalGradient,
      },
      fontFamily: "Sora, Trebuchet MS, sans-serif",
      textColor: "#b8c9df",
    },
    localization: {
      locale: "pt-BR",
    },
    rightPriceScale: {
      borderColor: "rgba(100, 128, 166, 0.35)",
      scaleMargins: {
        bottom: 0.12,
        top: 0.1,
      },
    },
    timeScale: {
      borderColor: "rgba(100, 128, 166, 0.35)",
      rightOffset: 4,
      secondsVisible: false,
      timeVisible: true,
    },
    width: Math.max(320, chartViewport.clientWidth || 760),
  });

  ensureChartOverlaySeries();

  chartApi.subscribeCrosshairMove((param) => {
    if (!currentChartSnapshot) {
      return;
    }

    const time = parseTimeToUnixSeconds(param.time, Number.NaN);

    if (Number.isFinite(time) && chartCandleByTime.has(time)) {
      updateChartLegendFromCandle(chartCandleByTime.get(time), currentChartSnapshot, true);
      return;
    }

    if (chartLatestCandles.length > 0) {
      updateChartLegendFromCandle(
        chartLatestCandles[chartLatestCandles.length - 1],
        currentChartSnapshot,
      );
      return;
    }

    setChartLegend("Passe o mouse no grafico para detalhes.");
  });

  if (typeof ResizeObserver === "function") {
    chartResizeObserver = new ResizeObserver(() => {
      resizeChartToViewport();
    });

    chartResizeObserver.observe(chartViewport);
  }

  return true;
}

function fitChartContent() {
  if (!chartApi) {
    return;
  }

  chartApi.timeScale().fitContent();
}

function clearChartSurface() {
  chartLatestCandles = [];
  chartCandleByTime = new Map();

  if (!chartApi) {
    setChartLegend("Sem dados para exibir no momento.");
    return;
  }

  if (chartBaseSeries) {
    chartBaseSeries.setData([]);
  }

  if (chartEmaFastSeries) {
    chartEmaFastSeries.setData([]);
  }

  if (chartEmaSlowSeries) {
    chartEmaSlowSeries.setData([]);
  }

  clearChartPriceLines();
  setChartLegend("Sem dados para exibir no momento.");
}

function destroyInteractiveChart() {
  if (terminalRefreshTimer !== null) {
    window.clearTimeout(terminalRefreshTimer);
    terminalRefreshTimer = null;
  }

  stopWatchlistAutoRefresh();

  if (chartResizeObserver && chartViewport instanceof HTMLElement) {
    chartResizeObserver.unobserve(chartViewport);
    chartResizeObserver.disconnect();
    chartResizeObserver = null;
  }

  if (chartApi) {
    chartApi.remove();
  }

  chartApi = null;
  chartBaseSeries = null;
  chartBaseSeriesStyle = "";
  chartEmaFastSeries = null;
  chartEmaSlowSeries = null;
  chartPriceLines = [];
  chartLatestCandles = [];
  chartCandleByTime = new Map();

  if (tvWidgetContainer instanceof HTMLElement) {
    tvWidgetContainer.innerHTML = "";
  }
}

function renderInteractiveChart(snapshot) {
  if (!ensureInteractiveChart()) {
    return;
  }

  const candles = normalizeChartPoints(snapshot);

  if (candles.length < 2) {
    clearChartSurface();
    return;
  }

  const style = resolveChartStyle();
  const renderedCandles = style === "heikin" ? computeHeikinAshiCandles(candles) : candles;
  ensureBaseSeries(style);
  ensureChartOverlaySeries();

  if (!chartBaseSeries) {
    return;
  }

  const usesOhlcSeries = style === "candles" || style === "bars" || style === "heikin";
  const baseData = usesOhlcSeries
    ? renderedCandles.map((candle) => ({
      close: candle.close,
      high: candle.high,
      low: candle.low,
      open: candle.open,
      time: candle.time,
    }))
    : renderedCandles.map((candle) => ({
      time: candle.time,
      value: candle.close,
    }));

  chartBaseSeries.setData(baseData);

  const showEma = !(chartOverlayEmaToggle instanceof HTMLInputElement)
    || chartOverlayEmaToggle.checked;

  if (showEma) {
    chartEmaFastSeries?.setData(computeEmaSeries(renderedCandles, 9));
    chartEmaSlowSeries?.setData(computeEmaSeries(renderedCandles, 21));
  } else {
    chartEmaFastSeries?.setData([]);
    chartEmaSlowSeries?.setData([]);
  }

  const showLevels = !(chartOverlayLevelsToggle instanceof HTMLInputElement)
    || chartOverlayLevelsToggle.checked;
  applyChartLevels(snapshot, showLevels);

  chartLatestCandles = renderedCandles;
  chartCandleByTime = new Map(renderedCandles.map((candle) => [candle.time, candle]));
  updateChartLegendFromCandle(renderedCandles[renderedCandles.length - 1], snapshot);

  if (!chartHasInitialFit) {
    fitChartContent();
    chartHasInitialFit = true;
  }
}

function renderChartMetrics(snapshot) {
  if (!chartMetricsElement) {
    renderDeepAnalysisPanel(snapshot);
    return;
  }

  const insights = snapshot?.insights;

  if (!insights) {
    chartMetricsElement.innerHTML = "";
    renderDeepAnalysisPanel(null);
    return;
  }

  const rsi14Label =
    typeof insights.rsi14 === "number" && !Number.isNaN(insights.rsi14)
      ? insights.rsi14.toFixed(2)
      : "n/d";
  const metrics = [
    {
      label: "Preço",
      value: formatPrice(insights.currentPrice, snapshot.currency),
    },
    {
      label: "Ação",
      value: formatTradeActionLabel(insights.tradeAction),
    },
    {
      label: "Confianca",
      value: `${Math.round(insights.confidenceScore)}%`,
    },
    {
      label: "Trend",
      value: formatTrendLabel(insights.trend),
    },
    {
      label: "Variação",
      value: formatPercent(insights.changePercent),
    },
    {
      label: "Volatilidade",
      value: formatPercent(insights.volatilityPercent),
    },
    {
      label: "ATR",
      value: formatPercent(insights.atrPercent),
    },
    {
      label: "RSI 14",
      value: rsi14Label,
    },
    {
      label: "MACD Hist",
      value: formatPercent(insights.macdHistogram),
    },
    {
      label: "EMA 9",
      value: formatPrice(insights.emaFast, snapshot.currency),
    },
    {
      label: "EMA 21",
      value: formatPrice(insights.emaSlow, snapshot.currency),
    },
    {
      label: "Suporte",
      value: formatPrice(insights.supportLevel, snapshot.currency),
    },
    {
      label: "Resistência",
      value: formatPrice(insights.resistanceLevel, snapshot.currency),
    },
    {
      label: "Entrada",
      value: `${formatPrice(insights.tradeLevels.entryZoneLow, snapshot.currency)} - ${formatPrice(insights.tradeLevels.entryZoneHigh, snapshot.currency)}`,
    },
    {
      label: "Stop",
      value: formatPrice(insights.tradeLevels.stopLoss, snapshot.currency),
    },
    {
      label: "TP1/TP2",
      value: `${formatPrice(insights.tradeLevels.takeProfit1, snapshot.currency)} / ${formatPrice(insights.tradeLevels.takeProfit2, snapshot.currency)}`,
    },
    {
      label: "Modo",
      value: CHART_MODE_LABELS[snapshot.mode] ?? snapshot.mode,
    },
    {
      label: "Provider",
      value: String(snapshot.provider ?? "n/d").toUpperCase(),
    },
  ];

  chartMetricsElement.innerHTML = "";

  for (const metric of metrics) {
    const metricElement = document.createElement("article");
    metricElement.className = "chart-metric";

    const labelElement = document.createElement("div");
    labelElement.className = "chart-metric-label";
    labelElement.textContent = metric.label;

    const valueElement = document.createElement("div");
    valueElement.className = "chart-metric-value";
    valueElement.textContent = metric.value;

    metricElement.append(labelElement, valueElement);
    chartMetricsElement.append(metricElement);
  }

  renderDeepAnalysisPanel(snapshot);
}

async function requestCryptoChartEndpoint(assetId, range, mode, exchange = "binance") {
  const endpoint = mode === "live" ? "/v1/crypto/live-chart" : "/v1/crypto/chart";
  const normalizedExchange = typeof exchange === "string" && exchange.length > 0 ? exchange : "binance";
  const query = mode === "live"
    ? `assetId=${encodeURIComponent(assetId)}&range=${encodeURIComponent(range)}&exchange=${encodeURIComponent(normalizedExchange)}`
    : `assetId=${encodeURIComponent(assetId)}&currency=usd&range=${encodeURIComponent(range)}`;
  const response = await fetch(buildApiUrl(`${endpoint}?${query}`), {
    method: "GET",
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage = payload?.error?.message;
    throw new Error(typeof errorMessage === "string" ? errorMessage : "Nao foi possivel carregar o grafico");
  }

  return payload?.data ?? null;
}

async function requestCryptoChart(assetId, range, mode, exchange) {
  try {
    const snapshot = await requestCryptoChartEndpoint(assetId, range, mode, exchange);

    return {
      fallbackReason: "",
      snapshot,
    };
  } catch (error) {
    if (mode !== "live") {
      throw error;
    }

    const fallbackSnapshot = await requestCryptoChartEndpoint(assetId, range, "delayed", exchange);

    return {
      fallbackReason:
        error instanceof Error ? error.message : "Live indisponivel, fallback delayed acionado",
      snapshot: fallbackSnapshot,
    };
  }
}

function shouldRefreshNewsIntelligence(assetId, force = false) {
  if (force) {
    return true;
  }

  if (newsIntelligenceLastAssetId !== assetId) {
    return true;
  }

  if (newsIntelligenceLastFetchedAtMs <= 0) {
    return true;
  }

  return Date.now() - newsIntelligenceLastFetchedAtMs >= NEWS_INTELLIGENCE_REFRESH_INTERVAL_MS;
}

async function requestNewsIntelligence(assetId) {
  const response = await fetch(
    buildApiUrl(`/v1/crypto/news-intelligence?assetId=${encodeURIComponent(assetId)}&limit=8`),
    {
      method: "GET",
    },
  );

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const apiMessage = payload?.error?.message;
    throw new Error(typeof apiMessage === "string" ? apiMessage : "Falha ao carregar noticias do ativo");
  }

  return payload?.data ?? null;
}

async function loadNewsIntelligence(assetId, options = {}) {
  if (typeof assetId !== "string" || assetId.length === 0) {
    return;
  }

  const forceRefresh = options.force === true;

  if (!shouldRefreshNewsIntelligence(assetId, forceRefresh)) {
    if (activeAnalysisTabId === "noticias") {
      renderDeepAnalysisPanel(currentChartSnapshot);
    }

    return;
  }

  const requestToken = newsIntelligenceRequestToken + 1;
  newsIntelligenceRequestToken = requestToken;

  try {
    const payload = await requestNewsIntelligence(assetId);

    if (requestToken !== newsIntelligenceRequestToken) {
      return;
    }

    if (!payload || !Array.isArray(payload.items)) {
      throw new Error("Payload de noticias em formato invalido");
    }

    newsIntelligencePayload = payload;
    newsIntelligenceLastAssetId = assetId;
    newsIntelligenceLastFetchedAtMs = Date.now();
  } catch {
    if (requestToken !== newsIntelligenceRequestToken) {
      return;
    }

    if (newsIntelligenceLastAssetId !== assetId) {
      newsIntelligencePayload = null;
      newsIntelligenceLastFetchedAtMs = 0;
    }
  } finally {
    if (activeAnalysisTabId === "noticias") {
      renderDeepAnalysisPanel(currentChartSnapshot);
    }
  }
}

function buildContingencyChartSnapshot(input) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const points = Array.from({ length: 36 }, (_, index) => {
    const time = nowSeconds - (35 - index) * 300;

    return {
      close: input.price,
      high: input.price,
      low: input.price,
      open: input.price,
      timestamp: new Date(time * 1000).toISOString(),
      volume: null,
    };
  });

  return {
    assetId: input.assetId,
    cache: {
      stale: false,
      state: "miss",
    },
    currency: "usd",
    fetchedAt: new Date().toISOString(),
    insights: {
      atrPercent: 0,
      changePercent: 0,
      confidenceScore: 48,
      currentPrice: input.price,
      emaFast: input.price,
      emaSlow: input.price,
      highPrice: input.price,
      longMovingAverage: input.price,
      lowPrice: input.price,
      macdHistogram: 0,
      momentumPercent: 0,
      resistanceLevel: input.price,
      rsi14: null,
      shortMovingAverage: input.price,
      supportLevel: input.price,
      tradeAction: "wait",
      tradeLevels: {
        entryZoneHigh: input.price,
        entryZoneLow: input.price,
        stopLoss: input.price,
        takeProfit1: input.price,
        takeProfit2: input.price,
      },
      trend: "sideways",
      volatilityPercent: 0,
    },
    live: null,
    mode: "delayed",
    points,
    provider: input.provider ?? "coincap",
    range: input.range,
  };
}

async function loadChart(options = {}) {
  if (!chartAssetSelect || !chartRangeSelect) {
    return;
  }

  if (isChartLoading) {
    return;
  }

  const assetId = options.assetId ?? chartAssetSelect.value;
  const requestedMode = options.mode ?? chartModeSelect?.value ?? "delayed";
  const selectedExchange = getSelectedTerminalExchange();
  const selectedBroker = getSelectedBroker();
  const mode = requestedMode === "live" && !isNativeLiveModeSupported()
    ? "delayed"
    : requestedMode;
  const forcedModeReason = requestedMode === "live" && mode !== "live"
    ? `Live nativo ainda em rollout para ${selectedExchange}; exibindo delayed resiliente`
    : "";
  const range = options.range ?? chartRangeSelect.value;
  const silent = options.silent === true;

  isChartLoading = true;

  if (chartRefreshButton instanceof HTMLButtonElement && !silent) {
    chartRefreshButton.disabled = true;
    chartRefreshButton.textContent = "Atualizando...";
  }

  if (!silent) {
    setChartStatus("Atualizando dados de grafico...", "loading");
  }

  try {
    const { fallbackReason, snapshot } = await requestCryptoChart(assetId, range, mode, selectedBroker);
    const combinedFallbackReason = [forcedModeReason, fallbackReason].filter((item) => item.length > 0).join(" | ");

    if (!snapshot || !Array.isArray(snapshot.points)) {
      throw new Error("Resposta de grafico invalida");
    }

    currentChartSnapshot = snapshot;
    void loadNewsIntelligence(assetId);

    if (chartViewMode === "copilot") {
      renderInteractiveChart(snapshot);
    }

    renderChartMetrics(snapshot);

    const cacheLabel = snapshot.cache?.state ? `cache ${snapshot.cache.state}` : "cache n/d";
    const rangeLabel = CHART_RANGE_LABELS[snapshot.range] ?? snapshot.range;
    const modeLabel = CHART_MODE_LABELS[snapshot.mode] ?? snapshot.mode;
    const styleLabel = chartViewMode === "tv"
      ? CHART_STYLE_LABELS[getSelectedTerminalStyle()] ?? getSelectedTerminalStyle()
      : CHART_STYLE_LABELS[resolveChartStyle()] ?? resolveChartStyle();
    const providerLabel = String(snapshot.provider ?? "n/d").toUpperCase();
    const refreshIntervalMs = resolveAutoRefreshIntervalMs();
    const refreshLabel =
      snapshot.mode === "live"
        ? refreshIntervalMs > 0
          ? ` • refresh ${Math.round(refreshIntervalMs / 1000)}s`
          : " • refresh manual"
        : "";
    const liveLabel =
      snapshot.mode === "live"
        ? ` • 24h ${formatPercent(snapshot.live?.changePercent24h)} • vol ${formatPrice(snapshot.live?.volume24h, "usd")}`
        : "";
    const fallbackLabel = combinedFallbackReason.length > 0
      ? " • live indisponivel, usando delayed"
      : "";
    const updatedAtLabel = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    setChartStatus(
      `Grafico ${assetId.toUpperCase()} (${modeLabel}, ${rangeLabel}, ${styleLabel}) • exchange ${selectedExchange} • provider ${providerLabel} • ${cacheLabel}${refreshLabel}${liveLabel}${fallbackLabel} • atualizado ${updatedAtLabel}`,
    );

    if (chartViewMode === "tv") {
      setChartLegend(
        `Terminal ${buildTradingViewSymbol()} ativo • intervalo ${getSelectedTerminalInterval()} • estilo ${styleLabel}`,
      );
    } else if (combinedFallbackReason.length > 0) {
      setChartLegend(`Fallback ativo: ${combinedFallbackReason}. Exibindo delayed temporariamente.`, "error");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro ao carregar grafico";
    let spotQuote = null;

    try {
      const spotBatch = await requestSpotPriceBatch([assetId]);
      spotQuote = Array.isArray(spotBatch?.quotes)
        ? spotBatch.quotes.find((item) => item.assetId === assetId && item.status === "ok")
        : null;
    } catch {
      spotQuote = null;
    }

    if (spotQuote?.quote?.price && Number.isFinite(spotQuote.quote.price)) {
      const contingencySnapshot = buildContingencyChartSnapshot({
        assetId,
        price: spotQuote.quote.price,
        provider: spotQuote.quote.provider,
        range,
      });

      currentChartSnapshot = contingencySnapshot;
      void loadNewsIntelligence(assetId);

      if (chartViewMode === "copilot") {
        renderInteractiveChart(contingencySnapshot);
      }

      renderChartMetrics(contingencySnapshot);
      setChartStatus(`Modo contingencia ativo: ${errorMessage}`, "error");
      setChartLegend("Sem historico no momento. Exibindo preco de contingencia para manter acompanhamento operacional.", "error");
    } else {
      setChartStatus(errorMessage, "error");

      if (currentChartSnapshot && chartViewMode === "copilot") {
        renderInteractiveChart(currentChartSnapshot);
        setChartLegend("Falha na atualizacao. Mantendo ultimo snapshot valido.", "error");
      } else {
        clearChartSurface();
        setChartLegend("Falha ao carregar o grafico. Tente atualizar.", "error");
        renderChartMetrics(null);
        currentChartSnapshot = null;
      }
    }
  } finally {
    if (chartRefreshButton instanceof HTMLButtonElement && !silent) {
      chartRefreshButton.disabled = false;
      chartRefreshButton.textContent = "Atualizar grafico";
    }

    isChartLoading = false;
  }
}

function stopChartAutoRefresh() {
  if (chartAutoRefreshTimer !== null) {
    window.clearInterval(chartAutoRefreshTimer);
    chartAutoRefreshTimer = null;
  }
}

function configureChartAutoRefresh() {
  stopChartAutoRefresh();

  if (!chartModeSelect) {
    return;
  }

  const refreshIntervalMs = resolveAutoRefreshIntervalMs();

  if (refreshIntervalMs <= 0) {
    return;
  }

  chartAutoRefreshTimer = window.setInterval(() => {
    void loadChart({
      silent: true,
    });
  }, refreshIntervalMs);
}

function renderMessages() {
  if (!messagesContainer) {
    return;
  }

  messagesContainer.innerHTML = "";

  for (const message of messages) {
    const messageElement = document.createElement("article");
    messageElement.className = `message message-${message.role}${message.error ? " message-error" : ""}`;

    const roleElement = document.createElement("div");
    roleElement.className = "role";
    roleElement.textContent = message.role === "user" ? "Você" : "Copiloto";

    const contentElement = document.createElement("p");
    contentElement.textContent = message.content;

    messageElement.append(roleElement, contentElement);

    const metaText = formatMeta(message.meta);

    if (metaText.length > 0) {
      const metaElement = document.createElement("div");
      metaElement.className = "meta";
      metaElement.textContent = metaText;
      messageElement.append(metaElement);
    }

    messagesContainer.append(messageElement);
  }

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function pushMessage(role, content, options = {}) {
  messages.push({
    content,
    error: options.error ?? false,
    meta: options.meta,
    role,
  });

  saveMessagesToLocalStorage();
  renderMessages();
  renderRecentHistory();
}

function setSendingState(nextValue) {
  isSending = nextValue;

  if (sendButton) {
    sendButton.disabled = nextValue || isChatLockedByAuth;
    sendButton.textContent = nextValue ? "Consultando..." : "Enviar ao Copiloto";
  }

  if (chatInput) {
    chatInput.disabled = nextValue || isChatLockedByAuth;
  }

  setStatus(nextValue ? "loading" : "", nextValue ? "Consultando" : "Pronto");
}

async function requestCopilotCompletion(message) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (isCloudHistoryEnabled() && supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data?.session?.access_token;

      if (typeof accessToken === "string" && accessToken.length > 20) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
    } catch {
      // Keep request running even if session retrieval fails.
    }
  }

  const requestSessionId = isCloudHistoryEnabled() && activeConversationId.length > 0
    ? activeConversationId
    : chatSessionId;

  const response = await fetch(buildApiUrl("/v1/copilot/chat"), {
    body: JSON.stringify({
      maxTokens: 350,
      message,
      sessionId: requestSessionId,
      temperature: 0.1,
    }),
    headers,
    method: "POST",
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const apiMessage = payload?.error?.message;
    throw new Error(typeof apiMessage === "string" ? apiMessage : "Falha ao consultar o Copiloto");
  }

  return payload;
}

async function loadMessagesFromBackend() {
  const historySessionId = activeConversationId.length > 0 ? activeConversationId : chatSessionId;

  const response = await fetch(
    buildApiUrl(`/v1/copilot/history?sessionId=${encodeURIComponent(historySessionId)}&limit=${MAX_STORED_MESSAGES}`),
    {
      method: "GET",
    },
  );

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return false;
  }

  const historyMessages = Array.isArray(payload?.data?.messages) ? payload.data.messages : [];
  const normalizedMessages = historyMessages
    .map((item) => normalizeRemoteHistoryMessage(item))
    .filter((item) => item !== null);

  if (normalizedMessages.length === 0) {
    return false;
  }

  replaceMessages(normalizedMessages);

  const assistantWithModel = [...normalizedMessages]
    .reverse()
    .find((item) => item.role === "assistant" && item.meta?.model);

  if (activeModelElement && assistantWithModel?.meta?.model) {
    activeModelElement.textContent = assistantWithModel.meta.model;
  }

  return true;
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!chatInput || isSending || isChatLockedByAuth) {
    return;
  }

  const prompt = chatInput.value.trim();

  if (prompt.length === 0) {
    return;
  }

  if (isCloudHistoryEnabled() && activeConversationId.length < 8) {
    try {
      await createAndActivateConversation();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao iniciar conversa";
      setStatus("error", message);
      return;
    }
  }

  const userTime = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  pushMessage("user", prompt, {
    meta: {
      time: userTime,
    },
  });

  if (isCloudHistoryEnabled() && activeConversationId.length > 0) {
    try {
      await persistCloudMessage(activeConversationId, {
        content: prompt,
        error: false,
        meta: {
          time: userTime,
        },
        role: "user",
      });

      const currentConversation = conversationItems.find((item) => item.id === activeConversationId);
      const shouldRefreshTitle = !currentConversation || currentConversation.title === "Nova conversa";
      const conversationTitle = shouldRefreshTitle
        ? buildConversationTitleFromPrompt(prompt)
        : currentConversation.title;

      await updateConversationInCloud(activeConversationId, {
        last_message_at: new Date().toISOString(),
        title: conversationTitle,
      });
    } catch (error) {
      setStatus(
        "error",
        error instanceof Error ? error.message : "Falha ao salvar mensagem na conversa",
      );
    }
  }

  chatInput.value = "";
  setSendingState(true);

  try {
    const payload = await requestCopilotCompletion(prompt);
    const aiData = payload?.data;

    if (!aiData || typeof aiData.answer !== "string") {
      throw new Error("Resposta da IA sem formato esperado");
    }

    if (activeModelElement && typeof aiData.model === "string") {
      activeModelElement.textContent = aiData.model;
    }

    const assistantTime = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const assistantMessageMeta = {
      model: aiData.model,
      time: assistantTime,
      totalTokens: aiData.usage?.totalTokens,
    };

    pushMessage("assistant", aiData.answer, {
      meta: assistantMessageMeta,
    });

    if (isCloudHistoryEnabled() && activeConversationId.length > 0) {
      try {
        await persistCloudMessage(activeConversationId, {
          content: aiData.answer,
          error: false,
          meta: assistantMessageMeta,
          role: "assistant",
        });

        await updateConversationInCloud(activeConversationId, {
          last_message_at: new Date().toISOString(),
        });
      } catch (error) {
        setStatus(
          "error",
          error instanceof Error ? error.message : "Falha ao salvar resposta na conversa",
        );
      }
    }

    setStatus("", "Pronto");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao consultar a IA";

    const assistantErrorTime = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    pushMessage("assistant", message, {
      error: true,
      meta: {
        time: assistantErrorTime,
      },
    });

    if (isCloudHistoryEnabled() && activeConversationId.length > 0) {
      try {
        await persistCloudMessage(activeConversationId, {
          content: message,
          error: true,
          meta: {
            time: assistantErrorTime,
          },
          role: "assistant",
        });

        await updateConversationInCloud(activeConversationId, {
          last_message_at: new Date().toISOString(),
        });
      } catch {
        // Keep UI flow even when cloud persistence fails.
      }
    }

    setStatus("error", "Falha");
  } finally {
    setSendingState(false);
    chatInput?.focus();
  }
}

function setupQuickPrompts() {
  if (!quickPromptsContainer || !chatInput) {
    return;
  }

  quickPromptsContainer.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const prompt = target.dataset.prompt;

    if (!prompt) {
      return;
    }

    chatInput.value = prompt;
    chatInput.focus();
  });
}

function setupLocalHistoryControls() {
  if (clearLocalHistoryButton instanceof HTMLButtonElement) {
    clearLocalHistoryButton.addEventListener("click", () => {
      if (isCloudHistoryEnabled()) {
        void (async () => {
          try {
            await createAndActivateConversation();
            chatInput?.focus();
          } catch (error) {
            setStatus(
              "error",
              error instanceof Error ? error.message : "Falha ao iniciar nova conversa",
            );
          }
        })();

        return;
      }

      rotateSessionId();
      persistActiveConversationId("");
      messages.splice(0, messages.length);
      localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
      renderMessages();
      renderRecentHistory();
      setStatus("", "Nova sessao iniciada");
      chatInput?.focus();
    });
  }

  if (conversationListElement instanceof HTMLElement) {
    conversationListElement.addEventListener("click", (event) => {
      const target = event.target;
      const button = target instanceof HTMLElement
        ? target.closest("button[data-conversation-id]")
        : null;

      if (!(button instanceof HTMLButtonElement)) {
        return;
      }

      const nextConversationId = button.dataset.conversationId;

      if (!nextConversationId || nextConversationId === activeConversationId) {
        return;
      }

      void (async () => {
        try {
          setStatus("loading", "Abrindo conversa...");
          await setActiveConversation(nextConversationId);
          setStatus("", "Conversa carregada");
        } catch (error) {
          setStatus(
            "error",
            error instanceof Error ? error.message : "Falha ao carregar conversa",
          );
        }
      })();
    });
  }
}

function isEditableElement(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable
    || tagName === "input"
    || tagName === "textarea"
    || tagName === "select"
  );
}

function setupChartKeyboardShortcuts() {
  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) {
      return;
    }

    const intervalShortcut = TERMINAL_INTERVAL_SHORTCUTS[event.code];

    if (event.altKey && !event.metaKey && !event.ctrlKey && intervalShortcut) {
      event.preventDefault();
      setActiveTerminalInterval(intervalShortcut);
      scheduleTradingViewRefresh();
      saveChartPreferences();
      setChartLegend(`Atalho ativo: intervalo ${intervalShortcut}`);
      return;
    }

    if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "k") {
      if (!(chartSymbolInput instanceof HTMLInputElement)) {
        return;
      }

      event.preventDefault();
      chartSymbolInput.focus();
      chartSymbolInput.select();
      setChartLegend("Atalho ativo: foco no simbolo do terminal (Ctrl+K).");
      return;
    }

    const canRunGlobalShortcuts = event.altKey
      && !event.ctrlKey
      && !event.metaKey
      && !isEditableElement(event.target);

    const routeShortcut = APP_ROUTE_SHORTCUTS[event.code];

    if (canRunGlobalShortcuts && routeShortcut) {
      event.preventDefault();

      if (routeShortcut !== activeAppRoute) {
        navigateToRoute(routeShortcut);
      }

      const routeLabel = APP_ROUTE_LABELS[routeShortcut] ?? routeShortcut;
      setStatus("", `Atalho ativo: rota ${routeLabel}.`);
      return;
    }

    if (!canRunGlobalShortcuts) {
      return;
    }

    const lowerKey = event.key.toLowerCase();

    if (lowerKey === "v") {
      event.preventDefault();
      setChartViewMode(chartViewMode === "tv" ? "copilot" : "tv");
      setChartLegend(`Atalho ativo: modo ${chartViewMode === "tv" ? "Terminal PRO" : "Insights IA"}.`);
      return;
    }

    if (lowerKey === "r") {
      event.preventDefault();
      void loadChart();
      void refreshWatchlistMarket({
        silent: true,
      });

      if (chartViewMode === "tv") {
        scheduleTradingViewRefresh();
      }

      setChartLegend("Atalho ativo: refresh completo do workspace.");
      return;
    }

    if (lowerKey === "f") {
      event.preventDefault();

      if (chartViewMode === "copilot") {
        fitChartContent();
      } else {
        scheduleTradingViewRefresh();
      }

      setChartLegend("Atalho ativo: recenter aplicado.");
    }
  });
}

function setupChartLab() {
  if (!chartControlsForm || !chartAssetSelect || !chartRangeSelect) {
    return;
  }

  hydrateChartPreferences();

  if (
    chartSymbolInput instanceof HTMLInputElement
    && sanitizeTerminalSymbol(chartSymbolInput.value).length < 5
  ) {
    syncTerminalSymbolWithAsset();
  } else if (chartSymbolInput instanceof HTMLInputElement) {
    chartSymbolInput.value = mapSymbolToExchange(chartSymbolInput.value, getSelectedTerminalExchange());
  }

  setActiveTerminalInterval(getSelectedTerminalInterval());
  renderWatchlist();
  watchlistDiagnostics = {
    ...watchlistDiagnostics,
    broker: getSelectedBroker(),
  };
  renderWatchlistDiagnostics();
  void refreshWatchlistMarket({
    silent: true,
  });
  setWatchlistStatus(
    watchlistLastUpdatedAt.length > 0
      ? `Ultimo sync ${formatShortTime(watchlistLastUpdatedAt)}`
      : "Aguardando sync",
  );

  chartControlsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void loadChart();
    void refreshWatchlistMarket({
      silent: true,
    });

    if (chartViewMode === "tv") {
      scheduleTradingViewRefresh();
    }

    saveChartPreferences();
  });

  chartAssetSelect.addEventListener("change", () => {
    chartHasInitialFit = false;
    syncTerminalSymbolWithAsset();
    renderWatchlist();
    void loadChart();
    void refreshWatchlistMarket({
      silent: true,
    });

    if (chartViewMode === "tv") {
      scheduleTradingViewRefresh();
    }

    saveChartPreferences();
  });

  chartRangeSelect.addEventListener("change", () => {
    chartHasInitialFit = false;
    void loadChart();
    saveChartPreferences();
  });

  if (chartModeSelect) {
    chartModeSelect.addEventListener("change", () => {
      chartHasInitialFit = false;

      if (chartModeSelect.value === "live" && !isNativeLiveModeSupported()) {
        setChartLegend("Modo live nativo indisponivel para a corretora selecionada. Aplicando fallback delayed com refresh continuo.", "error");
      }

      configureChartAutoRefresh();
      configureWatchlistAutoRefresh();
      void loadChart();
      void refreshWatchlistMarket({
        silent: true,
      });

      if (chartViewMode === "tv") {
        scheduleTradingViewRefresh();
      }

      saveChartPreferences();
    });
  }

  if (chartStyleSelect) {
    chartStyleSelect.addEventListener("change", () => {
      chartHasInitialFit = false;

      if (chartViewMode === "copilot" && currentChartSnapshot) {
        renderInteractiveChart(currentChartSnapshot);
      }

      if (chartViewMode === "tv") {
        scheduleTradingViewRefresh();
      }

      saveChartPreferences();
    });
  }

  if (chartExchangeSelect) {
    chartExchangeSelect.addEventListener("change", () => {
      if (chartSymbolInput instanceof HTMLInputElement) {
        chartSymbolInput.value = mapSymbolToExchange(chartSymbolInput.value, getSelectedTerminalExchange());
      }

      if (chartModeSelect instanceof HTMLSelectElement && chartModeSelect.value === "live" && !isNativeLiveModeSupported()) {
        setChartLegend("Live nativo indisponivel para a corretora selecionada nesta versao. Aplicando modo delayed resiliente.", "error");
      }

      renderWatchlist();
      configureChartAutoRefresh();
      configureWatchlistAutoRefresh();
      void loadChart({
        silent: true,
      });
      void refreshWatchlistMarket({
        silent: true,
      });
      scheduleTradingViewRefresh();
      saveChartPreferences();
    });
  }

  if (chartSymbolInput) {
    chartSymbolInput.addEventListener("input", () => {
      chartSymbolInput.value = mapSymbolToExchange(
        sanitizeTerminalSymbol(chartSymbolInput.value),
        getSelectedTerminalExchange(),
      );
      renderWatchlist();
      scheduleTradingViewRefresh();
      saveChartPreferences();
    });

    chartSymbolInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      chartSymbolInput.blur();
      scheduleTradingViewRefresh();
      saveChartPreferences();
    });
  }

  if (chartAutoRefreshSelect) {
    chartAutoRefreshSelect.addEventListener("change", () => {
      configureChartAutoRefresh();
      configureWatchlistAutoRefresh();

      if (chartModeSelect?.value === "live") {
        void loadChart({
          silent: true,
        });
        void refreshWatchlistMarket({
          silent: true,
        });
      }

      if (chartViewMode === "tv") {
        scheduleTradingViewRefresh();
      }

      saveChartPreferences();
    });
  }

  if (chartOverlayEmaToggle) {
    chartOverlayEmaToggle.addEventListener("change", () => {
      if (chartViewMode === "copilot" && currentChartSnapshot) {
        renderInteractiveChart(currentChartSnapshot);
      }

      saveChartPreferences();
    });
  }

  if (chartOverlayLevelsToggle) {
    chartOverlayLevelsToggle.addEventListener("change", () => {
      if (chartViewMode === "copilot" && currentChartSnapshot) {
        renderInteractiveChart(currentChartSnapshot);
      }

      saveChartPreferences();
    });
  }

  if (chartFitButton) {
    chartFitButton.addEventListener("click", () => {
      if (chartViewMode === "copilot") {
        fitChartContent();
      }

      if (chartViewMode === "tv") {
        scheduleTradingViewRefresh();
      }

      saveChartPreferences();
    });
  }

  if (chartViewSwitch instanceof HTMLElement) {
    chartViewSwitch.addEventListener("click", (event) => {
      const target = event.target;

      if (!(target instanceof HTMLButtonElement)) {
        return;
      }

      const nextMode = target.dataset.view;

      if (!nextMode) {
        return;
      }

      setChartViewMode(nextMode);
      saveChartPreferences();
    });
  }

  if (chartIntervalSwitch instanceof HTMLElement) {
    chartIntervalSwitch.addEventListener("click", (event) => {
      const target = event.target;

      if (!(target instanceof HTMLButtonElement)) {
        return;
      }

      const interval = target.dataset.interval;

      if (!interval) {
        return;
      }

      setActiveTerminalInterval(interval);
      scheduleTradingViewRefresh();
      saveChartPreferences();
    });
  }

  if (watchlistGrid instanceof HTMLElement) {
    watchlistGrid.addEventListener("click", (event) => {
      const target = event.target;
      const button = target instanceof HTMLElement ? target.closest("button.watch-item") : null;

      if (!(button instanceof HTMLButtonElement)) {
        return;
      }

      const assetId = button.dataset.assetId;
      const symbol = button.dataset.symbol;
      const exchange = button.dataset.exchange;

      if (assetId && chartAssetSelect instanceof HTMLSelectElement) {
        chartAssetSelect.value = assetId;
      }

      if (symbol && chartSymbolInput instanceof HTMLInputElement) {
        chartSymbolInput.value = symbol;
      }

      if (exchange && chartExchangeSelect instanceof HTMLSelectElement) {
        chartExchangeSelect.value = exchange;
      }

      renderWatchlist();
      chartHasInitialFit = false;
      void loadChart();
      void refreshWatchlistMarket({
        silent: true,
      });
      scheduleTradingViewRefresh();
      saveChartPreferences();
    });
  }

  if (watchlistRefreshButton) {
    watchlistRefreshButton.addEventListener("click", () => {
      void refreshWatchlistMarket();
      void loadChart({
        silent: true,
      });
      scheduleTradingViewRefresh();
    });
  }

  if (chartAnalyzeButton) {
    chartAnalyzeButton.addEventListener("click", () => {
      if (!chatInput || !chartAssetSelect || !chartRangeSelect) {
        return;
      }

      const assetId = chartAssetSelect.value;
      const range = chartRangeSelect.value;
      const mode = chartModeSelect?.value ?? "delayed";
      const exchange = getSelectedTerminalExchange();
      const modeLabel = CHART_MODE_LABELS[mode] ?? mode;
      const rangeLabel = CHART_RANGE_LABELS[range] ?? range;
      const trend = currentChartSnapshot?.insights?.trend
        ? formatTrendLabel(currentChartSnapshot.insights.trend).toLowerCase()
        : "viés indefinido";

      chatInput.value = `Analise tecnicamente o grafico de ${assetId} em ${rangeLabel}, corretora ${exchange}, modo ${modeLabel}. Quero um report completo com todos os blocos: resumo executivo, tecnica, SMC, harmonicos, WEGD, probabilistica, calculo de risco/retorno, timing, visual IA e noticias operacionais. Traga cenario de compra e venda com probabilidades, gatilho, invalidacao, TP1/TP2/TP3, confluencias e plano de gestao de risco. Se faltar dado, declare a limitacao e mantenha a analise objetiva com grau de confianca. Contexto atual: ${trend}.`;
      chatInput.focus();

      if (chatForm && !isSending) {
        chatForm.requestSubmit();
      }
    });
  }

  if (analysisTabsElement instanceof HTMLElement) {
    analysisTabsElement.addEventListener("click", (event) => {
      const target = event.target;

      if (!(target instanceof HTMLButtonElement)) {
        return;
      }

      const tabId = target.dataset.tab;

      if (!tabId || !ANALYSIS_TAB_DEFINITIONS.some((item) => item.id === tabId)) {
        return;
      }

      activeAnalysisTabId = tabId;
      renderDeepAnalysisPanel(currentChartSnapshot);

      if (tabId === "noticias" && chartAssetSelect instanceof HTMLSelectElement) {
        void loadNewsIntelligence(chartAssetSelect.value);
      }
    });
  }

  ensureInteractiveChart();
  setChartViewMode(chartViewMode);
  configureChartAutoRefresh();
  configureWatchlistAutoRefresh();
  setupChartKeyboardShortcuts();
  saveChartPreferences();
  void loadChart();
}

function setAuthFormDisabled(nextValue) {
  if (authEmailInput instanceof HTMLInputElement) {
    authEmailInput.disabled = nextValue;
  }

  if (authPasswordInput instanceof HTMLInputElement) {
    authPasswordInput.disabled = nextValue;
  }

  if (authSubmitButton instanceof HTMLButtonElement) {
    authSubmitButton.disabled = nextValue;
  }

  if (authToggleModeButton instanceof HTMLButtonElement) {
    authToggleModeButton.disabled = nextValue;
  }
}

async function handleAuthenticatedUser(nextUser) {
  const wasSameUser = activeAuthUser?.id === nextUser?.id;
  activeAuthUser = nextUser;

  if (!(nextUser && typeof nextUser.id === "string" && nextUser.id.length > 0)) {
    return;
  }

  setAuthUserLabel(`Conta: ${nextUser.email ?? nextUser.id}`);

  if (authLogoutButton instanceof HTMLButtonElement) {
    authLogoutButton.classList.remove("is-hidden");
  }

  if (clearLocalHistoryButton instanceof HTMLButtonElement) {
    clearLocalHistoryButton.textContent = "Nova";
  }

  setAuthFeedback("");
  setAuthGateVisible(false);
  setChatLockState(false);

  if (!wasSameUser || conversationItems.length === 0) {
    await initializeChatHistory();
  }
}

function handleSignedOutState() {
  activeAuthUser = null;
  conversationItems = [];
  persistActiveConversationId("");
  renderConversationList();

  if (authLogoutButton instanceof HTMLButtonElement) {
    authLogoutButton.classList.add("is-hidden");
  }

  const hasSupabase = isSupabaseConfigured && Boolean(supabase);

  if (!hasSupabase) {
    setAuthUserLabel("Supabase nao configurado.");
    setAuthStatusMessage("Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no frontend.");
    setAuthFeedback("Nao foi possivel habilitar login: configuracao Supabase ausente.", "error");
    setAuthFormDisabled(true);
    setStatus("error", "Configurar Supabase para login");
  } else {
    setAuthUserLabel("Login obrigatorio para historico por usuario.");
    setAuthFeedback("");
    setAuthFormDisabled(false);
    setStatus("", "Aguardando login");
  }

  setAuthGateVisible(true);
  setChatLockState(true);
  messages.splice(0, messages.length);
  renderMessages();
  renderRecentHistory();
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  if (!isSupabaseConfigured || !supabase || isSending) {
    return;
  }

  const email = authEmailInput instanceof HTMLInputElement ? authEmailInput.value.trim() : "";
  const password = authPasswordInput instanceof HTMLInputElement ? authPasswordInput.value : "";

  if (email.length < 5 || password.length < 6) {
    setAuthFeedback("Informe e-mail valido e senha com pelo menos 6 caracteres.", "error");
    return;
  }

  setAuthFormDisabled(true);
  setAuthFeedback("");

  try {
    if (authMode === AUTH_MODE_SIGN_UP) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        throw new Error(error.message || "Falha ao criar conta");
      }

      if (!data.session) {
        setAuthFeedback("Conta criada. Verifique seu e-mail para confirmar o cadastro.");
        setAuthStatusMessage("Aguardando confirmacao de e-mail para liberar acesso.");
        return;
      }

      await handleAuthenticatedUser(data.session.user);
      setStatus("", "Conta conectada");
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message || "Falha no login");
    }

    if (!data.session) {
      throw new Error("Sessao nao retornada pelo login");
    }

    await handleAuthenticatedUser(data.session.user);
    setStatus("", "Conta conectada");
  } catch (error) {
    setAuthFeedback(error instanceof Error ? error.message : "Falha no login", "error");
  } finally {
    setAuthFormDisabled(false);
  }
}

async function initializeAuth() {
  setAuthMode(AUTH_MODE_SIGN_IN);

  if (!(authForm instanceof HTMLFormElement)) {
    return;
  }

  authForm.addEventListener("submit", (event) => {
    void handleAuthSubmit(event);
  });

  if (authToggleModeButton instanceof HTMLButtonElement) {
    authToggleModeButton.addEventListener("click", () => {
      setAuthFeedback("");
      setAuthMode(authMode === AUTH_MODE_SIGN_IN ? AUTH_MODE_SIGN_UP : AUTH_MODE_SIGN_IN);
    });
  }

  if (authLogoutButton instanceof HTMLButtonElement) {
    authLogoutButton.addEventListener("click", () => {
      if (!supabase) {
        return;
      }

      void (async () => {
        try {
          await supabase.auth.signOut();
        } catch {
          // Ignore logout error to avoid blocking local cleanup.
        }

        handleSignedOutState();
      })();
    });
  }

  if (!isSupabaseConfigured || !supabase) {
    setAuthStatusMessage("Supabase nao configurado. Login obrigatorio para continuar.");
    handleSignedOutState();
    return;
  }

  setAuthGateVisible(true);
  setChatLockState(true);
  setAuthStatusMessage("Carregando sessao da conta...");

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      void handleAuthenticatedUser(session.user);
      return;
    }

    handleSignedOutState();
  });

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      throw new Error(error.message || "Falha ao recuperar sessao");
    }

    if (data?.session?.user) {
      await handleAuthenticatedUser(data.session.user);
      return;
    }

    handleSignedOutState();
  } catch (error) {
    setAuthFeedback(error instanceof Error ? error.message : "Falha ao carregar autenticacao", "error");
    handleSignedOutState();
  }
}

async function initializeChatHistory() {
  setStatus("loading", "Sincronizando");

  if (isCloudHistoryEnabled()) {
    try {
      await loadConversationsFromCloud();

      const hasActiveConversation = conversationItems.some((item) => item.id === activeConversationId);

      if (!hasActiveConversation) {
        const firstConversation = conversationItems[0];
        persistActiveConversationId(firstConversation?.id ?? "");
      }

      if (activeConversationId.length < 8) {
        const createdConversation = await createConversationInCloud("Nova conversa");
        persistActiveConversationId(createdConversation?.id ?? "");
      }

      if (activeConversationId.length > 0) {
        await setActiveConversation(activeConversationId);
      } else {
        replaceMessages([]);
      }

      if (messages.length === 0) {
        pushMessage(
          "assistant",
          "Pronto para ajudar. Abra uma conversa e me diga o que voce precisa analisar.",
          {
            meta: {
              model: "google/gemini-2.0-flash-001",
              time: new Date().toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          },
        );
      }

      setStatus("", "Historico da conta carregado");
      return;
    } catch (error) {
      setStatus(
        "error",
        error instanceof Error ? error.message : "Falha ao sincronizar historico da conta",
      );
      replaceMessages([]);
      return;
    }
  }

  try {
    const loadedFromBackend = await loadMessagesFromBackend();

    if (loadedFromBackend) {
      setStatus("", "Historico remoto carregado");
      return;
    }
  } catch {
    // Fallback para historico local quando API estiver indisponivel.
  }

  const storedMessages = loadMessagesFromLocalStorage();

  if (storedMessages.length > 0) {
    replaceMessages(storedMessages);
    setStatus("", "Historico local carregado");
    return;
  }

  pushMessage(
    "assistant",
    "Pronto para ajudar. Peça um resumo de mercado, riscos de curto prazo, panorama macro ou analise tecnica de grafico.",
    {
      meta: {
        model: "google/gemini-2.0-flash-001",
        time: new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    },
  );

  setStatus("", "Pronto");
}

if (chatForm) {
  chatForm.addEventListener("submit", (event) => {
    void handleSubmit(event);
  });
}

if (chatInput) {
  chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      chatForm?.requestSubmit();
    }
  });
}

window.addEventListener("beforeunload", () => {
  if (airdropQueryDebounceTimer !== null) {
    window.clearTimeout(airdropQueryDebounceTimer);
    airdropQueryDebounceTimer = null;
  }

  stopChartAutoRefresh();
  stopMemecoinAutoRefresh();
  stopWatchlistAutoRefresh();
  destroyInteractiveChart();
});

setupQuickPrompts();
setupAppShellRouting();
setupLocalHistoryControls();
setupMarketNavigator();
setupChartLab();
setupAirdropRadarPanel();
setupMemecoinRadarPanel();
void (async () => {
  await initializeAuth();
})();