import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
} from "lightweight-charts";
import "./styles.css";

const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const sendButton = document.querySelector("#send-button");
const messagesContainer = document.querySelector("#messages");
const statusPill = document.querySelector("#connection-status");
const quickPromptsContainer = document.querySelector("#quick-prompts");
const activeModelElement = document.querySelector("#active-model");
const recentHistoryElement = document.querySelector("#recent-history");
const clearLocalHistoryButton = document.querySelector("#clear-local-history");
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
const chartViewport = document.querySelector("#chart-viewport");
const chartMetricsElement = document.querySelector("#chart-metrics");
const chartAnalyzeButton = document.querySelector("#chart-analyze-button");

const CHAT_HISTORY_STORAGE_KEY = "botfinanceiro.copilot.history.v1";
const CHAT_SESSION_STORAGE_KEY = "botfinanceiro.copilot.session.v1";
const CHART_PREFERENCES_STORAGE_KEY = "botfinanceiro.chart.preferences.v1";
const MAX_STORED_MESSAGES = 60;
const MAX_RECENT_HISTORY_ITEMS = 8;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
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
const TERMINAL_STYLE_TO_TV = {
  area: "3",
  bars: "0",
  candles: "1",
  heikin: "8",
  line: "2",
};
const TRADINGVIEW_SCRIPT_URL = "https://s3.tradingview.com/tv.js";
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
let chatSessionId = getOrCreateSessionId();
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
let tvScriptLoadingPromise = null;
let tvMountIdCounter = 0;
let terminalRefreshTimer = null;
let watchlistAutoRefreshTimer = null;
let watchlistMarketByAsset = new Map();
let watchlistLastUpdatedAt = "";
let isWatchlistLoading = false;

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
  try {
    const compactMessages = messages.slice(-MAX_STORED_MESSAGES);
    localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(compactMessages));
  } catch {
    // Ignore storage errors to keep chat interaction working.
  }
}

function loadMessagesFromLocalStorage() {
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

function getSelectedTerminalSymbol() {
  const symbolFromInput = sanitizeTerminalSymbol(
    chartSymbolInput instanceof HTMLInputElement ? chartSymbolInput.value : "",
  );

  if (symbolFromInput.length >= 5) {
    return symbolFromInput;
  }

  const selectedAsset = chartAssetSelect instanceof HTMLSelectElement
    ? chartAssetSelect.value
    : "bitcoin";
  return ASSET_TO_TERMINAL_SYMBOL[selectedAsset] ?? "BTCUSDT";
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

  chartSymbolInput.value = mappedSymbol;
}

function renderWatchlist() {
  if (!(watchlistGrid instanceof HTMLElement)) {
    return;
  }

  const activeSymbol = getSelectedTerminalSymbol();
  watchlistGrid.innerHTML = "";

  for (const item of TERMINAL_WATCHLIST) {
    const marketSnapshot = watchlistMarketByAsset.get(item.assetId) ?? null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `watch-item${item.symbol === activeSymbol ? " is-active" : ""}`;

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

    button.dataset.assetId = item.assetId;
    button.dataset.exchange = item.exchange;
    button.dataset.symbol = item.symbol;

    const identityElement = document.createElement("div");
    identityElement.className = "watch-identity";

    const symbolElement = document.createElement("strong");
    symbolElement.textContent = item.symbol;

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

async function requestBrokerLiveQuote(assetId) {
  const response = await fetch(
    buildApiUrl(
      `/v1/brokers/live-quote?broker=binance&assetId=${encodeURIComponent(assetId)}`,
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
    throw new Error(typeof message === "string" ? message : "Falha ao consultar broker");
  }

  const market = payload?.data?.market;

  return {
    changePercent24h:
      typeof market?.changePercent24h === "number" ? market.changePercent24h : Number.NaN,
    fetchedAt: typeof payload?.data?.fetchedAt === "string" ? payload.data.fetchedAt : "",
    price: typeof market?.price === "number" ? market.price : Number.NaN,
    status: "ok",
  };
}

async function requestSpotPriceFallback(assetId) {
  const response = await fetch(
    buildApiUrl(`/v1/crypto/spot-price?assetId=${encodeURIComponent(assetId)}&currency=usd`),
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
    throw new Error(typeof message === "string" ? message : "Falha ao consultar spot fallback");
  }

  return {
    changePercent24h: Number.NaN,
    fetchedAt: typeof payload?.data?.fetchedAt === "string" ? payload.data.fetchedAt : "",
    price: typeof payload?.data?.price === "number" ? payload.data.price : Number.NaN,
    status: "fallback",
  };
}

async function refreshWatchlistMarket(options = {}) {
  if (isWatchlistLoading) {
    return;
  }

  const silent = options.silent === true;
  isWatchlistLoading = true;
  setWatchlistLoadingState(true);

  const nextMarketByAsset = new Map();
  let successCount = 0;
  let fallbackCount = 0;

  try {
    const batchSize = 5;

    for (let index = 0; index < TERMINAL_WATCHLIST.length; index += batchSize) {
      const batch = TERMINAL_WATCHLIST.slice(index, index + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          try {
            const snapshot = await requestBrokerLiveQuote(item.assetId);
            return [item.assetId, snapshot];
          } catch {
            try {
              const fallbackSnapshot = await requestSpotPriceFallback(item.assetId);
              return [item.assetId, fallbackSnapshot];
            } catch {
              return [
                item.assetId,
                {
                  changePercent24h: Number.NaN,
                  fetchedAt: "",
                  price: Number.NaN,
                  status: "error",
                },
              ];
            }
          }
        }),
      );

      for (const [assetId, snapshot] of batchResults) {
        nextMarketByAsset.set(assetId, snapshot);

        if (snapshot.status === "ok") {
          successCount += 1;
        }

        if (snapshot.status === "fallback") {
          fallbackCount += 1;
        }
      }
    }

    watchlistMarketByAsset = nextMarketByAsset;
    watchlistLastUpdatedAt = new Date().toISOString();
    renderWatchlist();

    const statusLabel = `${successCount}/${TERMINAL_WATCHLIST.length} live • fb ${fallbackCount} • ${formatShortTime(watchlistLastUpdatedAt)}`;
    setWatchlistStatus(statusLabel);

    if (!silent) {
      setChartLegend(`Watchlist sincronizada: ${statusLabel}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na sincronizacao da watchlist";
    setWatchlistStatus(message, "error");

    if (!silent) {
      setChartLegend(message, "error");
    }
  } finally {
    isWatchlistLoading = false;
    setWatchlistLoadingState(false);
  }
}

function stopWatchlistAutoRefresh() {
  if (watchlistAutoRefreshTimer !== null) {
    window.clearInterval(watchlistAutoRefreshTimer);
    watchlistAutoRefreshTimer = null;
  }
}

function configureWatchlistAutoRefresh() {
  stopWatchlistAutoRefresh();

  if (!(chartModeSelect instanceof HTMLSelectElement) || chartModeSelect.value !== "live") {
    return;
  }

  const baseInterval = resolveAutoRefreshIntervalMs();
  const refreshIntervalMs = baseInterval > 0
    ? Math.max(WATCHLIST_REFRESH_MIN_INTERVAL_MS, baseInterval * 2)
    : WATCHLIST_REFRESH_MIN_INTERVAL_MS;

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

function loadTradingViewScript() {
  if (window.TradingView?.widget) {
    return Promise.resolve();
  }

  if (tvScriptLoadingPromise) {
    return tvScriptLoadingPromise;
  }

  tvScriptLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TRADINGVIEW_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar biblioteca TradingView"));
    document.head.append(script);
  }).catch((error) => {
    tvScriptLoadingPromise = null;
    throw error;
  });

  return tvScriptLoadingPromise;
}

function createTradingViewMountId() {
  tvMountIdCounter += 1;
  return `tv-widget-mount-${tvMountIdCounter}`;
}

function buildTradingViewWatchlist() {
  return TERMINAL_WATCHLIST.map((entry) => `${entry.exchange}:${entry.symbol}`);
}

async function mountTradingViewWidget() {
  if (chartViewMode !== "tv" || !(tvWidgetContainer instanceof HTMLElement)) {
    return;
  }

  try {
    setChartStatus("Carregando terminal profissional...", "loading");
    await loadTradingViewScript();

    const mountId = createTradingViewMountId();
    tvWidgetContainer.innerHTML = `<div id="${mountId}" class="tv-widget-mount"></div>`;

    const symbol = buildTradingViewSymbol();
    const interval = getSelectedTerminalInterval();
    const selectedStyle = getSelectedTerminalStyle();
    const style = TERMINAL_STYLE_TO_TV[selectedStyle] ?? "1";

    if (typeof window.TradingView?.widget !== "function") {
      throw new Error("API TradingView indisponivel neste momento");
    }

    // TradingView global é carregado dinamicamente pelo script oficial.
    window.TradingView.widget({
      allow_symbol_change: true,
      autosize: true,
      calendar: true,
      container_id: mountId,
      details: true,
      enable_publishing: false,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      hotlist: true,
      interval,
      locale: "br",
      save_image: true,
      style,
      studies: ["Volume@tv-basicstudies", "RSI@tv-basicstudies", "MACD@tv-basicstudies"],
      symbol,
      theme: "dark",
      timezone: "Etc/UTC",
      toolbar_bg: "#0f2138",
      watchlist: buildTradingViewWatchlist(),
      withdateranges: true,
    });

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

function resolveChartStyle() {
  const style = chartStyleSelect instanceof HTMLSelectElement ? chartStyleSelect.value : "candles";

  if (style === "line" || style === "area") {
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
  ensureBaseSeries(style);
  ensureChartOverlaySeries();

  if (!chartBaseSeries) {
    return;
  }

  const baseData = style === "candles"
    ? candles.map((candle) => ({
      close: candle.close,
      high: candle.high,
      low: candle.low,
      open: candle.open,
      time: candle.time,
    }))
    : candles.map((candle) => ({
      time: candle.time,
      value: candle.close,
    }));

  chartBaseSeries.setData(baseData);

  const showEma = !(chartOverlayEmaToggle instanceof HTMLInputElement)
    || chartOverlayEmaToggle.checked;

  if (showEma) {
    chartEmaFastSeries?.setData(computeEmaSeries(candles, 9));
    chartEmaSlowSeries?.setData(computeEmaSeries(candles, 21));
  } else {
    chartEmaFastSeries?.setData([]);
    chartEmaSlowSeries?.setData([]);
  }

  const showLevels = !(chartOverlayLevelsToggle instanceof HTMLInputElement)
    || chartOverlayLevelsToggle.checked;
  applyChartLevels(snapshot, showLevels);

  chartLatestCandles = candles;
  chartCandleByTime = new Map(candles.map((candle) => [candle.time, candle]));
  updateChartLegendFromCandle(candles[candles.length - 1], snapshot);

  if (!chartHasInitialFit) {
    fitChartContent();
    chartHasInitialFit = true;
  }
}

function renderChartMetrics(snapshot) {
  if (!chartMetricsElement) {
    return;
  }

  const insights = snapshot?.insights;

  if (!insights) {
    chartMetricsElement.innerHTML = "";
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
}

async function requestCryptoChartEndpoint(assetId, range, mode) {
  const endpoint = mode === "live" ? "/v1/crypto/live-chart" : "/v1/crypto/chart";
  const query = mode === "live"
    ? `assetId=${encodeURIComponent(assetId)}&range=${encodeURIComponent(range)}`
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

async function requestCryptoChart(assetId, range, mode) {
  try {
    const snapshot = await requestCryptoChartEndpoint(assetId, range, mode);

    return {
      fallbackReason: "",
      snapshot,
    };
  } catch (error) {
    if (mode !== "live") {
      throw error;
    }

    const fallbackSnapshot = await requestCryptoChartEndpoint(assetId, range, "delayed");

    return {
      fallbackReason:
        error instanceof Error ? error.message : "Live indisponivel, fallback delayed acionado",
      snapshot: fallbackSnapshot,
    };
  }
}

async function loadChart(options = {}) {
  if (!chartAssetSelect || !chartRangeSelect) {
    return;
  }

  if (isChartLoading) {
    return;
  }

  const assetId = options.assetId ?? chartAssetSelect.value;
  const mode = options.mode ?? chartModeSelect?.value ?? "delayed";
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
    const { fallbackReason, snapshot } = await requestCryptoChart(assetId, range, mode);

    if (!snapshot || !Array.isArray(snapshot.points)) {
      throw new Error("Resposta de grafico invalida");
    }

    currentChartSnapshot = snapshot;

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
    const fallbackLabel = fallbackReason.length > 0
      ? " • live indisponivel, usando delayed"
      : "";
    const updatedAtLabel = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    setChartStatus(
      `Grafico ${assetId.toUpperCase()} (${modeLabel}, ${rangeLabel}, ${styleLabel}) • provider ${providerLabel} • ${cacheLabel}${refreshLabel}${liveLabel}${fallbackLabel} • atualizado ${updatedAtLabel}`,
    );

    if (chartViewMode === "tv") {
      setChartLegend(
        `Terminal ${buildTradingViewSymbol()} ativo • intervalo ${getSelectedTerminalInterval()} • estilo ${styleLabel}`,
      );
    } else if (fallbackReason.length > 0) {
      setChartLegend(`Fallback ativo: ${fallbackReason}. Exibindo delayed temporariamente.`, "error");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar grafico";
    setChartStatus(message, "error");
    clearChartSurface();
    setChartLegend("Falha ao carregar o grafico. Tente atualizar.", "error");
    renderChartMetrics(null);
    currentChartSnapshot = null;
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

  if (!chartModeSelect || chartModeSelect.value !== "live") {
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
    sendButton.disabled = nextValue;
    sendButton.textContent = nextValue ? "Consultando..." : "Enviar ao Copiloto";
  }

  if (chatInput) {
    chatInput.disabled = nextValue;
  }

  setStatus(nextValue ? "loading" : "", nextValue ? "Consultando" : "Pronto");
}

async function requestCopilotCompletion(message) {
  const response = await fetch(buildApiUrl("/v1/copilot/chat"), {
    body: JSON.stringify({
      maxTokens: 350,
      message,
      sessionId: chatSessionId,
      temperature: 0.1,
    }),
    headers: {
      "Content-Type": "application/json",
    },
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
  const response = await fetch(
    buildApiUrl(`/v1/copilot/history?sessionId=${encodeURIComponent(chatSessionId)}&limit=${MAX_STORED_MESSAGES}`),
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

  if (!chatInput || isSending) {
    return;
  }

  const prompt = chatInput.value.trim();

  if (prompt.length === 0) {
    return;
  }

  pushMessage("user", prompt, {
    meta: {
      time: new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
  });

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

    pushMessage("assistant", aiData.answer, {
      meta: {
        model: aiData.model,
        time: new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        totalTokens: aiData.usage?.totalTokens,
      },
    });

    setStatus("", "Pronto");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao consultar a IA";

    pushMessage("assistant", message, {
      error: true,
      meta: {
        time: new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    });

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
  if (!clearLocalHistoryButton) {
    return;
  }

  clearLocalHistoryButton.addEventListener("click", () => {
    rotateSessionId();
    messages.splice(0, messages.length);
    localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
    renderMessages();
    renderRecentHistory();
    setStatus("", "Nova sessao iniciada");
    chatInput?.focus();
  });
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
  }

  setActiveTerminalInterval(getSelectedTerminalInterval());
  renderWatchlist();
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
      renderWatchlist();
      scheduleTradingViewRefresh();
      saveChartPreferences();
    });
  }

  if (chartSymbolInput) {
    chartSymbolInput.addEventListener("input", () => {
      chartSymbolInput.value = sanitizeTerminalSymbol(chartSymbolInput.value);
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
      const modeLabel = CHART_MODE_LABELS[mode] ?? mode;
      const rangeLabel = CHART_RANGE_LABELS[range] ?? range;
      const trend = currentChartSnapshot?.insights?.trend
        ? formatTrendLabel(currentChartSnapshot.insights.trend).toLowerCase()
        : "viés indefinido";

      chatInput.value = `Analise tecnicamente o grafico de ${assetId} em ${rangeLabel} no modo ${modeLabel}, com tendencia, momentum, volatilidade, RSI, MACD, ATR, suporte/resistencia e sinal tatico (buy/sell/wait) com confianca e niveis de entrada/stop/take-profit. Contexto atual: ${trend}.`;
      chatInput.focus();

      if (chatForm && !isSending) {
        chatForm.requestSubmit();
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

async function initializeChatHistory() {
  setStatus("loading", "Sincronizando");

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
  stopChartAutoRefresh();
  stopWatchlistAutoRefresh();
  destroyInteractiveChart();
});

setupQuickPrompts();
setupLocalHistoryControls();
setupChartLab();
void initializeChatHistory();