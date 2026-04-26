import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
} from "lightweight-charts";
import { isSupabaseConfigured, supabase } from "./shared/supabase-client.js";
import { createCounter } from "@botfinanceiro/shared-utils";
import { parseStreamPayload } from "./shared/parse-stream-payload.js";
import { scheduleRender } from "./shared/schedule-render.js";
import { filterOutOtc, getAssetFilterSnapshot } from "./shared/asset-filters.js";
import { setLiveStatus, getLiveStatusSnapshot, LIVE_STATUS } from "./shared/live-status-indicator.js";
import { initPushNotifications } from "./shared/push-notifications.js";
import { initPaperTradingPanel } from "./shared/paper-trading-panel.js";
import { initBacktestingPanel } from "./shared/backtesting-panel.js";
import { bootstrapLiveSignals } from "./live-signals.js";
import { bootstrapExecutiveReport, generateExecutiveReport } from "./executive-report.js";
import { PriceZonesPrimitive } from "./chart-zones-primitive.js";
import {
  classifyProbabilisticTone,
  computeProbabilisticHistoricalStats,
  computeProbabilisticHourlySeasonality,
  computeProbabilisticKurtosis,
  computeProbabilisticMonthlySeasonality,
  computeProbabilisticRiskMetrics,
  computeProbabilisticReturnsSeries,
  computeProbabilisticSkewness,
  computeProbabilisticWeekdaySeasonality,
  detectProbabilisticCandlePatterns,
  formatProbabilisticPercent,
  PROBABILISTIC_MIN_RETURNS_FOR_STATS,
  PROBABILISTIC_WEEKDAY_LABELS,
  runProbabilisticMonteCarloProjection,
} from "./modules/chart-lab/quant/probabilistic.js";
import { buildExecutionGateSnapshot } from "./modules/chart-lab/quant/execution-gate.js";
import { buildExecutionPlanSnapshot } from "./modules/chart-lab/quant/execution-plan.js";
import { buildExecutionQualitySnapshot } from "./modules/chart-lab/quant/execution-quality.js";
import { buildExecutionAutomationGuardSnapshot } from "./modules/chart-lab/quant/execution-automation.js";
import {
  BACKEND_MOMENTUM_BLEND_LOCAL_WEIGHT,
  BACKEND_MOMENTUM_BLEND_REMOTE_WEIGHT,
  DIRECTIONAL_BIAS_CLAMP,
  INSTITUTIONAL_BIAS_WEIGHT,
  KINETIC_ACCELERATION_BIAS_CLAMP,
  KINETIC_ACCELERATION_BIAS_SCALE,
  KINETIC_ACCELERATION_MOMENTUM_FACTOR,
  KINETIC_COOLING_BIAS_CLAMP,
  KINETIC_COOLING_BIAS_SCALE,
  KINETIC_EXPLOSIVE_BIAS,
  MOMENTUM_BIAS_CLAMP,
  MOMENTUM_BIAS_SCALE,
  MOMENTUM_BOOST_CLAMP_MAX,
  MOMENTUM_BOOST_CLAMP_MIN,
  MOMENTUM_BOOST_COOLING_DECEL_SCALE,
  MOMENTUM_BOOST_EXPLOSIVE,
  MOMENTUM_BOOST_POI_HIT,
  MOMENTUM_DIRECTION_THRESHOLD,
  MOMENTUM_LABEL_MODERATE_THRESHOLD,
  MOMENTUM_LABEL_STRONG_THRESHOLD,
  MOMENTUM_STRENGTH_SCALE,
  NEUTRAL_ADJ_EXPLOSIVE,
  NEUTRAL_ADJ_POI_COOLING,
  NEUTRAL_ADJ_POI_ONLY,
  NEUTRAL_BASE_BOOST_DEFAULT,
  NEUTRAL_BASE_BOOST_LOW_MOMENTUM,
  NEUTRAL_LOW_MOMENTUM_THRESHOLD,
  NEUTRAL_PROBABILITY_CLAMP_MAX,
  POI_BIAS_CLUSTER,
  POI_BIAS_LABEL_BUYER_THRESHOLD,
  POI_BIAS_LABEL_SELLER_THRESHOLD,
  POI_BIAS_MIDNIGHT_OPEN,
  POI_BIAS_PREVIOUS_HIGH,
  POI_BIAS_PREVIOUS_LOW,
  PROBABILITY_CLAMP_MAX,
  PROBABILITY_CLAMP_MIN,
  SIGNAL_TONE_BIAS_BONUS,
  SUGGESTED_EXPIRY_BAR_MULTIPLIER,
  SUGGESTED_EXPIRY_MAX_SECONDS,
  SUGGESTED_EXPIRY_MIN_SECONDS,
  TRIGGER_HEAT_DIRECTIONAL_WEIGHT,
  TRIGGER_HEAT_HOT_DIRECTIONAL_MIN,
  TRIGGER_HEAT_HOT_MOMENTUM_MIN,
  TRIGGER_HEAT_HOT_NEUTRAL_MAX,
  TRIGGER_HEAT_MOMENTUM_WEIGHT,
  TRIGGER_HEAT_NEUTRAL_PENALTY,
  TRIGGER_HEAT_WARM_DIRECTIONAL_MIN,
  TRIGGER_HEAT_WARM_MOMENTUM_MIN,
  TRIGGER_HEAT_WARM_NEUTRAL_MAX,
} from "./modules/chart-lab/quant/micro-timing-config.js";
import {
  buildAutoSignalPayload as buildOperatorAutoSignalPayload,
  canSubmitAutoSignal as canSubmitOperatorAutoSignal,
  clearOperatorSettings as clearOperatorSettingsStore,
  loadOperatorSettings as loadOperatorSettingsStore,
  PAPER_TRADING_OPERATOR_MIN_TOKEN_LENGTH,
  saveOperatorSettings as saveOperatorSettingsStore,
  submitAutoSignal as submitOperatorAutoSignal,
} from "./modules/chart-lab/quant/paper-trading-operator-client.js";
import {
  appendOperatorJournalEntry,
  clearOperatorJournal as clearOperatorJournalStore,
  createOperatorJournalEntry,
  loadOperatorJournal as loadOperatorJournalStore,
  PAPER_TRADING_OPERATOR_BREAKER_FAILURE_THRESHOLD,
  saveOperatorJournal as saveOperatorJournalStore,
  shouldTripOperatorBreaker,
  summarizeOperatorJournal,
} from "./modules/chart-lab/quant/paper-trading-operator-journal.js";
import {
  fetchCentralOperatorJournal,
  summarizeCentralJournalSnapshot,
} from "./modules/chart-lab/quant/paper-trading-operator-central-journal.js";
import {
  appendExecutionJournalEntry,
  createExecutionJournalEntry,
  createExecutionJournalState,
  getRecentExecutionJournalEntries,
  sanitizeExecutionJournalState,
  settleExecutionJournalEntries,
  summarizeExecutionJournal,
} from "./modules/chart-lab/quant/execution-journal.js";
import {
  classifyRiskLabRuinTone,
  loadRiskLabState,
  persistRiskLabState,
  RISK_LAB_STRATEGY_OPTIONS,
  runMonteCarloRiskSimulation,
} from "./modules/chart-lab/quant/risk-lab.js";
import {
  classifyPositionAssetSpec,
  computePositionCalc,
  describePositionAssetSpec,
  loadPositionCalcState,
  persistPositionCalcState,
  POSITION_CALC_PROFILES,
} from "./modules/chart-lab/quant/position-calculator.js";
import { buildLiquidityHeatmapSnapshot } from "./modules/chart-lab/quant/liquidity-heatmap.js";
import { buildMarketRegimeSnapshot } from "./modules/chart-lab/quant/market-regime.js";
import { buildTimingOrderFlowSnapshot } from "./modules/chart-lab/quant/order-flow.js";
import { deriveSmcConfluence } from "./modules/chart-lab/quant/smc-derivations.js";
import { buildVisualIntelligenceEvidence } from "./modules/chart-lab/quant/visual-intelligence.js";
import { createChartLabStore } from "./modules/chart-lab/chart-lab-store.js";
import { createChartLoadController } from "./modules/chart-lab/chart-load-controller.js";
import { createChartLiveStreamController } from "./modules/chart-lab/chart-live-stream-controller.js";
import {
  createChartAssetGeneration,
  isStaleChartAssetGenerationError,
} from "./modules/chart-lab/chart-asset-generation.js";
import { resetChartAssetContext } from "./modules/chart-lab/chart-asset-context-reset.js";
import {
  buildBinaryOptionsLiveStreamDescriptor,
  buildCryptoLiveStreamDescriptor,
} from "./modules/chart-lab/chart-live-stream-selection.js";
import {
  resolveChartLiveStreamBrokerSelection,
  resolveNextAutoBrokerAfterLiveFailure,
} from "./modules/chart-lab/chart-live-failover.js";
import "./styles.css";

const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const sendButton = document.querySelector("#send-button");
const messagesContainer = document.querySelector("#messages");
const appSidebarElement = document.querySelector("#app-sidebar");
const appRouteNavElement = document.querySelector("#app-route-nav");
const sidebarToggleButton = document.querySelector("#sidebar-toggle");
const mobileMenuToggleButton = document.querySelector("#mobile-menu-toggle");
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
const heroSection = document.querySelector(".hero");
const marketNavigatorSection = document.querySelector(".market-navigator");
const workspaceStageSection = document.querySelector(".workspace-stage");
const chartDeskSection = document.querySelector(".chart-desk");
const layoutGridSection = document.querySelector(".layout-grid");
const intelligenceStageSection = document.querySelector(".intelligence-stage");
const memecoinsStageSection = document.querySelector(".memecoins-stage");
const airdropsStageSection = document.querySelector(".airdrops-stage");
const paperTradingPanelSection = document.querySelector("#paper-trading-panel");
const backtestingPanelSection = document.querySelector("#backtesting-panel");
const liveSignalsStageSection = document.querySelector("#live-signals-stage");
const chartControlsForm = document.querySelector("#chart-controls");
const chartAssetSelect = document.querySelector("#chart-asset");
const chartModeSelect = document.querySelector("#chart-mode");
const chartOperationalModeSelect = document.querySelector("#chart-operational-mode");
const chartRangeSelect = document.querySelector("#chart-range");
const chartRefreshButton = document.querySelector("#chart-refresh-button");
const chartStyleSelect = document.querySelector("#chart-style");
const chartAutoRefreshSelect = document.querySelector("#chart-auto-refresh");
const chartExchangeSelect = document.querySelector("#chart-exchange");
const chartSymbolInput = document.querySelector("#chart-symbol");
const chartOverlayEmaToggle = document.querySelector("#chart-overlay-ema");
const chartOverlayLevelsToggle = document.querySelector("#chart-overlay-levels");
const chartFitButton = document.querySelector("#chart-fit-button");
const chartAnalyzeMarketButton = document.querySelector("#chart-analyze-market-button");
const chartViewSwitch = document.querySelector("#chart-view-switch");
const chartIntervalSwitch = document.querySelector("#chart-interval-switch");
const chartIntervalMenuButton = document.querySelector("#chart-interval-menu-button");
const chartIntervalMenu = document.querySelector("#chart-interval-menu");
const chartIntervalMenuList = document.querySelector("#chart-interval-menu-list");
const chartIntervalMenuCurrent = document.querySelector("#chart-interval-menu-current");
const chartOperationalModeTagElement = document.querySelector("#chart-operational-mode-tag");
const chartFallbackBadgeElement = document.querySelector("#chart-fallback-badge");
const chartLiveStatusElement = document.querySelector("#chart-live-status");

function updateChartLiveStatus(status, options) {
  if (!(chartLiveStatusElement instanceof HTMLElement)) {
    return;
  }

  setLiveStatus(chartLiveStatusElement, status, options ?? {});
}

if (typeof window !== "undefined") {
  window.__botfinanceiroDebug = window.__botfinanceiroDebug ?? {};
  window.__botfinanceiroDebug.liveStatusSnapshot = () => getLiveStatusSnapshot();
  window.__botfinanceiroDebug.assetFilterSnapshot = () => getAssetFilterSnapshot();
}
const chartStatusElement = document.querySelector("#chart-status");
const chartLegendElement = document.querySelector("#chart-legend");
const chartCopilotStage = document.querySelector("#chart-copilot-stage");
const tvStage = document.querySelector("#tv-stage");
const tvWidgetContainer = document.querySelector("#tv-widget");
const watchlistGrid = document.querySelector("#watchlist-grid");
const watchlistRefreshButton = document.querySelector("#watchlist-refresh");
const watchlistStatusElement = document.querySelector("#watchlist-status");
const watchlistDiagnosticsElement = document.querySelector("#watchlist-diagnostics");
const watchlistRiskSummaryElement = document.querySelector("#watchlist-risk-summary");
const propModeToggle = document.querySelector("#prop-mode-toggle");
const propModeStatusElement = document.querySelector("#prop-mode-status");
const propAccountSizeInput = document.querySelector("#prop-account-size");
const propRiskPercentInput = document.querySelector("#prop-risk-percent");
const propStopLossInput = document.querySelector("#prop-stop-loss");
const propLotResultElement = document.querySelector("#prop-lot-result");
const propExitStrategySelect = document.querySelector("#prop-exit-strategy");
const propStrategyHintElement = document.querySelector("#prop-strategy-hint");
const prop3x7WinsElement = document.querySelector("#prop-3x7-wins");
const prop3x7LossesElement = document.querySelector("#prop-3x7-losses");
const prop3x7StatusElement = document.querySelector("#prop-3x7-status");
const prop3x7WinButton = document.querySelector("#prop-3x7-win");
const prop3x7LossButton = document.querySelector("#prop-3x7-loss");
const prop3x7ResetButton = document.querySelector("#prop-3x7-reset");
const chartViewport = document.querySelector("#chart-viewport");
const chartExecutionHudElement = document.querySelector("#chart-execution-hud");
const chartMetricsElement = document.querySelector("#chart-metrics");
const chartAnalyzeButton = document.querySelector("#chart-analyze-button");
const analysisPanel = document.querySelector("#analysis-panel");
const analysisStatusElement = document.querySelector("#analysis-status");
const intelligenceSyncOpsPanelElement = document.querySelector("#intelligence-sync-ops");
const intelligenceSyncOpsBadgeElement = document.querySelector("#intelligence-sync-ops-badge");
const intelligenceSyncOpsStatusElement = document.querySelector("#intelligence-sync-ops-status");
const intelligenceSyncOpsSuccessRateElement = document.querySelector("#intelligence-sync-ops-success-rate");
const intelligenceSyncOpsP95Element = document.querySelector("#intelligence-sync-ops-p95");
const intelligenceSyncOpsAvgElement = document.querySelector("#intelligence-sync-ops-avg");
const intelligenceSyncOpsRequestsElement = document.querySelector("#intelligence-sync-ops-requests");
const intelligenceSyncOpsUpdatedElement = document.querySelector("#intelligence-sync-ops-updated");
const analysisSignalCardElement = document.querySelector("#analysis-signal-card");
const analysisTriggerNarrativeElement = document.querySelector("#analysis-trigger-narrative");
const analysisEnsembleEngineElement = document.querySelector("#analysis-ensemble-engine");
const analysisEnsembleListElement = document.querySelector("#analysis-ensemble-list");
const analysisEnsembleModeElement = document.querySelector("#analysis-ensemble-mode");
const analysisContextCardElement = document.querySelector("#analysis-context-card");
const institutionalSummaryElement = document.querySelector("#institutional-summary");
const institutionalConfluenceBadgeElement = document.querySelector("#institutional-confluence-badge");
const institutionalSummaryGridElement = document.querySelector("#institutional-summary-grid");
const institutionalContextStripElement = document.querySelector("#institutional-context-strip");
const institutionalChecklistElement = document.querySelector("#institutional-checklist");
const analysisTabsElement = document.querySelector("#analysis-tabs");
const analysisTabContentElement = document.querySelector("#analysis-tab-content");
const riskManagementTabPanel = document.querySelector("#risk-management-tab-panel");
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
const PROP_DESK_STORAGE_KEY = "botfinanceiro.chart.propDesk.v1";
const BINARY_OPTIONS_RISK_STORAGE_KEY = "botfinanceiro.chart.binaryOptionsRisk.v1";
const WATCHLIST_RISK_SUMMARY_COLLAPSED_STORAGE_KEY = "botfinanceiro.chart.watchlistRiskSummaryCollapsed.v1";
const MAX_STORED_MESSAGES = 60;
const MAX_RECENT_HISTORY_ITEMS = 8;
const MAX_CONVERSATIONS = 60;
const MARKET_HTTP_RETRY_MAX_ATTEMPTS = 3;
const MARKET_HTTP_RETRY_BASE_DELAY_MS = 280;
const BROKER_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const BROKER_CIRCUIT_BREAKER_COOLDOWN_MS = 120000;
const CHART_AUTO_BROKER_STICKY_MS = 180000;
const CHART_TRANSIENT_LEGEND_MIN_INTERVAL_MS = 8000;
const CHART_STREAM_ERROR_LEGEND_DEFER_MS = 2500;
const WATCHLIST_STREAM_FALLBACK_POLL_MS = 6000;
const CHART_STREAM_FALLBACK_POLL_MS = 4000;
const CHART_CONTEXT_SYNC_DEBOUNCE_MS = 280;
const INTELLIGENCE_SYNC_METRICS_MAX_SAMPLES = 60;
const INTELLIGENCE_SYNC_ALERT_WARNING_P95_MS = 1200;
const INTELLIGENCE_SYNC_ALERT_CRITICAL_P95_MS = 2000;
const INTELLIGENCE_SYNC_ALERT_WARNING_SUCCESS_RATE_PERCENT = 95;
const INTELLIGENCE_SYNC_ALERT_CRITICAL_SUCCESS_RATE_PERCENT = 90;
const INTELLIGENCE_SYNC_ALERT_MIN_INTERVAL_MS = 45000;
const INTELLIGENCE_SYNC_TELEMETRY_ENDPOINT = "/v1/crypto/intelligence-sync/telemetry";
const BINARY_OPTIONS_GHOST_AUDIT_SETTLEMENT_ENDPOINT = "/v1/binary-options/ghost-audit/settlements";
const BINARY_OPTIONS_GHOST_AUDIT_HISTORY_ENDPOINT = "/v1/binary-options/ghost-audit/history";
const BINARY_OPTIONS_GHOST_AUDIT_HISTORY_REFRESH_MS = 20000;
const BINARY_OPTIONS_GHOST_AUDIT_HISTORY_LIMIT = 300;
const GHOST_AUDIT_OPERATIONAL_MODE_BINARY_OPTIONS = "binary_options";
const GHOST_AUDIT_OPERATIONAL_MODE_SPOT_MARGIN = "spot_margin";
const BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_SESSION = "session";
const BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_INSTITUTIONAL = "institutional";
const INTELLIGENCE_SYNC_HEALTH_ENDPOINT = "/internal/health/intelligence-sync";
const INTELLIGENCE_SYNC_HEALTH_REFRESH_MS = 20000;
const INTELLIGENCE_SYNC_HEALTH_STALE_AFTER_MS = 90000;
const INTELLIGENCE_SYNC_INTERNAL_TOKEN_ENV = (import.meta.env.VITE_INTERNAL_API_TOKEN ?? "").trim();
const INTELLIGENCE_SYNC_INTERNAL_TOKEN_SESSION_STORAGE_KEY = "botfinanceiro.internalApiToken.session.v1";
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const APP_ROUTE_CHAT = "chat";
const APP_ROUTE_CHART_LAB = "chart-lab";
const APP_ROUTE_MERCADOS = "mercados";
const APP_ROUTE_MEMECOINS = "memecoins";
const APP_ROUTE_AIRDROPS = "airdrops";
const APP_ROUTE_PAPER = "paper";
const APP_ROUTE_BACKTESTING = "backtesting";
const APP_ROUTE_LIVE_SIGNALS = "live-signals";
const APP_ROUTES = new Set([
  APP_ROUTE_CHAT,
  APP_ROUTE_CHART_LAB,
  APP_ROUTE_MERCADOS,
  APP_ROUTE_MEMECOINS,
  APP_ROUTE_AIRDROPS,
  APP_ROUTE_PAPER,
  APP_ROUTE_BACKTESTING,
  APP_ROUTE_LIVE_SIGNALS,
]);
const APP_ROUTE_LABELS = {
  [APP_ROUTE_CHAT]: "Chat",
  [APP_ROUTE_CHART_LAB]: "Chart Lab",
  [APP_ROUTE_MERCADOS]: "Mercados",
  [APP_ROUTE_MEMECOINS]: "Memecoins",
  [APP_ROUTE_AIRDROPS]: "Airdrops",
  [APP_ROUTE_PAPER]: "Paper Trading",
  [APP_ROUTE_BACKTESTING]: "Backtesting",
  [APP_ROUTE_LIVE_SIGNALS]: "Sinais ao Vivo",
};
const APP_ROUTE_SHORTCUTS = {
  Digit7: APP_ROUTE_CHAT,
  Digit8: APP_ROUTE_CHART_LAB,
  Digit9: APP_ROUTE_MERCADOS,
  Digit0: APP_ROUTE_MEMECOINS,
  Minus: APP_ROUTE_AIRDROPS,
};
const AUTH_MODE_SIGN_IN = "signin";
const AUTH_MODE_SIGN_UP = "signup";
const SUPABASE_CONVERSATIONS_TABLE = "copilot_user_conversations";
const SUPABASE_MESSAGES_TABLE = "copilot_user_messages";
const WATCHLIST_REFRESH_MIN_INTERVAL_MS = 20000;
const TERMINAL_INTERVAL_DEFAULT = "60";
const TERMINAL_INTERVAL_FAVORITE_DEFAULTS = ["1", "5", "60", "240", "1D", "1W"];
const TERMINAL_INTERVAL_SHORTCUTS = {
  Digit1: "1",
  Digit2: "5",
  Digit3: "60",
  Digit4: "240",
  Digit5: "1D",
  Digit6: "1W",
};
const TERMINAL_INTERVAL_GROUP_ORDER = ["ticks", "seconds", "minutes", "hours", "days", "ranges"];
const TERMINAL_INTERVAL_GROUP_LABELS = {
  days: "Dias",
  hours: "Horas",
  minutes: "Minutos",
  ranges: "Ranges",
  seconds: "Segundos",
  ticks: "Ticks",
};
const TERMINAL_INTERVAL_DEFINITIONS = [
  {
    backendResolution: null,
    defaultRange: "24h",
    group: "ticks",
    label: "1 tick",
    tvResolution: "1T",
    value: "1T",
  },
  {
    backendResolution: null,
    defaultRange: "24h",
    group: "ticks",
    label: "10 ticks",
    tvResolution: "10T",
    value: "10T",
  },
  {
    backendResolution: null,
    defaultRange: "24h",
    group: "ticks",
    label: "100 ticks",
    tvResolution: "100T",
    value: "100T",
  },
  {
    backendResolution: null,
    defaultRange: "24h",
    group: "ticks",
    label: "1000 ticks",
    tvResolution: "1000T",
    value: "1000T",
  },
  {
    backendResolution: "1S",
    defaultRange: "24h",
    group: "seconds",
    label: "1 segundo",
    tvResolution: "1S",
    value: "1S",
  },
  {
    backendResolution: "5S",
    defaultRange: "24h",
    group: "seconds",
    label: "5 segundos",
    tvResolution: "5S",
    value: "5S",
  },
  {
    backendResolution: "10S",
    defaultRange: "24h",
    group: "seconds",
    label: "10 segundos",
    tvResolution: "10S",
    value: "10S",
  },
  {
    backendResolution: "15S",
    defaultRange: "24h",
    group: "seconds",
    label: "15 segundos",
    tvResolution: "15S",
    value: "15S",
  },
  {
    backendResolution: "30S",
    defaultRange: "24h",
    group: "seconds",
    label: "30 segundos",
    tvResolution: "30S",
    value: "30S",
  },
  {
    backendResolution: "45S",
    defaultRange: "24h",
    group: "seconds",
    label: "45 segundos",
    tvResolution: "45S",
    value: "45S",
  },
  {
    backendResolution: "1",
    defaultRange: "24h",
    group: "minutes",
    label: "1 minuto",
    tvResolution: "1",
    value: "1",
  },
  {
    backendResolution: "2",
    defaultRange: "24h",
    group: "minutes",
    label: "2 minutos",
    tvResolution: "2",
    value: "2",
  },
  {
    backendResolution: "3",
    defaultRange: "24h",
    group: "minutes",
    label: "3 minutos",
    tvResolution: "3",
    value: "3",
  },
  {
    backendResolution: "5",
    defaultRange: "24h",
    group: "minutes",
    label: "5 minutos",
    tvResolution: "5",
    value: "5",
  },
  {
    backendResolution: "10",
    defaultRange: "24h",
    group: "minutes",
    label: "10 minutos",
    tvResolution: "10",
    value: "10",
  },
  {
    backendResolution: "15",
    defaultRange: "24h",
    group: "minutes",
    label: "15 minutos",
    tvResolution: "15",
    value: "15",
  },
  {
    backendResolution: "30",
    defaultRange: "7d",
    group: "minutes",
    label: "30 minutos",
    tvResolution: "30",
    value: "30",
  },
  {
    backendResolution: "45",
    defaultRange: "7d",
    group: "minutes",
    label: "45 minutos",
    tvResolution: "45",
    value: "45",
  },
  {
    backendResolution: "60",
    defaultRange: "7d",
    group: "hours",
    label: "1 hora",
    tvResolution: "60",
    value: "60",
  },
  {
    backendResolution: "120",
    defaultRange: "7d",
    group: "hours",
    label: "2 horas",
    tvResolution: "120",
    value: "120",
  },
  {
    backendResolution: "180",
    defaultRange: "30d",
    group: "hours",
    label: "3 horas",
    tvResolution: "180",
    value: "180",
  },
  {
    backendResolution: "240",
    defaultRange: "30d",
    group: "hours",
    label: "4 horas",
    tvResolution: "240",
    value: "240",
  },
  {
    backendResolution: "D",
    defaultRange: "90d",
    group: "days",
    label: "1 dia",
    tvResolution: "D",
    value: "1D",
  },
  {
    backendResolution: "W",
    defaultRange: "1y",
    group: "days",
    label: "1 semana",
    tvResolution: "W",
    value: "1W",
  },
  {
    backendResolution: "M",
    defaultRange: "1y",
    group: "days",
    label: "1 mes",
    tvResolution: "M",
    value: "1M",
  },
  {
    backendResolution: null,
    defaultRange: "24h",
    group: "ranges",
    label: "1 range",
    tvResolution: "1R",
    value: "1R",
  },
  {
    backendResolution: null,
    defaultRange: "24h",
    group: "ranges",
    label: "10 ranges",
    tvResolution: "10R",
    value: "10R",
  },
  {
    backendResolution: null,
    defaultRange: "24h",
    group: "ranges",
    label: "100 ranges",
    tvResolution: "100R",
    value: "100R",
  },
  {
    backendResolution: null,
    defaultRange: "24h",
    group: "ranges",
    label: "1000 ranges",
    tvResolution: "1000R",
    value: "1000R",
  },
];
const TERMINAL_INTERVAL_DEFINITION_MAP = new Map(
  TERMINAL_INTERVAL_DEFINITIONS.map((definition) => [definition.value, definition]),
);
const TERMINAL_INTERVAL_SET = new Set(TERMINAL_INTERVAL_DEFINITION_MAP.keys());
const TERMINAL_INTERVAL_TO_CHART_RANGE = {
  ...Object.fromEntries(
    TERMINAL_INTERVAL_DEFINITIONS.map((definition) => [definition.value, definition.defaultRange]),
  ),
};
const TERMINAL_INTERVAL_BACKEND_FALLBACK = "1";
const TERMINAL_INTERVAL_BINARY_OPTIONS_FALLBACK = "1S";
const TERMINAL_INTERVAL_MENU_MAX_FAVORITES = 8;
const TERMINAL_INTERVAL_MENU_MIN_FAVORITES = 1;
const TERMINAL_INTERVAL_MENU_TV_ONLY_META = "Somente Terminal PRO";
const TERMINAL_INTERVAL_MENU_INSTITUTIONAL_META = "Recalcula IA nesta granularidade";
const TERMINAL_INTERVAL_MENU_SHORTCUT_META = "Atalho Alt+1..6";
const TERMINAL_INTERVAL_MENU_FALLBACK_MESSAGE =
  "A corretora atual nao fornece dados de [%INTERVAL%] para este ativo. Fallback automatico para [%FALLBACK%].";
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
const CHART_OPERATIONAL_MODE_SPOT_MARGIN = "spot_margin";
const CHART_OPERATIONAL_MODE_BINARY_OPTIONS = "binary_options";
const CHART_OPERATIONAL_MODES = new Set([
  CHART_OPERATIONAL_MODE_SPOT_MARGIN,
  CHART_OPERATIONAL_MODE_BINARY_OPTIONS,
]);
const CHART_OPERATIONAL_MODE_LABELS = {
  [CHART_OPERATIONAL_MODE_BINARY_OPTIONS]: "Opcoes Binarias (Micro-Timing)",
  [CHART_OPERATIONAL_MODE_SPOT_MARGIN]: "Spot/Margem",
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
    description: "Mesa por pais para leitura global de ativos e indicadores.",
    hiddenInCategoryList: true,
    id: "paises",
    label: "Paises",
    views: [
      {
        id: "paises-brasil",
        label: "Brasil",
        limit: 8,
        module: "b3",
        preset: "indices",
      },
      {
        id: "paises-estados-unidos",
        label: "Estados Unidos",
        limit: 8,
        module: "wall-street",
        preset: "indices",
      },
      {
        id: "paises-canada",
        label: "Canada",
        limit: 8,
        module: "equities",
        preset: "global_brands",
      },
      {
        id: "paises-reino-unido",
        label: "Reino Unido",
        limit: 8,
        module: "equities",
        preset: "global_brands",
      },
      {
        id: "paises-alemanha",
        label: "Alemanha",
        limit: 8,
        module: "equities",
        preset: "global_brands",
      },
      {
        id: "paises-india",
        label: "India",
        limit: 8,
        module: "equities",
        preset: "global_brands",
      },
      {
        id: "paises-japao",
        label: "Japao",
        limit: 8,
        module: "wall-street",
        preset: "indices",
      },
      {
        id: "paises-china",
        label: "China Continental",
        limit: 8,
        module: "equities",
        preset: "global_brands",
      },
      {
        id: "paises-hong-kong",
        label: "Hong Kong, China",
        limit: 8,
        module: "equities",
        preset: "global_brands",
      },
      {
        id: "paises-arabia-saudita",
        label: "Arabia Saudita",
        limit: 8,
        module: "equities",
        preset: "global_brands",
      },
      {
        id: "paises-australia",
        label: "Australia",
        limit: 8,
        module: "equities",
        preset: "global_brands",
      },
      {
        id: "paises-mais",
        label: "Mais paises...",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
    ],
  },
  {
    description: "Noticias e fornecedores editoriais para leitura de risco.",
    hiddenInCategoryList: true,
    id: "noticias",
    label: "Noticias",
    views: [
      {
        id: "noticias-visao-geral",
        label: "Visao geral",
        limit: 8,
        type: "news",
        assetId: "bitcoin",
      },
      {
        id: "noticias-atividade-corporativa",
        label: "Atividade corporativa",
        limit: 8,
        type: "news",
        assetId: "ethereum",
      },
      {
        id: "noticias-group-fornecedores",
        label: "Melhores fornecedores",
        type: "group",
      },
      {
        id: "noticias-reuters",
        label: "Reuters",
        limit: 8,
        type: "news",
        assetId: "bitcoin",
      },
      {
        id: "noticias-afp",
        label: "AFP",
        limit: 8,
        type: "news",
        assetId: "ethereum",
      },
      {
        id: "noticias-invezz",
        label: "Invezz",
        limit: 8,
        type: "news",
        assetId: "solana",
      },
      {
        id: "noticias-beincrypto",
        label: "Beincrypto",
        limit: 8,
        type: "news",
        assetId: "chainlink",
      },
      {
        id: "noticias-globenewswire",
        label: "GlobeNewswire",
        limit: 8,
        type: "news",
        assetId: "avalanche-2",
      },
      {
        id: "noticias-agricolas",
        label: "Noticias Agricolas",
        limit: 8,
        type: "news",
        assetId: "cardano",
      },
      {
        id: "noticias-livecoins",
        label: "Livecoins",
        limit: 8,
        type: "news",
        assetId: "xrp",
      },
    ],
  },
  {
    description: "Indices globais e cortes por familia de cotacoes.",
    id: "indices",
    label: "Indices",
    views: [
      {
        id: "indices-visao-geral",
        label: "Visao geral",
        limit: 8,
        module: "wall-street",
        preset: "indices",
      },
      {
        id: "indices-group-cotacoes",
        label: "Cotacoes",
        type: "group",
      },
      {
        id: "indices-todos",
        label: "Todos os indices",
        limit: 8,
        module: "wall-street",
        preset: "indices",
      },
      {
        id: "indices-principais-globais",
        label: "Principais indices globais",
        limit: 8,
        module: "wall-street",
        preset: "indices",
      },
      {
        id: "indices-eua",
        label: "Indices dos EUA",
        limit: 8,
        module: "wall-street",
        preset: "indices",
      },
      {
        id: "indices-setores-sp",
        label: "Setores S&P",
        limit: 8,
        module: "wall-street",
        preset: "sectors",
      },
      {
        id: "indices-moedas",
        label: "Indices de Moedas",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
    ],
  },
  {
    description: "Acoes por recorte setorial, desempenho e geografias.",
    id: "acoes",
    label: "Acoes",
    views: [
      {
        id: "acoes-visao-geral",
        label: "Visao geral",
        limit: 8,
        module: "equities",
        preset: "us_mega_caps",
      },
      {
        id: "acoes-setores-industrias",
        label: "Setores e industrias",
        limit: 8,
        module: "equities",
        preset: "global_brands",
      },
      {
        id: "acoes-group-brasil",
        label: "Acoes Brasil",
        type: "group",
      },
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
        id: "acoes-melhores",
        label: "Melhores desempenhos",
        limit: 8,
        module: "b3",
        preset: "blue_chips",
      },
      {
        id: "acoes-piores",
        label: "Piores desempenhos",
        limit: 8,
        module: "equities",
        preset: "global_brands",
      },
      {
        id: "acoes-group-mundiais",
        label: "Acoes Mundiais",
        type: "group",
      },
      {
        id: "acoes-maiores-mundo",
        label: "Maiores empresas do mundo",
        limit: 8,
        module: "equities",
        preset: "global_brands",
      },
      {
        id: "acoes-maiores-fora-eua",
        label: "Maiores empresas fora dos EUA",
        limit: 8,
        module: "equities",
        preset: "global_brands",
      },
      {
        id: "acoes-maiores-empregadoras",
        label: "Maiores empregadoras do mundo",
        limit: 8,
        module: "equities",
        preset: "us_mega_caps",
      },
    ],
  },
  {
    description: "Cripto por market cap, dominancia e filtros de moedas.",
    id: "cripto",
    label: "Cripto",
    views: [
      {
        id: "cripto-visao-geral",
        label: "Visao geral",
        limit: 10,
        module: "crypto",
      },
      {
        id: "cripto-market-cap",
        label: "Graficos de Market cap",
        limit: 10,
        module: "crypto",
      },
      {
        id: "cripto-dominancia",
        label: "Grafico de dominancia",
        limit: 10,
        module: "crypto",
      },
      {
        id: "cripto-group-moedas",
        label: "Moedas",
        type: "group",
      },
      {
        id: "cripto-todas-moedas",
        label: "Todas as Moedas",
        limit: 10,
        module: "crypto",
      },
      {
        id: "cripto-moedas-defi",
        label: "Moedas DeFi",
        limit: 8,
        module: "defi",
        preset: "blue_chips",
      },
      {
        id: "cripto-maior-valor-bloqueado",
        label: "Maior valor bloqueado",
        limit: 8,
        module: "defi",
        preset: "lending",
      },
      {
        id: "cripto-melhores-desempenhos",
        label: "Melhores desempenhos",
        limit: 10,
        module: "crypto",
      },
      {
        id: "cripto-piores-desempenhos",
        label: "Piores desempenhos",
        limit: 10,
        module: "crypto",
      },
      {
        id: "cripto-large-cap",
        label: "Large-cap",
        limit: 10,
        module: "crypto",
      },
      {
        id: "cripto-mais-negociadas",
        label: "Mais negociadas",
        limit: 10,
        module: "crypto",
      },
      {
        id: "cripto-mais-transacoes",
        label: "Mais transacoes",
        limit: 10,
        module: "crypto",
      },
      {
        id: "cripto-maior-oferta",
        label: "Maior oferta",
        limit: 10,
        module: "crypto",
      },
      {
        id: "cripto-menor-oferta",
        label: "Menor oferta",
        limit: 10,
        module: "crypto",
      },
    ],
  },
  {
    description: "Mesa de futuros por bloco de precos e classes.",
    id: "futuros",
    label: "Futuros",
    views: [
      {
        id: "futuros-visao-geral",
        label: "Visao geral",
        limit: 8,
        module: "futures",
        preset: "crypto_majors",
      },
      {
        id: "futuros-group-precos",
        label: "Precos",
        type: "group",
      },
      {
        id: "futuros-todos",
        label: "Todos os futuros",
        limit: 8,
        module: "futures",
        preset: "crypto_majors",
      },
      {
        id: "futuros-agricola",
        label: "Agricola",
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
        id: "futuros-moedas",
        label: "Moedas",
        limit: 8,
        module: "futures",
        preset: "layer1",
      },
      {
        id: "futuros-metais",
        label: "Metais",
        limit: 8,
        module: "commodities",
        preset: "metals",
      },
      {
        id: "futuros-indices-internacionais",
        label: "Indices Internacionais",
        limit: 8,
        module: "wall-street",
        preset: "indices",
      },
      {
        id: "futuros-juros",
        label: "Juros",
        limit: 8,
        module: "fixed-income",
        preset: "us_curve",
      },
    ],
  },
  {
    description: "Forex por cotacoes cruzadas, calor e blocos regionais.",
    id: "forex",
    label: "Forex",
    views: [
      {
        id: "forex-visao-geral",
        label: "Visao geral",
        limit: 8,
        module: "forex",
        preset: "global",
      },
      {
        id: "forex-cotacoes-cruzada",
        label: "Cotacoes Cruzada",
        limit: 8,
        module: "forex",
        preset: "majors",
      },
      {
        id: "forex-mapa-calor",
        label: "Mapa de Calor",
        limit: 8,
        module: "forex",
        preset: "global",
      },
      {
        id: "forex-indices-moedas",
        label: "Indices de Moedas",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
      {
        id: "forex-group-cotacoes",
        label: "Cotacoes",
        type: "group",
      },
      {
        id: "forex-todos-pares",
        label: "Todos os pares de moedas",
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
        id: "forex-secundario",
        label: "Secundario",
        limit: 8,
        module: "forex",
        preset: "global",
      },
      {
        id: "forex-exotico",
        label: "Exotico",
        limit: 8,
        module: "forex",
        preset: "latam",
      },
      {
        id: "forex-americas",
        label: "Americas",
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
      {
        id: "forex-pacifico",
        label: "Pacifico",
        limit: 8,
        module: "forex",
        preset: "asia",
      },
      {
        id: "forex-oriente-medio",
        label: "Oriente Medio",
        limit: 8,
        module: "forex",
        preset: "global",
      },
      {
        id: "forex-africa",
        label: "Africa",
        limit: 8,
        module: "forex",
        preset: "global",
      },
    ],
  },
  {
    description: "Titulos soberanos por curva e geografias de yield.",
    id: "titulos_governo",
    label: "Titulos do Governo",
    views: [
      {
        id: "governo-visao-geral",
        label: "Visao geral",
        limit: 8,
        module: "fixed-income",
        preset: "us_curve",
      },
      {
        id: "governo-curva",
        label: "Curva de rendimento",
        limit: 8,
        module: "fixed-income",
        preset: "us_curve",
      },
      {
        id: "governo-mapa-calor-yield",
        label: "Mapa de Calor Yield",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
      {
        id: "governo-group-cotacoes",
        label: "Cotacoes",
        type: "group",
      },
      {
        id: "governo-todos-titulos",
        label: "Todos os titulos",
        limit: 8,
        module: "fixed-income",
        preset: "us_curve",
      },
      {
        id: "governo-todos-10a",
        label: "Todos 10A",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
      {
        id: "governo-principais-10a",
        label: "Principais 10A",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
      {
        id: "governo-americas",
        label: "Americas",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
      {
        id: "governo-europa",
        label: "Europa",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
      {
        id: "governo-asia",
        label: "Asia",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
      {
        id: "governo-pacifico",
        label: "Pacifico",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
      {
        id: "governo-oriente-medio",
        label: "Oriente Medio",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
      {
        id: "governo-africa",
        label: "Africa",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
    ],
  },
  {
    description: "Credito corporativo por perfil de yield e duracao.",
    id: "titulos_corporativos",
    label: "Titulos corporativos",
    views: [
      {
        id: "corporativo-visao-geral",
        label: "Visao geral",
        limit: 8,
        module: "fixed-income",
        preset: "credit_proxies",
      },
      {
        id: "corporativo-group-cotacoes",
        label: "Cotacoes",
        type: "group",
      },
      {
        id: "corporativo-maior-yield",
        label: "Maior yield",
        limit: 8,
        module: "fixed-income",
        preset: "credit_proxies",
      },
      {
        id: "corporativo-longo-prazo",
        label: "Longo prazo",
        limit: 8,
        module: "fixed-income",
        preset: "rates_risk",
      },
      {
        id: "corporativo-curto-prazo",
        label: "Curto prazo",
        limit: 8,
        module: "fixed-income",
        preset: "rates_risk",
      },
      {
        id: "corporativo-taxa-variavel",
        label: "Taxa variavel",
        limit: 8,
        module: "fixed-income",
        preset: "rates_risk",
      },
      {
        id: "corporativo-taxa-fixa",
        label: "Taxa fixa",
        limit: 8,
        module: "fixed-income",
        preset: "rates_risk",
      },
      {
        id: "corporativo-cupom-zero",
        label: "Cupom zero",
        limit: 8,
        module: "fixed-income",
        preset: "rates_risk",
      },
    ],
  },
  {
    description: "ETFs por tamanho, fluxo, tema e classe de ativo.",
    id: "etfs",
    label: "ETFs",
    views: [
      {
        id: "etfs-visao-geral",
        label: "Visao geral",
        limit: 8,
        module: "etfs",
        preset: "broad_market",
      },
      {
        id: "etfs-group-fundos",
        label: "Fundos",
        type: "group",
      },
      {
        id: "etfs-maiores",
        label: "Maiores ETFs",
        limit: 8,
        module: "etfs",
        preset: "broad_market",
      },
      {
        id: "etfs-maior-aum",
        label: "Maior crescimento de AUM",
        limit: 8,
        module: "etfs",
        preset: "thematic",
      },
      {
        id: "etfs-maiores-retornos",
        label: "Maiores retornos",
        limit: 8,
        module: "etfs",
        preset: "broad_market",
      },
      {
        id: "etfs-maiores-perdas",
        label: "Maiores perdas",
        limit: 8,
        module: "etfs",
        preset: "broad_market",
      },
      {
        id: "etfs-mais-negociadas",
        label: "Mais negociadas",
        limit: 8,
        module: "etfs",
        preset: "broad_market",
      },
      {
        id: "etfs-maior-yield",
        label: "Maior yield",
        limit: 8,
        module: "etfs",
        preset: "fixed_income",
      },
      {
        id: "etfs-acoes",
        label: "Acoes",
        limit: 8,
        module: "etfs",
        preset: "broad_market",
      },
      {
        id: "etfs-bitcoin",
        label: "Bitcoin",
        limit: 8,
        module: "etfs",
        preset: "thematic",
      },
      {
        id: "etfs-ethereum",
        label: "Ethereum",
        limit: 8,
        module: "etfs",
        preset: "thematic",
      },
      {
        id: "etfs-ouro",
        label: "Ouro",
        limit: 8,
        module: "etfs",
        preset: "thematic",
      },
      {
        id: "etfs-renda-fixa",
        label: "Renda fixa",
        limit: 8,
        module: "etfs",
        preset: "fixed_income",
      },
      {
        id: "etfs-commodities",
        label: "Commodities",
        limit: 8,
        module: "etfs",
        preset: "international",
      },
    ],
  },
  {
    description: "Macro global por paises e indicadores estruturais.",
    id: "economia_mundial",
    label: "Economia mundial",
    views: [
      {
        id: "economia-visao-geral",
        label: "Visao geral",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
      {
        id: "economia-mapa-calor",
        label: "Mapa de Calor",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
      {
        id: "economia-tendencias-globais",
        label: "Tendencias globais",
        limit: 8,
        module: "macro-rates",
        preset: "risk_regime",
      },
      {
        id: "economia-group-paises",
        label: "Paises",
        type: "group",
      },
      {
        id: "economia-todos-paises",
        label: "Todos os paises",
        limit: 8,
        module: "wall-street",
        preset: "indices",
      },
      {
        id: "economia-brasil",
        label: "Brasil",
        limit: 8,
        module: "b3",
        preset: "indices",
      },
      {
        id: "economia-eua",
        label: "Estados Unidos",
        limit: 8,
        module: "wall-street",
        preset: "indices",
      },
      {
        id: "economia-china",
        label: "China Continental",
        limit: 8,
        module: "equities",
        preset: "global_brands",
      },
      {
        id: "economia-uniao-europeia",
        label: "Uniao Europeia",
        limit: 8,
        module: "equities",
        preset: "global_brands",
      },
      {
        id: "economia-japao",
        label: "Japao",
        limit: 8,
        module: "wall-street",
        preset: "indices",
      },
      {
        id: "economia-group-indicadores",
        label: "Indicadores",
        type: "group",
      },
      {
        id: "economia-todos-indicadores",
        label: "Todos os indicadores",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
      {
        id: "economia-pib",
        label: "PIB",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
      {
        id: "economia-taxa-juros",
        label: "Taxa de juros",
        limit: 8,
        module: "macro-rates",
        preset: "global_rates",
      },
      {
        id: "economia-taxa-inflacao",
        label: "Taxa de inflacao",
        limit: 8,
        module: "macro-rates",
        preset: "inflation_proxies",
      },
      {
        id: "economia-taxa-desemprego",
        label: "Taxa de desemprego",
        limit: 8,
        module: "macro-rates",
        preset: "risk_regime",
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
    id: "micro_timing",
    label: "Micro-Timing",
  },
  {
    id: "calculadora",
    label: "Calculadora",
  },
  {
    id: "gestao_risco",
    label: "Gestao de risco",
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
const BINARY_OPTIONS_HIDDEN_ANALYSIS_TABS = new Set([
  "smc",
  "wegd",
]);
const TERMINAL_STYLE_TO_TV = {
  area: "3",
  bars: "0",
  candles: "1",
  heikin: "8",
  line: "2",
};
const TRADINGVIEW_EMBED_BASE_URL = "https://s.tradingview.com/widgetembed/";
const EXCHANGE_TO_BROKER = {
  AUTO: "auto",
  BINANCE: "binance",
  BYBIT: "bybit",
  COINBASE: "coinbase",
  KRAKEN: "kraken",
  OKX: "okx",
};
const BROKER_FAILOVER_ORDER = ["binance", "bybit", "coinbase", "kraken", "okx"];
const EXCHANGES_WITH_NATIVE_LIVE = new Set(["AUTO", "BINANCE", "BYBIT", "COINBASE", "KRAKEN", "OKX"]);
const INSTITUTIONAL_MACRO_MODULES = new Set([
  "b3",
  "commodities",
  "equities",
  "etfs",
  "fiis",
  "fixed-income",
  "forex",
  "futures",
  "global-sectors",
  "macro-rates",
  "options",
  "wall-street",
]);
const FOREX_FIAT_CODES = new Set([
  "AED",
  "ARS",
  "AUD",
  "BRL",
  "CAD",
  "CHF",
  "CLP",
  "CNY",
  "COP",
  "CZK",
  "DKK",
  "EGP",
  "EUR",
  "GBP",
  "HKD",
  "HUF",
  "ILS",
  "INR",
  "JPY",
  "KRW",
  "MXN",
  "NOK",
  "NZD",
  "PEN",
  "PLN",
  "QAR",
  "RUB",
  "SAR",
  "SEK",
  "SGD",
  "THB",
  "TRY",
  "USD",
  "ZAR",
]);
const TERMINAL_WATCHLIST_RAW = [
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
const TERMINAL_WATCHLIST = filterOutOtc(TERMINAL_WATCHLIST_RAW);
const ASSET_TO_TERMINAL_SYMBOL = Object.fromEntries(
  TERMINAL_WATCHLIST.map((entry) => [entry.assetId, entry.symbol]),
);
const PROP_DESK_EXIT_STRATEGY_LABELS = {
  arbitrage_ab:
    "AB: prefira pares correlacionados e reduza risco direcional quando o macro radar estiver em amarelo/vermelho.",
  three_by_seven:
    "3x7: alvo operacional de 3 wins em 10 trades, com foco em consistencia e controle de drawdown.",
};
const PROP_DESK_DEFAULT_STATE = Object.freeze({
  accountSize: 10000,
  exitStrategy: "three_by_seven",
  propModeEnabled: false,
  riskPercent: 1,
  stopLoss: 12,
  trackerLosses: 0,
  trackerWins: 0,
});
const BINARY_OPTIONS_RISK_DEFAULT_STATE = Object.freeze({
  bankroll: 1000,
  payoutPercent: 82,
  stake: 20,
});
const BINARY_OPTIONS_GHOST_TRACKER_DEFAULTS = Object.freeze({
  cooldownSeconds: 20,
  fallbackExpirySeconds: 60,
  maxConcurrentSignals: 4,
  maxNeutralProbability: 24,
  minDirectionalProbability: 75,
  minMomentumStrength: 34,
  minProbabilityEdge: 6,
  resultHistoryLimit: 30,
});
const SPOT_MARGIN_GHOST_TRACKER_DEFAULTS = Object.freeze({
  cooldownSeconds: 45,
  fallbackExpirySeconds: 300,
  maxConcurrentSignals: 3,
  maxNeutralProbability: 32,
  minDirectionalProbability: 63,
  minProbabilityEdge: 7,
  resultHistoryLimit: 40,
});

const messages = [];
let isSending = false;
let isChatLockedByAuth = false;
let chatSessionId = getOrCreateSessionId();
let activeConversationId = getStoredConversationId();
let activeAppRoute = APP_ROUTE_CHAT;
let isSidebarCollapsed = false;
let isMobileSidebarOpen = false;
let authMode = AUTH_MODE_SIGN_IN;
let activeAuthUser = null;
let conversationItems = [];
const chartLabStore = createChartLabStore({
  operationalMode: CHART_OPERATIONAL_MODE_SPOT_MARGIN,
});
const chartLabState = {
  get snapshot() {
    return chartLabStore.getSnapshot();
  },
  set snapshot(snapshot) {
    chartLabStore.setSnapshot(snapshot);
  },
  get isLoading() {
    return chartLabStore.getLoading();
  },
  set isLoading(isLoading) {
    chartLabStore.setLoading(isLoading);
  },
  get viewMode() {
    return chartLabStore.getViewMode();
  },
  set viewMode(viewMode) {
    chartLabStore.setViewMode(viewMode);
  },
  get operationalMode() {
    return chartLabStore.getOperationalMode();
  },
  set operationalMode(operationalMode) {
    chartLabStore.setOperationalMode(operationalMode);
  },
  get symbolSourceModule() {
    return chartLabStore.getSymbolSourceModule();
  },
  set symbolSourceModule(symbolSourceModule) {
    chartLabStore.setSymbolSourceModule(symbolSourceModule);
  },
  get strategy() {
    return chartLabStore.getStrategy();
  },
  set strategy(strategy) {
    chartLabStore.setStrategy(strategy);
  },
};
const chartLoadController = createChartLoadController({
  getLoading: () => chartLabState.isLoading,
  setLoading: (isLoading) => {
    chartLabState.isLoading = isLoading;
  },
});
const chartAssetGeneration = createChartAssetGeneration();
const chartLiveStreamController = createChartLiveStreamController({
  liveStatus: LIVE_STATUS,
  timers: window,
  updateLiveStatus: (status) => updateChartLiveStatus(status),
});
let chartAutoRefreshTimer = null;
let chartAutoPreferredBroker = "binance";
let chartAutoPreferredBrokerLockUntilMs = 0;
let chartLastTransientLegendMessage = "";
let chartLastTransientLegendAtMs = 0;
let chartContextSyncTimer = null;
let intelligenceSyncPendingStartedAtMs = 0;
let intelligenceSyncActiveCorrelationId = "";
let intelligenceSyncAlertLevel = "ok";
let intelligenceSyncLastAlertAtMs = 0;
let intelligenceSyncLatencySamplesMs = [];
let intelligenceSyncHealthPollTimer = null;
let intelligenceSyncHealthInFlight = false;
let intelligenceSyncBackendHealthSnapshot = null;
let intelligenceSyncBackendHealthError = "";
let intelligenceSyncInternalToken = "";
let intelligenceSyncMetrics = {
  alertLevel: "ok",
  averageLatencyMs: 0,
  failed: 0,
  lastContextId: "",
  lastCorrelationId: "",
  lastLatencyMs: null,
  lastReason: "",
  lastSyncedAt: "",
  p95LatencyMs: 0,
  requests: 0,
  success: 0,
  successRatePercent: 0,
};
let chartApi = null;
let chartBaseSeries = null;
let chartBaseSeriesStyle = "";
let chartEmaFastSeries = null;
let chartEmaSlowSeries = null;
let chartPriceLines = [];
let chartZonesPrimitive = null; // ADR-077: Series Primitive para zonas SMC + Position Tool R:R
let chartResizeObserver = null;
let chartLatestCandles = [];
let chartCandleByTime = new Map();
let chartHasInitialFit = false;
let activeTerminalInterval = TERMINAL_INTERVAL_DEFAULT;
let favoriteTerminalIntervals = new Set(TERMINAL_INTERVAL_FAVORITE_DEFAULTS);
let isChartIntervalMenuOpen = false;
let tvMountIdCounter = 0;
let terminalRefreshTimer = null;
let watchlistAutoRefreshTimer = null;
let watchlistStream = null;
let watchlistStreamBackoffTimer = null;
let watchlistStreamReconnectAttempt = 0;
let watchlistStreamBroker = "";
let watchlistAutoPreferredBroker = "binance";
let watchlistStreamFallbackPollTimer = null;
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
// ADR-073 — Central WEGD Institucional. Sub-tab persistente entre sessões.
const WEGD_SUBTAB_PERSISTENCE_KEY = "botfinanceiro:wegd:subtab:v1";
const WEGD_SUBTAB_IDS = ["wyckoff", "elliott", "gann", "dow"];
const WEGD_SUBTAB_LABELS = {
  wyckoff: "Wyckoff",
  elliott: "Elliott",
  gann: "Gann",
  dow: "Dow",
};
const WEGD_SUBTAB_ICONS = {
  wyckoff: "◬",
  elliott: "≋",
  gann: "◎",
  dow: "▤",
};
let activeWegdSubTabId = "wyckoff";
(function hydrateWegdSubTabFromStorage() {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const raw = window.localStorage.getItem(WEGD_SUBTAB_PERSISTENCE_KEY);
    if (raw && WEGD_SUBTAB_IDS.includes(raw)) activeWegdSubTabId = raw;
  } catch { /* graceful: storage indisponível mantém default */ }
})();
function persistWegdSubTab() {
  if (typeof window === "undefined" || !window.localStorage) return;
  try { window.localStorage.setItem(WEGD_SUBTAB_PERSISTENCE_KEY, activeWegdSubTabId); }
  catch { /* graceful: quota/private mode mantém em memória */ }
}
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
let brokerFailureStreakByName = new Map();
let brokerCircuitOpenUntilByName = new Map();
let propDeskState = {
  ...PROP_DESK_DEFAULT_STATE,
};
let binaryOptionsRiskState = {
  ...BINARY_OPTIONS_RISK_DEFAULT_STATE,
};
let binaryOptionsGhostTrackerState = createBinaryOptionsGhostTrackerState();
let spotMarginGhostTrackerState = createSpotMarginGhostTrackerState();
let binaryOptionsGhostAuditBackendState = createBinaryOptionsGhostAuditBackendState();
let binaryOptionsGhostAuditViewMode = BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_SESSION;
let executionJournalState = createExecutionJournalState();
let latestTimingExecutionContext = null;
let isPropDeskInitialized = false;
let isWatchlistRiskSummaryCollapsed = false;

const GHOST_TRACKER_PERSISTENCE_KEY = "botfinanceiro:ghost-tracker:v1";
const GHOST_TRACKER_PERSIST_DEBOUNCE_MS = 180;
let ghostTrackerPersistTimer = null;
const EXECUTION_JOURNAL_PERSISTENCE_KEY = "botfinanceiro:execution-journal:v1";
const EXECUTION_JOURNAL_PERSIST_DEBOUNCE_MS = 180;
let executionJournalPersistTimer = null;

function sanitizePersistedGhostTrackerState(candidate, factory) {
  const base = factory();

  if (!candidate || typeof candidate !== "object") {
    return base;
  }

  const openSignals = Array.isArray(candidate.openSignals)
    ? candidate.openSignals.filter((signal) => signal && typeof signal === "object")
    : [];
  const recentResults = Array.isArray(candidate.recentResults)
    ? candidate.recentResults.filter((entry) => entry && typeof entry === "object")
    : [];

  return {
    ...base,
    lastSignalAtMs: Number.isFinite(candidate.lastSignalAtMs) ? candidate.lastSignalAtMs : 0,
    lastSettledAtMs: Number.isFinite(candidate.lastSettledAtMs) ? candidate.lastSettledAtMs : 0,
    losses: Number.isFinite(candidate.losses) ? Math.max(0, Math.trunc(candidate.losses)) : 0,
    openSignals,
    pushes: Number.isFinite(candidate.pushes) ? Math.max(0, Math.trunc(candidate.pushes)) : 0,
    recentResults,
    sessionKey: typeof candidate.sessionKey === "string" ? candidate.sessionKey : "",
    startedAtMs: Number.isFinite(candidate.startedAtMs) ? candidate.startedAtMs : Date.now(),
    wins: Number.isFinite(candidate.wins) ? Math.max(0, Math.trunc(candidate.wins)) : 0,
  };
}

function hydrateGhostTrackerStatesFromStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    const raw = window.localStorage.getItem(GHOST_TRACKER_PERSISTENCE_KEY);

    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return;
    }

    binaryOptionsGhostTrackerState = sanitizePersistedGhostTrackerState(
      parsed.binary,
      createBinaryOptionsGhostTrackerState,
    );
    spotMarginGhostTrackerState = sanitizePersistedGhostTrackerState(
      parsed.spot,
      createSpotMarginGhostTrackerState,
    );
  } catch {
    // Corrupcao de storage nao deve bloquear a UI; mantem estado fresco.
  }
}

function schedulePersistGhostTrackerStates() {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  if (ghostTrackerPersistTimer !== null) {
    return;
  }

  ghostTrackerPersistTimer = window.setTimeout(() => {
    ghostTrackerPersistTimer = null;

    try {
      const payload = JSON.stringify({
        binary: binaryOptionsGhostTrackerState,
        spot: spotMarginGhostTrackerState,
        version: 1,
      });
      window.localStorage.setItem(GHOST_TRACKER_PERSISTENCE_KEY, payload);
    } catch {
      // Quota excedida ou modo privado: auditoria fica em memoria apenas.
    }
  }, GHOST_TRACKER_PERSIST_DEBOUNCE_MS);
}

hydrateGhostTrackerStatesFromStorage();

function hydrateExecutionJournalStateFromStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    const raw = window.localStorage.getItem(EXECUTION_JOURNAL_PERSISTENCE_KEY);

    if (!raw) {
      return;
    }

    executionJournalState = sanitizeExecutionJournalState(JSON.parse(raw));
  } catch {
    executionJournalState = createExecutionJournalState();
  }
}

function schedulePersistExecutionJournalState() {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  if (executionJournalPersistTimer !== null) {
    return;
  }

  executionJournalPersistTimer = window.setTimeout(() => {
    executionJournalPersistTimer = null;

    try {
      window.localStorage.setItem(EXECUTION_JOURNAL_PERSISTENCE_KEY, JSON.stringify(executionJournalState));
    } catch {
      // Quota excedida ou modo privado: journal permanece apenas em memoria.
    }
  }, EXECUTION_JOURNAL_PERSIST_DEBOUNCE_MS);
}

hydrateExecutionJournalStateFromStorage();

// ============================================================================
// Auto Paper Trading - Operador (ADR-103)
// ----------------------------------------------------------------------------
// Estado em memoria do operador + helpers DOM. O token nunca eh logado e nao
// entra no bundle: vive apenas no localStorage do navegador onde foi colado.
// O dispatcher so envia quando o Auto Guard (ADR-101) liberar e respeita um
// cooldown idempotente para nao reenviar o mesmo plano em rajada.
// ============================================================================
let operatorAutoPaperSettings = loadOperatorSettingsStore();
let operatorAutoPaperJournal = loadOperatorJournalStore();
let operatorLastDispatchKey = "";
let operatorLastDispatchAtMs = 0;
const OPERATOR_DISPATCH_COOLDOWN_MS = 60_000;

function getOperatorAutoPaperSettings() {
  return { ...operatorAutoPaperSettings };
}

function tierFromExecutionQuality(quality) {
  if (!quality || typeof quality !== "object") return "low";
  if (quality.status === "prime") return "high";
  if (quality.status === "qualified") return "medium";
  return "low";
}

function buildOperatorPayloadFromContext({ executionPlan, executionQuality, snapshot }) {
  if (!executionPlan || !snapshot) return null;
  const entry = executionPlan.entry;
  const invalidation = executionPlan.invalidation;
  const targets = Array.isArray(executionPlan.targets) ? executionPlan.targets : [];
  const primaryTarget = targets[0];

  if (!entry || !invalidation || !primaryTarget) return null;

  const entryLow = Number(entry.low);
  const entryHigh = Number(entry.high);
  const entryPrice = Number.isFinite(entryLow) && Number.isFinite(entryHigh)
    ? (entryLow + entryHigh) / 2
    : Number.NaN;

  return buildOperatorAutoSignalPayload({
    asset: typeof snapshot.assetId === "string" ? snapshot.assetId : "",
    confluenceScore: executionQuality?.score ?? 0,
    entryPrice,
    side: executionPlan.side,
    stopPrice: invalidation.price,
    targetPrice: primaryTarget.price,
    tier: tierFromExecutionQuality(executionQuality),
  });
}

function maybeDispatchOperatorAutoSignal({ automationGuard, executionPlan, executionQuality, snapshot }) {
  const settings = operatorAutoPaperSettings;
  const payload = buildOperatorPayloadFromContext({ executionPlan, executionQuality, snapshot });

  if (!canSubmitOperatorAutoSignal({ automationGuard, operatorSettings: settings, payload })) {
    return;
  }

  const dispatchKey = `${payload.asset}|${payload.side}|${payload.entryPrice.toFixed(6)}|${payload.stopPrice.toFixed(6)}|${payload.targetPrice.toFixed(6)}`;
  const nowMs = Date.now();

  if (
    dispatchKey === operatorLastDispatchKey
    && nowMs - operatorLastDispatchAtMs < OPERATOR_DISPATCH_COOLDOWN_MS
  ) {
    return;
  }

  operatorLastDispatchKey = dispatchKey;
  operatorLastDispatchAtMs = nowMs;

  void submitOperatorAutoSignal({
    baseUrl: API_BASE_URL,
    payload,
    token: settings.token,
  }).then((result) => {
    recordOperatorJournalResult({ payload, result });
    if (typeof renderOperatorFeedback === "function") {
      if (result.ok) {
        renderOperatorFeedback(`Auto-paper enviado: ${payload.asset.toUpperCase()} ${payload.side.toUpperCase()} @ ${payload.entryPrice}`, "ok");
      } else {
        renderOperatorFeedback(`Auto-paper falhou (${result.error?.code ?? "ERR"}): ${result.error?.message ?? "erro desconhecido"}`, "error");
        // Em 401, desarmar para forcar revisao manual do token.
        if (result.status === 401) {
          operatorAutoPaperSettings = { ...settings, autoArmed: false };
          saveOperatorSettingsStore(operatorAutoPaperSettings);
          syncOperatorPanelFromState();
        }
      }
    }
  });
}

function recordOperatorJournalResult({ payload, result }) {
  const entry = createOperatorJournalEntry({ occurredAtMs: Date.now(), payload, result });
  if (!entry) return;
  operatorAutoPaperJournal = appendOperatorJournalEntry(operatorAutoPaperJournal, entry);
  saveOperatorJournalStore(operatorAutoPaperJournal);

  const summary = summarizeOperatorJournal(operatorAutoPaperJournal);
  if (operatorAutoPaperSettings.autoArmed === true && shouldTripOperatorBreaker(summary)) {
    operatorAutoPaperSettings = { ...operatorAutoPaperSettings, autoArmed: false };
    saveOperatorSettingsStore(operatorAutoPaperSettings);
    syncOperatorPanelFromState();
    if (typeof renderOperatorFeedback === "function") {
      renderOperatorFeedback(
        `Circuit breaker: ${summary.consecutiveFailures} falhas consecutivas. Auto desarmado.`,
        "error",
      );
    }
  }

  renderOperatorJournalPanel();
}

let operatorPanelTokenInput = null;
let operatorPanelArmToggle = null;
let operatorPanelStatusBadge = null;
let operatorPanelFeedback = null;
let operatorPanelSaveButton = null;
let operatorPanelClearButton = null;
let operatorPanelJournalSummary = null;
let operatorPanelJournalList = null;
let operatorPanelJournalBreaker = null;
let operatorPanelJournalClearButton = null;
let operatorPanelCentralSummary = null;
let operatorPanelCentralList = null;
let operatorPanelCentralFeedback = null;
let operatorPanelCentralActionInput = null;
let operatorPanelCentralAssetInput = null;
let operatorPanelCentralFromInput = null;
let operatorPanelCentralToInput = null;
let operatorPanelCentralFetchButton = null;
let operatorPanelCentralResetButton = null;

function renderOperatorFeedback(message, tone = "info") {
  if (!(operatorPanelFeedback instanceof HTMLElement)) return;
  operatorPanelFeedback.textContent = message ?? "";
  operatorPanelFeedback.dataset.tone = tone;
}

function syncOperatorPanelFromState() {
  const settings = operatorAutoPaperSettings;
  if (operatorPanelArmToggle instanceof HTMLInputElement) {
    operatorPanelArmToggle.checked = settings.autoArmed === true;
    operatorPanelArmToggle.disabled = !settings.token || settings.token.length < PAPER_TRADING_OPERATOR_MIN_TOKEN_LENGTH;
  }
  if (operatorPanelStatusBadge instanceof HTMLElement) {
    const armed = settings.autoArmed === true && settings.token.length >= PAPER_TRADING_OPERATOR_MIN_TOKEN_LENGTH;
    operatorPanelStatusBadge.textContent = armed ? "ARMADO" : "DESARMADO";
    operatorPanelStatusBadge.dataset.state = armed ? "armed" : "disarmed";
  }
}

function formatOperatorJournalTimestamp(occurredAtMs) {
  if (typeof occurredAtMs !== "number" || !Number.isFinite(occurredAtMs)) return "—";
  try {
    return new Date(occurredAtMs).toLocaleTimeString("pt-BR", { hour: "2-digit", hour12: false, minute: "2-digit", second: "2-digit" });
  } catch {
    return "—";
  }
}

function renderOperatorJournalPanel() {
  if (!(operatorPanelJournalSummary instanceof HTMLElement) || !(operatorPanelJournalList instanceof HTMLElement)) return;
  const summary = summarizeOperatorJournal(operatorAutoPaperJournal);
  if (summary.total === 0) {
    operatorPanelJournalSummary.textContent = "sem disparos registrados";
    operatorPanelJournalList.innerHTML = "";
  } else {
    const rate = summary.successRate !== null ? `${summary.successRate}%` : "—";
    operatorPanelJournalSummary.textContent = `${summary.total} disparos · ${summary.successes} ok · ${summary.failures} falha${summary.failures === 1 ? "" : "s"} · taxa ${rate}`;
    const recent = operatorAutoPaperJournal.entries.slice(-8).reverse();
    operatorPanelJournalList.innerHTML = recent.map((entry) => {
      const tone = entry.outcome === "success" ? "ok" : "error";
      const time = formatOperatorJournalTimestamp(entry.occurredAtMs);
      const score = entry.confluenceScore !== null ? `${entry.confluenceScore}%` : "—";
      const detail = entry.outcome === "success"
        ? `HTTP ${entry.status ?? "—"}`
        : `${entry.errorCode ?? "ERR"}${entry.status ? ` · HTTP ${entry.status}` : ""}`;
      return `<li class="paper-trading-operator__journal-item" data-tone="${tone}">`
        + `<span class="paper-trading-operator__journal-time">${time}</span>`
        + `<span class="paper-trading-operator__journal-asset">${entry.asset.toUpperCase()} ${entry.side.toUpperCase()}</span>`
        + `<span class="paper-trading-operator__journal-score">${score}</span>`
        + `<span class="paper-trading-operator__journal-detail">${detail}</span>`
        + `</li>`;
    }).join("");
  }

  if (operatorPanelJournalBreaker instanceof HTMLElement) {
    if (shouldTripOperatorBreaker(summary)) {
      operatorPanelJournalBreaker.hidden = false;
      operatorPanelJournalBreaker.textContent = `Circuit breaker aberto: ${summary.consecutiveFailures} falhas seguidas (limite ${PAPER_TRADING_OPERATOR_BREAKER_FAILURE_THRESHOLD}). Revise o token e rearme manualmente.`;
    } else {
      operatorPanelJournalBreaker.hidden = true;
      operatorPanelJournalBreaker.textContent = "";
    }
  }
}

function bindOperatorAutoPaperPanel() {
  if (typeof document === "undefined") return;
  operatorPanelTokenInput = document.getElementById("paper-trading-operator-token-input");
  operatorPanelArmToggle = document.getElementById("paper-trading-operator-arm-toggle");
  operatorPanelStatusBadge = document.getElementById("paper-trading-operator-status");
  operatorPanelFeedback = document.getElementById("paper-trading-operator-feedback");
  operatorPanelSaveButton = document.getElementById("paper-trading-operator-save");
  operatorPanelClearButton = document.getElementById("paper-trading-operator-clear");
  operatorPanelJournalSummary = document.getElementById("paper-trading-operator-journal-summary");
  operatorPanelJournalList = document.getElementById("paper-trading-operator-journal-list");
  operatorPanelJournalBreaker = document.getElementById("paper-trading-operator-journal-breaker");
  operatorPanelJournalClearButton = document.getElementById("paper-trading-operator-journal-clear");
  operatorPanelCentralSummary = document.getElementById("paper-trading-operator-central-summary");
  operatorPanelCentralList = document.getElementById("paper-trading-operator-central-list");
  operatorPanelCentralFeedback = document.getElementById("paper-trading-operator-central-feedback");
  operatorPanelCentralActionInput = document.getElementById("paper-trading-operator-central-action");
  operatorPanelCentralAssetInput = document.getElementById("paper-trading-operator-central-asset");
  operatorPanelCentralFromInput = document.getElementById("paper-trading-operator-central-from");
  operatorPanelCentralToInput = document.getElementById("paper-trading-operator-central-to");
  operatorPanelCentralFetchButton = document.getElementById("paper-trading-operator-central-fetch");
  operatorPanelCentralResetButton = document.getElementById("paper-trading-operator-central-reset");

  if (!(operatorPanelSaveButton instanceof HTMLElement)) return;

  if (operatorPanelTokenInput instanceof HTMLInputElement && operatorAutoPaperSettings.token) {
    // Mostramos comprimento via placeholder para o operador saber que ja existe um token salvo,
    // sem nunca expor o valor real.
    operatorPanelTokenInput.placeholder = `${operatorAutoPaperSettings.token.length} caracteres salvos`;
  }

  syncOperatorPanelFromState();
  renderOperatorJournalPanel();

  operatorPanelSaveButton.addEventListener("click", () => {
    const rawToken = operatorPanelTokenInput instanceof HTMLInputElement ? operatorPanelTokenInput.value.trim() : "";
    if (rawToken.length < PAPER_TRADING_OPERATOR_MIN_TOKEN_LENGTH) {
      renderOperatorFeedback(`Token precisa de ao menos ${PAPER_TRADING_OPERATOR_MIN_TOKEN_LENGTH} caracteres.`, "error");
      return;
    }
    const armed = operatorPanelArmToggle instanceof HTMLInputElement ? operatorPanelArmToggle.checked : false;
    operatorAutoPaperSettings = { autoArmed: armed, token: rawToken };
    const persisted = saveOperatorSettingsStore(operatorAutoPaperSettings);
    if (operatorPanelTokenInput instanceof HTMLInputElement) {
      operatorPanelTokenInput.value = "";
      operatorPanelTokenInput.placeholder = `${rawToken.length} caracteres salvos`;
    }
    syncOperatorPanelFromState();
    renderOperatorFeedback(
      persisted ? "Credenciais salvas neste navegador." : "Credenciais aplicadas em memoria (storage indisponivel).",
      persisted ? "ok" : "warn",
    );
  });

  operatorPanelClearButton?.addEventListener("click", () => {
    operatorAutoPaperSettings = { autoArmed: false, token: "" };
    clearOperatorSettingsStore();
    if (operatorPanelTokenInput instanceof HTMLInputElement) {
      operatorPanelTokenInput.value = "";
      operatorPanelTokenInput.placeholder = "paper_op_•••";
    }
    syncOperatorPanelFromState();
    renderOperatorFeedback("Credenciais limpas.", "info");
  });

  operatorPanelArmToggle?.addEventListener("change", () => {
    if (!(operatorPanelArmToggle instanceof HTMLInputElement)) return;
    if (operatorPanelArmToggle.checked && operatorAutoPaperSettings.token.length < PAPER_TRADING_OPERATOR_MIN_TOKEN_LENGTH) {
      operatorPanelArmToggle.checked = false;
      renderOperatorFeedback("Salve um token valido antes de armar.", "warn");
      return;
    }
    operatorAutoPaperSettings = { ...operatorAutoPaperSettings, autoArmed: operatorPanelArmToggle.checked };
    saveOperatorSettingsStore(operatorAutoPaperSettings);
    syncOperatorPanelFromState();
  });

  operatorPanelJournalClearButton?.addEventListener("click", () => {
    operatorAutoPaperJournal = { entries: [] };
    clearOperatorJournalStore();
    renderOperatorJournalPanel();
    renderOperatorFeedback("Auditoria local limpa.", "info");
  });

  operatorPanelCentralFetchButton?.addEventListener("click", () => {
    void refreshCentralOperatorJournal();
  });
  operatorPanelCentralResetButton?.addEventListener("click", () => {
    if (operatorPanelCentralActionInput instanceof HTMLSelectElement) {
      operatorPanelCentralActionInput.value = "";
    }
    if (operatorPanelCentralAssetInput instanceof HTMLInputElement) {
      operatorPanelCentralAssetInput.value = "";
    }
    if (operatorPanelCentralFromInput instanceof HTMLInputElement) {
      operatorPanelCentralFromInput.value = "";
    }
    if (operatorPanelCentralToInput instanceof HTMLInputElement) {
      operatorPanelCentralToInput.value = "";
    }
    void refreshCentralOperatorJournal();
  });
}

function readCentralOperatorJournalFilters() {
  const action = operatorPanelCentralActionInput instanceof HTMLSelectElement ? operatorPanelCentralActionInput.value : "";
  const asset = operatorPanelCentralAssetInput instanceof HTMLInputElement ? operatorPanelCentralAssetInput.value : "";
  const fromLocal = operatorPanelCentralFromInput instanceof HTMLInputElement ? operatorPanelCentralFromInput.value : "";
  const toLocal = operatorPanelCentralToInput instanceof HTMLInputElement ? operatorPanelCentralToInput.value : "";
  // datetime-local entrega "YYYY-MM-DDTHH:MM" no fuso local — convertemos para
  // ISO 8601 com offset Z para o backend interpretar como UTC determinístico.
  const fromIso = fromLocal ? new Date(fromLocal).toISOString() : "";
  const toIso = toLocal ? new Date(toLocal).toISOString() : "";
  return { action, asset, from: fromIso, limit: 50, to: toIso };
}

function renderCentralOperatorFeedback(message, tone = "info") {
  if (!(operatorPanelCentralFeedback instanceof HTMLElement)) return;
  operatorPanelCentralFeedback.textContent = message ?? "";
  if (message) {
    operatorPanelCentralFeedback.dataset.tone = tone;
  } else {
    delete operatorPanelCentralFeedback.dataset.tone;
  }
}

function renderCentralOperatorJournalPanel(snapshot) {
  if (!(operatorPanelCentralSummary instanceof HTMLElement) || !(operatorPanelCentralList instanceof HTMLElement)) return;
  const summary = summarizeCentralJournalSnapshot(snapshot);
  if (!summary.enabled) {
    operatorPanelCentralSummary.textContent = "endpoint desabilitado no servidor";
    operatorPanelCentralList.innerHTML = "";
    return;
  }
  if (summary.total === 0) {
    operatorPanelCentralSummary.textContent = "nenhum disparo no filtro atual";
    operatorPanelCentralList.innerHTML = "";
    return;
  }
  const successRate = summary.successRate !== null ? `${summary.successRate}%` : "—";
  operatorPanelCentralSummary.textContent = `${summary.total} disparos · ${summary.opened} opened · ${summary.skipped} skipped · ${summary.errors} error · sucesso ${successRate}`;
  operatorPanelCentralList.innerHTML = summary.entries.slice(0, 25).map((entry) => {
    const tone = entry.action === "opened" ? "ok" : entry.action === "error" ? "error" : "warn";
    const time = formatOperatorJournalTimestamp(entry.occurredAtMs);
    const score = entry.confluenceScore !== null ? `${Math.round(entry.confluenceScore)}%` : "—";
    const detail = entry.action === "opened"
      ? "opened"
      : entry.reason
        ? `${entry.action}: ${String(entry.reason).slice(0, 60)}`
        : entry.action;
    return `<li class="paper-trading-operator__journal-item" data-tone="${tone}">`
      + `<span class="paper-trading-operator__journal-time">${time}</span>`
      + `<span class="paper-trading-operator__journal-asset">${entry.asset.toUpperCase()} ${entry.side.toUpperCase()}</span>`
      + `<span class="paper-trading-operator__journal-score">${score}</span>`
      + `<span class="paper-trading-operator__journal-detail">${detail}</span>`
      + `</li>`;
  }).join("");
}

async function refreshCentralOperatorJournal() {
  if (!operatorAutoPaperSettings.token || operatorAutoPaperSettings.token.length < PAPER_TRADING_OPERATOR_MIN_TOKEN_LENGTH) {
    renderCentralOperatorFeedback("Salve um token válido para consultar a auditoria centralizada.", "warn");
    return;
  }
  const filters = readCentralOperatorJournalFilters();
  renderCentralOperatorFeedback("Consultando…", "info");
  const result = await fetchCentralOperatorJournal({
    filters,
    token: operatorAutoPaperSettings.token,
  });
  if (!result.ok) {
    renderCentralOperatorFeedback(`Falha: ${result.error?.code ?? "ERRO"}${result.error?.message ? ` — ${result.error.message}` : ""}`, "error");
    return;
  }
  renderCentralOperatorJournalPanel(result.data);
  renderCentralOperatorFeedback("", "info");
}

function mapSymbolToExchange(symbol, exchange) {
  const normalizedSymbol = sanitizeTerminalSymbol(symbol);
  const normalizedExchange = typeof exchange === "string" ? exchange.toUpperCase() : "BINANCE";

  if (normalizedSymbol.length < 2) {
    return normalizedSymbol;
  }

  if (!isLikelyCryptoTerminalSymbol(normalizedSymbol)) {
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

function isLikelyForexPairSymbol(symbol) {
  if (typeof symbol !== "string" || symbol.length !== 6) {
    return false;
  }

  const base = symbol.slice(0, 3);
  const quote = symbol.slice(3, 6);
  return FOREX_FIAT_CODES.has(base) && FOREX_FIAT_CODES.has(quote);
}

function isLikelyCryptoTerminalSymbol(symbol) {
  if (typeof symbol !== "string" || symbol.length < 5) {
    return false;
  }

  if (symbol.endsWith("USDT")) {
    return true;
  }

  if (symbol.endsWith("USD") && !isLikelyForexPairSymbol(symbol)) {
    return true;
  }

  return false;
}

function shouldUseCryptoChartPipeline(symbol) {
  const normalizedSymbol = sanitizeTerminalSymbol(symbol);

  if (normalizedSymbol.length === 0) {
    return true;
  }

  if (isLikelyCryptoTerminalSymbol(normalizedSymbol)) {
    return true;
  }

  if (chartLabState.symbolSourceModule === "crypto" || chartLabState.symbolSourceModule === "defi") {
    return true;
  }

  if (
    chartLabState.symbolSourceModule === "futures"
    && /(?:USDT|BUSD|USD)$/.test(normalizedSymbol)
    && !isLikelyForexPairSymbol(normalizedSymbol)
  ) {
    return true;
  }

  return false;
}

function resolveChartPipelineStrategy(symbol) {
  if (isBinaryOptionsOperationalMode()) {
    return "crypto";
  }

  if (shouldUseCryptoChartPipeline(symbol)) {
    return "crypto";
  }

  if (INSTITUTIONAL_MACRO_MODULES.has(chartLabState.symbolSourceModule)) {
    return "institutional_macro";
  }

  const normalizedSymbol = sanitizeTerminalSymbol(symbol);

  if (isLikelyForexPairSymbol(normalizedSymbol)) {
    return "institutional_macro";
  }

  return "institutional_macro";
}

function canRunInstitutionalMacroForSymbol(symbol) {
  const normalizedSymbol = sanitizeTerminalSymbol(symbol);

  if (isLikelyForexPairSymbol(normalizedSymbol)) {
    return true;
  }

  return INSTITUTIONAL_MACRO_MODULES.has(chartLabState.symbolSourceModule);
}

function normalizeChartOperationalMode(value) {
  if (typeof value !== "string") {
    return CHART_OPERATIONAL_MODE_SPOT_MARGIN;
  }

  const normalized = value.trim().toLowerCase();
  return CHART_OPERATIONAL_MODES.has(normalized)
    ? normalized
    : CHART_OPERATIONAL_MODE_SPOT_MARGIN;
}

function getChartOperationalModeLabel(mode) {
  return CHART_OPERATIONAL_MODE_LABELS[mode] ?? CHART_OPERATIONAL_MODE_LABELS[CHART_OPERATIONAL_MODE_SPOT_MARGIN];
}

function isBinaryOptionsOperationalMode(mode = chartLabState.operationalMode) {
  return normalizeChartOperationalMode(mode) === CHART_OPERATIONAL_MODE_BINARY_OPTIONS;
}

function isSpotMarginOperationalMode(mode = chartLabState.operationalMode) {
  return normalizeChartOperationalMode(mode) === CHART_OPERATIONAL_MODE_SPOT_MARGIN;
}

function resolveGhostAuditOperationalMode(mode = chartLabState.operationalMode) {
  if (isBinaryOptionsOperationalMode(mode)) {
    return GHOST_AUDIT_OPERATIONAL_MODE_BINARY_OPTIONS;
  }

  if (isSpotMarginOperationalMode(mode)) {
    return GHOST_AUDIT_OPERATIONAL_MODE_SPOT_MARGIN;
  }

  return null;
}

function isAnalysisTabVisible(tabId, mode = chartLabState.operationalMode) {
  const normalizedMode = normalizeChartOperationalMode(mode);

  if (tabId === "micro_timing") {
    return normalizedMode === CHART_OPERATIONAL_MODE_BINARY_OPTIONS;
  }

  if (normalizedMode === CHART_OPERATIONAL_MODE_BINARY_OPTIONS && BINARY_OPTIONS_HIDDEN_ANALYSIS_TABS.has(tabId)) {
    return false;
  }

  return true;
}

function resolveVisibleAnalysisTabs(mode = chartLabState.operationalMode) {
  const normalizedMode = normalizeChartOperationalMode(mode);
  return ANALYSIS_TAB_DEFINITIONS.filter((tab) => isAnalysisTabVisible(tab.id, normalizedMode));
}

function ensureActiveAnalysisTabForOperationalMode(mode = chartLabState.operationalMode) {
  if (isAnalysisTabVisible(activeAnalysisTabId, mode)) {
    return;
  }

  const nextTab = resolveVisibleAnalysisTabs(mode)[0];
  activeAnalysisTabId = nextTab?.id ?? "resumo";
}

function updateOperationalModeTag() {
  if (!(chartOperationalModeTagElement instanceof HTMLElement)) {
    return;
  }

  chartOperationalModeTagElement.dataset.operationalMode = chartLabState.operationalMode;
  chartOperationalModeTagElement.textContent = isBinaryOptionsOperationalMode()
    ? "Micro-Timing Desk"
    : "Live Desk";
}

function setChartOperationalMode(nextMode, options = {}) {
  const normalizedMode = normalizeChartOperationalMode(nextMode);
  const hasChanged = normalizedMode !== chartLabState.operationalMode;
  chartLabState.operationalMode = normalizedMode;

  if (hasChanged) {
    setChartFallbackBadge("", "");
  }

  if (hasChanged) {
    resetBinaryOptionsGhostTrackerSession();
    resetSpotMarginGhostTrackerSession();
    resetBinaryOptionsGhostAuditBackendState();
  }

  if (chartOperationalModeSelect instanceof HTMLSelectElement) {
    chartOperationalModeSelect.value = normalizedMode;
  }

  updateOperationalModeTag();

  ensureActiveAnalysisTabForOperationalMode(normalizedMode);
  renderDeepAnalysisPanel(chartLabState.snapshot);

  if (hasChanged && options.refreshChart === true) {
    void loadChart({
      silent: true,
    });

    if (chartLabState.viewMode === "tv") {
      scheduleTradingViewRefresh();
    }
  }

  if (hasChanged && options.announce === true) {
    setChartLegend(`Modo operacional ativo: ${getChartOperationalModeLabel(normalizedMode)}.`);
  }

  if (options.persist !== false) {
    saveChartPreferences();
  }
}

function applyExternalSymbolChartState(symbol, options = {}) {
  const normalizedSymbol = sanitizeTerminalSymbol(symbol);
  const silent = options.silent === true;

  chartLabState.snapshot = null;
  chartLabStore.patchSelection({
    symbol: normalizedSymbol,
  });
  setChartFallbackBadge("", "");

  if (chartLabState.viewMode === "copilot") {
    clearChartSurface();
  }

  renderChartMetrics(null);

  if (silent) {
    return;
  }

  const exchangePrefix = resolveTradingViewExchangePrefix(normalizedSymbol);
  setChartStatus("Modo simbolo externo ativo no Terminal PRO.", "");
  setChartLegend(
    normalizedSymbol.length > 0
      ? `Sem snapshot IA para ${exchangePrefix}:${normalizedSymbol}. Use a leitura do Terminal PRO para este ativo.`
      : "Sem snapshot IA para este simbolo. Use a leitura do Terminal PRO para este ativo.",
    "",
  );
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

function normalizeInternalApiToken(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readStoredIntelligenceSyncInternalToken() {
  try {
    return normalizeInternalApiToken(
      sessionStorage.getItem(INTELLIGENCE_SYNC_INTERNAL_TOKEN_SESSION_STORAGE_KEY),
    );
  } catch {
    return "";
  }
}

function persistIntelligenceSyncInternalToken(token) {
  const normalizedToken = normalizeInternalApiToken(token);

  try {
    if (normalizedToken.length >= 16) {
      sessionStorage.setItem(INTELLIGENCE_SYNC_INTERNAL_TOKEN_SESSION_STORAGE_KEY, normalizedToken);
    } else {
      sessionStorage.removeItem(INTELLIGENCE_SYNC_INTERNAL_TOKEN_SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors and keep token in memory.
  }
}

function getIntelligenceSyncInternalToken() {
  return intelligenceSyncInternalToken;
}

function hasIntelligenceSyncInternalToken() {
  return getIntelligenceSyncInternalToken().length >= 16;
}

function setIntelligenceSyncInternalToken(token, options = {}) {
  const normalizedToken = normalizeInternalApiToken(token);
  intelligenceSyncInternalToken = normalizedToken;

  if (options.persist !== false) {
    persistIntelligenceSyncInternalToken(normalizedToken);
  }

  if (options.refresh !== true) {
    return;
  }

  intelligenceSyncBackendHealthSnapshot = null;
  intelligenceSyncBackendHealthError = "";

  binaryOptionsGhostAuditBackendState.error = "";
  binaryOptionsGhostAuditBackendState.fetchedAtMs = 0;
  binaryOptionsGhostAuditBackendState.history = null;
  binaryOptionsGhostAuditBackendState.requestKey = "";

  renderIntelligenceSyncOpsPanel();
  renderDeepAnalysisPanel(chartLabState.snapshot);

  if (activeAppRoute !== APP_ROUTE_CHART_LAB) {
    return;
  }

  if (hasIntelligenceSyncInternalToken()) {
    void refreshIntelligenceSyncHealthSnapshot({
      reschedule: true,
    });

    if (chartLabState.snapshot) {
      void refreshBinaryOptionsGhostAuditHistory(chartLabState.snapshot, {
        force: true,
      });
    }

    return;
  }

  stopIntelligenceSyncHealthPolling();
}

function exposeIntelligenceSyncInternalTokenHelpers() {
  if (typeof window !== "object" || window === null) {
    return;
  }

  window.__botfinanceiroSetInternalToken = (token) => {
    setIntelligenceSyncInternalToken(token, {
      persist: true,
      refresh: true,
    });

    return hasIntelligenceSyncInternalToken();
  };

  window.__botfinanceiroClearInternalToken = () => {
    setIntelligenceSyncInternalToken("", {
      persist: true,
      refresh: true,
    });
  };
}

function hydrateIntelligenceSyncInternalToken() {
  const environmentToken = normalizeInternalApiToken(INTELLIGENCE_SYNC_INTERNAL_TOKEN_ENV);

  if (environmentToken.length >= 16) {
    intelligenceSyncInternalToken = environmentToken;
    return;
  }

  intelligenceSyncInternalToken = readStoredIntelligenceSyncInternalToken();
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

  if (normalized === "radar") {
    return APP_ROUTE_MERCADOS;
  }

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

  if (pathname.endsWith(`/${APP_ROUTE_MERCADOS}`) || hash === "#/mercados") {
    return APP_ROUTE_MERCADOS;
  }

  if (pathname.endsWith("/radar") || hash === "#/radar") {
    return APP_ROUTE_MERCADOS;
  }

  if (pathname.endsWith(`/${APP_ROUTE_MEMECOINS}`) || hash === "#/memecoins") {
    return APP_ROUTE_MEMECOINS;
  }

  if (pathname.endsWith(`/${APP_ROUTE_AIRDROPS}`) || hash === "#/airdrops") {
    return APP_ROUTE_AIRDROPS;
  }

  if (pathname.endsWith(`/${APP_ROUTE_PAPER}`) || hash === "#/paper") {
    return APP_ROUTE_PAPER;
  }

  if (pathname.endsWith(`/${APP_ROUTE_BACKTESTING}`) || hash === "#/backtesting") {
    return APP_ROUTE_BACKTESTING;
  }

  if (pathname.endsWith(`/${APP_ROUTE_LIVE_SIGNALS}`) || hash === "#/live-signals") {
    return APP_ROUTE_LIVE_SIGNALS;
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
  const showMarketNavigator = route === APP_ROUTE_MERCADOS;
  const showAnalysisPanel = route === APP_ROUTE_CHART_LAB;
  const showMemecoins = route === APP_ROUTE_MEMECOINS;
  const showAirdrops = route === APP_ROUTE_AIRDROPS;
  const showPaperTrading = route === APP_ROUTE_PAPER;
  const showBacktesting = route === APP_ROUTE_BACKTESTING;
  const showLiveSignals = route === APP_ROUTE_LIVE_SIGNALS;

  if (chartDeskSection instanceof HTMLElement) {
    chartDeskSection.classList.toggle("route-hidden", !showChartDesk);
  }

  if (heroSection instanceof HTMLElement) {
    heroSection.classList.toggle("route-hidden", !showLayoutGrid);
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

  if (memecoinsStageSection instanceof HTMLElement) {
    memecoinsStageSection.classList.toggle("route-hidden", !showMemecoins);
  }

  if (airdropsStageSection instanceof HTMLElement) {
    airdropsStageSection.classList.toggle("route-hidden", !showAirdrops);
  }

  if (paperTradingPanelSection instanceof HTMLElement) {
    paperTradingPanelSection.classList.toggle("route-hidden", !showPaperTrading);
  }

  if (backtestingPanelSection instanceof HTMLElement) {
    backtestingPanelSection.classList.toggle("route-hidden", !showBacktesting);
  }

  if (liveSignalsStageSection instanceof HTMLElement) {
    liveSignalsStageSection.classList.toggle("route-hidden", !showLiveSignals);
  }

  if (workspaceStageSection instanceof HTMLElement) {
    workspaceStageSection.classList.toggle("route-hidden", !(showChartDesk || showLayoutGrid));
  }

  if (intelligenceStageSection instanceof HTMLElement) {
    intelligenceStageSection.classList.toggle("route-hidden", !showAnalysisPanel);
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

function isDesktopViewport() {
  return window.matchMedia("(min-width: 1024px)").matches;
}

function setMobileSidebarOpen(nextValue) {
  const shouldOpen = Boolean(nextValue);
  isMobileSidebarOpen = shouldOpen;
  document.body.classList.toggle("mobile-sidebar-open", shouldOpen);

  if (mobileMenuToggleButton instanceof HTMLButtonElement) {
    mobileMenuToggleButton.setAttribute("aria-expanded", String(shouldOpen));
    mobileMenuToggleButton.setAttribute(
      "aria-label",
      shouldOpen ? "Fechar menu de navegacao" : "Abrir menu de navegacao",
    );
    mobileMenuToggleButton.textContent = shouldOpen ? "Fechar" : "Menu";
  }
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
  handleIntelligenceSyncOpsRouteChange(safeRoute);
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
  setMobileSidebarOpen(false);
  navigateToRoute(initialRoute, {
    replaceHistory: true,
  });

  if (mobileMenuToggleButton instanceof HTMLButtonElement) {
    mobileMenuToggleButton.addEventListener("click", () => {
      setMobileSidebarOpen(!isMobileSidebarOpen);
    });
  }

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
        if (!isDesktopViewport()) {
          setMobileSidebarOpen(false);
        }
        return;
      }

      navigateToRoute(nextRoute);

      if (!isDesktopViewport()) {
        setMobileSidebarOpen(false);
      }
    });
  }

  document.addEventListener("click", (event) => {
    if (!isMobileSidebarOpen || isDesktopViewport()) {
      return;
    }

    const target = event.target;

    if (!(target instanceof Node)) {
      return;
    }

    const clickedInsideSidebar = appSidebarElement instanceof HTMLElement && appSidebarElement.contains(target);
    const clickedOnMobileButton =
      mobileMenuToggleButton instanceof HTMLButtonElement && mobileMenuToggleButton.contains(target);

    if (clickedInsideSidebar || clickedOnMobileButton) {
      return;
    }

    setMobileSidebarOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isMobileSidebarOpen) {
      return;
    }

    setMobileSidebarOpen(false);
  });

  window.addEventListener("resize", () => {
    if (isDesktopViewport() && isMobileSidebarOpen) {
      setMobileSidebarOpen(false);
    }
  });

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
    setAuthStatusMessage("Crie sua conta para iniciar com contexto persistente.");
  } else {
    setAuthStatusMessage("Entre para sincronizar historico e threads do desk.");
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
    return "Nova thread";
  }

  const compact = prompt.replace(/\s+/g, " ").trim();

  if (compact.length === 0) {
    return "Nova thread";
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
    : "Nova thread";
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
      ? "Entre com sua conta para carregar conversas salvas."
      : "Supabase indisponivel. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.";
    conversationListElement.append(localModeItem);
    return;
  }

  if (conversationItems.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "Nenhuma conversa ainda. Clique em Nova thread para iniciar.";
    conversationListElement.append(emptyItem);
    return;
  }

  for (const conversation of conversationItems) {
    const item = document.createElement("li");
    item.className = "conversation-list-item";

    const row = document.createElement("div");
    row.className = "conversation-list-item-row";

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "open-conversation";
    button.className = "conversation-list-item-button";
    button.dataset.conversationId = conversation.id;
    button.setAttribute("aria-label", `Abrir thread: ${conversation.title}`);

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

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "conversation-list-item-delete";
    deleteButton.dataset.action = "delete-conversation";
    deleteButton.dataset.conversationId = conversation.id;
    deleteButton.title = "Apagar thread";
    deleteButton.setAttribute("aria-label", `Apagar thread: ${conversation.title}`);
    deleteButton.textContent = "×";

    row.append(button, deleteButton);
    item.append(row);
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

async function createConversationInCloud(initialTitle = "Nova thread") {
  if (!isCloudHistoryEnabled() || !supabase) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const conversationId = buildConversationId();
  const title = initialTitle.trim().length > 0 ? initialTitle.trim() : "Nova thread";

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

async function deleteConversationInCloud(conversationId) {
  if (!isCloudHistoryEnabled() || !supabase) {
    return false;
  }

  const safeConversationId = typeof conversationId === "string" ? conversationId.trim() : "";

  if (safeConversationId.length < 8) {
    return false;
  }

  const { error } = await supabase
    .from(SUPABASE_CONVERSATIONS_TABLE)
    .delete()
    .eq("id", safeConversationId)
    .eq("user_id", activeAuthUser.id);

  if (error) {
    throw new Error(error.message || "Falha ao apagar thread");
  }

  conversationItems = conversationItems.filter((item) => item.id !== safeConversationId);
  renderConversationList();
  return true;
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
  const createdConversation = await createConversationInCloud("Nova thread");

  if (!createdConversation) {
    return null;
  }

  await setActiveConversation(createdConversation.id, {
    hydrateMessages: false,
  });

  setStatus("", "Nova thread iniciada");
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
    "Atue como analista institucional de airdrops e entregue tese operacional sem recomendacao financeira.",
    `Projeto: ${project}`,
    `Chain: ${chain}`,
    `Score: ${score}`,
    `Confianca: ${confidence}`,
    `Reward: ${rewardType}`,
    `Tarefas iniciais: ${tasks}`,
    `Fontes: ${sources}`,
    sourceUrl.length > 0 ? `Link: ${sourceUrl}` : "Link: n/d",
    "Formato obrigatorio: 1) Tese e assimetria (score 0-100) 2) Elegibilidade verificavel e lacunas 3) Estrutura de risco (gas, bridge, sybil, custodia) 4) Plano D0/D1/D7 com prioridade e custo 5) Red flags e gatilho de abortar.",
    "Feche com checklist PASS/FAIL e proximas 3 acoes objetivas.",
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

function isLikelyValidPoolUrlForNotification(notification) {
  const pairUrl = typeof notification?.pairUrl === "string"
    ? notification.pairUrl.trim()
    : "";

  if (pairUrl.length === 0) {
    return false;
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(pairUrl);
  } catch {
    return false;
  }

  const host = parsedUrl.hostname.toLowerCase();

  if (!host.includes("dexscreener.com")) {
    return false;
  }

  const pathSegments = parsedUrl.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (pathSegments.length < 2) {
    return false;
  }

  const pairAddress = typeof notification?.pairAddress === "string"
    ? notification.pairAddress.trim()
    : "";
  const chain = typeof notification?.chain === "string"
    ? notification.chain.trim().toLowerCase()
    : "";
  const trailingSegment = pathSegments[pathSegments.length - 1] ?? "";

  if (pairAddress.length === 0 || trailingSegment.length === 0) {
    return false;
  }

  if (chain === "base") {
    return /^0x[a-fA-F0-9]{40}$/.test(pairAddress)
      && trailingSegment.toLowerCase() === pairAddress.toLowerCase();
  }

  if (chain === "solana") {
    return /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(pairAddress)
      && trailingSegment === pairAddress;
  }

  return trailingSegment.length >= 8;
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
  const hasValidPoolUrl = isLikelyValidPoolUrlForNotification(notification);
  const poolStatus = typeof notification?.poolStatus === "string"
    ? notification.poolStatus
    : "ALIVE";
  const poolStatusReason = typeof notification?.poolStatusReason === "string"
    ? notification.poolStatusReason
    : "";
  const securityStatus = typeof notification?.securityStatus === "string"
    ? notification.securityStatus
    : "UNKNOWN";
  const securityStatusReason = typeof notification?.securityStatusReason === "string"
    ? notification.securityStatusReason
    : "";
  const actionable = notification?.actionable !== false;

  return [
    "Atue como mesa institucional de memecoins e gere leitura tatico-operacional sem recomendacao financeira.",
    `Token: ${tokenSymbol} (${tokenName})`,
    `Chain: ${chain}`,
    `Prioridade: ${priority}`,
    `Hype score: ${score}`,
    `Confianca do sinal: ${confidence}`,
    `Status da pool: ${poolStatus}${poolStatusReason.length > 0 ? ` (${poolStatusReason})` : ""}`,
    `Status de seguranca: ${securityStatus}${securityStatusReason.length > 0 ? ` (${securityStatusReason})` : ""}`,
    `Operacional: ${actionable ? "acionavel" : "bloqueado por risco"}`,
    `Catalisadores: ${catalysts}`,
    `Riscos: ${risks}`,
    hasValidPoolUrl ? `Link da pool: ${pairUrl}` : "Link da pool: n/d",
    "Formato obrigatorio: 1) Leitura de fluxo e liquidez 2) Risco de manipulacao (bundle/vamp/multi-wallet) 3) Plano de monitoramento com gatilhos e invalidacao 4) Controles de risco e kill-switch 5) Conclusao com [RISK SCORE: 0-100] e acao: monitorar/reduzir/excluir.",
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
  const poolStatus = typeof notification?.poolStatus === "string"
    ? notification.poolStatus
    : "ALIVE";
  const poolStatusReason = typeof notification?.poolStatusReason === "string"
    ? notification.poolStatusReason
    : "";
  const securityStatus = typeof notification?.securityStatus === "string"
    ? notification.securityStatus
    : "UNKNOWN";
  const securityStatusReason = typeof notification?.securityStatusReason === "string"
    ? notification.securityStatusReason
    : "";
  const hasValidPoolUrl = isLikelyValidPoolUrlForNotification(notification);
  const actionable = notification?.actionable !== false
    && poolStatus === "ALIVE"
    && securityStatus !== "HONEYPOT"
    && hasValidPoolUrl;

  const card = document.createElement("article");
  card.className = "memecoin-card";
  card.dataset.priority = notification.priority;
  card.dataset.poolStatus = poolStatus.toLowerCase();
  card.dataset.securityStatus = securityStatus.toLowerCase();
  card.dataset.actionable = actionable ? "true" : "false";

  const top = document.createElement("div");
  top.className = "memecoin-card-top";

  const title = document.createElement("h5");
  title.textContent = `${notification.token.symbol} • ${notification.token.name}`;

  const chainPill = document.createElement("span");
  chainPill.className = "memecoin-card-chain";
  chainPill.textContent = formatMemeChainLabel(notification.chain);

  const topMeta = document.createElement("div");
  topMeta.className = "memecoin-card-top-meta";
  topMeta.append(chainPill);

  if (poolStatus !== "ALIVE") {
    const poolStatusPill = document.createElement("span");
    poolStatusPill.className = "memecoin-card-status-pill";
    poolStatusPill.dataset.tone = poolStatus === "RUGGED" ? "danger" : "warning";
    poolStatusPill.textContent = poolStatus;
    topMeta.append(poolStatusPill);
  }

  if (securityStatus === "HONEYPOT") {
    const securityStatusPill = document.createElement("span");
    securityStatusPill.className = "memecoin-card-status-pill";
    securityStatusPill.dataset.tone = "danger";
    securityStatusPill.textContent = "HONEYPOT";
    topMeta.append(securityStatusPill);
  }

  top.append(title, topMeta);

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

  if (!actionable) {
    const blockedChip = document.createElement("span");
    blockedChip.className = "memecoin-chip memecoin-chip-blocked";
    blockedChip.textContent = "Bloqueado";
    metrics.append(blockedChip);
  }

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

  const statusDetails = [poolStatusReason, securityStatusReason]
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0)
    .join(" | ");

  if (statusDetails.length > 0) {
    const statusLine = document.createElement("div");
    const statusLabel = document.createElement("strong");
    statusLabel.textContent = "Status: ";
    const statusText = document.createElement("span");
    statusText.textContent = statusDetails;
    statusLine.append(statusLabel, statusText);
    details.append(statusLine);
  }

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
  chatButton.disabled = !actionable;
  chatButton.textContent = actionable ? "Levar ao chat" : "Risco bloqueado";
  chatButton.title = actionable
    ? "Enviar sinal para o chat"
    : "Sinal bloqueado por risco de pool/seguranca";

  actions.append(pinButton, chatButton);

  if (actionable && notification.pairUrl && hasValidPoolUrl) {
    const link = document.createElement("a");
    link.className = "memecoin-card-link";
    link.href = notification.pairUrl;
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    link.textContent = "Pool";
    actions.append(link);
  } else if (notification.pairUrl && !hasValidPoolUrl) {
    const invalidLink = document.createElement("span");
    invalidLink.className = "memecoin-card-link memecoin-card-link-disabled";
    invalidLink.textContent = "Pool invalida";
    actions.append(invalidLink);
  } else if (notification.pairUrl) {
    const blockedLink = document.createElement("span");
    blockedLink.className = "memecoin-card-link memecoin-card-link-disabled";
    blockedLink.textContent = "Pool bloqueada";
    actions.append(blockedLink);
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
  const blockedCount = notifications.filter((notification) => notification?.actionable === false).length;

  setMemecoinSummary(
    `Fontes ${healthySources}/${sources.length} • total ${board.total ?? notifications.length} • bloqueados ${blockedCount} • fixados ${board.pinned ?? 0} • atualizado ${fetchedAt}`,
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

    if (actionButton.disabled) {
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

    if (notification?.actionable === false) {
      setStatus("error", "Sinal bloqueado por risco de pool/seguranca.");
      return;
    }

    navigateToRoute(APP_ROUTE_CHAT);

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
  const baseEmptyStateMessage = typeof viewStats?.emptyStateMessage === "string"
    ? viewStats.emptyStateMessage
    : "";
  const regionSuffix = marketNavigatorRegionFilter !== "all"
    ? ` • regiao ${formatMarketNavigatorRegionLabel(marketNavigatorRegionFilter)}`
    : "";
  const favoritesSuffix = marketNavigatorFavoritesOnly ? " • somente favoritos" : "";

  renderMarketNavigatorFeed(visibleItems, activeView, isSearchMode ? "" : baseEmptyStateMessage);

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

function isMarketNavigatorActionableView(view) {
  return Boolean(view) && view.type !== "group";
}

function getFirstMarketNavigatorActionableView(category) {
  if (!category || !Array.isArray(category.views) || category.views.length === 0) {
    return null;
  }

  return category.views.find((view) => isMarketNavigatorActionableView(view)) ?? null;
}

function getMarketNavigatorGroupTargetViewId(category, groupViewId) {
  if (!category || !Array.isArray(category.views) || category.views.length === 0) {
    return "";
  }

  const groupIndex = category.views.findIndex((view) => view.id === groupViewId && view.type === "group");

  if (groupIndex < 0) {
    return "";
  }

  for (let index = groupIndex + 1; index < category.views.length; index += 1) {
    const candidate = category.views[index];

    if (!candidate || candidate.type === "group") {
      break;
    }

    if (isMarketNavigatorActionableView(candidate)) {
      return candidate.id;
    }
  }

  return getFirstMarketNavigatorActionableView(category)?.id ?? "";
}

function getMarketNavigatorViewById(category, viewId) {
  if (!category || !Array.isArray(category.views) || category.views.length === 0) {
    return null;
  }

  return category.views.find((view) => view.id === viewId && isMarketNavigatorActionableView(view))
    ?? getFirstMarketNavigatorActionableView(category);
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

  if (item?.kind === "news") {
    if (typeof item.assetId === "string" && item.assetId.length > 0 && hasAssetOption(item.assetId)) {
      return {
        assetId: item.assetId,
        hasNativeAsset: true,
        module: "crypto",
        symbol: ASSET_TO_TERMINAL_SYMBOL[item.assetId] ?? "",
      };
    }

    return null;
  }

  if (typeof item.assetId === "string" && item.assetId.length > 0 && hasAssetOption(item.assetId)) {
    return {
      assetId: item.assetId,
      hasNativeAsset: true,
      module: typeof item?.module === "string" ? item.module : "",
      symbol: ASSET_TO_TERMINAL_SYMBOL[item.assetId] ?? "",
    };
  }

  if (typeof item.id === "string" && item.id.length > 0 && hasAssetOption(item.id)) {
    return {
      assetId: item.id,
      hasNativeAsset: true,
      module: typeof item?.module === "string" ? item.module : "",
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
        hasNativeAsset: true,
        module: typeof item?.module === "string" ? item.module : "",
        symbol: watchItem.symbol,
      };
    }
  }

  const fallbackCandidates = [item?.symbol, item?.ticker, item?.id];

  for (const candidate of fallbackCandidates) {
    const normalizedCandidate = sanitizeTerminalSymbol(candidate);

    if (normalizedCandidate.length < 2) {
      continue;
    }

    return {
      assetId: chartAssetSelect.value,
      hasNativeAsset: false,
      module: typeof item?.module === "string" ? item.module : "",
      symbol: normalizedCandidate,
    };
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

  navigateToRoute(APP_ROUTE_CHART_LAB);

  if (target.hasNativeAsset && typeof target.assetId === "string" && target.assetId.length > 0) {
    chartAssetSelect.value = target.assetId;
  }

  chartLabState.symbolSourceModule = target.hasNativeAsset
    ? "crypto"
    : typeof target.module === "string"
      ? target.module
      : "";

  if (chartSymbolInput instanceof HTMLInputElement && target.symbol.length > 0) {
    chartSymbolInput.value = mapSymbolToExchange(target.symbol, getSelectedTerminalExchange());
  }

  renderWatchlist();
  chartHasInitialFit = false;

  if (target.hasNativeAsset) {
    void loadChart();
    void refreshWatchlistMarket({
      silent: true,
    });
  }

  scheduleTradingViewRefresh();
  saveChartPreferences();
  return true;
}

function sendMarketItemToChat(item, view) {
  if (!(chatInput instanceof HTMLTextAreaElement)) {
    return;
  }
  navigateToRoute(APP_ROUTE_CHAT);

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
    if (category.hiddenInCategoryList) {
      continue;
    }

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
    if (!isMarketNavigatorActionableView(view)) {
      const groupButton = document.createElement("button");
      const targetViewId = getMarketNavigatorGroupTargetViewId(category, view.id);

      groupButton.type = "button";
      groupButton.className = "market-preset-group-button";
      groupButton.dataset.groupTargetView = targetViewId;

      if (targetViewId.length === 0) {
        groupButton.disabled = true;
      }

      if (targetViewId === activeMarketViewId) {
        groupButton.classList.add("is-active");
      }

      groupButton.innerHTML = `<span>${escapeHtml(view.label)}<small>Abrir secao</small></span><span>›</span>`;
      marketPresetListElement.append(groupButton);
      continue;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "market-preset-button";
    button.dataset.view = view.id;

    if (view.id === activeMarketViewId) {
      button.classList.add("is-active");
    }

    const sourceLabel = view.type === "news"
      ? "Inteligencia de noticias"
      : `Fonte /v1/${view.module}`;
    button.innerHTML = `<span>${escapeHtml(view.label)}<small>${escapeHtml(sourceLabel)}</small></span><span>›</span>`;
    marketPresetListElement.append(button);
  }
}

function renderMarketNavigatorFeed(items, view, emptyStateMessage = "") {
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
    } else if (typeof emptyStateMessage === "string" && emptyStateMessage.trim().length > 0) {
      empty.textContent = emptyStateMessage;
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
    openButton.textContent = "Abrir no Chart Lab";

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

function resolveMarketNavigatorProviderLabel(view, payloadData) {
  const providerCode = typeof payloadData?.provider === "string"
    ? payloadData.provider.trim().toLowerCase()
    : "";
  const providerByCode = {
    binance: "Binance",
    coincap: "CoinCap",
    coingecko: "CoinGecko",
    dexscreener: "DexScreener",
    yahoo: "Yahoo Finance",
    yahoo_finance: "Yahoo Finance",
  };

  if (providerCode.length > 0 && providerByCode[providerCode]) {
    return providerByCode[providerCode];
  }

  const moduleName = typeof view?.module === "string" ? view.module : "";
  const providerByModule = {
    b3: "Yahoo Finance",
    commodities: "Yahoo Finance",
    crypto: "CoinCap / CoinGecko / Binance",
    defi: "DeFiLlama / Yahoo Finance",
    equities: "Yahoo Finance",
    etfs: "Yahoo Finance",
    fiis: "Yahoo Finance",
    "fixed-income": "Yahoo Finance",
    forex: "Yahoo Finance",
    futures: "Binance Futures",
    "global-sectors": "Yahoo Finance",
    "macro-rates": "Yahoo Finance",
    options: "Yahoo Finance",
    portfolios: "Yahoo Finance",
    "wall-street": "Yahoo Finance",
  };

  return providerByModule[moduleName] ?? "fonte externa";
}

function inspectMarketNavigatorFailures(payloadData) {
  const bucket = [];

  if (Array.isArray(payloadData?.quotes)) {
    bucket.push(...payloadData.quotes);
  }

  if (Array.isArray(payloadData?.snapshots)) {
    bucket.push(...payloadData.snapshots);
  }

  let errorItemCount = 0;
  const errorCodes = [];

  for (const entry of bucket) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    if (entry.status !== "error") {
      continue;
    }

    errorItemCount += 1;

    if (
      typeof entry.error?.code === "string"
      && entry.error.code.length > 0
      && !errorCodes.includes(entry.error.code)
    ) {
      errorCodes.push(entry.error.code);
    }
  }

  return {
    errorCodes: errorCodes.slice(0, 3),
    errorItemCount,
  };
}

function renderMarketNavigatorPayload(view, payloadData) {
  if (!view || typeof view.id !== "string" || view.id.length === 0) {
    return;
  }

  if (!payloadData || typeof payloadData !== "object") {
    marketNavigatorViewCache.set(view.id, []);
    marketNavigatorViewStats.set(view.id, {
      emptyStateMessage: "Falha ao interpretar a resposta da API desta visao. Tente atualizar para reconectar.",
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
      emptyStateMessage: "",
      meta: `Cobertura ${summary.sourcesHealthy ?? 0}/${summary.totalSources ?? 0} • impacto medio ${summary.averageImpactScore ?? 0} • relevancia media ${summary.averageRelevanceScore ?? 0} • atualizado ${fetchedAt}`,
      statusLabel: newsItems.length > 0 ? "Noticias" : "Sem dados",
      statusMode: newsItems.length > 0 ? "" : "error",
    });
    renderMarketNavigatorFromState();
    return;
  }

  const normalizedItems = normalizeOverviewItems(view, payloadData);
  const failureSignals = inspectMarketNavigatorFailures(payloadData);
  const successCount = typeof payloadData.successCount === "number"
    ? payloadData.successCount
    : normalizedItems.length;
  const declaredFailureCount = typeof payloadData.failureCount === "number" ? payloadData.failureCount : 0;
  const failureCount = Math.max(declaredFailureCount, failureSignals.errorItemCount);
  const fetchedAt = formatShortTime(payloadData.fetchedAt);
  const hasProviderFailure = failureCount > 0;
  const providerLabel = resolveMarketNavigatorProviderLabel(view, payloadData);
  const errorCodesLabel = failureSignals.errorCodes.length > 0
    ? ` • codigos ${failureSignals.errorCodes.join(", ")}`
    : "";
  const providerAlertMessage = hasProviderFailure
    ? `Falha na comunicacao com o provedor ${providerLabel}. Tentando reconectar...${errorCodesLabel}`
    : "";
  const statusLabel = hasProviderFailure
    ? (normalizedItems.length === 0 ? "Erro de provedor" : "Falha parcial")
    : "Carregado";
  const statusMode = hasProviderFailure
    ? (normalizedItems.length === 0 ? "error" : "loading")
    : "";
  const metaMessage = hasProviderFailure
    ? `${providerAlertMessage} • ativos ${normalizedItems.length} • ok ${successCount} • falhas ${failureCount} • atualizado ${fetchedAt}`
    : `Ativos ${normalizedItems.length} • ok ${successCount} • falhas ${failureCount} • atualizado ${fetchedAt}`;

  marketNavigatorViewCache.set(view.id, normalizedItems);
  marketNavigatorViewStats.set(view.id, {
    emptyStateMessage: hasProviderFailure ? providerAlertMessage : "",
    meta: metaMessage,
    statusLabel,
    statusMode,
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
      emptyStateMessage: cachedItems.length === 0
        ? `Falha na comunicacao com o provedor desta visao. ${message}. Tentando reconectar...`
        : "",
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

  if (category.id === "noticias") {
    activeMarketScopeId = "news";
  } else if (category.id === "paises") {
    activeMarketScopeId = "countries";
  } else {
    activeMarketScopeId = "global";
  }

  activeMarketCategoryId = category.id;
  activeMarketViewId = getFirstMarketNavigatorActionableView(category)?.id ?? "";
  renderMarketNavigatorScopes();
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
    return;
  }

  if (scope.id === "countries") {
    setMarketNavigatorCategory("paises");
    return;
  }

  if (getActiveMarketNavigatorCategory()?.hiddenInCategoryList) {
    setMarketNavigatorCategory(MARKET_NAVIGATOR_DEFAULT_CATEGORY_ID);
    return;
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
  const initialCategory = defaultCategory?.hiddenInCategoryList
    ? getMarketNavigatorCategoryById(MARKET_NAVIGATOR_DEFAULT_CATEGORY_ID)
    : defaultCategory;

  if (initialCategory) {
    activeMarketCategoryId = initialCategory.id;
    activeMarketViewId = getFirstMarketNavigatorActionableView(initialCategory)?.id ?? "";
  }

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
    const button = target instanceof HTMLElement
      ? target.closest("button[data-view], button[data-group-target-view]")
      : null;

    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const viewId = button.dataset.view ?? button.dataset.groupTargetView;

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

  const marketRegime = buildMarketRegimeSnapshot({ snapshot });
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
    marketRegime,
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
      // ADR-076 — exposto p/ Timing Desk derivar regime de volatilidade real.
      volatilityPercent: Number.isFinite(insights.volatilityPercent) ? insights.volatilityPercent : 0,
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

function estimateMedianPointSpacingSeconds(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return 60;
  }

  const intervalsSeconds = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const previousTimeMs = typeof previous?.timestamp === "string" ? Date.parse(previous.timestamp) : Number.NaN;
    const currentTimeMs = typeof current?.timestamp === "string" ? Date.parse(current.timestamp) : Number.NaN;

    if (!Number.isFinite(previousTimeMs) || !Number.isFinite(currentTimeMs)) {
      continue;
    }

    const diffSeconds = (currentTimeMs - previousTimeMs) / 1000;

    if (Number.isFinite(diffSeconds) && diffSeconds > 0) {
      intervalsSeconds.push(diffSeconds);
    }
  }

  if (intervalsSeconds.length === 0) {
    return 60;
  }

  intervalsSeconds.sort((left, right) => left - right);
  const middleIndex = Math.floor(intervalsSeconds.length / 2);

  if (intervalsSeconds.length % 2 === 0) {
    return (intervalsSeconds[middleIndex - 1] + intervalsSeconds[middleIndex]) / 2;
  }

  return intervalsSeconds[middleIndex];
}

function estimateMomentumPerSecondPercent(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return 0;
  }

  const recentPoints = points.slice(-Math.min(points.length, 12));
  const firstPoint = recentPoints[0];
  const lastPoint = recentPoints[recentPoints.length - 1];
  const firstClose = toFiniteNumber(firstPoint?.close, Number.NaN);
  const lastClose = toFiniteNumber(lastPoint?.close, Number.NaN);

  if (!Number.isFinite(firstClose) || !Number.isFinite(lastClose)) {
    return 0;
  }

  const firstTimeMs = typeof firstPoint?.timestamp === "string" ? Date.parse(firstPoint.timestamp) : Number.NaN;
  const lastTimeMs = typeof lastPoint?.timestamp === "string" ? Date.parse(lastPoint.timestamp) : Number.NaN;
  const elapsedSecondsFromClock =
    Number.isFinite(firstTimeMs)
    && Number.isFinite(lastTimeMs)
    && lastTimeMs > firstTimeMs
      ? (lastTimeMs - firstTimeMs) / 1000
      : 0;
  const elapsedSecondsFallback = Math.max(1, recentPoints.length - 1) * estimateMedianPointSpacingSeconds(recentPoints);
  const elapsedSeconds = elapsedSecondsFromClock > 0 ? elapsedSecondsFromClock : elapsedSecondsFallback;
  const variationPercent = ((lastClose - firstClose) / Math.max(Math.abs(firstClose), 1e-6)) * 100;

  return variationPercent / Math.max(elapsedSeconds, 1e-6);
}

function normalizeBinaryOptionsInstitutionalPoiTag(value) {
  if (
    value === "cluster"
    || value === "midnight_open"
    || value === "previous_high"
    || value === "previous_low"
  ) {
    return value;
  }

  return "none";
}

function normalizeBinaryOptionsKineticExhaustionState(value) {
  if (value === "cooling" || value === "explosive") {
    return value;
  }

  return "neutral";
}

function resolveBinaryOptionsInstitutionalDirectionalBias(input) {
  if (!input.poiHit) {
    return 0;
  }

  if (input.poiTag === "previous_low") {
    return POI_BIAS_PREVIOUS_LOW;
  }

  if (input.poiTag === "previous_high") {
    return POI_BIAS_PREVIOUS_HIGH;
  }

  if (input.poiTag === "midnight_open") {
    return input.backendMomentumVelocity >= 0 ? POI_BIAS_MIDNIGHT_OPEN : -POI_BIAS_MIDNIGHT_OPEN;
  }

  if (input.poiTag === "cluster") {
    if (input.rejectionSignal === "bullish" || input.tradeAction === "buy") {
      return POI_BIAS_CLUSTER;
    }

    if (input.rejectionSignal === "bearish" || input.tradeAction === "sell") {
      return -POI_BIAS_CLUSTER;
    }
  }

  return 0;
}

function buildBinaryOptionsInstitutionalKineticContext(snapshot) {
  const insights = snapshot?.insights && typeof snapshot.insights === "object"
    ? snapshot.insights
    : null;
  const poiHit = insights?.institutionalPoiHit === true;
  const poiTag = normalizeBinaryOptionsInstitutionalPoiTag(insights?.institutionalPoiTag);
  const kineticState = normalizeBinaryOptionsKineticExhaustionState(insights?.kineticExhaustionState);
  const kineticAccelerationPercentPerSecond2 = toFiniteNumber(insights?.kineticAccelerationPercentPerSecond2, 0);
  const kineticDecelerationStrength = clampNumber(toFiniteNumber(insights?.kineticDecelerationStrength, 0), 0, 100);
  const rejectionSignal =
    insights?.rejectionSignal === "bullish" || insights?.rejectionSignal === "bearish"
      ? insights.rejectionSignal
      : "none";
  const tradeAction =
    insights?.tradeAction === "buy" || insights?.tradeAction === "sell"
      ? insights.tradeAction
      : "wait";
  const backendMomentumVelocity = toFiniteNumber(insights?.momentumVelocityPercentPerSecond, Number.NaN);
  const institutionalBias = resolveBinaryOptionsInstitutionalDirectionalBias({
    backendMomentumVelocity,
    poiHit,
    poiTag,
    rejectionSignal,
    tradeAction,
  });
  const accelerationBias = clampNumber(
    kineticAccelerationPercentPerSecond2 * KINETIC_ACCELERATION_BIAS_SCALE,
    -KINETIC_ACCELERATION_BIAS_CLAMP,
    KINETIC_ACCELERATION_BIAS_CLAMP,
  );
  const kineticDirectionalBias =
    kineticState === "cooling"
      ? clampNumber(kineticDecelerationStrength * KINETIC_COOLING_BIAS_SCALE, 0, KINETIC_COOLING_BIAS_CLAMP)
      : kineticState === "explosive"
        ? KINETIC_EXPLOSIVE_BIAS
        : 0;
  const directionalBias = clampNumber(
    institutionalBias * INSTITUTIONAL_BIAS_WEIGHT + accelerationBias + kineticDirectionalBias,
    -DIRECTIONAL_BIAS_CLAMP,
    DIRECTIONAL_BIAS_CLAMP,
  );
  const momentumStrengthBoost = clampNumber(
    (poiHit ? MOMENTUM_BOOST_POI_HIT : 0)
      + (kineticState === "cooling" ? kineticDecelerationStrength * MOMENTUM_BOOST_COOLING_DECEL_SCALE : 0)
      + (kineticState === "explosive" ? MOMENTUM_BOOST_EXPLOSIVE : 0),
    MOMENTUM_BOOST_CLAMP_MIN,
    MOMENTUM_BOOST_CLAMP_MAX,
  );
  const neutralProbabilityAdjustment =
    kineticState === "explosive"
      ? NEUTRAL_ADJ_EXPLOSIVE
      : poiHit && kineticState === "cooling"
        ? NEUTRAL_ADJ_POI_COOLING
        : poiHit
          ? NEUTRAL_ADJ_POI_ONLY
          : 0;
  const poiTagLabel =
    poiTag === "cluster"
      ? "Cluster de liquidez"
      : poiTag === "previous_low"
        ? "Previous low"
        : poiTag === "previous_high"
          ? "Previous high"
          : poiTag === "midnight_open"
            ? "Midnight open"
            : "Nao detectado";
  const poiBiasLabel =
    directionalBias >= POI_BIAS_LABEL_BUYER_THRESHOLD
      ? "Comprador"
      : directionalBias <= POI_BIAS_LABEL_SELLER_THRESHOLD
        ? "Vendedor"
        : "Equilibrado";
  const kineticStateLabel =
    kineticState === "cooling"
      ? "Cooling"
      : kineticState === "explosive"
        ? "Explosive"
        : "Neutral";
  const contextualGuidance =
    kineticState === "explosive" && !poiHit
      ? "Explosao sem POI confirmado: priorize espera para evitar clique em ruido de expansao."
      : kineticState === "cooling" && poiHit
        ? "Cooling com POI ativo: fluxo mais seletivo e favoravel para gatilhos curtos apos confirmacao."
        : poiHit
          ? "POI ativo sem exaustao forte: manter disciplina e aguardar confirmacao do proximo candle."
          : "Sem POI claro: opere apenas com edge de probabilidade e momentum consistente.";

  return {
    backendMomentumVelocityPercentPerSecond: Number.isFinite(backendMomentumVelocity)
      ? backendMomentumVelocity
      : null,
    callBiasAdjustment: directionalBias,
    contextualGuidance,
    institutionalContext: {
      biasLabel: poiBiasLabel,
      hit: poiHit,
      hitLabel: poiHit ? "ativo" : "inativo",
      tag: poiTag,
      tagLabel: poiTagLabel,
    },
    kineticContext: {
      accelerationPercentPerSecond2: kineticAccelerationPercentPerSecond2,
      decelerationStrength: kineticDecelerationStrength,
      state: kineticState,
      stateLabel: kineticStateLabel,
    },
    momentumStrengthBoost,
    neutralProbabilityAdjustment,
    putBiasAdjustment: -directionalBias,
  };
}

function resolveBinaryOptionsTriggerHeat(input) {
  const directionalProbability = Math.max(input.callProbability, input.putProbability);
  const score = clampNumber(
    roundNumber(
      directionalProbability * TRIGGER_HEAT_DIRECTIONAL_WEIGHT
      + input.momentumStrength * TRIGGER_HEAT_MOMENTUM_WEIGHT
      - input.neutralProbability * TRIGGER_HEAT_NEUTRAL_PENALTY,
      1,
    ),
    0,
    100,
  );
  const dominantSide = input.callProbability >= input.putProbability ? "CALL" : "PUT";

  if (
    directionalProbability >= TRIGGER_HEAT_HOT_DIRECTIONAL_MIN
    && input.momentumStrength >= TRIGGER_HEAT_HOT_MOMENTUM_MIN
    && input.neutralProbability <= TRIGGER_HEAT_HOT_NEUTRAL_MAX
  ) {
    return {
      dominantSide,
      guidance: `Fluxo quente para ${dominantSide}. Janela curta valida, sem perseguir esticada.`,
      score,
      state: "hot",
      title: "Gatilho quente",
    };
  }

  if (
    directionalProbability >= TRIGGER_HEAT_WARM_DIRECTIONAL_MIN
    && input.momentumStrength >= TRIGGER_HEAT_WARM_MOMENTUM_MIN
    && input.neutralProbability <= TRIGGER_HEAT_WARM_NEUTRAL_MAX
  ) {
    return {
      dominantSide,
      guidance: `Fluxo aquecendo para ${dominantSide}. Aguardar micro-confirmacao no proximo candle melhora qualidade.`,
      score,
      state: "warm",
      title: "Gatilho em aquecimento",
    };
  }

  return {
    dominantSide,
    guidance: "Fluxo frio ou conflitado. Melhor aguardar novo ciclo para evitar clique de baixa assimetria.",
    score,
    state: "cold",
    title: "Gatilho frio",
  };
}

function buildMicroTimingAnalysis(analysis, snapshot) {
  const points = Array.isArray(snapshot?.points) ? snapshot.points : [];
  const context = buildBinaryOptionsInstitutionalKineticContext(snapshot);
  const estimatedMomentumPerSecondPercent = estimateMomentumPerSecondPercent(points);
  const blendedMomentumPerSecondPercent = context.backendMomentumVelocityPercentPerSecond === null
    ? estimatedMomentumPerSecondPercent
    : estimatedMomentumPerSecondPercent * BACKEND_MOMENTUM_BLEND_LOCAL_WEIGHT
      + context.backendMomentumVelocityPercentPerSecond * BACKEND_MOMENTUM_BLEND_REMOTE_WEIGHT;
  const momentumPerSecondPercent = roundNumber(
    blendedMomentumPerSecondPercent
      + context.kineticContext.accelerationPercentPerSecond2 * KINETIC_ACCELERATION_MOMENTUM_FACTOR,
    6,
  );
  const momentumStrengthBase = clampNumber(
    roundNumber(Math.abs(momentumPerSecondPercent) * MOMENTUM_STRENGTH_SCALE, 1),
    0,
    100,
  );
  const momentumStrength = clampNumber(
    roundNumber(momentumStrengthBase + context.momentumStrengthBoost, 1),
    0,
    100,
  );
  const momentumDirection =
    momentumPerSecondPercent >= MOMENTUM_DIRECTION_THRESHOLD
      ? "comprador"
      : momentumPerSecondPercent <= -MOMENTUM_DIRECTION_THRESHOLD
        ? "vendedor"
        : "neutro";
  const momentumBias = clampNumber(
    momentumPerSecondPercent * MOMENTUM_BIAS_SCALE,
    -MOMENTUM_BIAS_CLAMP,
    MOMENTUM_BIAS_CLAMP,
  );
  const rawCall = clampNumber(
    analysis.buyProbability
      + momentumBias
      + context.callBiasAdjustment
      + (analysis.signal.tone === "buy" ? SIGNAL_TONE_BIAS_BONUS : 0),
    PROBABILITY_CLAMP_MIN,
    PROBABILITY_CLAMP_MAX,
  );
  const rawPut = clampNumber(
    analysis.sellProbability
      - momentumBias
      + context.putBiasAdjustment
      + (analysis.signal.tone === "sell" ? SIGNAL_TONE_BIAS_BONUS : 0),
    PROBABILITY_CLAMP_MIN,
    PROBABILITY_CLAMP_MAX,
  );
  const rawNeutral = clampNumber(
    analysis.neutralProbability
      + (momentumStrength < NEUTRAL_LOW_MOMENTUM_THRESHOLD ? NEUTRAL_BASE_BOOST_LOW_MOMENTUM : NEUTRAL_BASE_BOOST_DEFAULT)
      + context.neutralProbabilityAdjustment,
    PROBABILITY_CLAMP_MIN,
    NEUTRAL_PROBABILITY_CLAMP_MAX,
  );
  const total = rawCall + rawPut + rawNeutral;
  const callProbability = roundNumber((rawCall / total) * 100, 1);
  const putProbability = roundNumber((rawPut / total) * 100, 1);
  const neutralProbability = roundNumber(Math.max(0, 100 - callProbability - putProbability), 1);
  const barSpacingSeconds = estimateMedianPointSpacingSeconds(points);
  const suggestedExpirySeconds = Math.round(clampNumber(
    barSpacingSeconds * SUGGESTED_EXPIRY_BAR_MULTIPLIER,
    SUGGESTED_EXPIRY_MIN_SECONDS,
    SUGGESTED_EXPIRY_MAX_SECONDS,
  ));
  const momentumLabel =
    momentumStrength >= MOMENTUM_LABEL_STRONG_THRESHOLD
      ? "Aceleracao forte"
      : momentumStrength >= MOMENTUM_LABEL_MODERATE_THRESHOLD
        ? "Aceleracao moderada"
        : "Fluxo comprimido";
  const triggerHeat = resolveBinaryOptionsTriggerHeat({
    callProbability,
    momentumStrength,
    neutralProbability,
    putProbability,
  });

  return {
    barSpacingSeconds,
    callProbability,
    momentumDirection,
    momentumLabel,
    momentumPerSecondPercent,
    momentumStrength,
    neutralProbability,
    contextualGuidance: context.contextualGuidance,
    institutionalContext: context.institutionalContext,
    kineticContext: context.kineticContext,
    putProbability,
    suggestedExpirySeconds,
    triggerHeat,
  };
}

function createBinaryOptionsGhostTrackerState() {
  return {
    lastSignalAtMs: 0,
    lastSettledAtMs: 0,
    losses: 0,
    openSignals: [],
    pushes: 0,
    recentResults: [],
    sessionKey: "",
    startedAtMs: Date.now(),
    wins: 0,
  };
}

function createSpotMarginGhostTrackerState() {
  return {
    lastSignalAtMs: 0,
    lastSettledAtMs: 0,
    losses: 0,
    openSignals: [],
    pushes: 0,
    recentResults: [],
    sessionKey: "",
    startedAtMs: Date.now(),
    wins: 0,
  };
}

function createBinaryOptionsGhostAuditBackendState() {
  return {
    error: "",
    fetchedAtMs: 0,
    history: null,
    inFlight: false,
    requestKey: "",
  };
}

function normalizeBinaryOptionsGhostAuditViewMode(value) {
  return value === BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_INSTITUTIONAL
    ? BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_INSTITUTIONAL
    : BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_SESSION;
}

function getBinaryOptionsGhostAuditSessionId() {
  const sessionId = typeof chatSessionId === "string" ? chatSessionId.trim() : "";
  return SESSION_ID_PATTERN.test(sessionId) ? sessionId : "";
}

function resetBinaryOptionsGhostTrackerSession() {
  binaryOptionsGhostTrackerState = createBinaryOptionsGhostTrackerState();
}

function resetSpotMarginGhostTrackerSession() {
  spotMarginGhostTrackerState = createSpotMarginGhostTrackerState();
}

function resetBinaryOptionsGhostAuditBackendState() {
  binaryOptionsGhostAuditBackendState = createBinaryOptionsGhostAuditBackendState();
  binaryOptionsGhostAuditViewMode = BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_SESSION;
}

function resetChartAssetScopedState(nextContext, options = {}) {
  return resetChartAssetContext({
    callbacks: [() => {
      resetBinaryOptionsGhostTrackerSession();
      resetSpotMarginGhostTrackerSession();
      resetBinaryOptionsGhostAuditBackendState();
      newsIntelligencePayload = null;
      newsIntelligenceLastAssetId = "";
      newsIntelligenceLastFetchedAtMs = 0;
      newsIntelligenceRequestToken += 1;
      intelligenceSyncAlertLevel = "ok";
      intelligenceSyncLastAlertAtMs = 0;
      chartLabState.snapshot = null;
      clearChartSurface();
      setChartLegend("Carregando novo contexto de ativo...", "loading");
      renderChartMetrics(null);
    }],
    force: options.force === true,
    nextContext,
    previousContext: {
      ...chartLabStore.getSelection(),
      operationalMode: chartLabState.operationalMode,
      strategy: chartLabState.strategy,
    },
    reason: typeof options.reason === "string" ? options.reason : "asset-context-change",
  });
}

function setBinaryOptionsGhostAuditViewMode(nextMode, options = {}) {
  const normalizedMode = normalizeBinaryOptionsGhostAuditViewMode(nextMode);

  if (normalizedMode === binaryOptionsGhostAuditViewMode && options.force !== true) {
    return;
  }

  binaryOptionsGhostAuditViewMode = normalizedMode;
  binaryOptionsGhostAuditBackendState.error = "";
  binaryOptionsGhostAuditBackendState.fetchedAtMs = 0;
  binaryOptionsGhostAuditBackendState.history = null;
  binaryOptionsGhostAuditBackendState.requestKey = "";

  renderDeepAnalysisPanel(chartLabState.snapshot);

  if (options.refresh !== false && chartLabState.snapshot) {
    void refreshBinaryOptionsGhostAuditHistory(chartLabState.snapshot, {
      force: true,
    });
  }
}

function bindGhostAuditViewModeButtons(container) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const ghostViewModeButtons = container.querySelectorAll("[data-ghost-audit-view-mode]");

  for (const ghostViewModeButton of ghostViewModeButtons) {
    if (!(ghostViewModeButton instanceof HTMLButtonElement)) {
      continue;
    }

    ghostViewModeButton.addEventListener("click", () => {
      setBinaryOptionsGhostAuditViewMode(ghostViewModeButton.dataset.ghostAuditViewMode, {
        refresh: true,
      });
    });
  }
}

function buildBinaryOptionsGhostSessionKey(snapshot) {
  const assetId = typeof snapshot?.assetId === "string" ? snapshot.assetId : "unknown";
  const range = typeof snapshot?.range === "string" ? snapshot.range : "na";
  const resolution = typeof snapshot?.resolution === "string" ? snapshot.resolution : "na";
  const exchange = typeof snapshot?.exchange?.resolved === "string"
    ? snapshot.exchange.resolved
    : typeof snapshot?.provider === "string"
      ? snapshot.provider
      : "provider";

  return `${assetId}:${range}:${resolution}:${exchange}`;
}

function getBinaryOptionsGhostTrackerStats(state = binaryOptionsGhostTrackerState) {
  const resolvedTrades = state.wins + state.losses;
  const winRate = resolvedTrades > 0 ? roundNumber((state.wins / resolvedTrades) * 100, 1) : 0;

  return {
    losses: state.losses,
    openSignals: state.openSignals.length,
    pushes: state.pushes,
    resolvedTrades,
    sampleState:
      resolvedTrades >= 20 ? "amostra robusta" : resolvedTrades >= 8 ? "amostra moderada" : "amostra inicial",
    wins: state.wins,
    winRate,
  };
}

/**
 * Mirror de `getBinaryOptionsGhostTrackerStats` para o modo Spot/Margem.
 * Retorna o shape minimo consumido pelo resumo institucional sem acoplar
 * ao estado de opcoes binarias.
 */
function getSpotMarginGhostTrackerStats(state = spotMarginGhostTrackerState) {
  const resolvedTrades = state.wins + state.losses;
  const winRate = resolvedTrades > 0 ? roundNumber((state.wins / resolvedTrades) * 100, 1) : 0;

  return {
    losses: state.losses,
    openSignals: state.openSignals.length,
    pushes: state.pushes,
    resolvedTrades,
    sampleState:
      resolvedTrades >= 20 ? "amostra robusta" : resolvedTrades >= 8 ? "amostra moderada" : "amostra inicial",
    wins: state.wins,
    winRate,
  };
}

function canFetchBinaryOptionsGhostAuditHistory() {
  return typeof fetch === "function" && hasIntelligenceSyncInternalToken();
}

function getBinaryOptionsGhostBackendStats(state = binaryOptionsGhostAuditBackendState) {
  const summary = state.history && typeof state.history.summary === "object" ? state.history.summary : null;
  const wins = Math.max(0, Math.round(toFiniteNumber(summary?.wins, 0)));
  const losses = Math.max(0, Math.round(toFiniteNumber(summary?.losses, 0)));
  const pushes = Math.max(0, Math.round(toFiniteNumber(summary?.pushes, 0)));
  const resolvedTrades = Math.max(
    0,
    Math.round(toFiniteNumber(summary?.resolvedTrades, wins + losses)),
  );
  const winRate = clampNumber(
    toFiniteNumber(summary?.winRatePercent, resolvedTrades > 0 ? (wins / resolvedTrades) * 100 : 0),
    0,
    100,
  );
  const totalMatched = Math.max(
    0,
    Math.round(toFiniteNumber(state.history?.totalMatched, resolvedTrades + pushes)),
  );
  const totalStored = Math.max(0, Math.round(toFiniteNumber(state.history?.totalStored, totalMatched)));

  return {
    enabled: canFetchBinaryOptionsGhostAuditHistory(),
    error: state.error,
    fetchedAtMs: state.fetchedAtMs,
    hasSnapshot: summary !== null,
    inFlight: state.inFlight,
    losses,
    pushes,
    resolvedTrades,
    sampleState:
      resolvedTrades >= 40 ? "amostra institucional" : resolvedTrades >= 12 ? "amostra em crescimento" : "amostra inicial",
    totalMatched,
    totalStored,
    winRate,
    wins,
  };
}

function buildBinaryOptionsGhostBackendStatusMessage(ghostBackendStats) {
  const isSessionView =
    normalizeBinaryOptionsGhostAuditViewMode(binaryOptionsGhostAuditViewMode)
    === BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_SESSION;

  if (!ghostBackendStats.enabled) {
    return "Backend audit indisponivel: defina VITE_INTERNAL_API_TOKEN ou injete token em runtime com window.__botfinanceiroSetInternalToken('...').";
  }

  if (isSessionView && ghostBackendStats.error === "ghost-audit-session-id-invalid") {
    return "Sessao atual sem sessionId valido para consultar o historico persistido.";
  }

  if (ghostBackendStats.inFlight && !ghostBackendStats.hasSnapshot) {
    return isSessionView
      ? "Sincronizando historico persistido da sessao atual..."
      : "Sincronizando historico institucional...";
  }

  if (ghostBackendStats.error.length > 0 && !ghostBackendStats.hasSnapshot) {
    return isSessionView
      ? "Historico persistido da sessao indisponivel; mantendo auditoria local da sessao."
      : "Historico institucional indisponivel; mantendo apenas auditoria local da sessao.";
  }

  if (ghostBackendStats.resolvedTrades <= 0) {
    return isSessionView
      ? "Sem base persistida para a sessao atual neste ativo."
      : "Sem base persistida para este ativo ate o momento.";
  }

  if (ghostBackendStats.error.length > 0) {
    return isSessionView
      ? "Exibindo ultimo snapshot valido da sessao; houve falha na atualizacao mais recente."
      : "Exibindo ultimo snapshot valido do backend; houve falha na atualizacao mais recente.";
  }

  if (isSessionView) {
    return `Sessao atual: ${ghostBackendStats.totalMatched} registros filtrados por sessionId.`;
  }

  return `Base institucional: ${ghostBackendStats.totalMatched} registros filtrados (${ghostBackendStats.totalStored} no storage).`;
}

function buildBinaryOptionsGhostAuditHistoryQuery(snapshot) {
  const params = new URLSearchParams();
  const assetId = typeof snapshot?.assetId === "string" ? snapshot.assetId.trim() : "";
  const ghostAuditOperationalMode = resolveGhostAuditOperationalMode();
  const ghostAuditViewMode = normalizeBinaryOptionsGhostAuditViewMode(binaryOptionsGhostAuditViewMode);

  if (ghostAuditOperationalMode) {
    params.set("operationalMode", ghostAuditOperationalMode);
  }

  if (ghostAuditViewMode === BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_SESSION) {
    const sessionId = getBinaryOptionsGhostAuditSessionId();

    if (sessionId.length > 0) {
      params.set("sessionId", sessionId);
    }
  }

  if (assetId.length > 0) {
    params.set("assetId", assetId);
  }

  params.set("limit", String(BINARY_OPTIONS_GHOST_AUDIT_HISTORY_LIMIT));
  params.set("offset", "0");
  return params.toString();
}

function buildBinaryOptionsGhostAuditHistoryRequestKey(snapshot) {
  const baseSessionKey = buildBinaryOptionsGhostSessionKey(snapshot);
  const ghostAuditOperationalMode = resolveGhostAuditOperationalMode();
  const ghostAuditViewMode = normalizeBinaryOptionsGhostAuditViewMode(binaryOptionsGhostAuditViewMode);
  const operationalModeKey = ghostAuditOperationalMode ?? "unknown";

  if (ghostAuditViewMode === BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_SESSION) {
    const sessionId = getBinaryOptionsGhostAuditSessionId();
    return sessionId.length > 0
      ? `${baseSessionKey}:${operationalModeKey}:${BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_SESSION}:${sessionId}`
      : `${baseSessionKey}:${operationalModeKey}:${BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_SESSION}:invalid`;
  }

  return `${baseSessionKey}:${operationalModeKey}:${BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_INSTITUTIONAL}`;
}

async function refreshBinaryOptionsGhostAuditHistory(snapshot, options = {}) {
  const ghostAuditOperationalMode = resolveGhostAuditOperationalMode();

  if (!ghostAuditOperationalMode || snapshot?.mode !== "live") {
    return;
  }

  if (activeAppRoute !== APP_ROUTE_CHART_LAB) {
    return;
  }

  if (!canFetchBinaryOptionsGhostAuditHistory()) {
    return;
  }

  const ghostAuditViewMode = normalizeBinaryOptionsGhostAuditViewMode(binaryOptionsGhostAuditViewMode);
  const sessionId = getBinaryOptionsGhostAuditSessionId();

  if (ghostAuditViewMode === BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_SESSION && sessionId.length < 8) {
    binaryOptionsGhostAuditBackendState.error = "ghost-audit-session-id-invalid";
    binaryOptionsGhostAuditBackendState.history = null;
    binaryOptionsGhostAuditBackendState.requestKey = "";
    binaryOptionsGhostAuditBackendState.fetchedAtMs = 0;
    return;
  }

  if (binaryOptionsGhostAuditBackendState.inFlight) {
    return;
  }

  const requestKey = buildBinaryOptionsGhostAuditHistoryRequestKey(snapshot);
  const nowMs = Date.now();
  const hasFreshSnapshot =
    binaryOptionsGhostAuditBackendState.fetchedAtMs > 0
    && nowMs - binaryOptionsGhostAuditBackendState.fetchedAtMs < BINARY_OPTIONS_GHOST_AUDIT_HISTORY_REFRESH_MS
    && binaryOptionsGhostAuditBackendState.requestKey === requestKey;

  if (options.force !== true && hasFreshSnapshot) {
    return;
  }

  const query = buildBinaryOptionsGhostAuditHistoryQuery(snapshot);
  const requestPath = query.length > 0
    ? `${BINARY_OPTIONS_GHOST_AUDIT_HISTORY_ENDPOINT}?${query}`
    : BINARY_OPTIONS_GHOST_AUDIT_HISTORY_ENDPOINT;
  const internalToken = getIntelligenceSyncInternalToken();

  binaryOptionsGhostAuditBackendState.inFlight = true;

  try {
    const response = await fetch(buildApiUrl(requestPath), {
      headers: {
        "x-internal-token": internalToken,
      },
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`ghost-audit-history-${response.status}`);
    }

    const payload = await response.json();
    const payloadData = payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
      ? payload.data
      : null;

    if (!payloadData || !payloadData.summary || typeof payloadData.summary !== "object") {
      throw new Error("ghost-audit-history-invalid");
    }

    binaryOptionsGhostAuditBackendState.error = "";
    binaryOptionsGhostAuditBackendState.fetchedAtMs = Date.now();
    binaryOptionsGhostAuditBackendState.history = payloadData;
    binaryOptionsGhostAuditBackendState.requestKey = requestKey;
    renderDeepAnalysisPanel(chartLabState.snapshot);
  } catch (error) {
    binaryOptionsGhostAuditBackendState.error = error instanceof Error ? error.message : "ghost-audit-history-failed";
    binaryOptionsGhostAuditBackendState.fetchedAtMs = Date.now();
    renderDeepAnalysisPanel(chartLabState.snapshot);
  } finally {
    binaryOptionsGhostAuditBackendState.inFlight = false;
  }
}

function buildBinaryOptionsGhostSignalId(nowMs = Date.now()) {
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `ghost_${nowMs}_${randomSuffix}`;
}

function buildBinaryOptionsGhostAuditSettlementPayload(input) {
  const sessionId = typeof chatSessionId === "string" ? chatSessionId.trim() : "";

  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return null;
  }

  const signal = input?.signal;
  const snapshot = input?.snapshot;
  const operationalMode = resolveGhostAuditOperationalMode(input?.operationalMode ?? chartLabState.operationalMode);
  const settledAtMs = toFiniteNumber(input?.nowMs, Date.now());
  const expiryPrice = toFiniteNumber(input?.currentPrice, Number.NaN);

  if (!signal || !Number.isFinite(expiryPrice)) {
    return null;
  }

  const openedAt = Number.isFinite(signal.openedAtMs)
    ? new Date(signal.openedAtMs).toISOString()
    : undefined;
  const settledAt = Number.isFinite(settledAtMs)
    ? new Date(settledAtMs).toISOString()
    : undefined;

  return {
    assetId: typeof snapshot?.assetId === "string" ? snapshot.assetId : "bitcoin",
    callProbability: Number.isFinite(signal.callProbability) ? signal.callProbability : undefined,
    direction: signal.direction,
    entryPrice: signal.entryPrice,
    exchangeRequested:
      typeof snapshot?.exchange?.requested === "string" ? snapshot.exchange.requested : undefined,
    exchangeResolved:
      typeof snapshot?.exchange?.resolved === "string" ? snapshot.exchange.resolved : undefined,
    expiryPrice,
    expirySeconds: signal.expirySeconds,
    momentumStrength: Number.isFinite(signal.momentumStrength) ? signal.momentumStrength : undefined,
    neutralProbability: Number.isFinite(signal.neutralProbability) ? signal.neutralProbability : undefined,
    openedAt,
    operationalMode: operationalMode ?? undefined,
    outcome: input?.outcome,
    probability: signal.probability,
    provider: typeof snapshot?.provider === "string" ? snapshot.provider : undefined,
    putProbability: Number.isFinite(signal.putProbability) ? signal.putProbability : undefined,
    range: typeof snapshot?.range === "string" ? snapshot.range : undefined,
    resolution: typeof signal.resolution === "string" ? signal.resolution : undefined,
    sessionId,
    settledAt,
    signalId: signal.signalId,
    symbol: typeof snapshot?.symbol === "string" ? snapshot.symbol : undefined,
    triggerHeat:
      signal.triggerHeat === "cold" || signal.triggerHeat === "warm" || signal.triggerHeat === "hot"
        ? signal.triggerHeat
        : undefined,
  };
}

async function publishBinaryOptionsGhostSettlementToBackend(input) {
  if (typeof fetch !== "function") {
    return;
  }

  const payload = buildBinaryOptionsGhostAuditSettlementPayload(input);

  if (!payload) {
    return;
  }

  try {
    const response = await fetch(buildApiUrl(BINARY_OPTIONS_GHOST_AUDIT_SETTLEMENT_ENDPOINT), {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      keepalive: true,
      method: "POST",
    });

    if (response.ok) {
      binaryOptionsGhostAuditBackendState.fetchedAtMs = 0;
    }
  } catch {
    // Ghost audit nao deve bloquear a experiencia do operador.
  }
}

function settleBinaryOptionsGhostSignals(currentPrice, snapshot, nowMs = Date.now()) {
  if (!Number.isFinite(currentPrice) || binaryOptionsGhostTrackerState.openSignals.length === 0) {
    return;
  }

  const epsilon = Math.max(1e-8, Math.abs(currentPrice) * 0.00001);
  const pendingSignals = [];
  let hasSettlement = false;

  for (const signal of binaryOptionsGhostTrackerState.openSignals) {
    if (nowMs < signal.expiresAtMs) {
      pendingSignals.push(signal);
      continue;
    }

    const priceDelta = currentPrice - signal.entryPrice;
    let outcome = "push";

    if (signal.direction === "call") {
      outcome = priceDelta > epsilon ? "win" : priceDelta < -epsilon ? "loss" : "push";
    } else {
      outcome = priceDelta < -epsilon ? "win" : priceDelta > epsilon ? "loss" : "push";
    }

    if (outcome === "win") {
      binaryOptionsGhostTrackerState.wins += 1;
    } else if (outcome === "loss") {
      binaryOptionsGhostTrackerState.losses += 1;
    } else {
      binaryOptionsGhostTrackerState.pushes += 1;
    }

    binaryOptionsGhostTrackerState.recentResults.unshift({
      direction: signal.direction,
      entryPrice: signal.entryPrice,
      expiryPrice: currentPrice,
      expirySeconds: signal.expirySeconds,
      outcome,
      probability: signal.probability,
      signalId: signal.signalId,
      settledAtMs: nowMs,
      triggerHeat: signal.triggerHeat ?? "unknown",
    });

    void publishBinaryOptionsGhostSettlementToBackend({
      currentPrice,
      nowMs,
      operationalMode: GHOST_AUDIT_OPERATIONAL_MODE_BINARY_OPTIONS,
      outcome,
      signal,
      snapshot,
    });

    hasSettlement = true;
  }

  if (!hasSettlement) {
    return;
  }

  binaryOptionsGhostTrackerState.lastSettledAtMs = nowMs;
  binaryOptionsGhostTrackerState.openSignals = pendingSignals;
  binaryOptionsGhostTrackerState.recentResults = binaryOptionsGhostTrackerState.recentResults.slice(
    0,
    BINARY_OPTIONS_GHOST_TRACKER_DEFAULTS.resultHistoryLimit,
  );
}

function registerBinaryOptionsGhostSignal(snapshot, microTiming, currentPrice, nowMs = Date.now()) {
  const directionalProbability = Math.max(microTiming.callProbability, microTiming.putProbability);
  const probabilityEdge = Math.abs(microTiming.callProbability - microTiming.putProbability);

  if (directionalProbability < BINARY_OPTIONS_GHOST_TRACKER_DEFAULTS.minDirectionalProbability) {
    return false;
  }

  if (probabilityEdge < BINARY_OPTIONS_GHOST_TRACKER_DEFAULTS.minProbabilityEdge) {
    return false;
  }

  if (microTiming.neutralProbability > BINARY_OPTIONS_GHOST_TRACKER_DEFAULTS.maxNeutralProbability) {
    return false;
  }

  if (microTiming.momentumStrength < BINARY_OPTIONS_GHOST_TRACKER_DEFAULTS.minMomentumStrength) {
    return false;
  }

  if (microTiming.triggerHeat?.state === "cold") {
    return false;
  }

  if (binaryOptionsGhostTrackerState.openSignals.length >= BINARY_OPTIONS_GHOST_TRACKER_DEFAULTS.maxConcurrentSignals) {
    return false;
  }

  const cooldownMs = BINARY_OPTIONS_GHOST_TRACKER_DEFAULTS.cooldownSeconds * 1000;

  if (nowMs - binaryOptionsGhostTrackerState.lastSignalAtMs < cooldownMs) {
    return false;
  }

  const direction = microTiming.callProbability >= microTiming.putProbability ? "call" : "put";
  const suggestedExpirySeconds = toFiniteNumber(
    microTiming.suggestedExpirySeconds,
    BINARY_OPTIONS_GHOST_TRACKER_DEFAULTS.fallbackExpirySeconds,
  );
  const expirySeconds = Math.round(clampNumber(suggestedExpirySeconds, 30, 180));
  const signalId = buildBinaryOptionsGhostSignalId(nowMs);

  binaryOptionsGhostTrackerState.openSignals.push({
    callProbability: microTiming.callProbability,
    direction,
    entryPrice: currentPrice,
    expiresAtMs: nowMs + expirySeconds * 1000,
    expirySeconds,
    momentumStrength: microTiming.momentumStrength,
    neutralProbability: microTiming.neutralProbability,
    openedAtMs: nowMs,
    probability: directionalProbability,
    putProbability: microTiming.putProbability,
    resolution: typeof snapshot?.resolution === "string" ? snapshot.resolution : "1S",
    signalId,
    triggerHeat: microTiming.triggerHeat?.state,
  });
  binaryOptionsGhostTrackerState.lastSignalAtMs = nowMs;
  return true;
}

function updateBinaryOptionsGhostTracker(snapshot, microTiming) {
  if (!isBinaryOptionsOperationalMode() || snapshot?.mode !== "live") {
    return;
  }

  const points = Array.isArray(snapshot?.points) ? snapshot.points : [];
  const lastPoint = points[points.length - 1];
  const currentPrice = toFiniteNumber(lastPoint?.close, Number.NaN);

  if (!Number.isFinite(currentPrice)) {
    return;
  }

  const sessionKey = buildBinaryOptionsGhostSessionKey(snapshot);

  if (binaryOptionsGhostTrackerState.sessionKey !== sessionKey) {
    binaryOptionsGhostTrackerState = createBinaryOptionsGhostTrackerState();
    binaryOptionsGhostTrackerState.sessionKey = sessionKey;
  }

  const nowMs = Date.now();
  settleBinaryOptionsGhostSignals(currentPrice, snapshot, nowMs);
  registerBinaryOptionsGhostSignal(snapshot, microTiming, currentPrice, nowMs);
  schedulePersistGhostTrackerStates();
}

function resolveSpotMarginTriggerHeat(input) {
  const directionalProbability = Math.max(input.buyProbability, input.sellProbability);
  const score = clampNumber(
    roundNumber(
      directionalProbability * 0.72
      + input.confidenceScore * 0.2
      - input.neutralProbability * 0.26
      - Math.max(0, input.volatilityPercent - 3.2) * 2.1,
      1,
    ),
    0,
    100,
  );
  const dominantSide = input.buyProbability >= input.sellProbability ? "BUY" : "SELL";

  if (directionalProbability >= 72 && input.neutralProbability <= 24 && input.confidenceScore >= 58) {
    return {
      dominantSide,
      guidance: `Fluxo spot/margem aquecido para ${dominantSide}. Priorize execucao com risco controlado e sem aumentar alavancagem no impulso.`,
      score,
      state: "hot",
      title: "Viés quente",
    };
  }

  if (directionalProbability >= 64 && input.neutralProbability <= 32 && input.confidenceScore >= 48) {
    return {
      dominantSide,
      guidance: `Viés moderado para ${dominantSide}. Aguarde confirmacao de continuidade antes de aumentar exposicao.`,
      score,
      state: "warm",
      title: "Viés em aquecimento",
    };
  }

  return {
    dominantSide,
    guidance: "Viés frio para spot/margem. Melhor reduzir frequencia e aguardar assimetria mais clara.",
    score,
    state: "cold",
    title: "Viés frio",
  };
}

function settleSpotMarginGhostSignals(currentPrice, snapshot, nowMs = Date.now()) {
  if (!Number.isFinite(currentPrice) || spotMarginGhostTrackerState.openSignals.length === 0) {
    return;
  }

  const epsilon = Math.max(1e-8, Math.abs(currentPrice) * 0.00001);
  const pendingSignals = [];
  let hasSettlement = false;

  for (const signal of spotMarginGhostTrackerState.openSignals) {
    if (nowMs < signal.expiresAtMs) {
      pendingSignals.push(signal);
      continue;
    }

    const priceDelta = currentPrice - signal.entryPrice;
    let outcome = "push";

    if (signal.direction === "call") {
      outcome = priceDelta > epsilon ? "win" : priceDelta < -epsilon ? "loss" : "push";
    } else {
      outcome = priceDelta < -epsilon ? "win" : priceDelta > epsilon ? "loss" : "push";
    }

    if (outcome === "win") {
      spotMarginGhostTrackerState.wins += 1;
    } else if (outcome === "loss") {
      spotMarginGhostTrackerState.losses += 1;
    } else {
      spotMarginGhostTrackerState.pushes += 1;
    }

    spotMarginGhostTrackerState.recentResults.unshift({
      direction: signal.direction,
      entryPrice: signal.entryPrice,
      expiryPrice: currentPrice,
      expirySeconds: signal.expirySeconds,
      outcome,
      probability: signal.probability,
      signalId: signal.signalId,
      settledAtMs: nowMs,
      triggerHeat: signal.triggerHeat ?? "unknown",
    });

    void publishBinaryOptionsGhostSettlementToBackend({
      currentPrice,
      nowMs,
      operationalMode: GHOST_AUDIT_OPERATIONAL_MODE_SPOT_MARGIN,
      outcome,
      signal,
      snapshot,
    });

    hasSettlement = true;
  }

  if (!hasSettlement) {
    return;
  }

  spotMarginGhostTrackerState.lastSettledAtMs = nowMs;
  spotMarginGhostTrackerState.openSignals = pendingSignals;
  spotMarginGhostTrackerState.recentResults = spotMarginGhostTrackerState.recentResults.slice(
    0,
    SPOT_MARGIN_GHOST_TRACKER_DEFAULTS.resultHistoryLimit,
  );
}

function registerSpotMarginGhostSignal(snapshot, analysis, currentPrice, nowMs = Date.now()) {
  const signalTone = typeof analysis?.signal?.tone === "string" ? analysis.signal.tone : "neutral";

  if (signalTone !== "buy" && signalTone !== "sell") {
    return false;
  }

  const buyProbability = clampNumber(toFiniteNumber(analysis?.buyProbability, 0), 0, 100);
  const sellProbability = clampNumber(toFiniteNumber(analysis?.sellProbability, 0), 0, 100);
  const neutralProbability = clampNumber(toFiniteNumber(analysis?.neutralProbability, 0), 0, 100);
  const directionalProbability = signalTone === "buy" ? buyProbability : sellProbability;
  const probabilityEdge = Math.abs(buyProbability - sellProbability);
  const confidenceScore = clampNumber(toFiniteNumber(analysis?.signal?.confidence, 0), 0, 100);

  if (directionalProbability < SPOT_MARGIN_GHOST_TRACKER_DEFAULTS.minDirectionalProbability) {
    return false;
  }

  if (probabilityEdge < SPOT_MARGIN_GHOST_TRACKER_DEFAULTS.minProbabilityEdge) {
    return false;
  }

  if (neutralProbability > SPOT_MARGIN_GHOST_TRACKER_DEFAULTS.maxNeutralProbability) {
    return false;
  }

  if (spotMarginGhostTrackerState.openSignals.length >= SPOT_MARGIN_GHOST_TRACKER_DEFAULTS.maxConcurrentSignals) {
    return false;
  }

  const cooldownMs = SPOT_MARGIN_GHOST_TRACKER_DEFAULTS.cooldownSeconds * 1000;

  if (nowMs - spotMarginGhostTrackerState.lastSignalAtMs < cooldownMs) {
    return false;
  }

  const points = Array.isArray(snapshot?.points) ? snapshot.points : [];
  const barSpacingSeconds = estimateMedianPointSpacingSeconds(points);
  const suggestedExpirySeconds = toFiniteNumber(
    barSpacingSeconds * 10,
    SPOT_MARGIN_GHOST_TRACKER_DEFAULTS.fallbackExpirySeconds,
  );
  const expirySeconds = Math.round(clampNumber(suggestedExpirySeconds, 120, 600));
  const signalId = buildBinaryOptionsGhostSignalId(nowMs);
  const triggerHeat = resolveSpotMarginTriggerHeat({
    buyProbability,
    confidenceScore,
    neutralProbability,
    sellProbability,
    volatilityPercent: toFiniteNumber(snapshot?.insights?.volatilityPercent, 0),
  });
  const momentumStrength = clampNumber(
    Math.abs(toFiniteNumber(analysis?.wegd?.pressure, 0)) * 1.2 + Math.abs(toFiniteNumber(analysis?.fearGreed?.delta7d, 0)) * 0.8,
    0,
    100,
  );

  spotMarginGhostTrackerState.openSignals.push({
    callProbability: buyProbability,
    direction: signalTone === "buy" ? "call" : "put",
    entryPrice: currentPrice,
    expiresAtMs: nowMs + expirySeconds * 1000,
    expirySeconds,
    momentumStrength,
    neutralProbability,
    openedAtMs: nowMs,
    probability: directionalProbability,
    putProbability: sellProbability,
    resolution: typeof snapshot?.resolution === "string"
      ? snapshot.resolution
      : (normalizeRequestedChartResolution(getSelectedTerminalInterval()) ?? "1"),
    signalId,
    triggerHeat: triggerHeat.state,
  });
  spotMarginGhostTrackerState.lastSignalAtMs = nowMs;
  return true;
}

function updateSpotMarginGhostTracker(snapshot, analysis) {
  if (!isSpotMarginOperationalMode() || snapshot?.mode !== "live") {
    return;
  }

  const points = Array.isArray(snapshot?.points) ? snapshot.points : [];
  const lastPoint = points[points.length - 1];
  const currentPrice = toFiniteNumber(lastPoint?.close, Number.NaN);

  if (!Number.isFinite(currentPrice)) {
    return;
  }

  const sessionKey = `${buildBinaryOptionsGhostSessionKey(snapshot)}:${GHOST_AUDIT_OPERATIONAL_MODE_SPOT_MARGIN}`;

  if (spotMarginGhostTrackerState.sessionKey !== sessionKey) {
    spotMarginGhostTrackerState = createSpotMarginGhostTrackerState();
    spotMarginGhostTrackerState.sessionKey = sessionKey;
  }

  const nowMs = Date.now();
  settleSpotMarginGhostSignals(currentPrice, snapshot, nowMs);
  registerSpotMarginGhostSignal(snapshot, analysis, currentPrice, nowMs);
  schedulePersistGhostTrackerStates();
}

function sanitizeBinaryOptionsRiskState(candidate) {
  const bankroll = clampNumber(
    parseOptionalNumber(candidate?.bankroll, BINARY_OPTIONS_RISK_DEFAULT_STATE.bankroll),
    10,
    100000000,
  );
  const payoutPercent = clampNumber(
    parseOptionalNumber(candidate?.payoutPercent, BINARY_OPTIONS_RISK_DEFAULT_STATE.payoutPercent),
    10,
    99,
  );
  const stake = clampNumber(
    parseOptionalNumber(candidate?.stake, BINARY_OPTIONS_RISK_DEFAULT_STATE.stake),
    1,
    bankroll,
  );

  return {
    bankroll,
    payoutPercent,
    stake,
  };
}

function readStoredBinaryOptionsRiskState() {
  try {
    const raw = localStorage.getItem(BINARY_OPTIONS_RISK_STORAGE_KEY);

    if (!raw) {
      return {
        ...BINARY_OPTIONS_RISK_DEFAULT_STATE,
      };
    }

    const parsed = JSON.parse(raw);
    return sanitizeBinaryOptionsRiskState(parsed);
  } catch {
    return {
      ...BINARY_OPTIONS_RISK_DEFAULT_STATE,
    };
  }
}

function saveBinaryOptionsRiskState() {
  try {
    localStorage.setItem(BINARY_OPTIONS_RISK_STORAGE_KEY, JSON.stringify(binaryOptionsRiskState));
  } catch {
    // Ignore storage errors and keep UX stateless.
  }
}

function calculateBinaryOptionsRiskProjection(state = binaryOptionsRiskState) {
  const safeState = sanitizeBinaryOptionsRiskState(state);
  const projectedProfit = roundNumber(safeState.stake * (safeState.payoutPercent / 100), 2);
  const projectedBalanceWin = roundNumber(safeState.bankroll + projectedProfit, 2);
  const projectedBalanceLoss = roundNumber(Math.max(0, safeState.bankroll - safeState.stake), 2);
  const stakePercent = roundNumber((safeState.stake / Math.max(safeState.bankroll, 1e-6)) * 100, 2);
  const suggestedStake = roundNumber(safeState.bankroll * 0.02, 2);

  return {
    projectedBalanceLoss,
    projectedBalanceWin,
    projectedProfit,
    safeState,
    stakePercent,
    suggestedStake,
  };
}

function syncBinaryOptionsRiskPanel(container) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const projection = calculateBinaryOptionsRiskProjection();
  const fields = {
    bankroll: String(projection.safeState.bankroll),
    payoutPercent: String(projection.safeState.payoutPercent),
    stake: String(projection.safeState.stake),
  };

  for (const [field, value] of Object.entries(fields)) {
    const inputElements = container.querySelectorAll(`[data-binary-risk-input="${field}"]`);

    for (const inputElement of inputElements) {
      if (inputElement instanceof HTMLInputElement && inputElement.value !== value) {
        inputElement.value = value;
      }
    }
  }

  const outputMap = {
    balanceLoss: formatPrice(projection.projectedBalanceLoss, "usd"),
    balanceWin: formatPrice(projection.projectedBalanceWin, "usd"),
    payoutPercent: `${projection.safeState.payoutPercent.toFixed(2)}%`,
    projectedProfit: formatPrice(projection.projectedProfit, "usd"),
    stakePercent: `${projection.stakePercent.toFixed(2)}%`,
    suggestedStake: formatPrice(projection.suggestedStake, "usd"),
  };

  for (const [key, value] of Object.entries(outputMap)) {
    const outputElements = container.querySelectorAll(`[data-binary-risk-output="${key}"]`);

    for (const outputElement of outputElements) {
      if (outputElement instanceof HTMLElement) {
        outputElement.textContent = value;
      }
    }
  }
}

function updateBinaryOptionsRiskStateFromInput(inputElement) {
  if (!(inputElement instanceof HTMLInputElement)) {
    return;
  }

  const field = inputElement.dataset.binaryRiskInput;

  if (field !== "bankroll" && field !== "payoutPercent" && field !== "stake") {
    return;
  }

  binaryOptionsRiskState = sanitizeBinaryOptionsRiskState({
    ...binaryOptionsRiskState,
    [field]: inputElement.value,
  });

  saveBinaryOptionsRiskState();
  syncBinaryOptionsRiskPanel(analysisTabContentElement);
}

function renderAnalysisTabs() {
  if (!(analysisTabsElement instanceof HTMLElement)) {
    return;
  }

  analysisTabsElement.innerHTML = "";

  ensureActiveAnalysisTabForOperationalMode(chartLabState.operationalMode);

  for (const tab of resolveVisibleAnalysisTabs(chartLabState.operationalMode)) {
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

// =============================================================================
// ADR-074 — Dashboard Probabilistico Quantitativo
// Helpers honestos (sem fabricar win rate; graceful degradation; bootstrap MC).
// =============================================================================

// Pure ADR-074 helpers live in modules/chart-lab/quant/probabilistic.js.

function renderInstitutionalProbabilisticTab(analysis, snapshot, currency) {
  const points = Array.isArray(snapshot?.points) ? snapshot.points : [];
  const returns = computeProbabilisticReturnsSeries(points);
  const stats = computeProbabilisticHistoricalStats(returns);
  const risk = computeProbabilisticRiskMetrics(returns, snapshot);
  const monteCarlo = runProbabilisticMonteCarloProjection({
    lastClose: toFiniteNumber(snapshot?.live?.price ?? points[points.length - 1]?.close, Number.NaN),
    returns,
  });
  const seasonality = computeProbabilisticMonthlySeasonality(points);
  const skewness = computeProbabilisticSkewness(returns);
  const kurtosis = computeProbabilisticKurtosis(returns);
  const hourlySeasonality = computeProbabilisticHourlySeasonality(points);
  const weekdaySeasonality = computeProbabilisticWeekdaySeasonality(points);
  const candlePatterns = detectProbabilisticCandlePatterns(points);

  const ghostBackend = typeof getBinaryOptionsGhostBackendStats === "function"
    ? getBinaryOptionsGhostBackendStats()
    : { winRate: 0, resolvedTrades: 0, hasSnapshot: false };
  const overallReady = ghostBackend.hasSnapshot && ghostBackend.resolvedTrades >= 5;
  const overallWinRate = overallReady ? ghostBackend.winRate.toFixed(0) : "—";
  const overallSample = overallReady
    ? `${ghostBackend.resolvedTrades} trades auditados`
    : `Aquecendo (${ghostBackend.resolvedTrades}/5)`;

  const buyProbability = toFiniteNumber(analysis?.buyProbability, 50);
  const sellProbability = toFiniteNumber(analysis?.sellProbability, 50);
  const neutralProbability = toFiniteNumber(analysis?.neutralProbability, 0);
  const directionalEdge = roundNumber(buyProbability - sellProbability, 1);

  const scenarios = analysis?.scenarios ?? {};
  const buyScenario = scenarios.buy ?? null;
  const sellScenario = scenarios.sell ?? null;
  const equilibriumPrice = toFiniteNumber(analysis?.context?.equilibriumPrice, Number.NaN);

  const monteCarloSegments = (() => {
    if (!monteCarlo.ready) {
      return { bearPercent: 33.33, basePercent: 33.34, bullPercent: 33.33 };
    }
    const range = Math.max(monteCarlo.bullPrice - monteCarlo.bearPrice, 1e-9);
    const bearWidth = ((monteCarlo.basePrice - monteCarlo.bearPrice) / range) * 100;
    return {
      bearPercent: clampNumber(bearWidth, 5, 95),
      basePercent: 0,
      bullPercent: clampNumber(100 - bearWidth, 5, 95),
    };
  })();

  const statRetCls = stats.ready ? classifyProbabilisticTone(stats.cumulativeReturnPercent) : "neutral";
  const statSharpeCls = stats.ready ? classifyProbabilisticTone(stats.sharpeRatio) : "neutral";
  const statDrawdownCls = stats.ready ? "bear" : "neutral";

  const monteCarloHeader = monteCarlo.ready
    ? `Horizonte ${monteCarlo.horizon} periodos • ${monteCarlo.simulations.toLocaleString("pt-BR")} simulacoes`
    : `Aquecendo (${returns.length}/${PROBABILISTIC_MIN_RETURNS_FOR_STATS})`;

  return `
    <section class="prob-dashboard" aria-label="Dashboard Probabilistico Quantitativo">
      <header class="prob-direction-header" aria-label="Probabilidade Direcional Global">
        <h4>Probabilidade Direcional Global</h4>
        <div class="prob-direction-bar" role="img" aria-label="Equilibrio entre alta e baixa">
          <div class="prob-direction-bar__bull" style="width: ${clampNumber(buyProbability, 0, 100)}%" title="Probabilidade de alta: ${buyProbability.toFixed(1)}%">
            <span id="prob-direction-bull">▲ ${buyProbability.toFixed(0)}%</span>
          </div>
          <div class="prob-direction-bar__bear" style="width: ${clampNumber(sellProbability, 0, 100)}%" title="Probabilidade de baixa: ${sellProbability.toFixed(1)}%">
            <span id="prob-direction-bear">${sellProbability.toFixed(0)}% ▼</span>
          </div>
        </div>
        <p class="prob-direction-bar__edge">Edge direcional: <strong id="prob-direction-edge" data-tone="${directionalEdge > 0 ? "bull" : directionalEdge < 0 ? "bear" : "neutral"}">${directionalEdge >= 0 ? "+" : ""}${directionalEdge} p.p.</strong> • Neutro <strong>${neutralProbability.toFixed(0)}%</strong></p>
      </header>

      <header class="prob-kpi-row">
        <article class="prob-kpi-card" data-tone="neutral">
          <span class="prob-kpi-icon" aria-hidden="true">📊</span>
          <strong id="prob-winrate-overall">${overallWinRate}${overallReady ? "%" : ""}</strong>
          <span class="prob-kpi-label">Win Rate Auditado</span>
          <small class="prob-kpi-foot">${escapeHtml(overallSample)}</small>
        </article>
        <article class="prob-kpi-card" data-tone="${buyProbability >= sellProbability ? "bull" : "neutral"}">
          <span class="prob-kpi-icon" aria-hidden="true">↗</span>
          <strong id="prob-winrate-long">${buyProbability.toFixed(0)}%</strong>
          <span class="prob-kpi-label">Prob. Direcional Long</span>
          <small class="prob-kpi-foot">Edge ${directionalEdge >= 0 ? "+" : ""}${directionalEdge} p.p.</small>
        </article>
        <article class="prob-kpi-card" data-tone="${sellProbability > buyProbability ? "bear" : "neutral"}">
          <span class="prob-kpi-icon" aria-hidden="true">↘</span>
          <strong id="prob-winrate-short">${sellProbability.toFixed(0)}%</strong>
          <span class="prob-kpi-label">Prob. Direcional Short</span>
          <small class="prob-kpi-foot">Neutro ${neutralProbability.toFixed(0)}%</small>
        </article>
      </header>

      <article class="prob-card">
        <header class="prob-card__head">
          <h4>Estatisticas Historicas</h4>
          <span class="prob-card__hint">${stats.ready ? `${stats.sample} periodos` : `Aquecendo (${returns.length}/${PROBABILISTIC_MIN_RETURNS_FOR_STATS})`}</span>
        </header>
        <div class="prob-stats-grid">
          <div class="prob-stats-cell" data-tone="${statRetCls}" title="Retorno cumulativo (log) sobre a janela disponivel">
            <strong id="prob-stats-return">${stats.ready ? formatProbabilisticPercent(stats.cumulativeReturnPercent, { signed: true }) : "—"}</strong>
            <span>Retorno</span>
          </div>
          <div class="prob-stats-cell" data-tone="neutral" title="Volatilidade anualizada (desvio padrao * sqrt(252))">
            <strong id="prob-stats-vol">${stats.ready ? formatProbabilisticPercent(stats.annualizedVolatilityPercent) : "—"}</strong>
            <span>Volatilidade</span>
          </div>
          <div class="prob-stats-cell" data-tone="${statSharpeCls}" title="Sharpe Ratio anualizado (rf=0)">
            <strong id="prob-stats-sharpe">${stats.ready ? stats.sharpeRatio.toFixed(2) : "—"}</strong>
            <span>Sharpe Ratio</span>
          </div>
          <div class="prob-stats-cell" data-tone="${statDrawdownCls}" title="Maior queda peak-to-trough na janela">
            <strong id="prob-stats-drawdown">${stats.ready ? formatProbabilisticPercent(stats.maxDrawdownPercent) : "—"}</strong>
            <span>Max Drawdown</span>
          </div>
        </div>
      </article>

      <article class="prob-card">
        <header class="prob-card__head">
          <h4>Simulacao Monte Carlo</h4>
          <span class="prob-card__hint">${escapeHtml(monteCarloHeader)}</span>
        </header>
        <div class="prob-mc-bar" role="img" aria-label="Distribuicao Monte Carlo P5/P50/P95">
          <div class="prob-mc-bar__track">
            <div class="prob-mc-bar__segment prob-mc-bar__segment--bear" style="width: ${monteCarloSegments.bearPercent}%"></div>
            <div class="prob-mc-bar__segment prob-mc-bar__segment--bull" style="width: ${monteCarloSegments.bullPercent}%"></div>
            <div class="prob-mc-bar__marker prob-mc-bar__marker--bear" style="left: 0%">
              <span id="prob-mc-bear">${monteCarlo.ready ? formatPrice(monteCarlo.bearPrice, currency) : "—"}</span>
            </div>
            <div class="prob-mc-bar__marker prob-mc-bar__marker--base" style="left: ${monteCarloSegments.bearPercent}%">
              <span id="prob-mc-base">${monteCarlo.ready ? formatPrice(monteCarlo.basePrice, currency) : "—"}</span>
            </div>
            <div class="prob-mc-bar__marker prob-mc-bar__marker--bull" style="left: 100%">
              <span id="prob-mc-bull">${monteCarlo.ready ? formatPrice(monteCarlo.bullPrice, currency) : "—"}</span>
            </div>
          </div>
          <p class="prob-mc-bar__legend">Nivel de confianca: <strong>${(monteCarlo.confidenceLevel * 100).toFixed(0)}%</strong></p>
        </div>
      </article>

      <article class="prob-card">
        <header class="prob-card__head">
          <h4>Cenarios Probabilisticos</h4>
          <span class="prob-card__hint">Derivado da estrutura tecnica</span>
        </header>
        <div class="prob-scenario-rows">
          <div class="prob-scenario-row" data-tone="bull">
            <header><span>Alta (Bullish)</span><strong id="prob-scenario-bull-prob">${buyProbability.toFixed(0)}%</strong></header>
            <div class="prob-scenario-track"><div class="prob-scenario-fill prob-scenario-fill--bull" style="width: ${clampNumber(buyProbability, 0, 100)}%"><span id="prob-scenario-bull-target">Alvo: ${buyScenario ? escapeHtml(formatPrice(buyScenario.targets?.[0], currency)) : "—"}</span></div></div>
            <small>Cenario otimista baseado em volatilidade e tendencia recente.</small>
          </div>
          <div class="prob-scenario-row" data-tone="neutral">
            <header><span>Neutro (Base)</span><strong id="prob-scenario-base-prob">${neutralProbability.toFixed(0)}%</strong></header>
            <div class="prob-scenario-track"><div class="prob-scenario-fill prob-scenario-fill--neutral" style="width: ${clampNumber(neutralProbability, 0, 100)}%"><span id="prob-scenario-base-target">Alvo: ${Number.isFinite(equilibriumPrice) ? escapeHtml(formatPrice(equilibriumPrice, currency)) : "—"}</span></div></div>
            <small>Cenario base: mediana da distribuicao.</small>
          </div>
          <div class="prob-scenario-row" data-tone="bear">
            <header><span>Baixa (Bearish)</span><strong id="prob-scenario-bear-prob">${sellProbability.toFixed(0)}%</strong></header>
            <div class="prob-scenario-track"><div class="prob-scenario-fill prob-scenario-fill--bear" style="width: ${clampNumber(sellProbability, 0, 100)}%"><span id="prob-scenario-bear-target">Alvo: ${sellScenario ? escapeHtml(formatPrice(sellScenario.targets?.[0], currency)) : "—"}</span></div></div>
            <small>Cenario pessimista baseado em drawdown e pressao vendedora.</small>
          </div>
        </div>
      </article>

      <article class="prob-card">
        <header class="prob-card__head">
          <h4>Sazonalidade</h4>
          <span class="prob-card__hint">${stats.sample > 0 ? "Mediana Open->Close por mes (janela disponivel)" : "Sem dados de candles"}</span>
        </header>
        <div class="prob-season-grid">
          ${seasonality.months.map((month) => {
            const tone = !month.ready
              ? "empty"
              : month.medianReturnPercent > 0
                ? "bull"
                : month.medianReturnPercent < 0
                  ? "bear"
                  : "neutral";
            const isCurrent = month.index === seasonality.currentMonthIndex;
            return `
              <div class="prob-season-cell${isCurrent ? " prob-season-cell--current" : ""}" data-tone="${tone}" title="${month.ready ? `${month.sample} candles em ${month.label}` : `Sem amostras em ${month.label}`}">
                <strong>${month.label}</strong>
                <span class="prob-season-cell__value" id="prob-season-${month.index}-return">${month.ready ? formatProbabilisticPercent(month.medianReturnPercent, { signed: true }) : "—"}</span>
                <small id="prob-season-${month.index}-winrate">${month.ready ? `${month.winRatePercent}% win` : "—"}</small>
              </div>
            `;
          }).join("")}
        </div>
      </article>

      <article class="prob-card">
        <header class="prob-card__head">
          <h4>Metricas de Risco</h4>
          <span class="prob-card__hint">${risk.ready ? "Distribuicao empirica (sem premissa gaussiana)" : "Aquecendo"}</span>
        </header>
        <div class="prob-risk-grid">
          <div class="prob-risk-cell" data-tone="bear" title="Value-at-Risk 95% (perda diaria esperada nao excedida em 95% dos dias)">
            <strong id="prob-var-95">${risk.ready ? formatProbabilisticPercent(risk.varPercent) : "—"}</strong>
            <span>VaR 95%</span>
          </div>
          <div class="prob-risk-cell" data-tone="bear" title="Expected Shortfall: media das perdas alem do VaR 95%">
            <strong id="prob-expected-shortfall">${risk.ready ? formatProbabilisticPercent(risk.expectedShortfallPercent) : "—"}</strong>
            <span>Expected Shortfall</span>
          </div>
          <div class="prob-risk-cell" data-tone="neutral" title="Beta vs benchmark (indisponivel sem serie de referencia)">
            <strong id="prob-beta">${escapeHtml(risk.betaLabel)}</strong>
            <span>Beta</span>
          </div>
          <div class="prob-risk-cell" data-tone="neutral" title="Correlacao vs benchmark (indisponivel sem serie de referencia)">
            <strong id="prob-correlation">${escapeHtml(risk.correlationLabel)}</strong>
            <span>Correlacao</span>
          </div>
        </div>
      </article>

      <article class="prob-card">
        <header class="prob-card__head">
          <h4>Sazonalidade Recente (Ultimos 30 Dias)</h4>
          <span class="prob-card__hint">Win rate por horario UTC e dia da semana</span>
        </header>
        <div class="prob-season-sub">
          <h5>Horario Atual (UTC ${String(hourlySeasonality.currentHour).padStart(2, "0")}:00)</h5>
          <div class="prob-season-hourly" id="prob-season-hourly">
            ${hourlySeasonality.hours.map((bucket) => {
              const tone = !bucket.ready ? "empty" : bucket.winRatePercent >= 55 ? "bull" : bucket.winRatePercent <= 45 ? "bear" : "neutral";
              const isCurrent = bucket.hour === hourlySeasonality.currentHour;
              return `<div class="prob-season-hourly__cell${isCurrent ? " prob-season-hourly__cell--current" : ""}" data-tone="${tone}" title="${bucket.ready ? `${bucket.sample} candles em ${String(bucket.hour).padStart(2, "0")}h • avg ${bucket.avgChangePercent}%` : `Sem amostras em ${String(bucket.hour).padStart(2, "0")}h`}"><strong>${String(bucket.hour).padStart(2, "0")}</strong><span>${bucket.ready ? `${bucket.winRatePercent}%` : "—"}</span></div>`;
            }).join("")}
          </div>
        </div>
        <div class="prob-season-sub">
          <h5>Dia da Semana (Hoje: ${PROBABILISTIC_WEEKDAY_LABELS[weekdaySeasonality.currentWeekday]})</h5>
          <div class="prob-season-weekday" id="prob-season-weekday">
            ${weekdaySeasonality.days.map((day) => {
              const tone = !day.ready ? "empty" : day.winRatePercent >= 55 ? "bull" : day.winRatePercent <= 45 ? "bear" : "neutral";
              const isCurrent = day.index === weekdaySeasonality.currentWeekday;
              return `<div class="prob-season-weekday__cell${isCurrent ? " prob-season-weekday__cell--current" : ""}" data-tone="${tone}" title="${day.ready ? `${day.sample} candles em ${day.label} • avg ${day.avgChangePercent}%` : `Sem amostras em ${day.label}`}"><strong>${day.label}</strong><span>${day.ready ? `${day.winRatePercent}%` : "—"}</span></div>`;
            }).join("")}
          </div>
        </div>
      </article>

      <article class="prob-card">
        <header class="prob-card__head">
          <h4>Padroes de Candlestick (Ultimos ${points.length} Candles)</h4>
          <span class="prob-card__hint">Taxa de acerto historica do proximo candle (>=5 ocorrencias para ativar)</span>
        </header>
        <div class="prob-candle-grid" id="prob-candle-patterns">
          ${candlePatterns.map((pattern) => {
            const tone = !pattern.ready ? "empty" : pattern.winRatePercent >= 55 ? "bull" : pattern.winRatePercent <= 45 ? "bear" : "neutral";
            const biasLabel = pattern.bias === "bull" ? "Vies de alta" : pattern.bias === "bear" ? "Vies de baixa" : "Indecisao";
            return `<div class="prob-candle-cell" data-tone="${tone}" title="${pattern.label}: ${pattern.occurrences} ocorrencias na janela">
              <header><strong>${escapeHtml(pattern.label)}</strong><span>${pattern.occurrences}x</span></header>
              <div class="prob-candle-cell__rate" id="prob-candle-${pattern.id}-rate">${pattern.ready ? `${pattern.winRatePercent}%` : "—"}</div>
              <small>${escapeHtml(biasLabel)}${pattern.ready ? "" : " • Aquecendo"}</small>
            </div>`;
          }).join("")}
        </div>
      </article>

      <article class="prob-card">
        <header class="prob-card__head">
          <h4>Distribuicao de Retornos</h4>
          <span class="prob-card__hint">${stats.ready ? "Forma da distribuicao (assimetria + caudas)" : "Aquecendo"}</span>
        </header>
        <div class="prob-distribution-grid">
          <div class="prob-distribution-cell" data-tone="${stats.ready ? "neutral" : "empty"}" title="Volatilidade anualizada (referencia)">
            <strong id="prob-dist-vol">${stats.ready ? formatProbabilisticPercent(stats.annualizedVolatilityPercent) : "—"}</strong>
            <span>Volatilidade</span>
            <small>Dispersao anualizada</small>
          </div>
          <div class="prob-distribution-cell" data-tone="${skewness.ready ? (skewness.value > 0.1 ? "bull" : skewness.value < -0.1 ? "bear" : "neutral") : "empty"}" title="Skewness (assimetria): >0 cauda direita, <0 cauda esquerda">
            <strong id="prob-dist-skewness">${skewness.ready ? skewness.value.toFixed(2) : "—"}</strong>
            <span>Skewness (Assimetria)</span>
            <small id="prob-dist-skewness-bias">${escapeHtml(skewness.bias)}</small>
          </div>
          <div class="prob-distribution-cell" data-tone="${kurtosis.ready ? (kurtosis.isFatTail ? "bear" : "neutral") : "empty"}" title="Curtose excess (>0 caudas gordas = risco de outliers)">
            <strong id="prob-dist-kurtosis">${kurtosis.ready ? (kurtosis.value >= 0 ? "+" : "") + kurtosis.value.toFixed(2) : "—"}</strong>
            <span>Curtose (Caudas)</span>
            <small id="prob-dist-kurtosis-alert">${escapeHtml(kurtosis.alert)}</small>
          </div>
        </div>
      </article>
    </section>
  `;
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

function buildSmcPriceActionConfluence(analysis, snapshot) {
  const confluence = deriveSmcConfluence({
    analysis,
    snapshot,
  });
  const pinbarDetected = confluence.checks.rejectionAligned;
  const engulfingDetected = confluence.checks.trendAligned && confluence.checks.fvgAligned;
  const orderBlockTouch = confluence.checks.fvgAligned;
  const pdhPdlSweep = confluence.checks.sweepConfirmed;
  const rejectionActive = pinbarDetected || engulfingDetected;
  const liquidityActive = orderBlockTouch || pdhPdlSweep;

  return {
    rejection: [
      {
        label: "Pinbar (Martelo / Estrela Cadente)",
        ok: pinbarDetected,
        hint: pinbarDetected
          ? `Pavio dominante ${confluence.rejection.direction} (${Math.round(confluence.rejection.wickRatio * 100)}% do candle)`
          : "Sem rejeicao clara por pavio real",
      },
      {
        label: "Engolfo institucional",
        ok: engulfingDetected,
        hint: engulfingDetected ? "Impulso alinhado a FVG mitigado" : "Sem absorcao numerica alinhada ao FVG",
      },
    ],
    liquidity: [
      {
        label: "Toque em Order Block",
        ok: orderBlockTouch,
        hint: orderBlockTouch ? "Preco mitigou zona FVG institucional" : "Sem mitigacao objetiva de desequilibrio",
      },
      {
        label: "Varredura de PDH/PDL",
        ok: pdhPdlSweep,
        hint: pdhPdlSweep
          ? `Extremo ${confluence.sweep.direction} varrido e rejeitado`
          : "Liquidez recente intacta pelos candles",
      },
    ],
    rejectionActive,
    liquidityActive,
    confluenceActive: rejectionActive && liquidityActive,
  };
}

function renderSmcChecklistColumn(title, items) {
  const rows = items.map((item) => `
    <li class="institutional-check" data-ok="${item.ok ? "true" : "false"}">
      <span class="institutional-check__icon" aria-hidden="true">${item.ok ? "✓" : "✕"}</span>
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <small>${escapeHtml(item.hint)}</small>
      </div>
    </li>
  `).join("");
  return `<article class="analysis-block">
    <h4>${escapeHtml(title)}</h4>
    <ul class="institutional-checklist" role="list">${rows}</ul>
  </article>`;
}

function renderSmcConfluenceChecklist(confluence) {
  const badgeTone = confluence.confluenceActive ? "ok" : "pending";
  const badgeLabel = confluence.confluenceActive
    ? "✓ Confluencia ATIVA — rejeicao em zona de liquidez"
    : confluence.rejectionActive
      ? "Aguardando contexto de liquidez"
      : confluence.liquidityActive
        ? "Liquidez presente — aguardando padrao de rejeicao"
        : "Sem confluencia: aguarde o setup";
  return `
    <div class="analysis-block analysis-block--confluence" data-tone="${badgeTone}">
      <strong>${escapeHtml(badgeLabel)}</strong>
      <small>Padrao de vela so e valido com a condicao de liquidez correspondente ativa.</small>
    </div>
    <div class="analysis-grid">
      ${renderSmcChecklistColumn("Padroes de rejeicao", confluence.rejection)}
      ${renderSmcChecklistColumn("Contexto de liquidez", confluence.liquidity)}
    </div>
  `;
}

// =============================================================
// Detalhamento SMC institucional (aba "SMC") — ADR-071
// Renderiza Estrutura (BOS/CHoCH + Discount/Equilibrium/Premium),
// Order Blocks candidatos (lastSwing*), Fair Value Gap ativo e
// Monitor de Liquidez (BSL/SSL com flag de Sweep). Top-Down 3x1
// (quando institutional disponível) e Killzone preservados como
// drill-down secundário. Dados 100% derivados de
// snapshot.insights.marketStructure — sem fabricação.
// =============================================================

function smcSignalToTone(signal) {
  if (signal === "bullish") return "bull";
  if (signal === "bearish") return "bear";
  return "neutral";
}

function smcSignalLabel(signal) {
  if (signal === "bullish") return "BULL";
  if (signal === "bearish") return "BEAR";
  return "—";
}

function smcZoneLabel(zone) {
  if (zone === "discount") return "DISCOUNT";
  if (zone === "premium") return "PREMIUM";
  return "EQUILIBRIUM";
}

function smcZoneTone(zone) {
  if (zone === "discount") return "bull";
  if (zone === "premium") return "bear";
  return "neutral";
}

function buildSmcInstitutionalView(analysis, snapshot, currency) {
  const insights = snapshot?.insights ?? {};
  const ms = insights.marketStructure ?? {};
  const liquidityHeatmap = buildLiquidityHeatmapSnapshot({ snapshot });
  const currentPrice = Number(insights.currentPrice ?? 0);
  const swingHigh = Number(ms.lastSwingHigh ?? 0);
  const swingLow = Number(ms.lastSwingLow ?? 0);
  const range = swingHigh - swingLow;

  // Posição relativa do preço no range (0 = fundo, 1 = topo)
  let pricePosition = 0.5;
  if (range > 0 && currentPrice > 0) {
    pricePosition = clampNumber((currentPrice - swingLow) / range, 0, 1);
  }

  const bias = String(ms.bias ?? "neutral");
  const zone = String(ms.institutionalZone ?? "equilibrium");
  const bos = String(ms.bosSignal ?? "none");
  const choch = String(ms.chochSignal ?? "none");
  const sweep = String(ms.liquiditySweepSignal ?? "none");
  const fvgActive = Boolean(ms.fairValueGapActive);
  const fvgBias = String(ms.fairValueGapBias ?? "none");
  const fvgLow = Number(ms.fairValueGapLower ?? 0);
  const fvgHigh = Number(ms.fairValueGapUpper ?? 0);
  const bsl = ms.liquiditySweepReferenceHigh; // buy-side liquidity (acima)
  const ssl = ms.liquiditySweepReferenceLow;  // sell-side liquidity (abaixo)

  // Order Blocks candidatos — derivados dos swings, sem fabricar
  const obCandidates = [];
  if (swingHigh > 0) {
    const mitigated = currentPrice >= swingHigh;
    obCandidates.push({
      kind: "Bearish OB",
      tone: "bear",
      level: swingHigh,
      label: mitigated ? "Mitigado" : (bias === "bearish" ? "Ativo" : "Pendente"),
      mitigated,
    });
  }
  if (swingLow > 0) {
    const mitigated = currentPrice <= swingLow;
    obCandidates.push({
      kind: "Bullish OB",
      tone: "bull",
      level: swingLow,
      label: mitigated ? "Mitigado" : (bias === "bullish" ? "Ativo" : "Pendente"),
      mitigated,
    });
  }
  if (Number.isFinite(Number(ms.previousSwingHigh)) && Number(ms.previousSwingHigh) > 0) {
    obCandidates.push({
      kind: "Bearish OB (prévio)",
      tone: "bear",
      level: Number(ms.previousSwingHigh),
      label: "Histórico",
      mitigated: currentPrice >= Number(ms.previousSwingHigh),
    });
  }
  if (Number.isFinite(Number(ms.previousSwingLow)) && Number(ms.previousSwingLow) > 0) {
    obCandidates.push({
      kind: "Bullish OB (prévio)",
      tone: "bull",
      level: Number(ms.previousSwingLow),
      label: "Histórico",
      mitigated: currentPrice <= Number(ms.previousSwingLow),
    });
  }

  // Distância % do preço ao FVG
  let fvgDistancePercent = null;
  let fvgDirection = "—";
  if (fvgActive && fvgLow > 0 && fvgHigh > 0 && currentPrice > 0) {
    const fvgMid = (fvgLow + fvgHigh) / 2;
    fvgDistancePercent = ((fvgMid - currentPrice) / currentPrice) * 100;
    fvgDirection = fvgDistancePercent > 0 ? "↑" : fvgDistancePercent < 0 ? "↓" : "≈";
  }

  return {
    bias,
    zone,
    bos,
    choch,
    sweep,
    fvg: {
      active: fvgActive,
      bias: fvgBias,
      low: fvgLow,
      high: fvgHigh,
      distancePercent: fvgDistancePercent,
      direction: fvgDirection,
    },
    pricePosition,
    swingHigh,
    swingLow,
    currentPrice,
    obCandidates,
    bsl: Number.isFinite(Number(bsl)) ? Number(bsl) : null,
    ssl: Number.isFinite(Number(ssl)) ? Number(ssl) : null,
    swingRangePercent: Number(ms.swingRangePercent ?? 0),
    invalidationLevel: analysis?.timing?.invalidationLevel ?? null,
    liquidityHeatmap,
    smcText: {
      structure: analysis?.smc?.structure ?? "",
      liquidity: analysis?.smc?.liquidity ?? "",
      sweepRisk: analysis?.smc?.sweepRisk ?? "",
    },
  };
}

function renderSmcStructurePanel(view, currency) {
  const bosTone = smcSignalToTone(view.bos);
  const chochTone = smcSignalToTone(view.choch);
  const zoneTone = smcZoneTone(view.zone);
  const biasTone = view.bias === "bullish" ? "bull" : view.bias === "bearish" ? "bear" : "neutral";
  const markerLeft = (view.pricePosition * 100).toFixed(2);
  const invalidationFmt = view.invalidationLevel != null
    ? formatPrice(view.invalidationLevel, currency)
    : "—";

  return `
    <article class="analysis-block smc-panel" data-tone="${biasTone}" id="smc-structure-panel">
      <header class="smc-panel__head">
        <h4>Estrutura de Mercado</h4>
        <span class="smc-bias-badge" data-tone="${biasTone}" id="smc-bias">
          ${escapeHtml(view.bias.toUpperCase())}
        </span>
      </header>
      <div class="smc-structure-row">
        <div class="smc-structure-cell" title="Break of Structure: rompimento de máximo/mínimo prévio confirmando continuidade do bias">
          <span class="smc-structure-cell__label">BOS</span>
          <span class="smc-structure-tag" data-tone="${bosTone}" id="smc-bos">${escapeHtml(smcSignalLabel(view.bos))}</span>
        </div>
        <div class="smc-structure-cell" title="Change of Character: rompimento contrário ao bias vigente, sinal de possível reversão">
          <span class="smc-structure-cell__label">CHoCH</span>
          <span class="smc-structure-tag" data-tone="${chochTone}" id="smc-choch">${escapeHtml(smcSignalLabel(view.choch))}</span>
        </div>
        <div class="smc-structure-cell" title="Sweep: varredura de liquidez (stop-hunt) acima/abaixo de extremo prévio">
          <span class="smc-structure-cell__label">Sweep</span>
          <span class="smc-structure-tag" data-tone="${smcSignalToTone(view.sweep)}" id="smc-sweep">${escapeHtml(smcSignalLabel(view.sweep))}</span>
        </div>
      </div>
      <div class="smc-zone-meter" title="Discount (fundo) = compra institucional. Premium (topo) = venda institucional. Equilibrium = miolo do range.">
        <div class="smc-zone-meter__track">
          <div class="smc-zone-seg smc-zone-seg--discount">DISCOUNT</div>
          <div class="smc-zone-seg smc-zone-seg--equilibrium">EQUILIBRIUM</div>
          <div class="smc-zone-seg smc-zone-seg--premium">PREMIUM</div>
          <div class="smc-zone-marker" id="smc-zone-marker" style="left: ${markerLeft}%" aria-hidden="true"></div>
        </div>
        <div class="smc-zone-meter__legend">
          <span class="smc-mono">${escapeHtml(formatPrice(view.swingLow, currency))}</span>
          <span class="smc-zone-active" data-tone="${zoneTone}" id="smc-zone-label">${escapeHtml(smcZoneLabel(view.zone))}</span>
          <span class="smc-mono">${escapeHtml(formatPrice(view.swingHigh, currency))}</span>
        </div>
      </div>
      <p class="smc-invalidation" title="Fechamento de candle além deste nível invalida o setup vigente">
        Invalida em <strong class="smc-mono" id="smc-invalidation">${escapeHtml(invalidationFmt)}</strong>
        • Range estrutural <span class="smc-mono">${view.swingRangePercent.toFixed(2)}%</span>
      </p>
    </article>
  `;
}

function renderSmcOrderBlocksPanel(view, currency) {
  const items = view.obCandidates.length === 0
    ? `<li class="smc-empty">Sem swings estruturais detectados na janela atual</li>`
    : view.obCandidates.map((ob, idx) => `
        <li class="smc-ob-row" data-tone="${ob.tone}" data-mitigated="${ob.mitigated ? "true" : "false"}" id="smc-ob-${idx}">
          <span class="smc-ob-row__kind">${escapeHtml(ob.kind)}</span>
          <span class="smc-mono smc-ob-row__price">${escapeHtml(formatPrice(ob.level, currency))}</span>
          <span class="smc-ob-row__tag" data-tone="${ob.tone}">${escapeHtml(ob.label)}</span>
        </li>
      `).join("");

  return `
    <article class="analysis-block smc-panel" id="smc-order-blocks-panel">
      <header class="smc-panel__head">
        <h4>Order Blocks (candidatos)</h4>
        <span class="smc-panel__hint" title="Derivado de últimos swing high/low — fonte: backend marketStructure">Auditado</span>
      </header>
      <ul class="smc-list" role="list">${items}</ul>
    </article>
  `;
}

function renderSmcFvgPanel(view, currency) {
  const fvg = view.fvg;
  if (!fvg.active) {
    return `
      <article class="analysis-block smc-panel" id="smc-fvg-panel">
        <header class="smc-panel__head">
          <h4>Fair Value Gap (FVG)</h4>
          <span class="smc-panel__hint">Nenhum desequilíbrio aberto</span>
        </header>
        <p class="smc-empty">Sem FVG ativo na janela atual. Aguarde candle de impulso para abrir gap institucional.</p>
      </article>
    `;
  }
  const tone = smcSignalToTone(fvg.bias);
  const distLabel = fvg.distancePercent != null
    ? `${fvg.direction} ${Math.abs(fvg.distancePercent).toFixed(2)}%`
    : "—";
  return `
    <article class="analysis-block smc-panel" data-tone="${tone}" id="smc-fvg-panel">
      <header class="smc-panel__head">
        <h4>Fair Value Gap (FVG)</h4>
        <span class="smc-fvg-badge" data-tone="${tone}">${escapeHtml(fvg.bias.toUpperCase())}</span>
      </header>
      <div class="smc-fvg-grid">
        <div class="smc-fvg-cell" title="Limite inferior do desequilíbrio">
          <span class="smc-fvg-cell__label">Inferior</span>
          <strong class="smc-mono" id="smc-fvg-low">${escapeHtml(formatPrice(fvg.low, currency))}</strong>
        </div>
        <div class="smc-fvg-cell" title="Limite superior do desequilíbrio">
          <span class="smc-fvg-cell__label">Superior</span>
          <strong class="smc-mono" id="smc-fvg-high">${escapeHtml(formatPrice(fvg.high, currency))}</strong>
        </div>
        <div class="smc-fvg-cell" title="Distância percentual do preço atual até o ponto médio do FVG">
          <span class="smc-fvg-cell__label">Distância</span>
          <strong class="smc-mono" id="smc-fvg-distance">${escapeHtml(distLabel)}</strong>
        </div>
      </div>
    </article>
  `;
}

function renderSmcLiquidityPanel(view, currency) {
  const sweepActive = view.sweep !== "none";
  const sweepTone = smcSignalToTone(view.sweep);
  const bslLabel = view.bsl != null ? formatPrice(view.bsl, currency) : "—";
  const sslLabel = view.ssl != null ? formatPrice(view.ssl, currency) : "—";

  return `
    <article class="analysis-block smc-panel" id="smc-liquidity-panel">
      <header class="smc-panel__head">
        <h4>Monitor de Liquidez</h4>
        ${sweepActive ? `<span class="smc-sweep-badge" data-tone="${sweepTone}" title="Varredura institucional detectada">⚠ SWEEP ${escapeHtml(view.sweep.toUpperCase())}</span>` : `<span class="smc-panel__hint">Liquidez intacta</span>`}
      </header>
      <ul class="smc-list" role="list">
        <li class="smc-liq-row" data-tone="bear" id="smc-bsl">
          <span class="smc-liq-row__kind" title="Buy-side Liquidity: stops de vendedores acima — alvo institucional de alta">BSL (acima)</span>
          <span class="smc-mono">${escapeHtml(bslLabel)}</span>
          <span class="smc-liq-row__tag" data-tone="${view.sweep === "bullish" ? "warn" : "neutral"}">${view.sweep === "bullish" ? "VARRIDA" : "Pendente"}</span>
        </li>
        <li class="smc-liq-row" data-tone="bull" id="smc-ssl">
          <span class="smc-liq-row__kind" title="Sell-side Liquidity: stops de compradores abaixo — alvo institucional de baixa">SSL (abaixo)</span>
          <span class="smc-mono">${escapeHtml(sslLabel)}</span>
          <span class="smc-liq-row__tag" data-tone="${view.sweep === "bearish" ? "warn" : "neutral"}">${view.sweep === "bearish" ? "VARRIDA" : "Pendente"}</span>
        </li>
      </ul>
      <p class="smc-narrative">${escapeHtml(view.smcText.sweepRisk || "Sem leitura de risco de sweep no momento.")}</p>
    </article>
  `;
}

function renderSmcLiquidityHeatmapPanel(view, currency) {
  const heatmap = view?.liquidityHeatmap ?? { ready: false, zones: [], sampleSize: 0 };
  const zones = Array.isArray(heatmap.zones) ? heatmap.zones : [];
  const rows = zones.length === 0
    ? `<li class="smc-empty">Heatmap em aquecimento: aguardando OHLCV suficiente para clusterizar liquidez.</li>`
    : zones.map((zone, index) => {
        const tone = zone.tone === "bull" || zone.tone === "bear" ? zone.tone : "neutral";
        const priceLabel = Number.isFinite(zone.center) ? formatPrice(zone.center, currency) : "—";
        const distanceLabel = Number.isFinite(zone.distancePercent)
          ? `${zone.distancePercent > 0 ? "+" : ""}${zone.distancePercent.toFixed(2)}%`
          : "n/d";
        return `
          <li class="smc-liq-row" data-tone="${tone}" id="smc-liq-heatmap-${index}" title="touches=${Number(zone.touchCount ?? 0)}; volumeWeight=${Number(zone.volumeWeight ?? 0).toFixed(2)}; side=${escapeHtml(zone.side)}">
            <span class="smc-liq-row__kind">${escapeHtml(zone.label)} · ${escapeHtml(zone.density)}</span>
            <span class="smc-mono">${escapeHtml(priceLabel)}</span>
            <span class="smc-liq-row__tag" data-tone="neutral">${escapeHtml(distanceLabel)}</span>
          </li>
        `;
      }).join("");
  const nearestAbove = heatmap.nearestAbove?.center != null ? formatPrice(heatmap.nearestAbove.center, currency) : "—";
  const nearestBelow = heatmap.nearestBelow?.center != null ? formatPrice(heatmap.nearestBelow.center, currency) : "—";

  return `
    <article class="analysis-block smc-panel" id="smc-liquidity-heatmap-panel">
      <header class="smc-panel__head">
        <h4>Heatmap de Liquidez</h4>
        <span class="smc-panel__hint" title="Derivado de clusters de high/low/close ponderados por volume local">${heatmap.ready ? "Ativo" : "Aquecendo"}</span>
      </header>
      <ul class="smc-list" role="list">${rows}</ul>
      <p class="smc-narrative">BSL mais proxima: <span class="smc-mono">${escapeHtml(nearestAbove)}</span> · SSL mais proxima: <span class="smc-mono">${escapeHtml(nearestBelow)}</span> · Amostra ${Number(heatmap.sampleSize ?? 0)} candles.</p>
    </article>
  `;
}

function renderSmcTopDownDrillDown(snapshot, currency) {
  const institutional = snapshot?.institutional;
  if (!institutional || typeof institutional !== "object") return "";
  const topDown = institutional.topDown ?? {};
  const daily = topDown.daily ?? {};
  const h4 = topDown.h4 ?? {};
  const m5 = topDown.m5 ?? {};
  const vote = topDown.vote ?? {};
  const killzones = institutional.killzones ?? {};

  return `
    <details class="smc-drilldown">
      <summary>
        <span>Top‑Down 3×1 + Killzone</span>
        <span class="smc-drilldown__hint">expandir</span>
      </summary>
      <div class="analysis-grid">
        <article class="analysis-block">
          <h4>Top-Down 3×1 (D1 + H4 + M5)</h4>
          <p><strong>D1:</strong> Bias ${escapeHtml(String(daily.bias ?? "neutral"))} • PDH ${escapeHtml(formatPrice(daily.pdh, currency))} • PDL ${escapeHtml(formatPrice(daily.pdl, currency))}</p>
          <p><strong>H4:</strong> Bias ${escapeHtml(String(h4.bias ?? "neutral"))} • FVG ${escapeHtml(String(h4.fvgCount ?? 0))} • ERL ${escapeHtml(formatPrice(h4.erl, currency))} • IRL ${escapeHtml(formatPrice(h4.irl, currency))} • CRT ${escapeHtml(String(h4.crt ?? "inactive"))}</p>
          <p><strong>M5:</strong> Bias ${escapeHtml(String(m5.bias ?? "neutral"))} • MSS ${escapeHtml(String(m5.mss ?? "none"))} • BOS ${escapeHtml(String(m5.bos ?? "none"))}</p>
        </article>
        <article class="analysis-block">
          <h4>Confluência institucional</h4>
          <p>Votação: Bull ${escapeHtml(String(vote.bullish ?? 0))} • Bear ${escapeHtml(String(vote.bearish ?? 0))} • Neutral ${escapeHtml(String(vote.neutral ?? 0))}</p>
          <p>Status 3×1: ${escapeHtml(String(vote.confluence ?? "mixed"))}</p>
          <p>Killzone: ${escapeHtml(String(killzones.session ?? "off_session"))} • Fase: ${escapeHtml(String(killzones.phase ?? "transition"))} • UTC ${escapeHtml(String(killzones.utcHour ?? "--"))}</p>
          <p>${escapeHtml(String(killzones.narrative ?? "Sem narrativa institucional disponível"))}</p>
        </article>
      </div>
    </details>
  `;
}

// =============================================================
// ADR-073 — Central WEGD Institucional (Wyckoff · Elliott · Gann · Dow)
// Substitui o placeholder textual da aba "wegd" por terminal visual com
// sub-tabs, painel de convergência clássica e marcação honesta entre
// dados live (analysis/snapshot) e métricas derivadas/heurísticas.
// Princípios: graceful degradation, sem fabricação de sinal, ARIA tab pattern.
// =============================================================

function pickWegdSubTabId(candidate) {
  return WEGD_SUBTAB_IDS.includes(candidate) ? candidate : "wyckoff";
}

function clampPercent01(value) {
  return clampNumber(toFiniteNumber(value, 0), 0, 100);
}

function deriveZigzagPivots(points, minMovePercent = 0.35) {
  if (!Array.isArray(points) || points.length < 5) return [];
  const series = points
    .map((p) => ({
      price: Number(p?.close ?? p?.price ?? p?.value),
      ts: Number(p?.timestamp ?? p?.time ?? p?.t ?? 0),
    }))
    .filter((p) => Number.isFinite(p.price));
  if (series.length < 5) return [];
  const threshold = minMovePercent / 100;
  const pivots = [{ ...series[0], dir: 0 }];
  let lastPivot = series[0];
  let dir = 0;
  for (let i = 1; i < series.length; i += 1) {
    const cur = series[i];
    const move = (cur.price - lastPivot.price) / Math.max(Math.abs(lastPivot.price), 1e-9);
    if (dir >= 0 && move >= threshold) {
      if (dir === 1 && cur.price > lastPivot.price) {
        pivots[pivots.length - 1] = { ...cur, dir: 1 };
        lastPivot = cur;
      } else {
        pivots.push({ ...cur, dir: 1 });
        lastPivot = cur;
        dir = 1;
      }
    } else if (dir <= 0 && move <= -threshold) {
      if (dir === -1 && cur.price < lastPivot.price) {
        pivots[pivots.length - 1] = { ...cur, dir: -1 };
        lastPivot = cur;
      } else {
        pivots.push({ ...cur, dir: -1 });
        lastPivot = cur;
        dir = -1;
      }
    }
  }
  return pivots;
}

function deriveWyckoffPanel(insights, analysis, currentPrice, points) {
  const rsi = Number.isFinite(insights?.rsi14) ? insights.rsi14 : 50;
  const fast = Number.isFinite(insights?.emaFast) ? insights.emaFast : currentPrice;
  const slow = Number.isFinite(insights?.emaSlow) ? insights.emaSlow : currentPrice;
  const momentum = toFiniteNumber(insights?.momentumPercent, 0);
  const grad = toFiniteNumber(analysis?.wegd?.gradient, 0);
  const pressure = toFiniteNumber(analysis?.wegd?.pressure, 0);
  const energy = toFiniteNumber(analysis?.wegd?.energy, 0);

  let phase = "CONSOLIDAÇÃO";
  let phaseSub = "Sem fase clara — preço lateral em range estreito";
  let next = "MARKUP";
  let progress = 50;

  if (rsi < 38 && fast < slow) {
    phase = "ACUMULAÇÃO";
    phaseSub = "Mãos fortes absorvem oferta após queda extensa";
    next = "MARKUP";
    progress = clampPercent01((40 - rsi) * 4 + 20);
  } else if (rsi >= 38 && rsi < 65 && fast >= slow && momentum > -0.05) {
    phase = "MARKUP";
    phaseSub = "Movimento de alta após acumulação";
    next = "DISTRIBUIÇÃO";
    progress = clampPercent01(((rsi - 38) / 27) * 100);
  } else if (rsi >= 65 && fast >= slow) {
    phase = "DISTRIBUIÇÃO";
    phaseSub = "Mãos fortes vendem para o público em euforia";
    next = "MARKDOWN";
    progress = clampPercent01((rsi - 65) * 3 + 30);
  } else if (rsi < 50 && fast < slow && momentum < 0) {
    phase = "MARKDOWN";
    phaseSub = "Movimento de baixa após distribuição";
    next = "ACUMULAÇÃO";
    progress = clampPercent01((50 - rsi) * 3 + 20);
  }

  const compositeMan = grad > 0 && pressure > 5
    ? { state: "buy", label: "COMPRANDO", icon: "↗" }
    : grad < 0 && pressure < -5
      ? { state: "sell", label: "VENDENDO", icon: "↘" }
      : { state: "neutral", label: "OBSERVANDO", icon: "◌" };

  // Eventos: derivados de pivots reais; se ausentes, marcamos como pendentes (sem fabricação)
  const pivots = deriveZigzagPivots(points, 0.4);
  const pivotsTail = pivots.slice(-6);
  const events = [];
  if (pivotsTail.length >= 2) {
    const last = pivotsTail[pivotsTail.length - 1];
    const prev = pivotsTail[pivotsTail.length - 2];
    if (last.dir === -1) {
      events.push({ key: "PSY", label: "PSY (Preliminary Supply)", price: prev.price, ok: prev.dir === 1 });
      events.push({ key: "SC", label: "SC (Selling Climax)", price: last.price, ok: true });
    }
    if (pivotsTail.length >= 3) {
      const test = pivotsTail[pivotsTail.length - 3];
      if (test.dir === 1) events.push({ key: "ST", label: "ST (Secondary Test)", price: test.price, ok: true });
    }
  }
  const pending = ["Spring", "UTAD", "SOS"].filter((evt) => {
    if (evt === "SOS") return !(grad > 0.1 && energy >= 50);
    if (evt === "Spring") return !(phase === "ACUMULAÇÃO" && rsi < 35);
    if (evt === "UTAD") return !(phase === "DISTRIBUIÇÃO" && rsi > 70);
    return true;
  });
  const detected = [];
  if (grad > 0.1 && energy >= 50 && fast > slow) detected.push("SOS (Sign of Strength)");
  if (phase === "ACUMULAÇÃO" && rsi < 35 && currentPrice > slow) detected.push("Spring");
  if (phase === "DISTRIBUIÇÃO" && rsi > 70 && currentPrice < fast) detected.push("UTAD");

  const volatility = toFiniteNumber(insights?.volatilityPercent, 0);
  const atr = toFiniteNumber(insights?.atrPercent, 0);
  const volumeStrength = volatility / Math.max(atr, 0.01);
  const volumeLabel = volumeStrength >= 1.4 ? "ALTO" : volumeStrength >= 0.8 ? "MÉDIO" : "BAIXO";
  const volumeNarrative = volumeStrength >= 1.4
    ? "Volume acima da média indica interesse institucional ativo."
    : volumeStrength >= 0.8
      ? "Volume normal — mercado em ritmo de operação padrão."
      : "Volume baixo — confirmação de movimento enfraquecida.";

  const vote = phase === "ACUMULAÇÃO" || phase === "MARKUP"
    ? "buy"
    : phase === "DISTRIBUIÇÃO" || phase === "MARKDOWN"
      ? "sell"
      : "neutral";

  return {
    phase, phaseSub, next, progress, compositeMan, events, pending,
    detectedExtras: detected, volumeLabel, volumeStrength, volumeNarrative, vote,
    confidence: clampPercent01(progress),
    derived: true,
  };
}

function deriveElliottPanel(insights, analysis, currentPrice, points, currency) {
  const pivots = deriveZigzagPivots(points, 0.5);
  if (pivots.length < 3) {
    return {
      hasData: false,
      currentLabel: "—",
      currentType: "—",
      progress: 0,
      confidence: 0,
      counts: [],
      next: "Aguardando estrutura",
      invalidationLevel: toFiniteNumber(analysis?.timing?.invalidationLevel, currentPrice),
      fibTargets: [],
      vote: "neutral",
    };
  }
  // Mapeamento simples: alterna 1-2-3-4-5-A-B-C nos últimos 8 pivots
  const labels = ["1", "2", "3", "4", "5", "A", "B", "C"];
  const tail = pivots.slice(-8);
  const counts = tail.map((p, i) => ({ label: labels[i] ?? "?", price: p.price, dir: p.dir }));
  const lastIdx = counts.length - 1;
  const currentLabel = counts[lastIdx].label;
  const isImpulsive = ["1", "3", "5"].includes(currentLabel);
  const currentType = ["A", "B", "C"].includes(currentLabel) ? "CORRETIVA" : isImpulsive ? "IMPULSIVA" : "CORRETIVA";
  const nextMap = { 1: "Onda 2", 2: "Onda 3", 3: "Onda 4", 4: "Onda 5", 5: "Onda A", A: "Onda B", B: "Onda C", C: "Onda 1" };
  const next = nextMap[currentLabel] ?? "—";

  const lastPivot = tail[lastIdx];
  const prevPivot = tail[lastIdx - 1] ?? lastPivot;
  const range = Math.abs(lastPivot.price - prevPivot.price);
  const traveled = Math.abs(currentPrice - prevPivot.price);
  const progress = clampPercent01(range > 0 ? (traveled / range) * 100 : 0);

  // Confiança: proporcionalidade clássica (Onda 3 ≥ Onda 1)
  let confidence = 50;
  if (counts.length >= 5) {
    const w1 = Math.abs(counts[0].price - (counts[1]?.price ?? counts[0].price));
    const w3 = Math.abs(counts[2].price - (counts[3]?.price ?? counts[2].price));
    if (w3 >= w1) confidence += 20;
    if (w3 >= w1 * 1.618) confidence += 15;
  }
  confidence = clampPercent01(confidence);

  // Alvos Fibonacci (extensão sobre última perna impulsiva)
  const baseLow = Math.min(prevPivot.price, lastPivot.price);
  const baseHigh = Math.max(prevPivot.price, lastPivot.price);
  const baseRange = baseHigh - baseLow;
  const direction = lastPivot.price >= prevPivot.price ? 1 : -1;
  const fibTargets = baseRange > 0 ? [
    { ratio: 1.272, price: lastPivot.price + direction * baseRange * 0.272 },
    { ratio: 1.618, price: lastPivot.price + direction * baseRange * 0.618 },
    { ratio: 2.000, price: lastPivot.price + direction * baseRange * 1.000 },
  ] : [];

  const invalidationLevel = toFiniteNumber(analysis?.timing?.invalidationLevel, currentPrice);
  const vote = isImpulsive && direction > 0 ? "buy" : isImpulsive && direction < 0 ? "sell" : "neutral";

  return {
    hasData: true,
    currentLabel,
    currentType,
    progress,
    confidence,
    counts,
    next,
    invalidationLevel,
    fibTargets,
    vote,
    derived: true,
  };
}

function deriveGannPanel(insights, analysis, currentPrice, points) {
  const grad = toFiniteNumber(analysis?.wegd?.gradient, 0);
  const atr = Math.max(toFiniteNumber(insights?.atrPercent, 0.5), 0.05);
  const ratio = Math.abs(grad) / atr;
  let dominantAngle = "1×8";
  let dominantDeg = 7;
  if (ratio > 2.5) { dominantAngle = "4×1"; dominantDeg = 75; }
  else if (ratio > 1.5) { dominantAngle = "2×1"; dominantDeg = 63; }
  else if (ratio > 1.0) { dominantAngle = "1×1"; dominantDeg = 45; }
  else if (ratio > 0.5) { dominantAngle = "1×2"; dominantDeg = 27; }
  else if (ratio > 0.25) { dominantAngle = "1×4"; dominantDeg = 15; }

  const atrAbs = Math.max(currentPrice * (atr / 100), 1e-9);
  const supports = [
    { angle: "1×8", price: currentPrice - atrAbs * 1.8 },
    { angle: "1×4", price: currentPrice - atrAbs * 1.0 },
    { angle: "1×3", price: currentPrice - atrAbs * 0.6 },
  ];
  const resistances = [
    { angle: "1×8", price: currentPrice + atrAbs * 1.8 },
    { angle: "1×4", price: currentPrice + atrAbs * 1.0 },
    { angle: "1×3", price: currentPrice + atrAbs * 0.6 },
  ];

  // Quadrado do tempo: dias desde último pivot maior
  const pivots = deriveZigzagPivots(points, 0.6);
  let cycleDays = null;
  let nextReversalEstimate = null;
  if (pivots.length >= 2) {
    const last = pivots[pivots.length - 1];
    const prev = pivots[pivots.length - 2];
    const deltaMs = Math.abs(last.ts - prev.ts);
    if (deltaMs > 0) {
      cycleDays = Math.max(1, Math.round(deltaMs / 86400000));
      nextReversalEstimate = cycleDays * 7; // projeção heurística
    }
  }
  // Quadrado do preço (Square of 9 simplificado)
  const sqrt = Math.sqrt(currentPrice);
  const nextSquareUp = (Math.ceil(sqrt) ** 2);
  const nextSquareDown = (Math.floor(sqrt) ** 2);

  const sign = grad >= 0.05 ? 1 : grad <= -0.05 ? -1 : 0;
  const vote = sign > 0 && ratio >= 1 ? "buy" : sign < 0 && ratio >= 1 ? "sell" : "neutral";

  return {
    dominantAngle, dominantDeg, ratio, supports, resistances,
    cycleDays, nextReversalEstimate, nextSquareUp, nextSquareDown,
    vote, confidence: clampPercent01(ratio * 50),
    derived: true,
  };
}

function deriveDowPanel(insights, analysis, currentPrice) {
  const trend = String(insights?.trend ?? "neutral").toLowerCase();
  const fast = toFiniteNumber(insights?.emaFast, currentPrice);
  const slow = toFiniteNumber(insights?.emaSlow, currentPrice);
  const momentum = toFiniteNumber(insights?.momentumPercent, 0);
  const pressure = toFiniteNumber(analysis?.wegd?.pressure, 0);
  const grad = toFiniteNumber(analysis?.wegd?.gradient, 0);
  const energy = toFiniteNumber(analysis?.wegd?.energy, 0);

  const direction = (val) => val > 0.05 ? "ALTA" : val < -0.05 ? "BAIXA" : "LATERAL";
  const arrow = (label) => label === "ALTA" ? "↗" : label === "BAIXA" ? "↘" : "↔";

  const primary = trend === "bullish" ? "ALTA" : trend === "bearish" ? "BAIXA" : "LATERAL";
  const secondary = direction(fast - slow);
  const minor = direction(momentum);

  // Fase de mercado — CLAMPED 0-100% (FIX do bug 257% visto na imagem original)
  const energyClamped = clampPercent01(energy);
  let marketPhase = "PARTICIPAÇÃO PÚBLICA";
  let phaseHint = "Volume e estrutura confirmam a tendência";
  if (energyClamped < 33) {
    marketPhase = "ACUMULAÇÃO";
    phaseHint = "Acumulação institucional silenciosa em curso";
  } else if (energyClamped > 75) {
    marketPhase = "DISTRIBUIÇÃO";
    phaseHint = "Euforia/exaustão — risco crescente de reversão";
  }

  const priceVolumeOk = (primary === "ALTA" && grad > 0) || (primary === "BAIXA" && grad < 0);
  const indicesOk = (primary === "ALTA" && pressure > 0) || (primary === "BAIXA" && pressure < 0)
    || primary === "LATERAL";

  const vote = primary === "ALTA" ? "buy" : primary === "BAIXA" ? "sell" : "neutral";

  return {
    primary: { label: primary, arrow: arrow(primary) },
    secondary: { label: secondary, arrow: arrow(secondary) },
    minor: { label: minor, arrow: arrow(minor) },
    marketPhase, phaseHint, energyClamped, energyRaw: energy,
    confirmations: {
      priceVolume: priceVolumeOk,
      indices: indicesOk,
    },
    vote, confidence: clampPercent01(50 + Math.abs(grad) * 10 + (energyClamped - 50) * 0.4),
    derived: true,
  };
}

function buildClassicalConvergence(panels) {
  const votes = [
    { id: "wyckoff", label: "Wyckoff", vote: panels.wyckoff.vote, confidence: panels.wyckoff.confidence },
    { id: "elliott", label: "Elliott", vote: panels.elliott.vote, confidence: panels.elliott.confidence },
    { id: "gann", label: "Gann", vote: panels.gann.vote, confidence: panels.gann.confidence },
    { id: "dow", label: "Dow", vote: panels.dow.vote, confidence: panels.dow.confidence },
  ];
  const buys = votes.filter((v) => v.vote === "buy");
  const sells = votes.filter((v) => v.vote === "sell");
  const neutrals = votes.filter((v) => v.vote === "neutral");
  const buyForce = buys.reduce((s, v) => s + v.confidence, 0);
  const sellForce = sells.reduce((s, v) => s + v.confidence, 0);

  let verdict = "NEUTRO";
  let tone = "neutral";
  if (buys.length > sells.length && buyForce > sellForce) {
    verdict = buys.length >= 3 ? "FORTE ALTA" : "ALTA MODERADA";
    tone = "bull";
  } else if (sells.length > buys.length && sellForce > buyForce) {
    verdict = sells.length >= 3 ? "FORTE BAIXA" : "BAIXA MODERADA";
    tone = "bear";
  }

  const confluenceCount = Math.max(buys.length, sells.length);
  const score = `${confluenceCount}/4`;

  return { votes, buys: buys.length, sells: sells.length, neutrals: neutrals.length, verdict, tone, score };
}

function buildWegdInstitutionalView(analysis, snapshot) {
  const insights = snapshot?.insights && typeof snapshot.insights === "object" ? snapshot.insights : {};
  const points = Array.isArray(snapshot?.points) ? snapshot.points : [];
  const currentPrice = toFiniteNumber(snapshot?.currentPrice ?? insights?.lastPrice, 0)
    || toFiniteNumber(insights?.emaFast, 0) || 1;
  const wyckoff = deriveWyckoffPanel(insights, analysis, currentPrice, points);
  const elliott = deriveElliottPanel(insights, analysis, currentPrice, points);
  const gann = deriveGannPanel(insights, analysis, currentPrice, points);
  const dow = deriveDowPanel(insights, analysis, currentPrice);
  const convergence = buildClassicalConvergence({ wyckoff, elliott, gann, dow });
  return { wyckoff, elliott, gann, dow, convergence, currentPrice };
}

// ---------- Renderers de painel ----------

function renderWegdWyckoffPanel(view, currency) {
  const w = view.wyckoff;
  const eventsHtml = w.events.length > 0
    ? w.events.map((evt) => `
        <li class="wegd-event-item is-confirmed" title="${escapeHtml(evt.label)}">
          <span class="wegd-event-key">${escapeHtml(evt.key)}</span>
          <span class="wegd-event-name">${escapeHtml(evt.label)}</span>
          <span class="wegd-event-price font-mono">${escapeHtml(formatPrice(evt.price, currency))}</span>
        </li>`).join("")
    : `<li class="wegd-event-item is-empty">Sem pivots auditáveis nos últimos candles</li>`;
  const pendingHtml = w.pending.length > 0
    ? w.pending.map((p) => `<li class="wegd-event-item is-pending"><span class="wegd-event-name">${escapeHtml(p)}</span><span class="wegd-event-price">aguardando</span></li>`).join("")
    : `<li class="wegd-event-item is-empty">Todos eventos chave detectados</li>`;
  const detectedExtras = w.detectedExtras.length > 0
    ? `<p class="wegd-extra-detect">⚡ Detectado: ${w.detectedExtras.map(escapeHtml).join(" · ")}</p>`
    : "";
  return `
    <header class="wegd-panel-headline" data-tone="${w.vote === "buy" ? "bull" : w.vote === "sell" ? "bear" : "neutral"}">
      <div class="wegd-headline-title">
        <strong class="wegd-headline-phase font-mono">${escapeHtml(w.phase)}</strong>
        <span class="wegd-headline-sub">${escapeHtml(w.phaseSub)}</span>
      </div>
      <div class="wegd-headline-meta">
        <span class="wegd-headline-progress font-mono">${w.progress.toFixed(0)}%</span>
        <span class="wegd-headline-tag">Progresso</span>
      </div>
    </header>
    <div class="wegd-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${w.progress.toFixed(0)}">
      <div class="wegd-progress-fill is-${w.vote}" style="width:${w.progress.toFixed(1)}%"></div>
    </div>
    <div class="wegd-grid wegd-grid-2">
      <article class="wegd-card">
        <h5 class="wegd-card-title">Ciclo de Mercado</h5>
        <div class="wegd-cycle-row">
          <div class="wegd-cycle-cell"><span>Atual</span><strong class="font-mono">${escapeHtml(w.phase)}</strong></div>
          <span class="wegd-cycle-arrow">→</span>
          <div class="wegd-cycle-cell is-next"><span>Próximo</span><strong class="font-mono">${escapeHtml(w.next)}</strong></div>
        </div>
        <p class="wegd-card-foot">Confiança: <strong class="font-mono">${w.confidence.toFixed(0)}%</strong></p>
      </article>
      <article class="wegd-card">
        <h5 class="wegd-card-title">Composite Man</h5>
        <div class="wegd-composite is-${w.compositeMan.state}">
          <span class="wegd-composite-icon" aria-hidden="true">${w.compositeMan.icon}</span>
          <strong class="wegd-composite-label font-mono">${escapeHtml(w.compositeMan.label)}</strong>
        </div>
      </article>
    </div>
    <div class="wegd-grid wegd-grid-2">
      <article class="wegd-card">
        <h5 class="wegd-card-title">Eventos Wyckoff <span class="wegd-card-pill">✓ Confirmados</span></h5>
        <ul class="wegd-event-list">${eventsHtml}</ul>
      </article>
      <article class="wegd-card">
        <h5 class="wegd-card-title">Pendentes <span class="wegd-card-pill is-warn">Σ Aguardando</span></h5>
        <ul class="wegd-event-list">${pendingHtml}</ul>
        ${detectedExtras}
      </article>
    </div>
    <article class="wegd-card">
      <h5 class="wegd-card-title">Análise de Volume</h5>
      <div class="wegd-volume-row" data-tone="${w.volumeStrength >= 1.4 ? "bull" : w.volumeStrength >= 0.8 ? "neutral" : "bear"}">
        <strong class="font-mono">${escapeHtml(w.volumeLabel)}</strong>
        <span class="wegd-volume-narr">${escapeHtml(w.volumeNarrative)}</span>
        <span class="wegd-volume-meta font-mono">${(w.volumeStrength * 100).toFixed(0)}% da média</span>
      </div>
    </article>
    <p class="wegd-panel-summary">
      Fase <strong>${escapeHtml(w.phase)}</strong> com <strong class="font-mono">${w.progress.toFixed(1)}%</strong> de progresso.
      Composite Man ${escapeHtml(w.compositeMan.label)}. ${w.events.length} evento(s) detectado(s). Volume ${escapeHtml(w.volumeLabel)}.
    </p>
  `;
}

function renderWegdElliottPanel(view, currency) {
  const e = view.elliott;
  if (!e.hasData) {
    return `
      <article class="wegd-card wegd-empty-state">
        <h5 class="wegd-card-title">Contagem de Ondas</h5>
        <p>Estrutura insuficiente para contagem confiável. Aguardando ao menos 3 pivots auditáveis no histórico do gráfico.</p>
        <p class="wegd-card-foot">Nível de invalidação: <strong class="font-mono">${escapeHtml(formatPrice(e.invalidationLevel, currency))}</strong></p>
      </article>
    `;
  }
  const countsHtml = e.counts.map((c) => `
    <div class="wegd-wave-cell ${["1","3","5"].includes(c.label) ? "is-impulsive" : "is-corrective"}">
      <strong class="wegd-wave-label">${escapeHtml(c.label)}</strong>
      <span class="wegd-wave-price font-mono">${escapeHtml(formatPrice(c.price, currency))}</span>
    </div>
  `).join("");
  const fibHtml = e.fibTargets.length > 0
    ? e.fibTargets.map((f) => `
        <li class="wegd-fib-target">
          <span class="wegd-fib-ratio font-mono">${f.ratio.toFixed(3)}×</span>
          <strong class="wegd-fib-price font-mono">${escapeHtml(formatPrice(f.price, currency))}</strong>
        </li>`).join("")
    : `<li class="wegd-fib-target is-empty">Aguardando perna impulsiva mensurável</li>`;

  const typeBadgeTone = e.currentType === "IMPULSIVA" ? (e.vote === "buy" ? "bull" : "bear") : "neutral";

  return `
    <header class="wegd-panel-headline" data-tone="${e.vote === "buy" ? "bull" : e.vote === "sell" ? "bear" : "neutral"}">
      <div class="wegd-headline-title">
        <span class="wegd-headline-eyebrow">Onda Atual</span>
        <strong class="wegd-headline-phase font-mono">Onda ${escapeHtml(e.currentLabel)}</strong>
      </div>
      <div class="wegd-headline-meta">
        <span class="wegd-elliott-badge" data-tone="${typeBadgeTone}">${escapeHtml(e.currentType)}</span>
        <span class="wegd-headline-tag">Confiança: <strong class="font-mono">${e.confidence.toFixed(0)}%</strong></span>
      </div>
    </header>
    <div class="wegd-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${e.progress.toFixed(0)}">
      <div class="wegd-progress-fill is-${e.vote}" style="width:${e.progress.toFixed(1)}%"></div>
    </div>
    <p class="wegd-progress-caption">Progresso da onda: <strong class="font-mono">${e.progress.toFixed(0)}%</strong></p>
    <article class="wegd-card">
      <h5 class="wegd-card-title">Contagem de Ondas</h5>
      <div class="wegd-wave-row">${countsHtml}</div>
    </article>
    <div class="wegd-grid wegd-grid-2">
      <article class="wegd-card">
        <h5 class="wegd-card-title">Próxima Onda</h5>
        <div class="wegd-next-wave">
          <strong class="font-mono">${escapeHtml(e.next)}</strong>
          <span>Esperada</span>
        </div>
      </article>
      <article class="wegd-card">
        <h5 class="wegd-card-title">Alvos de Fibonacci</h5>
        <ul class="wegd-fib-list">${fibHtml}</ul>
      </article>
    </div>
    <article class="wegd-card wegd-invalidation">
      <h5 class="wegd-card-title is-bear">Nível de Invalidação</h5>
      <div class="wegd-invalidation-row">
        <span>Se rompido, a contagem é invalidada</span>
        <strong class="font-mono">${escapeHtml(formatPrice(e.invalidationLevel, currency))}</strong>
      </div>
    </article>
    <p class="wegd-panel-summary">
      Onda ${escapeHtml(e.currentLabel)} (${escapeHtml(e.currentType)}) em progresso (<strong class="font-mono">${e.progress.toFixed(0)}%</strong>).
      Próxima: ${escapeHtml(e.next)}. Invalidação em <strong class="font-mono">${escapeHtml(formatPrice(e.invalidationLevel, currency))}</strong>.
    </p>
  `;
}

function renderWegdGannPanel(view, currency) {
  const g = view.gann;
  const supportsHtml = g.supports.map((s) => `
    <li class="wegd-gann-row is-support">
      <span>${escapeHtml(s.angle)}</span>
      <strong class="font-mono">${escapeHtml(formatPrice(s.price, currency))}</strong>
    </li>`).join("");
  const resistancesHtml = g.resistances.map((r) => `
    <li class="wegd-gann-row is-resistance">
      <span>${escapeHtml(r.angle)}</span>
      <strong class="font-mono">${escapeHtml(formatPrice(r.price, currency))}</strong>
    </li>`).join("");
  return `
    <header class="wegd-panel-headline" data-tone="${g.vote === "buy" ? "bull" : g.vote === "sell" ? "bear" : "neutral"}">
      <div class="wegd-headline-title">
        <span class="wegd-headline-eyebrow">Ângulo Dominante</span>
        <strong class="wegd-headline-phase font-mono">${escapeHtml(g.dominantAngle)}</strong>
      </div>
      <div class="wegd-headline-meta">
        <span class="wegd-gann-deg font-mono">${g.dominantDeg}°</span>
        <span class="wegd-headline-tag">Força: <strong class="font-mono">${(g.ratio).toFixed(2)}× ATR</strong></span>
      </div>
    </header>
    <div class="wegd-grid wegd-grid-2">
      <article class="wegd-card">
        <h5 class="wegd-card-title is-bull">Ângulos de Suporte</h5>
        <ul class="wegd-gann-list">${supportsHtml}</ul>
      </article>
      <article class="wegd-card">
        <h5 class="wegd-card-title is-bear">Ângulos de Resistência</h5>
        <ul class="wegd-gann-list">${resistancesHtml}</ul>
      </article>
    </div>
    <div class="wegd-grid wegd-grid-3">
      <article class="wegd-card">
        <h5 class="wegd-card-title">Quadrado do Tempo</h5>
        <div class="wegd-cycle-cell"><span>Ciclo Atual</span><strong class="font-mono">${g.cycleDays !== null ? `${g.cycleDays} dia(s)` : "—"}</strong></div>
      </article>
      <article class="wegd-card">
        <h5 class="wegd-card-title">Próxima Reversão</h5>
        <div class="wegd-cycle-cell"><span>Estimativa</span><strong class="font-mono">${g.nextReversalEstimate !== null ? `~${g.nextReversalEstimate} períodos` : "—"}</strong></div>
      </article>
      <article class="wegd-card">
        <h5 class="wegd-card-title">Quadrado do Preço</h5>
        <div class="wegd-cycle-cell"><span>Square 9 ↑</span><strong class="font-mono">${escapeHtml(formatPrice(g.nextSquareUp, currency))}</strong></div>
        <div class="wegd-cycle-cell"><span>Square 9 ↓</span><strong class="font-mono">${escapeHtml(formatPrice(g.nextSquareDown, currency))}</strong></div>
      </article>
    </div>
    <p class="wegd-panel-summary">
      Preço no ângulo <strong class="font-mono">${escapeHtml(g.dominantAngle)}</strong>.
      Próximo ciclo Gann em <strong class="font-mono">${g.nextReversalEstimate !== null ? `~${g.nextReversalEstimate} períodos` : "—"}</strong>.
      Níveis Square of 9 próximos.
    </p>
  `;
}

function renderWegdDowPanel(view) {
  const d = view.dow;
  const trendCard = (label, item) => `
    <article class="wegd-card wegd-trend-card" data-tone="${item.label === "ALTA" ? "bull" : item.label === "BAIXA" ? "bear" : "neutral"}">
      <h5 class="wegd-card-title">${escapeHtml(label)}</h5>
      <div class="wegd-trend-value">
        <span class="wegd-trend-arrow" aria-hidden="true">${item.arrow}</span>
        <strong class="font-mono">${escapeHtml(item.label)}</strong>
      </div>
    </article>`;
  return `
    <article class="wegd-card">
      <h5 class="wegd-card-title">Tendências de Dow</h5>
      <div class="wegd-grid wegd-grid-3">
        ${trendCard("Primária", d.primary)}
        ${trendCard("Secundária", d.secondary)}
        ${trendCard("Menor", d.minor)}
      </div>
    </article>
    <article class="wegd-card">
      <h5 class="wegd-card-title">Fase de Mercado</h5>
      <div class="wegd-market-phase" data-tone="${d.marketPhase === "DISTRIBUIÇÃO" ? "bear" : d.marketPhase === "ACUMULAÇÃO" ? "neutral" : "bull"}">
        <div class="wegd-market-phase-head">
          <strong class="font-mono">${escapeHtml(d.marketPhase)}</strong>
          <span class="font-mono" title="Energia bruta WEGD: ${d.energyRaw.toFixed(1)}">${d.energyClamped.toFixed(0)}%</span>
        </div>
        <div class="wegd-progress-track">
          <div class="wegd-progress-fill is-${d.vote}" style="width:${d.energyClamped.toFixed(1)}%"></div>
        </div>
        <p class="wegd-card-foot">${escapeHtml(d.phaseHint)}</p>
      </div>
    </article>
    <article class="wegd-card">
      <h5 class="wegd-card-title">Confirmação de Dow</h5>
      <div class="wegd-grid wegd-grid-2">
        <div class="wegd-confirm-card ${d.confirmations.priceVolume ? "is-confirmed" : "is-pending"}">
          <span>Preço × Volume</span>
          <strong class="font-mono">${d.confirmations.priceVolume ? "✓ CONFIRMADO" : "✗ DIVERGENTE"}</strong>
        </div>
        <div class="wegd-confirm-card ${d.confirmations.indices ? "is-confirmed" : "is-pending"}">
          <span>Índices</span>
          <strong class="font-mono">${d.confirmations.indices ? "✓ CONFIRMADO" : "✗ DIVERGENTE"}</strong>
        </div>
      </div>
      <p class="wegd-card-foot">${d.confirmations.priceVolume && d.confirmations.indices ? "Volume e estrutura confirmam a tendência" : "Sinais mistos — aguardar confirmação adicional"}</p>
    </article>
    <p class="wegd-panel-summary">
      Tendência Primária: <strong>${escapeHtml(d.primary.label)}</strong>, Secundária: <strong>${escapeHtml(d.secondary.label)}</strong>,
      Menor: <strong>${escapeHtml(d.minor.label)}</strong>. Fase: <strong>${escapeHtml(d.marketPhase)}</strong>.
      ${d.confirmations.priceVolume ? "Volume confirma." : "Volume divergente."}
    </p>
  `;
}

function renderWegdConvergenceHeader(view) {
  const c = view.convergence;
  const voteIcon = (v) => v === "buy" ? "↑" : v === "sell" ? "↓" : "→";
  const voteLabel = (v) => v === "buy" ? "COMPRA" : v === "sell" ? "VENDA" : "NEUTRO";
  const voteCounts = `${c.buys}↑ ${c.sells}↓ ${c.neutrals}→`;
  const summaryLine = c.votes
    .map((v) => `${escapeHtml(v.label)}: ${voteLabel(v.vote)}`)
    .join(", ");
  return `
    <header class="wegd-institutional__head" data-tone="${c.tone}">
      <div class="wegd-head-identity">
        <span class="wegd-head-icon" aria-hidden="true">W</span>
        <div>
          <h3 class="wegd-head-title">Análise WEGD</h3>
          <span class="wegd-head-sub">Wyckoff · Elliott · Gann · Dow</span>
        </div>
      </div>
      <div class="wegd-head-verdict">
        <span class="wegd-verdict-badge" data-tone="${c.tone}">${escapeHtml(c.verdict)}</span>
        <span class="wegd-verdict-meta" title="${escapeHtml(voteCounts)}">Confluência: <strong class="font-mono">${escapeHtml(c.score)}</strong></span>
      </div>
    </header>
    <p class="wegd-head-summary">${escapeHtml(summaryLine)}. Confluência <strong>${escapeHtml(c.verdict)}</strong>.</p>
  `;
}

function renderWegdSubTabs(activeId) {
  return `
    <nav class="wegd-subnav" role="tablist" aria-label="Sub-análises WEGD">
      ${WEGD_SUBTAB_IDS.map((id) => {
        const isActive = id === activeId;
        return `
          <button
            type="button"
            class="wegd-subtab-button${isActive ? " is-active" : ""}"
            role="tab"
            aria-selected="${isActive ? "true" : "false"}"
            aria-controls="wegd-panel-${id}"
            tabindex="${isActive ? "0" : "-1"}"
            data-wegd-subtab="${id}"
          >
            <span class="wegd-subtab-icon" aria-hidden="true">${WEGD_SUBTAB_ICONS[id]}</span>
            <span>${escapeHtml(WEGD_SUBTAB_LABELS[id])}</span>
          </button>`;
      }).join("")}
    </nav>
  `;
}

function renderWegdActivePanel(view, currency, activeId) {
  const renderer =
    activeId === "elliott" ? renderWegdElliottPanel
    : activeId === "gann" ? renderWegdGannPanel
    : activeId === "dow" ? renderWegdDowPanel
    : renderWegdWyckoffPanel;
  return `
    <section class="wegd-panel" id="wegd-panel-${activeId}" role="tabpanel" aria-labelledby="wegd-tab-${activeId}">
      ${renderer(view, currency)}
    </section>
  `;
}

function renderInstitutionalWegdTab(analysis, snapshot, currency) {
  let view;
  try { view = buildWegdInstitutionalView(analysis, snapshot); }
  catch { view = null; }

  if (!view) {
    return `
      <div class="analysis-grid">
        <article class="analysis-block">
          <h4>WEGD (Weighted Edge Gradient Direction)</h4>
          <p>Direção: ${escapeHtml(analysis?.wegd?.direction ?? "—")}</p>
          <p>Gradiente: ${escapeHtml(formatPercent(analysis?.wegd?.gradient ?? 0))}</p>
          <p>Energia: ${(toFiniteNumber(analysis?.wegd?.energy, 0)).toFixed(1)} / 99</p>
          <p>Pressão líquida: ${escapeHtml(formatPercent(analysis?.wegd?.pressure ?? 0))}</p>
        </article>
      </div>
    `;
  }

  const activeId = pickWegdSubTabId(activeWegdSubTabId);
  return `
    <section class="wegd-institutional" data-tone="${view.convergence.tone}">
      ${renderWegdConvergenceHeader(view)}
      ${renderWegdSubTabs(activeId)}
      ${renderWegdActivePanel(view, currency, activeId)}
      <footer class="wegd-foot">
        <span class="wegd-foot-badge" title="Métricas derivadas de snapshot.insights + analysis.wegd. Heurística honesta — sem fabricação de sinal.">⚙ AUDITORIA · derivado</span>
        <span class="wegd-foot-hint">Use ← → para alternar análises</span>
      </footer>
    </section>
  `;
}

function bindWegdSubTabButtons(container, analysis, snapshot, currency) {
  if (!(container instanceof HTMLElement)) return;
  const buttons = Array.from(container.querySelectorAll("[data-wegd-subtab]"));
  if (buttons.length === 0) return;

  const swapPanel = (nextId) => {
    const normalized = pickWegdSubTabId(nextId);
    if (normalized === activeWegdSubTabId) return;
    activeWegdSubTabId = normalized;
    persistWegdSubTab();
    let view;
    try { view = buildWegdInstitutionalView(analysis, snapshot); }
    catch { view = null; }
    if (!view) return;
    // Atualiza apenas nav + painel (sem refazer o header completo)
    const navWrapper = container.querySelector(".wegd-subnav");
    if (navWrapper instanceof HTMLElement) {
      navWrapper.outerHTML = renderWegdSubTabs(normalized);
    }
    const panel = container.querySelector(".wegd-panel");
    if (panel instanceof HTMLElement) {
      panel.outerHTML = renderWegdActivePanel(view, currency, normalized);
    }
    // Re-bind no novo nav
    bindWegdSubTabButtons(container, analysis, snapshot, currency);
    const focusTarget = container.querySelector(`[data-wegd-subtab="${normalized}"]`);
    if (focusTarget instanceof HTMLElement) focusTarget.focus();
  };

  for (const btn of buttons) {
    if (!(btn instanceof HTMLButtonElement)) continue;
    btn.addEventListener("click", () => swapPanel(btn.dataset.wegdSubtab));
    btn.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      const idx = WEGD_SUBTAB_IDS.indexOf(activeWegdSubTabId);
      let nextIdx = idx;
      if (event.key === "ArrowLeft") nextIdx = (idx - 1 + WEGD_SUBTAB_IDS.length) % WEGD_SUBTAB_IDS.length;
      if (event.key === "ArrowRight") nextIdx = (idx + 1) % WEGD_SUBTAB_IDS.length;
      if (event.key === "Home") nextIdx = 0;
      if (event.key === "End") nextIdx = WEGD_SUBTAB_IDS.length - 1;
      swapPanel(WEGD_SUBTAB_IDS[nextIdx]);
    });
  }
}

function renderInstitutionalSmcTab(analysis, snapshot, currency) {
  let view;
  try {
    view = buildSmcInstitutionalView(analysis, snapshot, currency);
  } catch {
    view = null;
  }

  const smcConfluence = buildSmcPriceActionConfluence(analysis, snapshot);

  // Graceful degradation: se não temos marketStructure, cai no checklist + texto base
  if (!view || (!view.swingHigh && !view.swingLow && !view.fvg.active)) {
    return `
      ${renderSmcConfluenceChecklist(smcConfluence)}
      <div class="analysis-grid">
        <article class="analysis-block">
          <h4>Estrutura e liquidez (SMC)</h4>
          <p>${escapeHtml(analysis.smc.structure)}</p>
          <p>${escapeHtml(analysis.smc.liquidity)}</p>
          <p>${escapeHtml(analysis.smc.sweepRisk)}</p>
        </article>
        <article class="analysis-block">
          <h4>Invalidação estrutural</h4>
          <p>Nível de invalidação: ${escapeHtml(formatPrice(analysis?.timing?.invalidationLevel, currency))}</p>
          <p>Se houver fechamento além desse nível, o setup atual perde validade.</p>
        </article>
      </div>
      ${renderSmcTopDownDrillDown(snapshot, currency)}
    `;
  }

  return `
    <section class="smc-institutional" data-tone="${view.bias === "bullish" ? "bull" : view.bias === "bearish" ? "bear" : "neutral"}">
      <header class="smc-institutional__head">
        <div>
          <h3 class="smc-institutional__title">Detalhamento SMC</h3>
          <span class="smc-institutional__sub">Terminal de auditoria · Smart Money Concepts</span>
        </div>
        <span class="smc-live-badge" title="Dados derivados de snapshot.insights.marketStructure">● AO VIVO</span>
      </header>
      ${renderSmcStructurePanel(view, currency)}
      <div class="analysis-grid smc-grid">
        ${renderSmcOrderBlocksPanel(view, currency)}
        ${renderSmcFvgPanel(view, currency)}
      </div>
      ${renderSmcLiquidityPanel(view, currency)}
      ${renderSmcLiquidityHeatmapPanel(view, currency)}
      ${renderSmcConfluenceChecklist(smcConfluence)}
      ${renderSmcTopDownDrillDown(snapshot, currency)}
    </section>
  `;
}

// =============================================================
// Velocímetro de Confluência Institucional (aba "Tecnica")
// ADR-070 — substitui placar de varejo por gauge SVG + sensores SMC/HFT.
// Score adaptativo:
//   binary  -> microTiming.momentumStrength
//   spot    -> analysis.signal.confidence (fallback compositeScore)
// =============================================================

function resolveBiasFromTone(tone) {
  if (tone === "buy") return "bull";
  if (tone === "sell") return "bear";
  return "neutral";
}

function resolveBiasFromTrend(trend) {
  const t = String(trend ?? "").toLowerCase();
  if (/alta|bull|compra|up/.test(t)) return "bull";
  if (/baixa|bear|venda|down/.test(t)) return "bear";
  return "neutral";
}

function resolveTechnicalBiasLabel(score, tone) {
  if (!Number.isFinite(score)) return "Aguardando dados";
  if (score >= 65 && tone !== "sell") return "Viés de Alta";
  if (score <= 35 && tone !== "buy") return "Viés de Baixa";
  if (tone === "buy") return "Pressão compradora moderada";
  if (tone === "sell") return "Pressão vendedora moderada";
  return "Mercado neutro";
}

function resolveTechnicalScore(analysis, snapshot) {
  if (isBinaryOptionsOperationalMode()) {
    let micro = null;
    try { micro = buildMicroTimingAnalysis(analysis, snapshot); } catch { micro = null; }
    const ms = Number(micro?.momentumStrength);
    if (Number.isFinite(ms)) return clampNumber(ms, 0, 100);
  }
  const conf = Number(analysis?.signal?.confidence);
  if (Number.isFinite(conf)) return clampNumber(conf, 0, 100);
  const comp = Number(analysis?.compositeScore);
  if (Number.isFinite(comp)) return clampNumber(comp, 0, 100);
  return 50;
}

function buildSmcSensorTriggers(analysis) {
  let confluence = null;
  try { confluence = buildSmcPriceActionConfluence(analysis); } catch { confluence = null; }
  const tone = analysis?.signal?.tone ?? "neutral";
  const direction = tone === "buy" ? "bull" : tone === "sell" ? "bear" : "neutral";
  const items = [
    {
      id: "ob",
      label: "Order Block H1",
      icon: "◧",
      ok: Boolean(confluence?.liquidity?.[0]?.ok),
      hint: confluence?.liquidity?.[0]?.hint ?? "Aguardando contexto",
    },
    {
      id: "fvg",
      label: "FVG mitigado",
      icon: "▦",
      ok: Boolean(confluence?.rejection?.[1]?.ok),
      hint: confluence?.rejection?.[1]?.hint ?? "Sem engolfo na direção",
    },
    {
      id: "sweep",
      label: "Sweep de topo/fundo",
      icon: "↯",
      ok: Boolean(confluence?.liquidity?.[1]?.ok),
      hint: confluence?.liquidity?.[1]?.hint ?? "Liquidez intacta",
    },
  ].map((it) => ({
    ...it,
    state: it.ok ? direction : "neutral",
    tag: it.ok ? (direction === "bear" ? "bearish" : "bullish") : "aguardando",
  }));
  const pro = items.filter((it) => it.ok && (direction === "bull" || direction === "bear")).length;
  const con = 0; // SMC não gera sinal contrário direto; itens contrários = 0 por construção
  const neu = items.length - pro - con;
  return { items, pro, neu, con, direction };
}

function buildHftSensorTriggers(analysis, snapshot) {
  let micro = null;
  try { micro = buildMicroTimingAnalysis(analysis, snapshot); } catch { micro = null; }
  const tone = analysis?.signal?.tone ?? "neutral";
  const direction = tone === "buy" ? "bull" : tone === "sell" ? "bear" : "neutral";
  const momentumStrength = Number(micro?.momentumStrength);
  const neutralProb = Number(micro?.neutralProbability);
  const momentumDir = String(micro?.momentumDirection ?? "neutro");
  const wegdGradient = Number(analysis?.wegd?.gradient);
  const wegdEnergy = Number(analysis?.wegd?.energy);
  const wegdPressure = Number(analysis?.wegd?.pressure);

  // Desaceleração cinética: força de momentum baixa + neutralidade alta
  const kineticOk = Number.isFinite(momentumStrength) && Number.isFinite(neutralProb)
    && momentumStrength < 35 && neutralProb > 35;
  // Divergência de delta: gradiente WEGD oposto ao tone
  const deltaOk = Number.isFinite(wegdGradient)
    && ((tone === "buy" && wegdGradient < 0) || (tone === "sell" && wegdGradient > 0));
  // Pressão de book: pressão WEGD alinhada ao tone com energia ≥ 50
  const bookOk = Number.isFinite(wegdPressure) && Number.isFinite(wegdEnergy) && wegdEnergy >= 50
    && ((tone === "buy" && wegdPressure > 0) || (tone === "sell" && wegdPressure < 0));

  const rawItems = [
    {
      id: "kinetic",
      label: "Desaceleração cinética",
      icon: "⏱",
      ok: kineticOk,
      polarity: "warning", // sinal de exaustão = atenção, não a favor da tendência
      hint: kineticOk
        ? `Momentum ${momentumStrength.toFixed(0)} / Neutro ${neutralProb.toFixed(0)}%`
        : `Fluxo ${momentumDir}`,
    },
    {
      id: "delta",
      label: "Divergência de delta",
      icon: "Δ",
      ok: deltaOk,
      polarity: "against",
      hint: deltaOk ? "Gradiente WEGD invertido" : "Sem divergência detectada",
    },
    {
      id: "book",
      label: "Pressão de order book",
      icon: "≣",
      ok: bookOk,
      polarity: "favor",
      hint: bookOk ? "Pressão alinhada ao bias" : "Pressão indefinida",
    },
  ];

  const items = rawItems.map((it) => {
    let state = "neutral";
    if (it.ok) {
      if (it.polarity === "favor") state = direction === "bear" ? "bear" : "bull";
      else if (it.polarity === "against") state = direction === "bear" ? "bull" : "bear";
      else state = "warning";
    }
    return {
      id: it.id,
      label: it.label,
      icon: it.icon,
      ok: it.ok,
      state,
      tag: it.ok
        ? (state === "warning" ? "atenção" : state === "bear" ? "bearish" : "bullish")
        : "aguardando",
      hint: it.hint,
    };
  });

  const pro = items.filter((it) => it.state === "bull" && direction === "bull").length
    + items.filter((it) => it.state === "bear" && direction === "bear").length;
  const con = items.filter((it) => it.state === "bull" && direction === "bear").length
    + items.filter((it) => it.state === "bear" && direction === "bull").length;
  const warn = items.filter((it) => it.state === "warning").length;
  const neu = items.length - pro - con - warn;
  return { items, pro, neu: neu + warn, con, direction };
}

function buildMtfBiasMap(analysis, snapshot) {
  const topDown = snapshot?.institutional?.topDown && typeof snapshot.institutional.topDown === "object"
    ? snapshot.institutional.topDown
    : null;
  const trendBias = resolveBiasFromTrend(analysis?.context?.trend);
  const toneBias = resolveBiasFromTone(analysis?.signal?.tone);

  const fromBackend = (slot) => {
    const raw = String(topDown?.[slot]?.bias ?? "").toLowerCase();
    if (raw === "bullish" || raw === "bull") return "bull";
    if (raw === "bearish" || raw === "bear") return "bear";
    if (raw === "neutral") return "neutral";
    return null;
  };

  return {
    m5:  fromBackend("m5")    ?? toneBias,
    m15: toneBias,
    h1:  fromBackend("h1")    ?? trendBias,
    h4:  fromBackend("h4")    ?? trendBias,
    d1:  fromBackend("daily") ?? trendBias,
  };
}

function renderInstitutionalTechnicalTab(analysis, snapshot, currency) {
  const score = resolveTechnicalScore(analysis, snapshot);
  const tone = analysis?.signal?.tone ?? "neutral";
  const direction = tone === "buy" ? "bull" : tone === "sell" ? "bear" : "neutral";
  const gaugeDeg = clampNumber((score - 50) * 1.8, -90, 90);
  const biasLabel = resolveTechnicalBiasLabel(score, tone);
  const buyProb = clampNumber(Number(analysis?.buyProbability ?? 33), 0, 100);
  const sellProb = clampNumber(Number(analysis?.sellProbability ?? 33), 0, 100);
  const neuProb = clampNumber(Number(analysis?.neutralProbability ?? Math.max(0, 100 - buyProb - sellProb)), 0, 100);
  const totalProb = buyProb + sellProb + neuProb || 1;
  const buyPct = (buyProb / totalProb) * 100;
  const sellPct = (sellProb / totalProb) * 100;
  const neuPct = Math.max(0, 100 - buyPct - sellPct);

  const smc = buildSmcSensorTriggers(analysis);
  const hft = buildHftSensorTriggers(analysis, snapshot);
  const mtf = buildMtfBiasMap(analysis, snapshot);
  const support = analysis?.context?.supportLevel;
  const resistance = analysis?.context?.resistanceLevel;
  const equilibrium = analysis?.context?.equilibriumPrice;
  const fg = analysis?.fearGreed ?? {};

  const renderSensorList = (items) => items.map((it) => `
    <li data-state="${escapeHtml(it.state)}" id="tech-${escapeHtml(it.id)}-row" title="${escapeHtml(it.hint)}">
      <span class="tech-signal-icon" aria-hidden="true">${escapeHtml(it.icon)}</span>
      <span class="tech-signal-name">${escapeHtml(it.label)}</span>
      <span class="tech-signal-tag">${escapeHtml(it.tag)}</span>
    </li>
  `).join("");

  const mtfCells = [
    { tf: "M5",  id: "m5",  bias: mtf.m5 },
    { tf: "M15", id: "m15", bias: mtf.m15 },
    { tf: "H1",  id: "h1",  bias: mtf.h1 },
    { tf: "H4",  id: "h4",  bias: mtf.h4 },
    { tf: "D1",  id: "d1",  bias: mtf.d1 },
  ].map((c) => `
    <li class="tech-mtf-cell" id="tech-mtf-${escapeHtml(c.id)}" data-bias="${escapeHtml(c.bias)}">
      <span class="tech-mtf-tf">${escapeHtml(c.tf)}</span>
      <span class="tech-mtf-dot" aria-hidden="true"></span>
    </li>
  `).join("");

  const fgScore = Number(fg.score);
  const fgClassicRow = (label, value, tag) => `
    <li class="tech-classic-row" data-tag="${escapeHtml(tag)}">
      <span>${escapeHtml(label)}</span>
      <span>${escapeHtml(value)}</span>
      <span class="tech-classic-tag">${escapeHtml(tag)}</span>
    </li>`;
  const trendBias = resolveBiasFromTrend(analysis?.context?.trend);
  const fgTag = !Number.isFinite(fgScore) ? "neutral" : (fgScore >= 60 ? "buy" : fgScore <= 40 ? "sell" : "neutral");
  const trendTag = trendBias === "bull" ? "buy" : trendBias === "bear" ? "sell" : "neutral";
  const wegdDir = String(analysis?.wegd?.direction ?? "neutral").toLowerCase();
  const wegdTag = /alta|bull|up/.test(wegdDir) ? "buy" : /baixa|bear|down/.test(wegdDir) ? "sell" : "neutral";

  const supportFmt = Number.isFinite(Number(support)) ? formatPrice(support, currency) : "—";
  const resistanceFmt = Number.isFinite(Number(resistance)) ? formatPrice(resistance, currency) : "—";
  const equilibriumFmt = Number.isFinite(Number(equilibrium)) ? formatPrice(equilibrium, currency) : "—";

  return `
<section
  class="technical-institutional"
  data-section="technical-gauge"
  data-tone="${escapeHtml(direction)}"
  id="tech-root"
  aria-label="Análise técnica institucional"
  style="--gauge-deg: ${gaugeDeg.toFixed(2)}deg;"
>
  <header class="tech-header">
    <div class="tech-header-title">
      <h3>Velocímetro de Confluência Institucional</h3>
      <span class="tech-header-sub">SMC · HFT · Geometria · Indicadores</span>
    </div>
    <div class="tech-header-meta">
      <span class="tech-live-badge" aria-live="polite">
        <span class="tech-live-dot" aria-hidden="true"></span>
        Ao vivo
      </span>
    </div>
  </header>

  <div class="tech-row tech-row--gauge">
    <article class="analysis-block tech-gauge-card">
      <svg class="tech-gauge-svg" viewBox="0 0 220 130" preserveAspectRatio="xMidYMid meet"
           role="meter" aria-valuemin="0" aria-valuemax="100"
           aria-valuenow="${score.toFixed(0)}" aria-label="Score de confluência institucional"
           id="tech-gauge">
        <defs>
          <linearGradient id="tech-gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#ef4444"/>
            <stop offset="50%" stop-color="#a3a3a3"/>
            <stop offset="100%" stop-color="#22c55e"/>
          </linearGradient>
          <filter id="tech-needle-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-opacity="0.55"/>
          </filter>
        </defs>
        <path d="M 20 110 A 90 90 0 0 1 200 110" fill="none"
              stroke="rgba(255,255,255,0.06)" stroke-width="20" stroke-linecap="round"/>
        <path d="M 20 110 A 90 90 0 0 1 200 110" fill="none"
              stroke="url(#tech-gauge-grad)" stroke-width="18" stroke-linecap="round"/>
        <text x="20" y="125" font-size="9" fill="#fca5a5" text-anchor="middle">Venda</text>
        <text x="110" y="20" font-size="9" fill="#a3a3a3" text-anchor="middle">Neutro</text>
        <text x="200" y="125" font-size="9" fill="#86efac" text-anchor="middle">Compra</text>
        <g class="tech-needle">
          <line x1="110" y1="110" x2="110" y2="35"
                stroke="#f8fafc" stroke-width="2.5" stroke-linecap="round"
                filter="url(#tech-needle-shadow)"/>
          <circle cx="110" cy="110" r="6" fill="#f8fafc" stroke="#0f172a" stroke-width="1.5"/>
        </g>
      </svg>
      <div class="tech-gauge-readout">
        <div class="tech-gauge-score" id="tech-gauge-score"
             title="Score = SMC + HFT + Geometria + Ghost Tracker (auditado) + Sentimento">
          ${score.toFixed(0)}
        </div>
        <div class="tech-gauge-unit">/ 100 · Força de confluência</div>
        <div class="tech-gauge-bias" id="tech-gauge-bias" aria-live="polite">${escapeHtml(biasLabel)}</div>
        <p class="tech-gauge-hint">
          Viés baseado em algoritmos institucionais (SMC &amp; HFT) — indicadores clássicos atuam como confirmação secundária.
        </p>
      </div>
    </article>

    <article class="analysis-block tech-mtf-card">
      <h4>Alinhamento Multi-Timeframe</h4>
      <ul class="tech-mtf-grid" role="list">${mtfCells}</ul>
      <p class="tech-mtf-hint">Verde = bullish · Vermelho = bearish · Cinza = neutro. Alinhamento em ≥ 3 TFs reforça o setup.</p>
      <h5 class="tech-context-title">Contexto estrutural</h5>
      <ul class="tech-context-list">
        <li><span>Suporte</span><strong>${escapeHtml(supportFmt)}</strong></li>
        <li><span>Equilíbrio</span><strong>${escapeHtml(equilibriumFmt)}</strong></li>
        <li><span>Resistência</span><strong>${escapeHtml(resistanceFmt)}</strong></li>
      </ul>
    </article>
  </div>

  <div class="tech-row tech-row--sensors">
    <article class="analysis-block tech-sensor-card" data-tone="${escapeHtml(direction)}" id="tech-sensor-smc">
      <header class="tech-sensor-header">
        <h4>Sensores de Liquidez (SMC)</h4>
        <span class="tech-sensor-weight">peso 30%</span>
      </header>
      <div class="tech-scoreboard">
        <div class="tech-score-cell tech-score-pro">
          <span class="tech-score-num" id="tech-smc-pro">${smc.pro}</span>
          <span class="tech-score-lbl">↑ a favor</span>
        </div>
        <div class="tech-score-cell tech-score-neu">
          <span class="tech-score-num" id="tech-smc-neu">${smc.neu}</span>
          <span class="tech-score-lbl">— neutro</span>
        </div>
        <div class="tech-score-cell tech-score-con">
          <span class="tech-score-num" id="tech-smc-con">${smc.con}</span>
          <span class="tech-score-lbl">↓ contra</span>
        </div>
      </div>
      <ul class="tech-signal-list" role="list">${renderSensorList(smc.items.map((it) => ({ ...it, id: `smc-${it.id}` })))}</ul>
    </article>

    <article class="analysis-block tech-sensor-card" data-tone="${escapeHtml(direction)}" id="tech-sensor-hft">
      <header class="tech-sensor-header">
        <h4>Sensores de Exaustão (Tick / HFT)</h4>
        <span class="tech-sensor-weight">peso 20%</span>
      </header>
      <div class="tech-scoreboard">
        <div class="tech-score-cell tech-score-pro">
          <span class="tech-score-num" id="tech-hft-pro">${hft.pro}</span>
          <span class="tech-score-lbl">↑ a favor</span>
        </div>
        <div class="tech-score-cell tech-score-neu">
          <span class="tech-score-num" id="tech-hft-neu">${hft.neu}</span>
          <span class="tech-score-lbl">— neutro</span>
        </div>
        <div class="tech-score-cell tech-score-con">
          <span class="tech-score-num" id="tech-hft-con">${hft.con}</span>
          <span class="tech-score-lbl">↓ contra</span>
        </div>
      </div>
      <ul class="tech-signal-list" role="list">${renderSensorList(hft.items.map((it) => ({ ...it, id: `hft-${it.id}` })))}</ul>
    </article>
  </div>

  <article class="analysis-block tech-consensus-card">
    <header class="tech-sensor-header">
      <h4>Consenso final dos sinais</h4>
      <span class="tech-sensor-weight">SMC + HFT + Geometria + Indicadores</span>
    </header>
    <div class="tech-consensus-bar" role="img" aria-label="Distribuição do consenso">
      <span class="tech-consensus-seg tech-consensus-sell" id="tech-consensus-sell" style="--seg: ${sellPct.toFixed(1)}%"></span>
      <span class="tech-consensus-seg tech-consensus-neu"  id="tech-consensus-neu"  style="--seg: ${neuPct.toFixed(1)}%"></span>
      <span class="tech-consensus-seg tech-consensus-buy"  id="tech-consensus-buy"  style="--seg: ${buyPct.toFixed(1)}%"></span>
    </div>
    <div class="tech-consensus-legend">
      <span class="tech-consensus-legend--sell">Venda · <strong id="tech-consensus-sell-pct">${sellPct.toFixed(0)}%</strong></span>
      <span class="tech-consensus-legend--neu">Neutro · <strong id="tech-consensus-neu-pct">${neuPct.toFixed(0)}%</strong></span>
      <span class="tech-consensus-legend--buy">Compra · <strong id="tech-consensus-buy-pct">${buyPct.toFixed(0)}%</strong></span>
    </div>
  </article>

  <details class="analysis-block tech-classic-details" id="tech-classic">
    <summary>
      <span>Indicadores clássicos — confirmação secundária</span>
      <span class="tech-classic-toggle">Mostrar / Ocultar</span>
    </summary>
    <div class="tech-classic-grid">
      <div>
        <h5 class="tech-classic-title">Tendência &amp; Momentum</h5>
        <ul class="tech-classic-list" id="tech-classic-ma" role="list">
          ${fgClassicRow("Tendência dominante", String(analysis?.context?.trend ?? "—"), trendTag)}
          ${fgClassicRow("WEGD direção", String(analysis?.wegd?.direction ?? "—"), wegdTag)}
          ${fgClassicRow("Energia WEGD", `${Number(analysis?.wegd?.energy ?? 0).toFixed(0)} / 99`, "neutral")}
        </ul>
      </div>
      <div>
        <h5 class="tech-classic-title">Sentimento &amp; Probabilidade</h5>
        <ul class="tech-classic-list" id="tech-classic-osc" role="list">
          ${fgClassicRow("Fear &amp; Greed", `${Number.isFinite(fgScore) ? fgScore.toFixed(1) : "—"} (${escapeHtml(String(fg.label ?? "n/d"))})`, fgTag)}
          ${fgClassicRow("Compra (prob.)", `${buyProb.toFixed(1)}%`, buyProb >= 55 ? "buy" : "neutral")}
          ${fgClassicRow("Venda (prob.)", `${sellProb.toFixed(1)}%`, sellProb >= 55 ? "sell" : "neutral")}
        </ul>
      </div>
    </div>
  </details>
</section>
  `;
}

// Ratios de Scott Carney (Harmonic Trading Vol.1/2). Tolerancia ±0.04 padrao
// institucional. Backend hoje so resolve a razao dominante (XD); demais legs
// ficam "pending" honestos ate fase 2 (ADR-072 backend XABCD pivots).
const HARMONIC_RATIO_TOLERANCE = 0.04;
const HARMONIC_PATTERN_DEFINITIONS = [
  {
    id: "gartley",
    name: "Gartley",
    icon: "▲",
    idealD: 0.786,
    prznLabel: "0.786 XA",
    stopBufferRatio: 1.04,
    ratios: { XB: 0.618, AC: 0.618, BD: 1.272, XD: 0.786 },
    ratiosLabel: { XB: "0.618", AC: "0.382 - 0.886", BD: "1.13 - 1.618", XD: "0.786" },
  },
  {
    id: "bat",
    name: "Bat (Morcego)",
    icon: "🦇",
    idealD: 0.886,
    prznLabel: "0.886 XA",
    stopBufferRatio: 1.03,
    ratios: { XB: 0.5, AC: 0.618, BD: 2.0, XD: 0.886 },
    ratiosLabel: { XB: "0.382 - 0.5", AC: "0.382 - 0.886", BD: "1.618 - 2.618", XD: "0.886" },
  },
  {
    id: "butterfly",
    name: "Butterfly (Borboleta)",
    icon: "🦋",
    idealD: 1.27,
    prznLabel: "1.272 XA",
    stopBufferRatio: 1.05,
    ratios: { XB: 0.786, AC: 0.618, BD: 1.92, XD: 1.272 },
    ratiosLabel: { XB: "0.786", AC: "0.382 - 0.886", BD: "1.618 - 2.24", XD: "1.272" },
  },
  {
    id: "crab",
    name: "Crab (Caranguejo)",
    icon: "🦀",
    idealD: 1.618,
    prznLabel: "1.618 XA",
    stopBufferRatio: 1.06,
    ratios: { XB: 0.5, AC: 0.618, BD: 2.92, XD: 1.618 },
    ratiosLabel: { XB: "0.382 - 0.618", AC: "0.382 - 0.886", BD: "2.24 - 3.618", XD: "1.618" },
  },
  {
    id: "shark",
    name: "Shark (Tubarao)",
    icon: "🦈",
    idealD: 1.0,
    prznLabel: "0.886 - 1.13 XA",
    stopBufferRatio: 1.05,
    ratios: { XB: 0.5, AC: 1.375, BD: 1.92, XD: 1.0 },
    ratiosLabel: { XB: "0.382 - 0.618", AC: "1.13 - 1.618", BD: "1.618 - 2.24", XD: "0.886 - 1.13" },
  },
];

const FIBONACCI_AUXILIARY_LEVELS = [0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.618];

function classifyHarmonicState(distance) {
  if (distance <= 0.04) return { label: "Formado", tone: "ok" };
  if (distance <= 0.12) return { label: "Em formacao", tone: "warning" };
  if (distance <= 0.28) return { label: "Buscando", tone: "pending" };
  return { label: "Nao detectado", tone: "muted" };
}

function buildHarmonicGeometryScanner(analysis, currency) {
  const zonePos = Number(analysis?.context?.zonePositionPercent ?? 50) / 100;
  const baseConfidence = Number(analysis?.harmonic?.confidence ?? 0);
  const dominantRatio = Number(analysis?.harmonic?.ratio ?? NaN);
  const tone = analysis?.signal?.tone;
  const support = Number(analysis?.context?.supportLevel ?? 0);
  const resistance = Number(analysis?.context?.resistanceLevel ?? 0);
  const tp1 = Number(analysis?.signal?.takeProfit1 ?? 0);
  const tp2 = Number(analysis?.signal?.takeProfit2 ?? 0);
  const stop = Number(analysis?.signal?.stopLoss ?? 0);
  const isBuy = tone === "buy";

  const patterns = HARMONIC_PATTERN_DEFINITIONS.map((def) => {
    const normalizedDist = Math.abs(zonePos - Math.min(def.idealD, 0.99));
    const score = clampNumber(Math.round(100 - normalizedDist * 280), 0, 100);
    const blendedConfidence = clampNumber(Math.round((score * 0.6) + (baseConfidence * 0.4)), 0, 99);
    const state = classifyHarmonicState(normalizedDist);
    const showLevels = blendedConfidence >= 70 && (isBuy || tone === "sell");

    // Validacao honesta: backend so resolve a razao dominante = leg XD.
    // Demais legs ficam "pending" ate ADR-072 fase 2 fornecer pivos XABCD reais.
    const xdActual = Number.isFinite(dominantRatio) ? dominantRatio : null;
    const xdValid = xdActual !== null
      ? Math.abs(xdActual - def.ratios.XD) <= HARMONIC_RATIO_TOLERANCE
      : null;
    const ratiosValidation = {
      XB: { expected: def.ratios.XB, expectedLabel: def.ratiosLabel.XB, actual: null, status: "pending" },
      AC: { expected: def.ratios.AC, expectedLabel: def.ratiosLabel.AC, actual: null, status: "pending" },
      BD: { expected: def.ratios.BD, expectedLabel: def.ratiosLabel.BD, actual: null, status: "pending" },
      XD: {
        expected: def.ratios.XD,
        expectedLabel: def.ratiosLabel.XD,
        actual: xdActual,
        status: xdValid === null ? "pending" : xdValid ? "ok" : "invalid",
      },
    };

    return {
      ...def,
      score,
      confidence: blendedConfidence,
      state,
      ratiosValidation,
      przLow: showLevels ? (isBuy ? support : resistance) : null,
      przHigh: showLevels ? (isBuy ? support * 1.001 : resistance * 0.999) : null,
      target1: showLevels ? tp1 : null,
      target2: showLevels ? tp2 : null,
      stopLevel: showLevels ? stop : null,
      currency,
    };
  });

  patterns.sort((left, right) => right.confidence - left.confidence);

  // Confluencia cross-pattern: PRZs proximos (delta < 0.3% do range) reforcam o setup
  const range = Math.max(0.0001, Math.abs(resistance - support));
  const activePrzs = patterns.filter((p) => p.przLow !== null).map((p) => p.przLow);
  let confluenceCount = 0;
  if (activePrzs.length >= 2) {
    for (let i = 0; i < activePrzs.length; i += 1) {
      for (let j = i + 1; j < activePrzs.length; j += 1) {
        if (Math.abs(activePrzs[i] - activePrzs[j]) / range < 0.003) {
          confluenceCount += 1;
        }
      }
    }
  }

  return {
    patterns,
    bestPattern: patterns[0] ?? null,
    tone,
    confluenceCount,
    backendXabcdAvailable: false, // ADR-072 fase 2 ativara isto
  };
}

function buildFibonacciAuxiliaryLevels(analysis, currency) {
  const high = Number(analysis?.context?.rangeHigh ?? 0);
  const low = Number(analysis?.context?.rangeLow ?? 0);
  const current = Number(analysis?.context?.equilibriumPrice ?? (high + low) / 2);
  if (!(high > 0) || !(low > 0) || high <= low) {
    return { levels: [], currency, current: null, range: null };
  }
  const range = high - low;
  // Por convencao, retracao a partir da maxima recente (high - range*ratio).
  // Niveis > 1.0 viram extensoes (projecao alem do range).
  const levels = FIBONACCI_AUXILIARY_LEVELS.map((ratio) => {
    const price = high - range * ratio;
    const isSupport = current > price;
    return {
      ratio,
      ratioLabel: `${(ratio * 100).toFixed(1)}%`,
      price,
      role: isSupport ? "SUPORTE" : "RESISTENCIA",
      distancePct: ((current - price) / current) * 100,
    };
  });
  // Marca o nivel mais proximo do preco atual
  let nearestIdx = 0;
  let nearestDelta = Infinity;
  for (let i = 0; i < levels.length; i += 1) {
    const d = Math.abs(levels[i].price - current);
    if (d < nearestDelta) { nearestDelta = d; nearestIdx = i; }
  }
  if (levels[nearestIdx]) levels[nearestIdx].nearest = true;
  return { levels, currency, current, range };
}

function renderHarmonicScanner(scanner) {
  if (!scanner || !Array.isArray(scanner.patterns) || scanner.patterns.length === 0) {
    return "";
  }

  const renderRatioCell = (legKey, leg) => {
    const expectedTitle = `Esperado: ${leg.expectedLabel} (alvo ${leg.expected.toFixed(3)} ±${HARMONIC_RATIO_TOLERANCE})`;
    let actualText;
    let icon;
    let iconLabel;
    if (leg.status === "ok") {
      actualText = leg.actual.toFixed(3);
      icon = "✓"; iconLabel = "valido";
    } else if (leg.status === "invalid") {
      actualText = leg.actual.toFixed(3);
      icon = "✕"; iconLabel = "invalidado";
    } else {
      actualText = "—";
      icon = "•"; iconLabel = "pendente";
    }
    const pendingHint = leg.status === "pending"
      ? ' title="Pivos XABCD individuais ainda nao expostos pelo backend (ADR-072 fase 2)."'
      : "";
    return `
      <div class="harmonic-ratio harmonic-ratio--${leg.status}"${pendingHint}>
        <span class="harmonic-ratio__leg">${legKey}</span>
        <span class="harmonic-ratio__expected" title="${escapeHtml(expectedTitle)}">esp ${escapeHtml(leg.expectedLabel)}</span>
        <span class="harmonic-ratio__actual">${escapeHtml(actualText)}</span>
        <span class="harmonic-ratio__icon" aria-label="${iconLabel}">${icon}</span>
      </div>
    `;
  };

  const cards = scanner.patterns.map((pattern) => {
    const fmt = (value) => (typeof value === "number" && Number.isFinite(value)
      ? formatPrice(value, pattern.currency)
      : "—");
    const ratiosGrid = `
      <div class="harmonic-card__ratios" role="group" aria-label="Validacao Fibonacci ${escapeHtml(pattern.name)}">
        ${renderRatioCell("XB", pattern.ratiosValidation.XB)}
        ${renderRatioCell("AC", pattern.ratiosValidation.AC)}
        ${renderRatioCell("BD", pattern.ratiosValidation.BD)}
        ${renderRatioCell("XD", pattern.ratiosValidation.XD)}
      </div>
    `;
    const execution = pattern.target1 !== null
      ? `
        <div class="harmonic-card__execution">
          <article class="harmonic-exec harmonic-exec--prz" title="Potential Reversal Zone (${escapeHtml(pattern.prznLabel)})">
            <span class="harmonic-exec__label">PRZ</span>
            <span class="harmonic-exec__value">${escapeHtml(fmt(pattern.przLow))}<span class="harmonic-exec__suffix">/ ${escapeHtml(fmt(pattern.przHigh))}</span></span>
            <small>${escapeHtml(pattern.prznLabel)}</small>
          </article>
          <article class="harmonic-exec harmonic-exec--target">
            <span class="harmonic-exec__label">Alvos</span>
            <span class="harmonic-exec__value">${escapeHtml(fmt(pattern.target1))}</span>
            <small>TP2 ${escapeHtml(fmt(pattern.target2))}</small>
          </article>
          <article class="harmonic-exec harmonic-exec--stop">
            <span class="harmonic-exec__label">Stop</span>
            <span class="harmonic-exec__value">${escapeHtml(fmt(pattern.stopLevel))}</span>
            <small>invalidacao</small>
          </article>
        </div>
      `
      : `<div class="harmonic-card__execution harmonic-card__execution--locked"><small>PRZ + alvos liberados acima de 70% de confianca harmonica.</small></div>`;
    return `
      <article class="harmonic-card" data-tone="${pattern.state.tone}" role="listitem">
        <header class="harmonic-card__header">
          <span class="harmonic-card__name"><span aria-hidden="true">${pattern.icon}</span> ${escapeHtml(pattern.name)}</span>
          <span class="harmonic-card__state harmonic-card__state--${pattern.state.tone}">${escapeHtml(pattern.state.label)}</span>
        </header>
        <div class="harmonic-card__progress" role="progressbar" aria-valuenow="${pattern.confidence}" aria-valuemin="0" aria-valuemax="100" aria-label="Confianca ${escapeHtml(pattern.name)}">
          <div class="harmonic-card__progress-bar" style="width:${pattern.confidence}%"></div>
        </div>
        <small class="harmonic-card__progress-label">Convergencia Fibonacci: ${pattern.confidence}%</small>
        ${ratiosGrid}
        ${execution}
      </article>
    `;
  }).join("");

  const confluenceBadge = scanner.confluenceCount > 0
    ? `<span class="harmonic-confluence-badge" title="PRZs proximos (<0.3% do range) reforcam o setup (ICT PRZ overlap).">🎯 Confluencia ${scanner.confluenceCount}x</span>`
    : "";
  const xabcdHint = scanner.backendXabcdAvailable
    ? ""
    : `<small class="harmonic-scanner__hint">Backend resolve apenas a razao dominante (XD). Legs XB/AC/BD ficam pendentes ate ADR-072 fase 2 expor pivos XABCD individuais.</small>`;

  return `
    <div class="analysis-block">
      <header class="harmonic-scanner__header">
        <h4>Scanner geometrico XABCD</h4>
        ${confluenceBadge}
      </header>
      <small>Estado calculado a partir da posicao no range, razao dominante e confianca harmonica agregada. Tolerancia de validacao ±${HARMONIC_RATIO_TOLERANCE}.</small>
      ${xabcdHint}
      <div class="harmonic-scanner" role="list" aria-live="polite">${cards}</div>
    </div>
  `;
}

function renderVisualAiEvidenceCard(card) {
  return `
    <article class="visual-ai-card" data-tone="${escapeHtml(card.tone)}" title="${escapeHtml(card.audit)}">
      <span class="visual-ai-card__label">${escapeHtml(card.label)}</span>
      <strong class="visual-ai-card__value">${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.detail)}</small>
    </article>
  `;
}

function renderVisualAiChecklist(checks) {
  return checks.map((check) => `
    <li class="visual-ai-check" data-ok="${check.ok ? "true" : "false"}" title="${escapeHtml(check.detail)}">
      <span class="visual-ai-check__icon" aria-hidden="true">${check.ok ? "✓" : "✕"}</span>
      <span class="visual-ai-check__label">${escapeHtml(check.label)}</span>
      <span class="visual-ai-check__detail">${escapeHtml(check.detail)}</span>
    </li>
  `).join("");
}

function renderVisualIntelligenceTab(evidence) {
  const cards = Array.isArray(evidence?.cards) ? evidence.cards : [];
  const checks = Array.isArray(evidence?.checks) ? evidence.checks : [];
  const verdict = evidence?.verdict ?? { label: "Aguardar leitura visual", tone: "neutral", detail: "Evidencia indisponivel." };
  const score = Number.isFinite(evidence?.score) ? evidence.score : 0;
  const candleLabel = evidence?.primaryCandle?.label ?? "n/d";
  const harmonicLabel = evidence?.harmonic?.pattern ?? "n/d";
  const signalConfidence = Number.isFinite(evidence?.signal?.confidence) ? evidence.signal.confidence.toFixed(0) : "0";
  const riskReward = Number.isFinite(evidence?.signal?.riskReward) && evidence.signal.riskReward > 0
    ? evidence.signal.riskReward.toFixed(2)
    : "n/d";

  return `
    <section class="visual-ai-desk" data-tone="${escapeHtml(verdict.tone)}" aria-label="Leitura Visual Quantitativa">
      <header class="visual-ai-head">
        <div>
          <h3>Leitura Visual Quantitativa</h3>
          <p>${escapeHtml(verdict.detail)}</p>
        </div>
        <div class="visual-ai-score" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${score}">
          <strong>${score}</strong>
          <span>/100</span>
        </div>
      </header>

      <div class="visual-ai-verdict" data-tone="${escapeHtml(verdict.tone)}">
        <strong>${escapeHtml(verdict.label)}</strong>
        <span>Amostra ${Number(evidence?.sampleSize ?? 0)} candles - sinal ${escapeHtml(String(evidence?.signal?.bias ?? "neutral"))}</span>
      </div>

      <div class="visual-ai-grid" role="list">
        ${cards.map(renderVisualAiEvidenceCard).join("")}
      </div>

      <div class="visual-ai-body">
        <ul class="visual-ai-checklist" role="list">
          ${renderVisualAiChecklist(checks)}
        </ul>
        <article class="visual-ai-audit">
          <h4>Auditoria da leitura</h4>
          <dl>
            <div><dt>Candle primario</dt><dd>${escapeHtml(candleLabel)}</dd></div>
            <div><dt>Padrao harmonico</dt><dd>${escapeHtml(harmonicLabel)}</dd></div>
            <div><dt>Confianca do sinal</dt><dd>${escapeHtml(signalConfidence)}%</dd></div>
            <div><dt>Risco/recompensa</dt><dd>${escapeHtml(riskReward)}</dd></div>
          </dl>
        </article>
      </div>
    </section>
  `;
}

function renderFibonacciAuxiliary(fib) {
  if (!fib || !Array.isArray(fib.levels) || fib.levels.length === 0) {
    return "";
  }
  const rows = fib.levels.map((lvl) => {
    const tone = lvl.role === "SUPORTE" ? "ok" : "warning";
    const nearestBadge = lvl.nearest ? ' <span class="fib-row__nearest" title="Nivel mais proximo do preco atual">📍 PROXIMO</span>' : "";
    const distance = Number.isFinite(lvl.distancePct) ? ` (${lvl.distancePct >= 0 ? "+" : ""}${lvl.distancePct.toFixed(2)}%)` : "";
    return `
      <li class="fib-row" data-tone="${tone}" role="listitem">
        <span class="fib-row__ratio">${escapeHtml(lvl.ratioLabel)}${nearestBadge}</span>
        <span class="fib-row__price">${escapeHtml(formatPrice(lvl.price, fib.currency))}</span>
        <span class="fib-row__role fib-row__role--${tone}">${escapeHtml(lvl.role)}${distance}</span>
      </li>
    `;
  }).join("");
  return `
    <div class="analysis-block">
      <h4>Niveis de Fibonacci (auxiliares)</h4>
      <small>Retracoes 23.6% a 78.6% e extensoes 127.2% / 161.8% sobre o range high-low atual. Classificacao Suporte/Resistencia derivada do preco corrente vs nivel.</small>
      <ul class="fib-levels" role="list">${rows}</ul>
    </div>
  `;
}

// =============================================================================
// ADR-075/090 — Calculadora de Posicao Institucional Multi-Asset
// Coexiste com Risk Lab Monte Carlo. Inputs persistidos. Pip-aware por classe.
// =============================================================================

function getPositionLotDecimals(spec) {
  return Number.isInteger(spec?.lotDecimals) ? spec.lotDecimals : spec?.kind === "forex" ? 2 : 4;
}

function formatPositionDistance(result, spec) {
  if (Number.isFinite(result?.stopDistancePips)) {
    return `${result.stopDistancePips.toFixed(1)} ${spec.pipLabel}`;
  }

  return `${Number(result?.stopDistanceAbs ?? 0).toFixed(2)} ${spec.pipLabel}`;
}

function formatPositionTpDistance(tp, spec) {
  if (Number.isFinite(tp?.distPips)) {
    return `+${tp.distPips.toFixed(1)}`;
  }

  return `+${Number(tp?.distAbs ?? 0).toFixed(2)}`;
}

function renderPositionCalculator({ analysis, snapshot, currency, assetId }) {
  const spec = classifyPositionAssetSpec(assetId, currency);
  const lotDecimals = getPositionLotDecimals(spec);
  const specDescription = describePositionAssetSpec(spec);
  const defaults = { capital: 0, profile: "moderate", spreadPips: spec.defaultSpreadPips };
  const persisted = loadPositionCalcState(defaults);

  const signal = analysis?.signal ?? {};
  const positionLabel = signal?.action ?? "AGUARDANDO";

  return `
    <section class="pos-calc" data-position-calculator data-asset-kind="${spec.kind}" aria-label="Calculadora de Posicao Institucional">
      <header class="pos-calc__header">
        <div>
          <h4>Calculadora de Gestao de Risco</h4>
          <small>Calcule o tamanho ideal da sua posicao para ${escapeHtml(spec.label)}</small>
        </div>
        <span class="pos-calc__asset-tag">${escapeHtml(spec.label)}</span>
      </header>

      <article class="pos-calc__signal-card">
        <div class="pos-calc__signal-head">
          <strong>Posicao: <span data-pos-action>${escapeHtml(String(positionLabel).toUpperCase())}</span></strong>
          <small>${signal?.guidance ? escapeHtml(signal.guidance) : "Aguardando melhor momento"}</small>
        </div>
        <div class="pos-calc__levels">
          <span class="pos-calc__level-label">Lote Minimo: <strong>${spec.lotMin.toFixed(lotDecimals)}</strong></span>
        </div>
        <div class="pos-calc__levels-grid">
          <div class="pos-calc__level"><small>Entrada</small><strong data-tone="entry">${escapeHtml(formatPrice(signal?.entryLow, currency))}</strong></div>
          <div class="pos-calc__level"><small>Stop Loss</small><strong data-tone="bear">${escapeHtml(formatPrice(signal?.stopLoss, currency))}</strong></div>
          <div class="pos-calc__level"><small>TP1</small><strong data-tone="bull">${escapeHtml(formatPrice(signal?.takeProfit1, currency))}</strong></div>
          <div class="pos-calc__level"><small>TP2</small><strong data-tone="bull">${escapeHtml(formatPrice(signal?.takeProfit2, currency))}</strong></div>
          <div class="pos-calc__level"><small>TP3</small><strong data-tone="bull">${escapeHtml(formatPrice(signal?.takeProfit3 ?? signal?.takeProfit2, currency))}</strong></div>
        </div>
      </article>

      ${spec.isFallback ? `<div class="pos-calc__warning" data-tone="warning" data-pos-spec-warning role="status">Sem contrato cadastrado para ${escapeHtml(spec.label)}. A calculadora esta em modo unidade/notional bruto; valide tick, contrato e lote minimo no broker antes de executar.</div>` : ""}

      <div class="pos-calc__warning" data-pos-margin-warning role="status" aria-live="polite" hidden></div>

      <label class="pos-calc__capital-field" for="pos-calc-capital">
        <span>Seu Capital (Banca) em Dolares (USD)</span>
        <span class="pos-calc__capital-input"><span aria-hidden="true">$</span><input id="pos-calc-capital" data-pos-input="capital" type="number" min="0" step="10" placeholder="Ex: 10000" value="${persisted.capital > 0 ? persisted.capital : ""}" /></span>
        <small>Digite o valor total do seu capital em Dolares (USD)</small>
      </label>

      <fieldset class="pos-calc__profiles" aria-label="Cenarios de Risco">
        <legend>Cenarios de Risco</legend>
        ${POSITION_CALC_PROFILES.map((profile) => `
          <label class="pos-calc__profile" data-profile-id="${profile.id}" data-active="${profile.id === persisted.profile}">
            <input type="radio" name="pos-calc-profile" value="${profile.id}" ${profile.id === persisted.profile ? "checked" : ""} />
            <span class="pos-calc__profile-icon" aria-hidden="true">${profile.id === "conservative" ? "🛡" : profile.id === "moderate" ? "📊" : "⚡"}</span>
            <strong>${escapeHtml(profile.label)}</strong>
            <small data-pos-profile-lot="${profile.id}">Insira capital</small>
            <small class="pos-calc__profile-risk">Risco: ${profile.riskMin}% - ${profile.riskMax}%</small>
          </label>
        `).join("")}
        <p class="pos-calc__profile-hint">Insira seu capital para ver o risco % calculado</p>
      </fieldset>

      <article class="pos-calc__scenarios-card">
        <header><h5>💲 Comparativo de Cenarios (USD)</h5></header>
        <div class="pos-calc__scenarios-table" role="table" aria-label="Comparativo de cenarios">
          <div class="pos-calc__row pos-calc__row--head" role="row">
            <span role="columnheader">Cenario</span>
            <span role="columnheader">Lotes</span>
            <span role="columnheader">Risco ($)</span>
            <span role="columnheader">Risco (%)</span>
            <span role="columnheader">TP1 Lucro</span>
          </div>
          ${POSITION_CALC_PROFILES.map((profile) => `
            <div class="pos-calc__row" role="row" data-pos-scenario-row="${profile.id}" data-active="${profile.id === persisted.profile}">
              <span role="cell">${escapeHtml(profile.label)}</span>
              <span role="cell" data-pos-scenario-lot="${profile.id}">—</span>
              <span role="cell" class="pos-calc__cell--bear" data-pos-scenario-risk="${profile.id}">—</span>
              <span role="cell" class="pos-calc__cell--bear" data-pos-scenario-risk-pct="${profile.id}">—</span>
              <span role="cell" class="pos-calc__cell--bull" data-pos-scenario-tp1="${profile.id}">—</span>
            </div>
          `).join("")}
        </div>
        <small class="pos-calc__scenarios-hint">Clique em uma linha para selecionar o cenario • Lote minimo: ${spec.lotMin.toFixed(lotDecimals)}</small>
      </article>

      <article class="pos-calc__sl-card">
        <header><h5>📉 Risco Maximo (Stop Loss)</h5></header>
        <div class="pos-calc__sl-grid">
          <div class="pos-calc__sl-cell">
            <small>Prejuizo Maximo</small>
            <strong data-pos-output="maxLoss">—</strong>
            <small data-pos-output="maxLossPct">—</small>
          </div>
          <div class="pos-calc__sl-cell">
            <small>Stop em</small>
            <strong data-pos-output="stopPrice">${escapeHtml(formatPrice(signal?.stopLoss, currency))}</strong>
            <small data-pos-output="stopPips">—</small>
          </div>
        </div>
        <div class="pos-calc__spread-row" data-pos-spread-row>
          <small>⚠ Custo do Spread <input type="number" min="0" step="0.1" data-pos-input="spreadPips" value="${persisted.spreadPips}" aria-label="Spread em ${spec.pipLabel}" /> ${escapeHtml(spec.pipLabel)}</small>
          <small>Custo estimado: <strong data-pos-output="spreadCost">—</strong></small>
        </div>
      </article>

      <article class="pos-calc__tp-card">
        <header><h5>📈 Potencial de Lucro (Take Profits)</h5></header>
        <div class="pos-calc__tp-grid">
          ${[1, 2, 3].map((idx) => `
            <div class="pos-calc__tp-row" data-pos-tp-row="${idx}">
              <header>
                <span class="pos-calc__tp-tag">TP ${idx}</span>
                <strong data-pos-output="tp${idx}Price">—</strong>
                <span class="pos-calc__tp-rr" data-pos-output="tp${idx}Rr">R:R —</span>
              </header>
              <div class="pos-calc__tp-cells">
                <div><small>Lucro Potencial</small><strong class="pos-calc__cell--bull" data-pos-output="tp${idx}Profit">—</strong></div>
                <div><small>Ganho %</small><strong class="pos-calc__cell--bull" data-pos-output="tp${idx}Gain">—</strong></div>
                <div><small>${escapeHtml(spec.pipLabel.charAt(0).toUpperCase() + spec.pipLabel.slice(1))}</small><strong class="pos-calc__cell--bull" data-pos-output="tp${idx}Pips">—</strong></div>
              </div>
            </div>
          `).join("")}
        </div>
      </article>

      <article class="pos-calc__summary-card">
        <header>
          <h5>✓ Resumo da Gestao</h5>
          <button type="button" class="pos-calc__copy-btn" data-pos-copy aria-label="Copiar plano para area de transferencia">📋 Copiar Plano</button>
        </header>
        <p data-pos-output="summary">Insira seu capital para gerar o resumo executivo da operacao.</p>
      </article>

      <article class="pos-calc__important-card">
        <header><h5>⚠ Importante</h5></header>
        <p>Os calculos consideram as especificacoes padrao do ativo ${escapeHtml(spec.label)} (${escapeHtml(specDescription)}) Verifique as condicoes do seu broker pois os spreads aumentam em periodos de alta volatilidade.</p>
      </article>
    </section>
  `;
}

function attachPositionCalculatorHandlers(rootElement, { analysis, snapshot, currency, assetId }) {
  if (!(rootElement instanceof HTMLElement)) return;
  const container = rootElement.querySelector("[data-position-calculator]");
  if (!(container instanceof HTMLElement)) return;
  const spec = classifyPositionAssetSpec(assetId, currency);
  const lotDecimals = getPositionLotDecimals(spec);
  let debounceHandle = null;

  function readState() {
    const capitalEl = container.querySelector('[data-pos-input="capital"]');
    const spreadEl = container.querySelector('[data-pos-input="spreadPips"]');
    const profileEl = container.querySelector('input[name="pos-calc-profile"]:checked');
    return {
      capital: capitalEl instanceof HTMLInputElement ? Number(capitalEl.value) : 0,
      spreadPips: spreadEl instanceof HTMLInputElement ? Number(spreadEl.value) : spec.defaultSpreadPips,
      profile: profileEl instanceof HTMLInputElement ? profileEl.value : "moderate",
    };
  }

  function applyResult(state, result) {
    const setText = (selector, value) => {
      const el = container.querySelector(selector);
      if (el) el.textContent = value;
    };
    // Profile cards (lot estimado por perfil)
    POSITION_CALC_PROFILES.forEach((profile) => {
      const card = container.querySelector(`[data-profile-id="${profile.id}"]`);
      if (card instanceof HTMLElement) card.dataset.active = profile.id === state.profile ? "true" : "false";
      const row = container.querySelector(`[data-pos-scenario-row="${profile.id}"]`);
      if (row instanceof HTMLElement) row.dataset.active = profile.id === state.profile ? "true" : "false";
      const scen = result.ready ? result.scenarios.find((s) => s.id === profile.id) : null;
      const lotText = scen ? `$${result.capital >= 1 ? Math.round(scen.risk).toLocaleString("pt-BR") : "0"} / ${scen.lot.toFixed(lotDecimals)} ${spec.unitLabel}` : "Insira capital";
      setText(`[data-pos-profile-lot="${profile.id}"]`, lotText);
      setText(`[data-pos-scenario-lot="${profile.id}"]`, scen ? scen.lot.toFixed(lotDecimals) : "—");
      setText(`[data-pos-scenario-risk="${profile.id}"]`, scen ? `$${scen.risk.toFixed(2)}` : "—");
      setText(`[data-pos-scenario-risk-pct="${profile.id}"]`, scen ? `${scen.riskPct.toFixed(2)}%` : "—");
      setText(`[data-pos-scenario-tp1="${profile.id}"]`, scen ? `+$${scen.tp1Profit.toFixed(2)}` : "—");
    });

    const warningEl = container.querySelector("[data-pos-margin-warning]");
    if (warningEl instanceof HTMLElement) {
      if (result.ready && result.exceedsRisk) {
        warningEl.hidden = false;
        warningEl.dataset.tone = "warning";
        warningEl.innerHTML = `⚠ <strong>Atencao ao Tamanho da Posicao</strong>: O lote minimo (${spec.lotMin}) gera risco de <strong>$${result.actualRisk.toFixed(2)} (${result.actualRiskPct.toFixed(1)}%)</strong>, acima do alvo de ${result.riskPct}%. Considere aumentar capital ou usar timeframes maiores.`;
      } else if (result.ready && result.actualRiskPct > 10) {
        warningEl.hidden = false;
        warningEl.dataset.tone = "danger";
        warningEl.innerHTML = `🚨 <strong>Risco excede 10% do capital</strong>: $${result.actualRisk.toFixed(2)} (${result.actualRiskPct.toFixed(1)}%). Operacao matematicamente perigosa.`;
      } else {
        warningEl.hidden = true;
      }
    }

    if (!result.ready) {
      setText('[data-pos-output="maxLoss"]', "—");
      setText('[data-pos-output="maxLossPct"]', "—");
      setText('[data-pos-output="stopPips"]', "—");
      setText('[data-pos-output="spreadCost"]', "—");
      setText('[data-pos-output="summary"]', "Insira seu capital para gerar o resumo executivo da operacao.");
      [1, 2, 3].forEach((idx) => {
        setText(`[data-pos-output="tp${idx}Profit"]`, "—");
        setText(`[data-pos-output="tp${idx}Gain"]`, "—");
        setText(`[data-pos-output="tp${idx}Pips"]`, "—");
        setText(`[data-pos-output="tp${idx}Rr"]`, "R:R —");
      });
      return;
    }

    setText('[data-pos-output="maxLoss"]', `$${result.actualRisk.toFixed(2)}`);
    setText('[data-pos-output="maxLossPct"]', `${result.actualRiskPct.toFixed(2)}% do capital`);
    setText('[data-pos-output="stopPips"]', formatPositionDistance(result, spec));
    setText('[data-pos-output="spreadCost"]', `$${result.spreadCost.toFixed(2)}`);

    [1, 2, 3].forEach((idx) => {
      const tp = result.tps[idx - 1];
      if (!tp) {
        setText(`[data-pos-output="tp${idx}Profit"]`, "—");
        setText(`[data-pos-output="tp${idx}Gain"]`, "—");
        setText(`[data-pos-output="tp${idx}Pips"]`, "—");
        setText(`[data-pos-output="tp${idx}Rr"]`, "R:R —");
        return;
      }
      setText(`[data-pos-output="tp${idx}Price"]`, formatPrice(tp.price, currency));
      setText(`[data-pos-output="tp${idx}Profit"]`, `+$${tp.profit.toFixed(2)}`);
      setText(`[data-pos-output="tp${idx}Gain"]`, `+${tp.gainPct.toFixed(2)}%`);
      setText(`[data-pos-output="tp${idx}Pips"]`, formatPositionTpDistance(tp, spec));
      setText(`[data-pos-output="tp${idx}Rr"]`, `R:R 1:${tp.riskReward.toFixed(1)}`);
    });

    const profileLabel = POSITION_CALC_PROFILES.find((p) => p.id === state.profile)?.label ?? "Moderado";
    const tp1 = result.tps[0];
    const summary = `Com um capital de <strong>$${result.capital.toFixed(2)}</strong> e perfil <strong>${profileLabel.toLowerCase()}</strong>, voce pode arriscar no maximo <strong class="pos-calc__cell--bear">$${result.actualRisk.toFixed(2)}</strong> nesta operacao usando <strong>${result.recommendedLot.toFixed(lotDecimals)} ${spec.unitLabel}</strong>.${tp1 ? ` Se atingir a TP1, seu lucro sera de <strong class="pos-calc__cell--bull">+$${tp1.profit.toFixed(2)} (${tp1.gainPct.toFixed(2)}% do capital)</strong>.` : ""}`;
    const summaryEl = container.querySelector('[data-pos-output="summary"]');
    if (summaryEl instanceof HTMLElement) summaryEl.innerHTML = summary;
  }

  function recompute() {
    const state = readState();
    persistPositionCalcState(state);
    const profileMeta = POSITION_CALC_PROFILES.find((p) => p.id === state.profile) ?? POSITION_CALC_PROFILES[1];
    const result = computePositionCalc({
      capital: state.capital,
      riskPct: profileMeta.default,
      signal: analysis?.signal ?? {},
      spec,
      spreadPips: state.spreadPips,
    });
    applyResult(state, result);
  }

  container.addEventListener("input", () => {
    if (debounceHandle !== null) window.clearTimeout(debounceHandle);
    debounceHandle = window.setTimeout(recompute, 150);
  });
  container.addEventListener("change", recompute);

  // Click em linha do comparativo seleciona o perfil
  container.querySelectorAll("[data-pos-scenario-row]").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.getAttribute("data-pos-scenario-row");
      if (!id) return;
      const radio = container.querySelector(`input[name="pos-calc-profile"][value="${id}"]`);
      if (radio instanceof HTMLInputElement) {
        radio.checked = true;
        recompute();
      }
    });
  });

  // Copiar plano
  const copyBtn = container.querySelector("[data-pos-copy]");
  if (copyBtn instanceof HTMLButtonElement) {
    copyBtn.addEventListener("click", async () => {
      const summary = container.querySelector('[data-pos-output="summary"]')?.textContent ?? "";
      const lot = container.querySelector('[data-pos-output="maxLoss"]')?.textContent ?? "";
      const tp1 = container.querySelector('[data-pos-output="tp1Profit"]')?.textContent ?? "";
      const tp2 = container.querySelector('[data-pos-output="tp2Profit"]')?.textContent ?? "";
      const tp3 = container.querySelector('[data-pos-output="tp3Profit"]')?.textContent ?? "";
      const text = `${spec.label} • ${analysis?.signal?.action ?? "—"}\nEntrada: ${formatPrice(analysis?.signal?.entryLow, currency)} | Stop: ${formatPrice(analysis?.signal?.stopLoss, currency)}\nRisco: ${lot} | TP1: ${tp1} | TP2: ${tp2} | TP3: ${tp3}\n${summary.replace(/<[^>]+>/g, "")}`;
      try {
        await navigator.clipboard.writeText(text);
        const original = copyBtn.textContent;
        copyBtn.textContent = "✓ Copiado";
        window.setTimeout(() => { copyBtn.textContent = original; }, 1800);
      } catch (_error) { /* noop */ }
    });
  }

  recompute();
}

function renderRiskLab({ mode, currency, defaults, reference }) {
  const persisted = loadRiskLabState(defaults);
  const strategyOptions = RISK_LAB_STRATEGY_OPTIONS.map((opt) =>
    `<option value="${opt.id}" ${opt.id === persisted.strategy ? "selected" : ""}>${escapeHtml(opt.label)}</option>`,
  ).join("");
  const isBinary = mode === "binary";
  const payoutLabel = isBinary ? "Payout (%)" : "Relacao Risco/Retorno (ex: 3 = 1:3)";
  const payoutMin = isBinary ? 10 : 0.5;
  const payoutMax = isBinary ? 99 : 20;
  const payoutStep = isBinary ? 0.5 : 0.1;
  const referenceBlock = reference
    ? `<article class="analysis-block">
        <h4>Referencia do sinal atual</h4>
        <p>Capital de referencia: ${escapeHtml(formatPrice(reference.capitalRef, "usd"))}</p>
        <p>Risco padrao 1%: ${escapeHtml(formatPrice(reference.riskBudget, "usd"))}</p>
        <p>Distancia ao stop: ${escapeHtml(formatPercent(reference.stopDistancePercent))}</p>
        <p>Notional sugerido: ${escapeHtml(formatPrice(reference.suggestedNotional, "usd"))}</p>
        <p>Entrada: ${escapeHtml(formatPrice(reference.signal.entryLow, currency))} - ${escapeHtml(formatPrice(reference.signal.entryHigh, currency))}</p>
        <p>Stop: ${escapeHtml(formatPrice(reference.signal.stopLoss, currency))} • TP1/TP2: ${escapeHtml(formatPrice(reference.signal.takeProfit1, currency))} / ${escapeHtml(formatPrice(reference.signal.takeProfit2, currency))}</p>
      </article>`
    : "";
  return `
    <div class="risk-lab" data-risk-lab data-mode="${escapeHtml(mode)}">
      <header class="risk-lab__header">
        <h4>Risk Lab — Gestao de Capital Quantitativa</h4>
        <small>Monte Carlo client-side (2000 trajetorias × 100 trades). Inputs persistidos em localStorage.</small>
      </header>
      <form class="risk-lab__form" data-risk-lab-form>
        <label class="prop-desk-field">
          Capital atual (banca, USD)
          <input type="number" min="10" step="10" data-risk-input="capital" value="${persisted.capital}" />
        </label>
        <label class="prop-desk-field">
          Risco por operacao (%)
          <input type="number" min="0.1" max="25" step="0.1" data-risk-input="riskPct" value="${persisted.riskPct}" />
        </label>
        <label class="prop-desk-field">
          ${escapeHtml(payoutLabel)}
          <input type="number" min="${payoutMin}" max="${payoutMax}" step="${payoutStep}" data-risk-input="payoutOrRR" value="${persisted.payoutOrRR}" />
        </label>
        <label class="prop-desk-field">
          Win rate observado (%)
          <input type="number" min="5" max="95" step="0.5" data-risk-input="winRatePct" value="${persisted.winRatePct}" />
        </label>
        <label class="prop-desk-field">
          Estrategia de stake
          <select data-risk-input="strategy">${strategyOptions}</select>
        </label>
      </form>
      <div class="risk-lab__warning" data-risk-lab-warning role="status" aria-live="polite"></div>
      <div class="risk-lab__ruin" data-risk-lab-ruin>
        <span class="risk-lab__ruin-label">Medidor de risco de ruina</span>
        <div class="risk-lab__ruin-bar"><div class="risk-lab__ruin-fill" data-risk-lab-ruin-fill style="width:0%"></div></div>
        <span class="risk-lab__ruin-pct" data-risk-lab-ruin-pct>—</span>
      </div>
      <div class="risk-lab__scenarios" data-risk-lab-scenarios></div>
      <div class="analysis-grid">
        <article class="analysis-block">
          <h4>Estrategia selecionada</h4>
          <p data-risk-lab-strategy-desc>${escapeHtml(RISK_LAB_STRATEGY_OPTIONS.find((opt) => opt.id === persisted.strategy)?.description ?? "")}</p>
          <p><strong>Regra de ouro:</strong> nenhum sistema legitima Martingale ilimitado. Recuperacao com Limite tem teto fisico de 4x base.</p>
        </article>
        ${referenceBlock}
      </div>
    </div>
  `;
}

function attachRiskLabHandlers(rootElement, { mode, currency }) {
  if (!(rootElement instanceof HTMLElement)) return;
  const container = rootElement.querySelector("[data-risk-lab]");
  if (!(container instanceof HTMLElement)) return;
  const form = container.querySelector("[data-risk-lab-form]");
  const warningEl = container.querySelector("[data-risk-lab-warning]");
  const ruinFill = container.querySelector("[data-risk-lab-ruin-fill]");
  const ruinPctEl = container.querySelector("[data-risk-lab-ruin-pct]");
  const scenariosEl = container.querySelector("[data-risk-lab-scenarios]");
  const strategyDesc = container.querySelector("[data-risk-lab-strategy-desc]");
  let debounceHandle = null;

  function readState() {
    const inputs = container.querySelectorAll("[data-risk-input]");
    const state = { strategy: "fixed", capital: 0, riskPct: 1, payoutOrRR: 1, winRatePct: 50 };
    inputs.forEach((input) => {
      const key = input.getAttribute("data-risk-input");
      if (!key) return;
      if (input.tagName === "SELECT") {
        state[key] = input.value;
      } else {
        const num = Number(input.value);
        state[key] = Number.isFinite(num) ? num : 0;
      }
    });
    return state;
  }

  function recompute() {
    const state = readState();
    persistRiskLabState(state);
    const sim = runMonteCarloRiskSimulation({ ...state, mode });
    const ruinClass = classifyRiskLabRuinTone(sim.ruinPct, state.riskPct);
    if (warningEl instanceof HTMLElement) {
      warningEl.dataset.tone = ruinClass.tone;
      warningEl.textContent = ruinClass.tone === "danger"
        ? `${ruinClass.label}. Reduza o risco abaixo de 2% para preservar a banca.`
        : ruinClass.tone === "warning"
          ? `${ruinClass.label}. Mantenha disciplina de stop e nao escale apos sequencia de loss.`
          : ruinClass.label;
    }
    if (ruinFill instanceof HTMLElement) {
      ruinFill.style.width = `${Math.min(100, sim.ruinPct).toFixed(1)}%`;
      ruinFill.dataset.tone = ruinClass.tone;
    }
    if (ruinPctEl instanceof HTMLElement) {
      ruinPctEl.textContent = `${sim.ruinPct.toFixed(1)}% das simulacoes terminaram em rebaixamento >50%`;
    }
    if (scenariosEl instanceof HTMLElement) {
      const cards = [
        { tone: "ok", title: "Cenario otimista (P90)", value: sim.p90, hint: "10% das trajetorias terminam acima deste equity." },
        { tone: "neutral", title: "Cenario neutro (P50, mediana)", value: sim.p50, hint: "Resultado tipico apos 100 trades." },
        { tone: "danger", title: "Cenario de rebaixamento (P10)", value: sim.p10, hint: `Drawdown medio simulado: ${sim.avgMaxDrawdownPct.toFixed(1)}%.` },
      ];
      scenariosEl.innerHTML = cards.map((card) => `
        <article class="risk-lab__scenario" data-tone="${card.tone}">
          <span class="risk-lab__scenario-title">${escapeHtml(card.title)}</span>
          <strong class="risk-lab__scenario-value">${escapeHtml(formatPrice(card.value, "usd"))}</strong>
          <small class="risk-lab__scenario-hint">${escapeHtml(card.hint)}</small>
        </article>
      `).join("");
    }
    if (strategyDesc instanceof HTMLElement) {
      const desc = RISK_LAB_STRATEGY_OPTIONS.find((opt) => opt.id === state.strategy)?.description ?? "";
      strategyDesc.textContent = desc;
    }
  }

  if (form instanceof HTMLElement) {
    form.addEventListener("input", () => {
      if (debounceHandle !== null) {
        window.clearTimeout(debounceHandle);
      }
      debounceHandle = window.setTimeout(recompute, 200);
    });
    form.addEventListener("change", recompute);
  }
  recompute();
  return { recompute, currency };
}

// ============================================================================
// ADR-078 — Hub de Inteligencia Fundamentalista (refator da aba Noticias)
// Camada de apresentacao 100% derivada: agrega dados ja existentes do
// crypto-news-intelligence-service (items, summary) + institutional.macroRadar
// (upcomingEvents). Zero chamadas externas adicionais. Fail-honest em todos
// os blocos: se nao ha dado, exibe estado vazio explicativo (nao mocka).
// ============================================================================

const FUNDI_HUB_TAB_STORAGE_KEY = "fundi-hub:tab:v1";
const FUNDI_HUB_PULSE_WINDOW_MIN = 30;

function getFundiHubPersistedTab() {
  try {
    const raw = window.localStorage?.getItem(FUNDI_HUB_TAB_STORAGE_KEY);
    if (raw === "news" || raw === "events") return raw;
  } catch {
    /* localStorage indisponivel: fallback silencioso */
  }
  return "news";
}

function setFundiHubPersistedTab(tab) {
  try {
    window.localStorage?.setItem(FUNDI_HUB_TAB_STORAGE_KEY, tab);
  } catch {
    /* quota/private mode: ignora */
  }
}

function computeFundiHubSentiment(items) {
  let positive = 0, negative = 0, neutral = 0;
  for (const it of items) {
    if (it?.sentiment === "positive") positive += 1;
    else if (it?.sentiment === "negative") negative += 1;
    else neutral += 1;
  }
  const total = positive + negative + neutral;
  if (total === 0) {
    return { score: 50, label: "Sem dados", tone: "neutral", positive: 0, negative: 0, neutral: 0 };
  }
  // Score 0-100 onde 0 = totalmente bearish, 100 = totalmente bullish.
  const score = Math.round(((positive - negative) / total + 1) * 50);
  let label = "Neutro";
  let tone = "neutral";
  if (score >= 65) { label = "Bullish"; tone = "bull"; }
  else if (score >= 55) { label = "Levemente Bullish"; tone = "bull-soft"; }
  else if (score <= 35) { label = "Bearish"; tone = "bear"; }
  else if (score <= 45) { label = "Levemente Bearish"; tone = "bear-soft"; }
  return { score, label, tone, positive, negative, neutral };
}

function computeFundiHubKeywords(items, limit = 10) {
  const counts = new Map();
  for (const it of items) {
    if (!Array.isArray(it?.tags)) continue;
    for (const tagRaw of it.tags) {
      if (typeof tagRaw !== "string") continue;
      const tag = tagRaw.trim().toLowerCase();
      if (tag.length < 2 || tag.length > 24) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

function classifyFundiHubImpact(value) {
  // Aceita string ("high"/"medium"/"low") ou numero (impactScore 0-10).
  if (typeof value === "string") {
    const v = value.toLowerCase();
    if (v === "high" || v === "alto") return { key: "high", label: "Alto Impacto" };
    if (v === "medium" || v === "moderate" || v === "medio" || v === "moderado") return { key: "medium", label: "Medio Impacto" };
    return { key: "low", label: "Baixo Impacto" };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 7) return { key: "high", label: "Alto Impacto" };
    if (value >= 4) return { key: "medium", label: "Medio Impacto" };
    return { key: "low", label: "Baixo Impacto" };
  }
  return { key: "low", label: "Baixo Impacto" };
}

function renderFundiHubNewsCard(item) {
  const impact = classifyFundiHubImpact(Number(item.impactScore));
  const sentimentTone = item.sentiment === "positive" ? "bull"
    : item.sentiment === "negative" ? "bear"
    : "neutral";
  const sourceInitial = (item.source ?? "?").trim().charAt(0).toUpperCase();
  const tagsHtml = Array.isArray(item.tags) && item.tags.length > 0
    ? `<div class="fundi-hub-news-tags">${item.tags.slice(0, 4).map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>`
    : "";
  return `
    <article class="fundi-hub-news-card" data-impact="${impact.key}" data-sentiment="${sentimentTone}">
      <div class="fundi-hub-news-avatar" aria-hidden="true">${escapeHtml(sourceInitial)}</div>
      <div class="fundi-hub-news-body">
        <header class="fundi-hub-news-header">
          <strong class="fundi-hub-news-title">${escapeHtml(item.title)}</strong>
          <a class="fundi-hub-news-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir fonte">↗</a>
        </header>
        <p class="fundi-hub-news-summary">${escapeHtml(item.summary)}</p>
        <footer class="fundi-hub-news-meta">
          <span class="fundi-hub-news-source">${escapeHtml(item.source)}</span>
          <span class="fundi-hub-news-time">${escapeHtml(formatShortTime(item.publishedAt))}</span>
          <span class="fundi-hub-impact-badge" data-impact="${impact.key}">${impact.label}</span>
        </footer>
        ${tagsHtml}
      </div>
    </article>
  `;
}

function renderFundiHubEventRow(eventItem) {
  const name = typeof eventItem?.name === "string" ? eventItem.name : "Evento macro";
  const impact = classifyFundiHubImpact(typeof eventItem?.impact === "string" ? eventItem.impact : 0);
  const hours = typeof eventItem?.hoursToEvent === "number" && Number.isFinite(eventItem.hoursToEvent)
    ? eventItem.hoursToEvent
    : null;
  const isImminent = hours !== null && hours >= 0 && hours * 60 <= FUNDI_HUB_PULSE_WINDOW_MIN;
  const whenLabel = hours === null
    ? "n/d"
    : hours < 1
      ? `em ${Math.max(0, Math.round(hours * 60))} min`
      : hours < 24
        ? `em ${hours.toFixed(0)}h`
        : `em ${(hours / 24).toFixed(1)}d`;
  const currency = typeof eventItem?.currency === "string" ? eventItem.currency : "";
  const frequency = typeof eventItem?.frequency === "string" ? eventItem.frequency : "";
  return `
    <article class="fundi-hub-event-row${isImminent ? " is-imminent" : ""}" data-impact="${impact.key}">
      <div class="fundi-hub-event-icon" aria-hidden="true">📅</div>
      <div class="fundi-hub-event-info">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(currency || frequency || "Macro global")}</span>
      </div>
      <span class="fundi-hub-event-when">${escapeHtml(whenLabel)}</span>
      <span class="fundi-hub-impact-badge" data-impact="${impact.key}">${impact.label}</span>
    </article>
  `;
}

function renderFundamentalistHubHtml({ payload, snapshot, analysis, currency: _currency }) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const summary = payload?.summary ?? {};
  const updatedAt = payload?.fetchedAt ? formatShortTime(payload.fetchedAt) : "n/d";
  const sentiment = computeFundiHubSentiment(items);
  const keywords = computeFundiHubKeywords(items);
  const macroRadar = snapshot?.institutional?.macroRadar ?? null;
  const upcomingEvents = Array.isArray(macroRadar?.upcomingEvents) ? macroRadar.upcomingEvents : [];
  const radarAlertLevel = typeof macroRadar?.alertLevel === "string" ? macroRadar.alertLevel : "green";
  const radarMessage = typeof macroRadar?.message === "string"
    ? macroRadar.message
    : "Sem risco macro critico identificado para a janela atual.";
  const radarBlock = macroRadar?.blockDirectionalRisk === true;
  const aiNarrativeRaw = typeof analysis?.summary === "string" && analysis.summary.length > 0
    ? analysis.summary
    : `Score de confluencia ${Number(analysis?.compositeScore ?? 0).toFixed(1)}/100 com ${String(analysis?.signal?.title ?? "leitura neutra").toLowerCase()}. Sentimento agregado de ${items.length} noticias indica leitura ${sentiment.label.toLowerCase()}.`;
  const initialTab = getFundiHubPersistedTab();

  const newsHtml = items.length > 0
    ? items.slice(0, 12).map(renderFundiHubNewsCard).join("")
    : `<p class="fundi-hub-empty">Sem noticias agregadas para o ativo no momento. As fontes RSS sao multi-provider e podem demorar segundos para preencher apos a primeira analise.</p>`;

  const eventsHtml = upcomingEvents.length > 0
    ? upcomingEvents.map(renderFundiHubEventRow).join("")
    : `<p class="fundi-hub-empty">Sem eventos macro relevantes na janela atual. O Timing Desk (aba Timing) detalha sessoes e killzones em paralelo.</p>`;

  const keywordsHtml = keywords.length > 0
    ? keywords.map((k) => `<span class="fundi-hub-keyword-chip" title="${k.count} ocorrencia(s)">${escapeHtml(k.tag)}</span>`).join("")
    : `<span class="fundi-hub-keyword-chip is-empty">Sem keywords agregadas</span>`;

  return `
    <section class="fundi-hub" data-active-tab="${initialTab}">
      <article class="fundi-hub-card fundi-hub-sentiment-card">
        <header class="fundi-hub-card-header">
          <div>
            <h4>Sentimento de Mercado (AI)</h4>
            <span class="fundi-hub-card-subtitle">Powered by news aggregation • atualizado ${escapeHtml(updatedAt)}</span>
          </div>
          <button type="button" class="fundi-hub-refresh-btn" data-fundi-hub-refresh aria-label="Atualizar feed fundamentalista">↻</button>
        </header>
        <div class="fundi-hub-sentiment-body">
          <div class="fundi-hub-sentiment-score" data-tone="${sentiment.tone}">
            <strong>${sentiment.score}</strong>
            <span>${escapeHtml(sentiment.label)}</span>
          </div>
          <div class="fundi-hub-sentiment-bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${sentiment.score}" aria-label="Sentimento de mercado: ${escapeHtml(sentiment.label)}">
            <div class="fundi-hub-sentiment-bar-track">
              <div class="fundi-hub-sentiment-bar-fill" style="width: ${sentiment.score}%"></div>
              <div class="fundi-hub-sentiment-bar-marker" style="left: ${sentiment.score}%"></div>
            </div>
            <div class="fundi-hub-sentiment-legend">
              <span>Bearish</span><span>Neutro</span><span>Bullish</span>
            </div>
          </div>
        </div>
        <div class="fundi-hub-keywords">
          <span class="fundi-hub-keywords-label">Palavras-chave monitoradas</span>
          <div class="fundi-hub-keywords-list">${keywordsHtml}</div>
        </div>
        <details class="fundi-hub-narrative" ${items.length > 0 ? "" : "open"}>
          <summary>
            <span class="fundi-hub-narrative-icon" aria-hidden="true">🌐</span>
            Analise Macro Sintetica
          </summary>
          <p>${escapeHtml(aiNarrativeRaw)}</p>
          <p class="fundi-hub-narrative-meta">Cobertura: ${summary.sourcesHealthy ?? 0}/${summary.totalSources ?? 0} fontes • impacto medio ${(summary.averageImpactScore ?? 0).toFixed(1)} • relevancia media ${(summary.averageRelevanceScore ?? 0).toFixed(1)} • ${items.length} item(s) agregados</p>
        </details>
      </article>

      <article class="fundi-hub-card fundi-hub-radar-card" data-alert="${escapeHtml(radarAlertLevel)}">
        <header class="fundi-hub-card-header">
          <h4>Radar Macro Institucional</h4>
          <span class="fundi-hub-radar-pill" data-alert="${escapeHtml(radarAlertLevel)}">${escapeHtml(radarAlertLevel.toUpperCase())}</span>
        </header>
        <p class="fundi-hub-radar-message">${escapeHtml(radarMessage)}</p>
        <div class="fundi-hub-radar-flags">
          <span class="fundi-hub-radar-flag" data-on="${radarBlock}">Bloqueio direcional: ${radarBlock ? "ATIVO" : "inativo"}</span>
          <span class="fundi-hub-radar-flag">Refugio: ${escapeHtml(typeof macroRadar?.safeHavenBias === "string" ? macroRadar.safeHavenBias : "neutral")}</span>
        </div>
      </article>

      <article class="fundi-hub-card fundi-hub-feed-card">
        <nav class="fundi-hub-tabs" role="tablist" aria-label="Hub de inteligencia fundamentalista">
          <button type="button" class="fundi-hub-tab" role="tab" data-fundi-hub-tab="news" aria-selected="${initialTab === "news"}" tabindex="${initialTab === "news" ? 0 : -1}">
            <span aria-hidden="true">📰</span> Noticias <span class="fundi-hub-tab-count">(${items.length})</span>
          </button>
          <button type="button" class="fundi-hub-tab" role="tab" data-fundi-hub-tab="events" aria-selected="${initialTab === "events"}" tabindex="${initialTab === "events" ? 0 : -1}">
            <span aria-hidden="true">📅</span> Eventos Economicos <span class="fundi-hub-tab-count">(${upcomingEvents.length})</span>
          </button>
        </nav>
        <div class="fundi-hub-panel" role="tabpanel" data-fundi-hub-panel="news" ${initialTab === "news" ? "" : "hidden"}>
          <div class="fundi-hub-news-list">${newsHtml}</div>
        </div>
        <div class="fundi-hub-panel" role="tabpanel" data-fundi-hub-panel="events" ${initialTab === "events" ? "" : "hidden"}>
          <div class="fundi-hub-events-list">${eventsHtml}</div>
        </div>
      </article>
    </section>
  `;
}

function attachFundamentalistHubHandlers(rootElement) {
  if (!(rootElement instanceof HTMLElement)) return;
  const hub = rootElement.querySelector(".fundi-hub");
  if (!(hub instanceof HTMLElement)) return;

  hub.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const tabBtn = target.closest("[data-fundi-hub-tab]");
    if (tabBtn instanceof HTMLElement) {
      const tab = tabBtn.getAttribute("data-fundi-hub-tab");
      if (tab !== "news" && tab !== "events") return;
      hub.setAttribute("data-active-tab", tab);
      const tabs = hub.querySelectorAll("[data-fundi-hub-tab]");
      tabs.forEach((el) => {
        const isActive = el.getAttribute("data-fundi-hub-tab") === tab;
        el.setAttribute("aria-selected", String(isActive));
        el.setAttribute("tabindex", isActive ? "0" : "-1");
      });
      const panels = hub.querySelectorAll("[data-fundi-hub-panel]");
      panels.forEach((p) => {
        if (p.getAttribute("data-fundi-hub-panel") === tab) p.removeAttribute("hidden");
        else p.setAttribute("hidden", "");
      });
      setFundiHubPersistedTab(tab);
      return;
    }

    const refreshBtn = target.closest("[data-fundi-hub-refresh]");
    if (refreshBtn instanceof HTMLElement) {
      refreshBtn.classList.add("is-spinning");
      // Reusa pipeline existente: ao trocar/atualizar contexto, o ciclo
      // de news intelligence eh disparado pelo orquestrador principal.
      try {
        if (typeof syncIntelligenceDeskForCurrentContext === "function") {
          syncIntelligenceDeskForCurrentContext({ force: true });
        }
      } catch {
        /* noop: fail silently */
      }
      window.setTimeout(() => refreshBtn.classList.remove("is-spinning"), 600);
    }
  });
}

function renderAnalysisTabContent(analysis, snapshot, options = {}) {
  if (!(analysisTabContentElement instanceof HTMLElement)) {
    return;
  }

  ensureActiveAnalysisTabForOperationalMode(chartLabState.operationalMode);

  const currency = snapshot?.currency ?? "usd";
  const isBinaryMode = isBinaryOptionsOperationalMode();

  if (activeAnalysisTabId === "gestao_risco") {
    analysisTabContentElement.innerHTML = "";

    if (isBinaryMode) {
      if (riskManagementTabPanel instanceof HTMLElement) {
        riskManagementTabPanel.classList.add("is-hidden");
        riskManagementTabPanel.setAttribute("aria-hidden", "true");
      }

      analysisTabContentElement.innerHTML = `
        <div class="analysis-grid">
          <article class="analysis-block">
            <h4>Gestao de Risco Binaria</h4>
            <p>Configure banca, payout e stake para controlar exposicao por ciclo de expiracao.</p>
            <div class="analysis-binary-input-grid">
              <label class="prop-desk-field" for="binary-bankroll-risk-input">
                Banca inicial (USD)
                <input id="binary-bankroll-risk-input" data-binary-risk-input="bankroll" type="number" min="10" step="10" />
              </label>
              <label class="prop-desk-field" for="binary-payout-risk-input">
                Payout atual (%)
                <input id="binary-payout-risk-input" data-binary-risk-input="payoutPercent" type="number" min="10" max="99" step="0.1" />
              </label>
              <label class="prop-desk-field" for="binary-stake-risk-input">
                Valor da entrada (stake)
                <input id="binary-stake-risk-input" data-binary-risk-input="stake" type="number" min="1" step="1" />
              </label>
            </div>
          </article>
          <article class="analysis-block">
            <h4>Saida projetada por expiracao</h4>
            <div class="analysis-binary-kpi-grid">
              <article class="analysis-binary-kpi">
                <span>Lucro projetado (win)</span>
                <strong data-binary-risk-output="projectedProfit">--</strong>
              </article>
              <article class="analysis-binary-kpi">
                <span>Saldo apos win</span>
                <strong data-binary-risk-output="balanceWin">--</strong>
              </article>
              <article class="analysis-binary-kpi">
                <span>Saldo apos loss</span>
                <strong data-binary-risk-output="balanceLoss">--</strong>
              </article>
              <article class="analysis-binary-kpi">
                <span>Stake / banca</span>
                <strong data-binary-risk-output="stakePercent">--</strong>
              </article>
              <article class="analysis-binary-kpi">
                <span>Payout monitorado</span>
                <strong data-binary-risk-output="payoutPercent">--</strong>
              </article>
              <article class="analysis-binary-kpi">
                <span>Stake sugerida (2%)</span>
                <strong data-binary-risk-output="suggestedStake">--</strong>
              </article>
            </div>
            <p>Mantenha stake sob controle para evitar erosao de banca em sequencias negativas.</p>
          </article>
        </div>
      `;

      syncBinaryOptionsRiskPanel(analysisTabContentElement);
      return;
    }

    if (riskManagementTabPanel instanceof HTMLElement) {
      riskManagementTabPanel.classList.remove("is-hidden");
      riskManagementTabPanel.removeAttribute("aria-hidden");
      analysisTabContentElement.append(riskManagementTabPanel);
      setupPropDesk();
      renderPropDesk();
    } else {
      analysisTabContentElement.innerHTML = `
        <article class="analysis-block">
          <h4>Gestao de risco</h4>
          <p>Painel de gestao de risco indisponivel no momento.</p>
        </article>
      `;
    }

    return;
  }

  if (riskManagementTabPanel instanceof HTMLElement) {
    riskManagementTabPanel.classList.add("is-hidden");
    riskManagementTabPanel.setAttribute("aria-hidden", "true");
  }

  if (activeAnalysisTabId === "resumo") {
    const baseResumoHtml = `
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

    if (!isBinaryMode && isSpotMarginOperationalMode()) {
      const spotGhostStats = getBinaryOptionsGhostTrackerStats(spotMarginGhostTrackerState);
      const spotTriggerHeat = resolveSpotMarginTriggerHeat({
        buyProbability: analysis.buyProbability,
        confidenceScore: toFiniteNumber(analysis.signal?.confidence, 0),
        neutralProbability: analysis.neutralProbability,
        sellProbability: analysis.sellProbability,
        volatilityPercent: toFiniteNumber(snapshot?.insights?.volatilityPercent, 0),
      });
      const spotSummaryLabel = spotGhostStats.pushes > 0
        ? `${spotGhostStats.wins}W - ${spotGhostStats.losses}L - ${spotGhostStats.pushes}D`
        : `${spotGhostStats.wins}W - ${spotGhostStats.losses}L`;
      const ghostBackendStats = getBinaryOptionsGhostBackendStats();
      const ghostBackendViewMode = normalizeBinaryOptionsGhostAuditViewMode(binaryOptionsGhostAuditViewMode);
      const isSessionBackendView = ghostBackendViewMode === BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_SESSION;
      const ghostBackendSummaryLabel = ghostBackendStats.hasSnapshot
        ? ghostBackendStats.pushes > 0
          ? `${ghostBackendStats.wins}W - ${ghostBackendStats.losses}L - ${ghostBackendStats.pushes}D`
          : `${ghostBackendStats.wins}W - ${ghostBackendStats.losses}L`
        : ghostBackendStats.inFlight
          ? "SYNC"
          : "SEM DADOS";
      const ghostBackendTitle = isSessionBackendView
        ? "Ghost Persistido Spot/Margem (Sessao Atual)"
        : "Ghost Institucional Spot/Margem";
      const ghostBackendState = !ghostBackendStats.enabled
        ? "cold"
        : ghostBackendStats.winRate >= 56
          ? "hot"
          : ghostBackendStats.winRate >= 46
            ? "warm"
            : "cold";
      const ghostBackendStatusMessage = buildBinaryOptionsGhostBackendStatusMessage(ghostBackendStats);
      const ghostBackendScopeMessage = isSessionBackendView
        ? "Escopo: filtros por sessionId ativo + assetId atual."
        : "Escopo: agregacao Spot/Margem por assetId na base persistida.";
      const ghostBackendUpdatedLabel = ghostBackendStats.fetchedAtMs > 0
        ? `Atualizado ${formatShortTime(new Date(ghostBackendStats.fetchedAtMs).toISOString())}`
        : "Sem snapshot backend ainda";

      analysisTabContentElement.innerHTML = `
        ${baseResumoHtml}
        <article class="analysis-block analysis-binary-ghost" data-state="${escapeHtml(spotTriggerHeat.state)}">
          <div class="analysis-binary-ghost-head">
            <h4>Ghost Tracker Spot/Margem (Sessao)</h4>
            <span class="analysis-binary-ghost-badge">${escapeHtml(spotSummaryLabel)}</span>
          </div>
          <div class="analysis-binary-ghost-metrics">
            <article><span>Win rate auditada</span><strong>${spotGhostStats.winRate.toFixed(1)}%</strong></article>
            <article><span>Sinais encerrados</span><strong>${spotGhostStats.resolvedTrades}</strong></article>
            <article><span>Sinais em aberto</span><strong>${spotGhostStats.openSignals}</strong></article>
            <article><span>Qualidade amostral</span><strong>${escapeHtml(spotGhostStats.sampleState)}</strong></article>
          </div>
          <p>${escapeHtml(spotTriggerHeat.guidance)}</p>
          <p>
            Regras ativas: probabilidade direcional >= ${SPOT_MARGIN_GHOST_TRACKER_DEFAULTS.minDirectionalProbability}%,
            edge minimo ${SPOT_MARGIN_GHOST_TRACKER_DEFAULTS.minProbabilityEdge} p.p.,
            cooldown ${SPOT_MARGIN_GHOST_TRACKER_DEFAULTS.cooldownSeconds}s.
          </p>
        </article>
        <article class="analysis-block analysis-binary-ghost" data-state="${escapeHtml(ghostBackendState)}">
          <div class="analysis-binary-ghost-head">
            <h4>${escapeHtml(ghostBackendTitle)}</h4>
            <span class="analysis-binary-ghost-badge">${escapeHtml(ghostBackendSummaryLabel)}</span>
          </div>
          <div class="analysis-binary-ghost-view-toggle" role="tablist" aria-label="Escopo da auditoria ghost persistida">
            <button
              type="button"
              class="analysis-binary-ghost-view-button ${isSessionBackendView ? "is-active" : ""}"
              data-ghost-audit-view-mode="${BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_SESSION}"
            >Sessao atual</button>
            <button
              type="button"
              class="analysis-binary-ghost-view-button ${isSessionBackendView ? "" : "is-active"}"
              data-ghost-audit-view-mode="${BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_INSTITUTIONAL}"
            >Institucional</button>
          </div>
          <div class="analysis-binary-ghost-metrics">
            <article><span>Win rate backend</span><strong>${ghostBackendStats.winRate.toFixed(1)}%</strong></article>
            <article><span>Sinais encerrados</span><strong>${ghostBackendStats.resolvedTrades}</strong></article>
            <article><span>Registros filtrados</span><strong>${ghostBackendStats.totalMatched}</strong></article>
            <article><span>Qualidade amostral</span><strong>${escapeHtml(ghostBackendStats.sampleState)}</strong></article>
          </div>
          <p>${escapeHtml(ghostBackendScopeMessage)}</p>
          <p>${escapeHtml(ghostBackendStatusMessage)}</p>
          <p>${escapeHtml(ghostBackendUpdatedLabel)}</p>
        </article>
      `;

      bindGhostAuditViewModeButtons(analysisTabContentElement);
      return;
    }

    analysisTabContentElement.innerHTML = baseResumoHtml;
    return;
  }

  if (activeAnalysisTabId === "tecnica") {
    analysisTabContentElement.innerHTML = renderInstitutionalTechnicalTab(analysis, snapshot, currency);
    return;
  }

  if (activeAnalysisTabId === "smc") {
    analysisTabContentElement.innerHTML = renderInstitutionalSmcTab(analysis, snapshot, currency);
    return;
  }

  if (activeAnalysisTabId === "harmonicos") {
    const scanner = buildHarmonicGeometryScanner(analysis, currency);
    const fib = buildFibonacciAuxiliaryLevels(analysis, currency);

    analysisTabContentElement.innerHTML = `
      ${renderHarmonicScanner(scanner)}
      ${renderFibonacciAuxiliary(fib)}
      <div class="analysis-grid">
        <article class="analysis-block">
          <h4>Leitura harmonica agregada</h4>
          <p>Padrao mais proximo: ${escapeHtml(analysis.harmonic.pattern)}</p>
          <p>Razao candidata: ${analysis.harmonic.ratio.toFixed(3)}</p>
          <p>Confianca harmonica: ${analysis.harmonic.confidence.toFixed(1)}%</p>
        </article>
        <article class="analysis-block">
          <h4>Como interpretar</h4>
          <p>Use padrao harmonico apenas com confirmacao de candle e volume. Sem confirmacao, tratar como contexto e nao gatilho. PRZ + Stop + Alvos so sao acionados acima de 70% de confianca.</p>
        </article>
      </div>
    `;
    return;
  }

  if (activeAnalysisTabId === "wegd") {
    analysisTabContentElement.innerHTML = renderInstitutionalWegdTab(analysis, snapshot, currency);
    bindWegdSubTabButtons(analysisTabContentElement, analysis, snapshot, currency);
    return;
  }

  if (activeAnalysisTabId === "probabilistica") {
    // ADR-074 — Dashboard Probabilistico Quantitativo Institucional.
    analysisTabContentElement.innerHTML = renderInstitutionalProbabilisticTab(analysis, snapshot, currency);
    return;
  }

  if (activeAnalysisTabId === "micro_timing") {
    const microTiming = options.microTiming ?? buildMicroTimingAnalysis(analysis, snapshot);
    const orderFlow = buildTimingOrderFlowSnapshot({ snapshot });
    const ghostStats = getBinaryOptionsGhostTrackerStats();
    const ghostBackendStats = getBinaryOptionsGhostBackendStats();
    const ghostBackendViewMode = normalizeBinaryOptionsGhostAuditViewMode(binaryOptionsGhostAuditViewMode);
    const isSessionBackendView = ghostBackendViewMode === BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_SESSION;
    const triggerHeat = microTiming.triggerHeat;
    const momentumPerSecondLabel = `${microTiming.momentumPerSecondPercent >= 0 ? "+" : ""}${microTiming.momentumPerSecondPercent.toFixed(4)}%/s`;
    const institutionalContext = microTiming.institutionalContext ?? {
      biasLabel: "Equilibrado",
      hitLabel: "inativo",
      tagLabel: "Nao detectado",
    };
    const kineticContext = microTiming.kineticContext ?? {
      accelerationPercentPerSecond2: 0,
      decelerationStrength: 0,
      stateLabel: "Neutral",
    };
    const kineticAccelerationLabel = `${kineticContext.accelerationPercentPerSecond2 >= 0 ? "+" : ""}${kineticContext.accelerationPercentPerSecond2.toFixed(6)}%/s2`;
    const ghostSummaryLabel = ghostStats.pushes > 0
      ? `${ghostStats.wins}W - ${ghostStats.losses}L - ${ghostStats.pushes}D`
      : `${ghostStats.wins}W - ${ghostStats.losses}L`;
    const ghostBackendSummaryLabel = ghostBackendStats.hasSnapshot
      ? ghostBackendStats.pushes > 0
        ? `${ghostBackendStats.wins}W - ${ghostBackendStats.losses}L - ${ghostBackendStats.pushes}D`
        : `${ghostBackendStats.wins}W - ${ghostBackendStats.losses}L`
      : ghostBackendStats.inFlight
        ? "SYNC"
        : "SEM DADOS";
    const ghostBackendTitle = isSessionBackendView
      ? "Ghost Tracker Persistido (Sessao Atual)"
      : "Ghost Tracker Institucional (Backend)";
    const ghostBackendScopeMessage = isSessionBackendView
      ? "Escopo: filtros por sessionId ativo + assetId atual."
      : "Escopo: agregacao por assetId em toda a base persistida.";
    const ghostBackendState = !ghostBackendStats.enabled
      ? "cold"
      : ghostBackendStats.winRate >= 58
        ? "hot"
        : ghostBackendStats.winRate >= 48
          ? "warm"
          : "cold";
    const ghostBackendStatusMessage = buildBinaryOptionsGhostBackendStatusMessage(ghostBackendStats);
    const ghostBackendUpdatedLabel = ghostBackendStats.fetchedAtMs > 0
      ? `Atualizado ${formatShortTime(new Date(ghostBackendStats.fetchedAtMs).toISOString())}`
      : "Sem snapshot backend ainda";

    analysisTabContentElement.innerHTML = `
      <article class="analysis-block analysis-binary-ghost" data-state="${escapeHtml(triggerHeat.state)}">
        <div class="analysis-binary-ghost-head">
          <h4>Ghost Tracker de Sessao</h4>
          <span class="analysis-binary-ghost-badge">${escapeHtml(ghostSummaryLabel)}</span>
        </div>
        <div class="analysis-binary-ghost-metrics">
          <article><span>Win rate auditada</span><strong>${ghostStats.winRate.toFixed(1)}%</strong></article>
          <article><span>Sinais encerrados</span><strong>${ghostStats.resolvedTrades}</strong></article>
          <article><span>Sinais em aberto</span><strong>${ghostStats.openSignals}</strong></article>
          <article><span>Qualidade amostral</span><strong>${escapeHtml(ghostStats.sampleState)}</strong></article>
        </div>
        <p>
          Regras ativas: probabilidade direcional >= ${BINARY_OPTIONS_GHOST_TRACKER_DEFAULTS.minDirectionalProbability}%,
          edge minimo ${BINARY_OPTIONS_GHOST_TRACKER_DEFAULTS.minProbabilityEdge} p.p.,
          cooldown ${BINARY_OPTIONS_GHOST_TRACKER_DEFAULTS.cooldownSeconds}s.
        </p>
      </article>
      <article class="analysis-block analysis-binary-ghost" data-state="${escapeHtml(ghostBackendState)}">
        <div class="analysis-binary-ghost-head">
          <h4>${escapeHtml(ghostBackendTitle)}</h4>
          <span class="analysis-binary-ghost-badge">${escapeHtml(ghostBackendSummaryLabel)}</span>
        </div>
        <div class="analysis-binary-ghost-view-toggle" role="tablist" aria-label="Escopo da auditoria ghost persistida">
          <button
            type="button"
            class="analysis-binary-ghost-view-button ${isSessionBackendView ? "is-active" : ""}"
            data-ghost-audit-view-mode="${BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_SESSION}"
          >Sessao atual</button>
          <button
            type="button"
            class="analysis-binary-ghost-view-button ${isSessionBackendView ? "" : "is-active"}"
            data-ghost-audit-view-mode="${BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_INSTITUTIONAL}"
          >Institucional</button>
        </div>
        <div class="analysis-binary-ghost-metrics">
          <article><span>Win rate backend</span><strong>${ghostBackendStats.winRate.toFixed(1)}%</strong></article>
          <article><span>Sinais encerrados</span><strong>${ghostBackendStats.resolvedTrades}</strong></article>
          <article><span>Registros filtrados</span><strong>${ghostBackendStats.totalMatched}</strong></article>
          <article><span>Qualidade amostral</span><strong>${escapeHtml(ghostBackendStats.sampleState)}</strong></article>
        </div>
        <p>${escapeHtml(ghostBackendScopeMessage)}</p>
        <p>${escapeHtml(ghostBackendStatusMessage)}</p>
        <p>${escapeHtml(ghostBackendUpdatedLabel)}</p>
      </article>
      <div class="analysis-grid">
        <article class="analysis-block">
          <h4>Probabilidade CALL/PUT</h4>
          <div class="analysis-probability-rows">
            <div class="analysis-probability-row">
              <span>CALL</span>
              <div class="analysis-probability-track"><div class="analysis-probability-fill buy" style="width: ${microTiming.callProbability.toFixed(1)}%"></div></div>
              <strong>${microTiming.callProbability.toFixed(1)}%</strong>
            </div>
            <div class="analysis-probability-row">
              <span>PUT</span>
              <div class="analysis-probability-track"><div class="analysis-probability-fill sell" style="width: ${microTiming.putProbability.toFixed(1)}%"></div></div>
              <strong>${microTiming.putProbability.toFixed(1)}%</strong>
            </div>
            <div class="analysis-probability-row">
              <span>NEUTRO</span>
              <div class="analysis-probability-track"><div class="analysis-probability-fill neutral" style="width: ${microTiming.neutralProbability.toFixed(1)}%"></div></div>
              <strong>${microTiming.neutralProbability.toFixed(1)}%</strong>
            </div>
          </div>
        </article>
        <article class="analysis-block">
          <h4>Forca do momentum em segundos</h4>
          <p>Direcao dominante: ${escapeHtml(microTiming.momentumDirection)}</p>
          <p>Intensidade: ${microTiming.momentumStrength.toFixed(1)} / 100 (${escapeHtml(microTiming.momentumLabel)})</p>
          <p>Velocidade instantanea: ${escapeHtml(momentumPerSecondLabel)}</p>
          <p>Amostra media: ${Math.round(microTiming.barSpacingSeconds)}s por barra • expiracao sugerida ${microTiming.suggestedExpirySeconds}s.</p>
          <div class="analysis-trigger-heat" data-state="${escapeHtml(triggerHeat.state)}">
            <div class="analysis-trigger-heat-head">
              <strong>${escapeHtml(triggerHeat.title)}</strong>
              <span>${escapeHtml(triggerHeat.state.toUpperCase())}</span>
            </div>
            <div class="analysis-trigger-heat-track">
              <div class="analysis-trigger-heat-fill" style="width: ${triggerHeat.score.toFixed(1)}%"></div>
            </div>
            <p>${escapeHtml(triggerHeat.guidance)}</p>
          </div>
          ${renderOrderFlowStrip(orderFlow)}
        </article>
        <article class="analysis-block">
          <h4>Contexto institucional e cinetico</h4>
          <p>POI institucional: ${escapeHtml(institutionalContext.hitLabel)} (${escapeHtml(institutionalContext.tagLabel)}).</p>
          <p>Bias institucional: ${escapeHtml(institutionalContext.biasLabel)}.</p>
          <p>Exaustao cinetica: ${escapeHtml(kineticContext.stateLabel)} • desaceleracao ${kineticContext.decelerationStrength.toFixed(1)} / 100.</p>
          <p>Aceleracao instantanea: ${escapeHtml(kineticAccelerationLabel)}</p>
          <p>${escapeHtml(microTiming.contextualGuidance)}</p>
        </article>
      </div>
      <article class="analysis-block">
        <h4>Checklist de execucao binaria</h4>
        <ul class="analysis-list">
          <li>Evite entrada quando momentum estiver neutro e payout abaixo de 70%.</li>
          <li>Em aceleracao forte, prefira expiracoes curtas alinhadas ao fluxo dominante.</li>
          <li>Se CALL/PUT estiverem muito proximos, reduzir stake e aguardar confirmacao.</li>
          <li>Se exaustao estiver explosive sem POI ativo, trate como ruido e preserve capital.</li>
        </ul>
      </article>
    `;

    bindGhostAuditViewModeButtons(analysisTabContentElement);

    return;
  }

  if (activeAnalysisTabId === "calculadora") {
    if (isBinaryMode) {
      analysisTabContentElement.innerHTML = `
        <div class="analysis-grid">
          <article class="analysis-block">
            <h4>Calculadora de Binarias</h4>
            <p>Projete stake e payout para avaliar retorno por ciclo de expiracao.</p>
            <div class="analysis-binary-input-grid">
              <label class="prop-desk-field" for="binary-bankroll-calc-input">
                Banca inicial (USD)
                <input id="binary-bankroll-calc-input" data-binary-risk-input="bankroll" type="number" min="10" step="10" />
              </label>
              <label class="prop-desk-field" for="binary-payout-calc-input">
                Payout atual (%)
                <input id="binary-payout-calc-input" data-binary-risk-input="payoutPercent" type="number" min="10" max="99" step="0.1" />
              </label>
              <label class="prop-desk-field" for="binary-stake-calc-input">
                Valor da entrada (stake)
                <input id="binary-stake-calc-input" data-binary-risk-input="stake" type="number" min="1" step="1" />
              </label>
            </div>
          </article>
          <article class="analysis-block">
            <h4>Saida esperada</h4>
            <p>Lucro projetado: <strong data-binary-risk-output="projectedProfit">--</strong></p>
            <p>Saldo apos win: <strong data-binary-risk-output="balanceWin">--</strong></p>
            <p>Saldo apos loss: <strong data-binary-risk-output="balanceLoss">--</strong></p>
            <p>Stake / banca: <strong data-binary-risk-output="stakePercent">--</strong></p>
            <p>Stake sugerida (2%): <strong data-binary-risk-output="suggestedStake">--</strong></p>
          </article>
        </div>
      `;

      syncBinaryOptionsRiskPanel(analysisTabContentElement);
      return;
    }

    const capitalRef = 10000;
    const riskBudget = capitalRef * 0.01;
    const stopDistancePercent = clampNumber(
      Math.abs((analysis.signal.entryLow - analysis.signal.stopLoss) / Math.max(analysis.signal.entryLow, 1e-6)) * 100,
      0.01,
      100,
    );
    const suggestedNotional = roundNumber(riskBudget / (stopDistancePercent / 100), 2);
    const defaultRR = analysis.signal.riskReward !== null && Number.isFinite(analysis.signal.riskReward)
      ? Math.max(0.2, Number(analysis.signal.riskReward))
      : 2;
    const positionCalcHtml = renderPositionCalculator({
      analysis,
      snapshot,
      currency,
      assetId: snapshot?.assetId ?? chartAssetSelect?.value ?? "",
    });
    const riskLabHtml = renderRiskLab({
      mode: "spot",
      currency,
      defaults: {
        capital: capitalRef,
        riskPct: 1,
        payoutOrRR: defaultRR,
        winRatePct: 55,
        strategy: "fixed",
      },
      reference: {
        capitalRef,
        riskBudget,
        stopDistancePercent,
        suggestedNotional,
        signal: analysis.signal,
      },
    });
    analysisTabContentElement.innerHTML = `
      <header class="analysis-tab-intro">
        <h3><span aria-hidden="true">🧮</span> Calculadora de Posicao</h3>
        <p>Calcule o tamanho ideal da sua posicao baseado no seu capital e perfil de risco.</p>
      </header>
      ${positionCalcHtml}
      <details class="risk-lab-toggle" open>
        <summary>Risk Lab — Monte Carlo (gestao de banca de longo prazo)</summary>
        ${riskLabHtml}
      </details>
    `;
    attachPositionCalculatorHandlers(analysisTabContentElement, {
      analysis,
      snapshot,
      currency,
      assetId: snapshot?.assetId ?? chartAssetSelect?.value ?? "",
    });
    attachRiskLabHandlers(analysisTabContentElement, { mode: "spot", currency });
    return;
  }

  if (activeAnalysisTabId === "timing") {
    // ADR-076 — Timing Desk Institucional.
    analysisTabContentElement.innerHTML = renderTimingDeskHtml(analysis, snapshot, currency);
    startTimingUtcClock();
    return;
  }

  if (activeAnalysisTabId === "visual_ia") {
    const harmonicScanner = buildHarmonicGeometryScanner(analysis, currency);
    const visualEvidence = buildVisualIntelligenceEvidence({
      analysis,
      harmonicScanner,
      points: snapshot?.points,
    });
    analysisTabContentElement.innerHTML = renderVisualIntelligenceTab(visualEvidence);
    return;
  }

  const institutional = snapshot?.institutional;

  if (institutional && typeof institutional === "object") {
    const macroRadar = institutional.macroRadar && typeof institutional.macroRadar === "object"
      ? institutional.macroRadar
      : null;
    const upcomingEvents = Array.isArray(macroRadar?.upcomingEvents) ? macroRadar.upcomingEvents : [];
    const alertLevel = typeof macroRadar?.alertLevel === "string" ? macroRadar.alertLevel : "green";
    const blockDirectionalRisk = macroRadar?.blockDirectionalRisk === true;
    const radarMessage = typeof macroRadar?.message === "string"
      ? macroRadar.message
      : "Sem risco macro critico identificado para a janela atual.";
    const safeHavenBias = typeof macroRadar?.safeHavenBias === "string"
      ? macroRadar.safeHavenBias
      : "neutral";

    analysisTabContentElement.innerHTML = `
      <article class="analysis-block">
        <h4>Radar Macro</h4>
        <p>Nivel: ${escapeHtml(alertLevel.toUpperCase())} • Bloqueio direcional: ${blockDirectionalRisk ? "ativo" : "inativo"} • Refugio: ${escapeHtml(safeHavenBias)}</p>
        <p>${escapeHtml(radarMessage)}</p>
        <ul class="analysis-list">
          ${upcomingEvents
            .map((eventItem) => {
              const name = typeof eventItem?.name === "string" ? eventItem.name : "Evento macro";
              const impact = typeof eventItem?.impact === "string" ? eventItem.impact : "medium";
              const hoursToEvent = typeof eventItem?.hoursToEvent === "number" && Number.isFinite(eventItem.hoursToEvent)
                ? `${eventItem.hoursToEvent}h`
                : "n/d";

              return `<li><strong>${escapeHtml(name)}</strong> • impacto ${escapeHtml(String(impact))} • em ${escapeHtml(hoursToEvent)}</li>`;
            })
            .join("")}
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
    // ADR-078 — Hub de Inteligencia Fundamentalista (sentimento + keywords +
    // narrativa AI + tabs Noticias/Eventos + radar macro). Render derivado do
    // payload existente + institutional.macroRadar; zero chamada externa nova.
    analysisTabContentElement.innerHTML = renderFundamentalistHubHtml({
      payload: newsIntelligencePayload,
      snapshot,
      analysis,
      currency,
    });
    attachFundamentalistHubHandlers(analysisTabContentElement);
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

let latestDeepAnalysisSnapshot = null;

function renderDeepAnalysisPanel(snapshot) {
  // Wrapper com coalescing via requestAnimationFrame. Mantém semantica "latest-wins":
  // callers disparando em burst (ticks SSE) resultam em um unico reflow por frame, e o
  // snapshot renderizado sera o mais recente observado ate o proximo frame.
  latestDeepAnalysisSnapshot = snapshot;
  scheduleRender("deep-analysis", () => {
    renderDeepAnalysisPanelImmediate(latestDeepAnalysisSnapshot);
  });
}

// ============================================================================
// ADR-076 — Timing Desk Institucional (Sessoes, Killzones, Calendario Macro)
// Helpers puros + render. Zero fetch externo: tudo derivado de Date.now() UTC,
// `analysis.timing.volatilityPercent` e `institutional.macroRadar.upcomingEvents`.
// ============================================================================

const TIMING_DESK_SESSIONS = Object.freeze([
  Object.freeze({ key: "asia", label: "Asia (Toquio/Sydney)", startUtcHour: 23, endUtcHour: 8, tone: "warm", icon: "🌏" }),
  Object.freeze({ key: "london", label: "Londres (LSE/FFM)", startUtcHour: 7, endUtcHour: 16, tone: "hot", icon: "🇬🇧" }),
  Object.freeze({ key: "newyork", label: "Nova York (NYSE/Nasdaq)", startUtcHour: 13, endUtcHour: 22, tone: "hot", icon: "🇺🇸" }),
]);

function isUtcHourInSession(hour, startHour, endHour) {
  if (startHour <= endHour) {
    return hour >= startHour && hour < endHour;
  }
  // Sessao cruza meia-noite (ex.: Asia 23-08).
  return hour >= startHour || hour < endHour;
}

function getCurrentTradingSessionUtc(nowMs = Date.now()) {
  const date = new Date(nowMs);
  const utcHour = date.getUTCHours();
  const active = TIMING_DESK_SESSIONS.filter((session) =>
    isUtcHourInSession(utcHour, session.startUtcHour, session.endUtcHour),
  );

  if (active.length === 0) {
    return { active: [], primary: null, label: "Mercado em transicao (baixa liquidez)" };
  }

  // Sobreposicao Londres+NY (13-16 UTC) eh o pico real do dia.
  const hasLondonNyOverlap = active.some((s) => s.key === "london") && active.some((s) => s.key === "newyork");

  if (hasLondonNyOverlap) {
    return {
      active,
      primary: "overlap-london-ny",
      label: "Sobreposicao Londres + Nova York (PICO de liquidez)",
    };
  }

  const labels = active.map((s) => s.label).join(" + ");
  return { active, primary: active[0].key, label: `Sessao ativa: ${labels}` };
}

function getVolatilityRegime(volatilityPercent) {
  const v = Number.isFinite(volatilityPercent) ? volatilityPercent : 0;
  if (v >= 7) return { key: "extreme", label: "Extrema (CUIDADO)", tone: "danger" };
  if (v >= 4) return { key: "high", label: "Alta", tone: "warn" };
  if (v >= 1.5) return { key: "normal", label: "Normal", tone: "neutral" };
  return { key: "low", label: "Baixa", tone: "cool" };
}

function detectAssetClassForTiming(assetId) {
  const id = typeof assetId === "string" ? assetId.trim() : "";
  if (!id) return "crypto";
  // Reusa heuristica robusta ja existente (linha ~2093).
  try {
    if (typeof isLikelyForexPairSymbol === "function" && isLikelyForexPairSymbol(id.toUpperCase())) {
      return "forex";
    }
  } catch { /* ignore */ }
  // Fallback: pares forex listados explicitamente.
  const lower = id.toLowerCase();
  const forexPairs = ["eurusd", "gbpusd", "usdjpy", "audusd", "usdcad", "usdchf", "nzdusd", "eurjpy", "gbpjpy"];
  if (forexPairs.some((p) => lower.includes(p))) return "forex";
  return "crypto";
}

function getKillzonesForAssetClass(assetClass) {
  // Killzones ICT/SMC + sessoes de overlap. Adaptativo por classe.
  const recommended = [
    { range: "07:00 - 10:00 UTC", title: "London Open Killzone", hint: "ICT classico — institucionais britanicos abrem posicoes; setups de breakout limpos" },
    { range: "13:00 - 16:00 UTC", title: "NY AM Killzone (Overlap)", hint: "Sobreposicao Londres+NY — MAIOR liquidez global do dia, ideal p/ continuacao" },
    { range: "06:00 - 07:00 UTC", title: "Pre-London (acumulacao)", hint: "Pre-mercado europeu — bons setups de breakout via varredura asiatica" },
  ];
  const avoid = [
    { range: "11:00 - 12:30 UTC", title: "London Lunch Gap", hint: "Volume cai antes do almoco europeu — movimentos erraticos, false breaks" },
    { range: "16:00 - 17:30 UTC", title: "Fechamento Londres", hint: "Reversoes falsas comuns; spreads alargam apos o fechamento" },
    { range: "21:00 - 23:00 UTC", title: "Pos-fechamento NY", hint: "Liquidez evapora — slippage agressivo e gap risk noturno" },
  ];

  if (assetClass === "crypto") {
    // Funding windows em perpetuals: 00:00, 08:00, 16:00 UTC (padrao Binance/Bybit/OKX).
    avoid.push({
      range: "Funding ±5min (00/08/16 UTC)",
      title: "Funding Window (Perpetuals)",
      hint: "Stop-hunts e spikes artificiais para pagar/receber funding — evite entradas curtas",
    });
  }

  return { recommended, avoid };
}

function formatUtcClock(date = new Date()) {
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss} UTC`;
}

let timingUtcClockInterval = null;

function startTimingUtcClock() {
  stopTimingUtcClock();
  const tick = () => {
    const clockEl = document.getElementById("timing-utc-clock");
    if (!(clockEl instanceof HTMLElement)) {
      stopTimingUtcClock();
      return;
    }
    const now = new Date();
    clockEl.textContent = formatUtcClock(now);
    const sessionEl = document.getElementById("timing-session-active");
    if (sessionEl instanceof HTMLElement) {
      const session = getCurrentTradingSessionUtc(now.getTime());
      sessionEl.textContent = session.label;
      sessionEl.dataset.primary = session.primary ?? "none";
    }
  };
  tick();
  timingUtcClockInterval = window.setInterval(tick, 1000);
}

function stopTimingUtcClock() {
  if (timingUtcClockInterval !== null) {
    window.clearInterval(timingUtcClockInterval);
    timingUtcClockInterval = null;
  }
}

function formatOrderFlowNumber(value, fallback = "n/d") {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.abs(value) >= 1000
    ? value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
    : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function renderOrderFlowSparkline(flow) {
  const bars = Array.isArray(flow?.cvd?.sparkline) ? flow.cvd.sparkline : [];

  if (bars.length === 0) {
    return `<div class="timing-flow-sparkline timing-flow-sparkline--empty" aria-hidden="true"></div>`;
  }

  return `
    <div class="timing-flow-sparkline" aria-label="Linha CVD dos ultimos ${bars.length} candles">
      ${bars.map((bar) => `<span data-tone="${escapeHtml(bar.tone)}" style="height:${Number(bar.heightPercent ?? 20).toFixed(1)}%" title="CVD ${escapeHtml(formatOrderFlowNumber(bar.value))}; delta ${escapeHtml(formatOrderFlowNumber(bar.delta))}"></span>`).join("")}
    </div>
  `;
}

function renderOrderFlowStrip(flow) {
  const cvd = flow?.cvd ?? { ready: false, label: "Aquecendo", tone: "neutral", change: null, bandOneSigma: null };
  const volume = flow?.volume ?? { ready: false, label: "Aquecendo", tone: "neutral", zScore: null };
  const zScoreLabel = volume.ready ? `${volume.zScore >= 0 ? "+" : ""}${Number(volume.zScore).toFixed(2)}σ` : "n/d";
  const anomalyBadge = volume.anomaly
    ? `<span class="timing-flow-badge" data-tone="${escapeHtml(volume.tone)}">Volume ${escapeHtml(zScoreLabel)}</span>`
    : `<span class="timing-flow-badge" data-tone="neutral">Volume ${escapeHtml(volume.label)}</span>`;

  return `
    <div class="timing-flow-strip" data-tone="${escapeHtml(cvd.tone)}">
      <div class="timing-flow-strip__head">
        <strong>CVD ${escapeHtml(cvd.label)}</strong>
        ${anomalyBadge}
      </div>
      ${renderOrderFlowSparkline(flow)}
      <div class="timing-flow-strip__meta">
        <span>Delta ${escapeHtml(formatOrderFlowNumber(cvd.change))}</span>
        <span>Banda 1σ ${escapeHtml(formatOrderFlowNumber(cvd.bandOneSigma))}</span>
        <span>Amostra ${Number(flow?.sampleSize ?? 0)}</span>
      </div>
    </div>
  `;
}

function renderTimingOrderFlowPanel(flow) {
  const cvd = flow?.cvd ?? { label: "Aquecendo", ready: false, tone: "neutral", latest: null, change: null, absorptionRatio: null, bandOneSigma: null };
  const volume = flow?.volume ?? { label: "Aquecendo", ready: false, tone: "neutral", zScore: null, latest: null, mean: null, baselineSample: 0 };
  const zScoreLabel = volume.ready ? `${volume.zScore >= 0 ? "+" : ""}${Number(volume.zScore).toFixed(2)}σ` : "n/d";
  const flowGuidance = !cvd.ready
    ? "Aguardando OHLCV suficiente para leitura de fluxo."
    : volume.anomaly
      ? "Anomalia de volume detectada: exigir confirmacao de direcao antes de executar."
      : cvd.tone === "bull"
        ? "Delta acumulado comprador favorece continuacao se o gatilho tecnico alinhar."
        : cvd.tone === "bear"
          ? "Delta acumulado vendedor favorece pressao de oferta no timing atual."
          : "Fluxo equilibrado: priorize setups com confirmacao adicional.";

  return `
    <article class="analysis-block timing-block timing-flow-panel" data-tone="${escapeHtml(cvd.tone)}">
      <h4>Order Flow CVD / Volume</h4>
      <div class="timing-flow-panel__grid">
        <article>
          <span>CVD</span>
          <strong>${escapeHtml(cvd.label)}</strong>
          <small>Delta ${escapeHtml(formatOrderFlowNumber(cvd.change))} / 1σ ${escapeHtml(formatOrderFlowNumber(cvd.bandOneSigma))}</small>
        </article>
        <article>
          <span>Volume z-score</span>
          <strong>${escapeHtml(zScoreLabel)}</strong>
          <small>${escapeHtml(volume.label)} (${Number(volume.baselineSample ?? 0)} candles base)</small>
        </article>
        <article>
          <span>Absorcao</span>
          <strong>${escapeHtml(Number.isFinite(cvd.absorptionRatio) ? `${(cvd.absorptionRatio * 100).toFixed(1)}%` : "n/d")}</strong>
          <small>Total volume ${escapeHtml(formatOrderFlowNumber(flow?.totalVolume))}</small>
        </article>
      </div>
      ${renderOrderFlowSparkline(flow)}
      <p class="timing-muted">${escapeHtml(flowGuidance)}</p>
    </article>
  `;
}

function formatRegimeMetric(value, suffix = "") {
  if (!Number.isFinite(value)) {
    return "n/d";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}${suffix}`;
}

function renderTimingMarketRegimePanel(marketRegime) {
  const regime = marketRegime ?? { ready: false, checks: [], label: "Aquecendo", tone: "neutral", metrics: {}, riskMultiplier: 0, score: 0 };
  const metrics = regime.metrics ?? {};
  const checks = Array.isArray(regime.checks) ? regime.checks : [];
  const scoreLabel = Number.isFinite(regime.score) ? regime.score.toFixed(0) : "0";
  const riskLabel = Number.isFinite(regime.riskMultiplier) ? `${Math.round(regime.riskMultiplier * 100)}%` : "n/d";
  const checksHtml = checks.length === 0
    ? `<li class="timing-regime-check" data-ok="false"><span>Amostra</span><strong>${Number(regime.sampleSize ?? 0)}/${Number(regime.warmupTarget ?? 12)}</strong></li>`
    : checks.map((check) => `
        <li class="timing-regime-check" data-ok="${check.ok ? "true" : "false"}" title="${escapeHtml(check.detail)}">
          <span>${escapeHtml(check.label)}</span>
          <strong>${check.ok ? "OK" : "Pendente"}</strong>
        </li>
      `).join("");

  return `
    <article class="analysis-block timing-block timing-regime-panel" data-tone="${escapeHtml(regime.tone)}" id="timing-market-regime-panel">
      <header class="timing-regime-panel__head">
        <div>
          <h4>Regime Institucional</h4>
          <p>${escapeHtml(regime.guidance ?? "Aguardando leitura de regime.")}</p>
        </div>
        <div class="timing-regime-score" id="timing-market-regime-score" title="Score de regime derivado de eficiencia, slope, volatilidade e volume">
          <strong>${escapeHtml(scoreLabel)}</strong>
          <span>/100</span>
        </div>
      </header>
      <div class="timing-regime-grid">
        <div class="timing-regime-cell">
          <span>Fase</span>
          <strong id="timing-market-regime-label">${escapeHtml(regime.label)}</strong>
          <small>${escapeHtml(regime.executionMode ?? "Aguardar")}</small>
        </div>
        <div class="timing-regime-cell">
          <span>Risco tatico</span>
          <strong>${escapeHtml(riskLabel)}</strong>
          <small>multiplicador da posicao base</small>
        </div>
        <div class="timing-regime-cell">
          <span>Efficiency Ratio</span>
          <strong>${Number.isFinite(metrics.efficiencyRatio) ? metrics.efficiencyRatio.toFixed(3) : "n/d"}</strong>
          <small>Slope ${escapeHtml(formatRegimeMetric(metrics.trendSlopePercent, "%"))}</small>
        </div>
        <div class="timing-regime-cell">
          <span>Volatilidade</span>
          <strong>${Number.isFinite(metrics.volatilityPercent) ? `${metrics.volatilityPercent.toFixed(2)}%` : "n/d"}</strong>
          <small>Volume ${escapeHtml(formatRegimeMetric(metrics.volumeZScore, "σ"))}</small>
        </div>
      </div>
      <ul class="timing-regime-checks" role="list">${checksHtml}</ul>
    </article>
  `;
}

function renderTimingExecutionGatePanel(executionGate) {
  const gate = executionGate ?? { checks: [], guidance: "Aguardando gate de execucao.", label: "AGUARDAR", metrics: {}, riskScale: 0, score: 0, signalTone: "neutral", status: "watch", tone: "warn" };
  const checks = Array.isArray(gate.checks) ? gate.checks : [];
  const scoreLabel = Number.isFinite(gate.score) ? gate.score.toFixed(0) : "0";
  const riskScaleLabel = Number.isFinite(gate.riskScale) ? `${Math.round(gate.riskScale * 100)}%` : "0%";
  const riskReward = Number.isFinite(gate.metrics?.riskReward) ? gate.metrics.riskReward.toFixed(2) : "n/d";
  const confidence = Number.isFinite(gate.metrics?.confidence) ? `${gate.metrics.confidence.toFixed(0)}%` : "n/d";
  const checksHtml = checks.map((check) => `
    <li class="timing-execution-check" data-ok="${check.ok ? "true" : "false"}" data-blocking="${check.blocking ? "true" : "false"}" title="${escapeHtml(check.detail)}">
      <span>${escapeHtml(check.label)}</span>
      <strong>${check.ok ? "OK" : check.blocking ? "BLOCK" : "WAIT"}</strong>
    </li>
  `).join("");

  return `
    <article class="analysis-block timing-block timing-execution-gate" data-tone="${escapeHtml(gate.tone)}" data-status="${escapeHtml(gate.status)}" id="timing-execution-gate-panel">
      <header class="timing-execution-gate__head">
        <div>
          <h4>Execution Gate</h4>
          <p>${escapeHtml(gate.guidance)}</p>
        </div>
        <div class="timing-execution-gate__badge" id="timing-execution-gate-status">
          <strong>${escapeHtml(gate.label)}</strong>
          <span>${escapeHtml(scoreLabel)}/100</span>
        </div>
      </header>
      <div class="timing-execution-gate__grid">
        <article>
          <span>Direcao</span>
          <strong>${escapeHtml(String(gate.signalTone ?? "neutral").toUpperCase())}</strong>
          <small>confianca ${escapeHtml(confidence)}</small>
        </article>
        <article>
          <span>Risco liberado</span>
          <strong>${escapeHtml(riskScaleLabel)}</strong>
          <small>do tamanho base ajustado</small>
        </article>
        <article>
          <span>Assimetria</span>
          <strong>R:R ${escapeHtml(riskReward)}</strong>
          <small>minimo institucional 1.20</small>
        </article>
      </div>
      <ul class="timing-execution-checks" role="list">${checksHtml}</ul>
    </article>
  `;
}

function renderTimingExecutionPlanPanel(executionPlan, currency) {
  const plan = executionPlan ?? { checks: [], guidance: "Aguardando plano de execucao.", label: "AGUARDAR", risk: {}, side: "neutral", state: "watch", targets: [], tone: "warn" };
  const entry = plan.entry ?? null;
  const invalidation = plan.invalidation ?? {};
  const risk = plan.risk ?? {};
  const targets = Array.isArray(plan.targets) ? plan.targets : [];
  const checks = Array.isArray(plan.checks) ? plan.checks : [];
  const entryLabel = entry
    ? `${formatPrice(entry.low, currency)} - ${formatPrice(entry.high, currency)}`
    : "n/d";
  const entryDistanceLabel = Number.isFinite(entry?.distancePercent)
    ? `${entry.distancePercent.toFixed(2)}%`
    : "n/d";
  const invalidationDistanceLabel = Number.isFinite(invalidation.distancePercent)
    ? `${invalidation.distancePercent.toFixed(2)}%`
    : "n/d";
  const suggestedRiskLabel = Number.isFinite(risk.suggestedRiskPercent)
    ? `${risk.suggestedRiskPercent.toFixed(2)}%`
    : "0%";
  const riskRewardLabel = Number.isFinite(risk.riskReward)
    ? risk.riskReward.toFixed(2)
    : "n/d";
  const targetCards = targets.map((target) => {
    const targetDistance = Number.isFinite(target.distancePercent)
      ? `${target.distancePercent.toFixed(2)}%`
      : "n/d";
    const targetRiskReward = Number.isFinite(target.riskReward)
      ? `R:R ${target.riskReward.toFixed(2)}`
      : "R:R n/d";

    return `
      <article>
        <span>${escapeHtml(target.label)}</span>
        <strong>${escapeHtml(formatPrice(target.price, currency))}</strong>
        <small>${escapeHtml(targetRiskReward)} • ${escapeHtml(targetDistance)}</small>
      </article>
    `;
  }).join("");
  const checksHtml = checks.map((check) => `
    <li class="timing-plan-check" data-ok="${check.ok ? "true" : "false"}" title="${escapeHtml(check.detail)}">
      <span>${escapeHtml(check.label)}</span>
      <strong>${check.ok ? "OK" : "WAIT"}</strong>
    </li>
  `).join("");

  return `
    <article class="analysis-block timing-block timing-execution-plan" data-tone="${escapeHtml(plan.tone)}" data-state="${escapeHtml(plan.state)}" id="timing-execution-plan-panel">
      <header class="timing-execution-plan__head">
        <div>
          <h4>Plano de Execucao</h4>
          <p>${escapeHtml(plan.guidance)}</p>
        </div>
        <div class="timing-execution-plan__badge" id="timing-execution-plan-state">
          <strong>${escapeHtml(plan.label)}</strong>
          <span>${escapeHtml(String(plan.side ?? "neutral").toUpperCase())}</span>
        </div>
      </header>
      <div class="timing-execution-plan__grid">
        <article>
          <span>Zona de entrada</span>
          <strong>${escapeHtml(entryLabel)}</strong>
          <small>distancia ${escapeHtml(entryDistanceLabel)}</small>
        </article>
        <article>
          <span>Invalidacao</span>
          <strong>${escapeHtml(formatPrice(invalidation.price, currency))}</strong>
          <small>stop ${escapeHtml(invalidationDistanceLabel)}</small>
        </article>
        <article>
          <span>Risco tatico</span>
          <strong>${escapeHtml(suggestedRiskLabel)}</strong>
          <small>R:R base ${escapeHtml(riskRewardLabel)}</small>
        </article>
        ${targetCards}
      </div>
      <ul class="timing-plan-checks" role="list">${checksHtml}</ul>
    </article>
  `;
}

function renderTimingExecutionQualityPanel(executionQuality) {
  const quality = executionQuality ?? { contributions: [], grade: "--", guidance: "Aguardando score de qualidade.", label: "AQUECENDO", sampleState: "Aquecendo", score: 0, status: "watch", tone: "warn" };
  const scoreLabel = Number.isFinite(quality.score) ? quality.score.toFixed(1) : "--";
  const contributions = Array.isArray(quality.contributions) ? quality.contributions : [];
  const contributionsHtml = contributions.map((contribution) => `
    <li class="timing-quality-check" data-ok="${contribution.ok ? "true" : "false"}" title="${escapeHtml(contribution.detail)}">
      <span>${escapeHtml(contribution.label)}</span>
      <strong>${escapeHtml(String(contribution.score ?? "--"))}/${escapeHtml(String(contribution.weight ?? "--"))}</strong>
    </li>
  `).join("");

  return `
    <article class="analysis-block timing-block timing-execution-quality" data-tone="${escapeHtml(quality.tone)}" data-status="${escapeHtml(quality.status)}" id="timing-execution-quality-panel">
      <header class="timing-execution-quality__head">
        <div>
          <h4>Score de Qualidade</h4>
          <p>${escapeHtml(quality.guidance)}</p>
        </div>
        <div class="timing-execution-quality__badge" id="timing-execution-quality-score">
          <strong>${escapeHtml(quality.label)}</strong>
          <span>${escapeHtml(scoreLabel)}/100 - ${escapeHtml(quality.grade)}</span>
        </div>
      </header>
      <div class="timing-execution-quality__grid">
        <article>
          <span>Grade</span>
          <strong>${escapeHtml(quality.grade)}</strong>
          <small>estado ${escapeHtml(quality.status)}</small>
        </article>
        <article>
          <span>Amostra</span>
          <strong>${escapeHtml(quality.sampleState)}</strong>
          <small>${quality.journalReady ? "journal validado" : "fail-honest"}</small>
        </article>
        <article>
          <span>Score</span>
          <strong>${escapeHtml(scoreLabel)}</strong>
          <small>ponderado por gate, risco e journal</small>
        </article>
      </div>
      <ul class="timing-quality-checks" role="list">${contributionsHtml}</ul>
    </article>
  `;
}

function renderTimingAutomationGuardPanel(automationGuard) {
  const guard = automationGuard ?? { checks: [], guidance: "Auto Guard aguardando contexto.", label: "AUTO BLOQUEADO", status: "blocked", tone: "danger" };
  const checks = Array.isArray(guard.checks) ? guard.checks : [];
  const checksHtml = checks.map((check) => `
    <li class="timing-automation-check" data-blocking="${check.blocking ? "true" : "false"}" data-ok="${check.ok ? "true" : "false"}" title="${escapeHtml(check.detail)}">
      <span>${escapeHtml(check.label)}</span>
      <strong>${check.ok ? "OK" : check.blocking ? "BLOCK" : "WAIT"}</strong>
    </li>
  `).join("");

  return `
    <article class="analysis-block timing-block timing-automation-guard" data-tone="${escapeHtml(guard.tone)}" data-status="${escapeHtml(guard.status)}" id="timing-automation-guard-panel">
      <header class="timing-automation-guard__head">
        <div>
          <h4>Auto Guard</h4>
          <p>${escapeHtml(guard.guidance)}</p>
        </div>
        <div class="timing-automation-guard__badge" id="timing-automation-guard-status">
          <strong>${escapeHtml(guard.label)}</strong>
          <span>${guard.canAutoPaper ? "paper liberado" : "sem ordem"}</span>
        </div>
      </header>
      <ul class="timing-automation-checks" role="list">${checksHtml}</ul>
    </article>
  `;
}

function renderChartExecutionHud({ currency, currentPrice, executionGate, executionPlan, executionQuality }) {
  if (!(chartExecutionHudElement instanceof HTMLElement)) {
    return;
  }

  if (!executionPlan || !executionQuality) {
    clearChartExecutionHud();
    return;
  }

  const entry = executionPlan.entry ?? null;
  const risk = executionPlan.risk ?? {};
  const scoreLabel = Number.isFinite(executionQuality.score) ? executionQuality.score.toFixed(1) : "--";
  const priceLabel = Number.isFinite(currentPrice) ? formatPrice(currentPrice, currency) : "n/d";
  const entryLabel = entry
    ? `${formatPrice(entry.low, currency)} - ${formatPrice(entry.high, currency)}`
    : "n/d";
  const riskLabel = Number.isFinite(risk.suggestedRiskPercent)
    ? `${risk.suggestedRiskPercent.toFixed(2)}%`
    : "0%";

  chartExecutionHudElement.hidden = false;
  chartExecutionHudElement.dataset.tone = executionQuality.tone ?? "warn";
  chartExecutionHudElement.dataset.status = executionQuality.status ?? "watch";
  chartExecutionHudElement.innerHTML = `
    <div class="chart-execution-hud__head">
      <span>${escapeHtml(executionQuality.label ?? "OBSERVAR")}</span>
      <strong>${escapeHtml(scoreLabel)}/100</strong>
    </div>
    <div class="chart-execution-hud__body">
      <span>Gate ${escapeHtml(executionGate?.label ?? "AGUARDAR")}</span>
      <span>Plano ${escapeHtml(executionPlan.label ?? "AGUARDAR")}</span>
      <span>Preco ${escapeHtml(priceLabel)}</span>
      <span>Entrada ${escapeHtml(entryLabel)}</span>
      <span>Risco ${escapeHtml(riskLabel)}</span>
      <span>Amostra ${escapeHtml(executionQuality.sampleState ?? "Aquecendo")}</span>
    </div>
  `;
}

function clearChartExecutionHud() {
  if (!(chartExecutionHudElement instanceof HTMLElement)) {
    return;
  }

  chartExecutionHudElement.hidden = true;
  chartExecutionHudElement.innerHTML = "";
  delete chartExecutionHudElement.dataset.tone;
  delete chartExecutionHudElement.dataset.status;
}

function resolveTimingCurrentPrice(snapshot) {
  const insightPrice = toFiniteNumber(snapshot?.insights?.currentPrice, Number.NaN);

  if (Number.isFinite(insightPrice)) {
    return insightPrice;
  }

  const points = Array.isArray(snapshot?.points) ? snapshot.points : [];
  const lastPoint = points[points.length - 1];
  return toFiniteNumber(lastPoint?.close, Number.NaN);
}

function syncExecutionJournalFromTiming({ analysis, currentPrice, executionGate, executionPlan, snapshot }) {
  latestTimingExecutionContext = {
    analysis,
    currentPrice,
    executionGate,
    executionPlan,
    snapshot,
  };

  const nowMs = Date.now();
  let changed = false;

  if (Number.isFinite(currentPrice)) {
    const settled = settleExecutionJournalEntries(executionJournalState, currentPrice, nowMs);
    executionJournalState = settled.state;
    changed = changed || settled.changed;
  }

  if (
    isSpotMarginOperationalMode()
    && snapshot?.mode === "live"
    && executionGate?.status === "armed"
    && executionPlan?.state === "trigger"
  ) {
    const entry = createExecutionJournalEntry({
      analysis,
      currentPrice,
      executionGate,
      executionPlan,
      nowMs,
      snapshot,
      source: "auto",
    });
    const appended = appendExecutionJournalEntry(executionJournalState, entry, {
      nowMs,
      preventDuplicate: true,
    });
    executionJournalState = appended.state;
    changed = changed || appended.appended;
  }

  if (changed) {
    schedulePersistExecutionJournalState();
  }

  return {
    recentEntries: getRecentExecutionJournalEntries(executionJournalState, 5),
    summary: summarizeExecutionJournal(executionJournalState),
  };
}

function registerCurrentExecutionPlan(source = "manual") {
  const context = latestTimingExecutionContext;

  if (!context || !context.snapshot || !context.executionPlan) {
    setChartStatus("Sem plano de execucao ativo para registrar.", "warn");
    return;
  }

  const nowMs = Date.now();
  const entry = createExecutionJournalEntry({
    ...context,
    nowMs,
    source,
  });
  const appended = appendExecutionJournalEntry(executionJournalState, entry, {
    nowMs,
    preventDuplicate: true,
  });
  executionJournalState = appended.state;

  if (!appended.appended) {
    const message = appended.reason === "duplicate"
      ? "Plano ja esta no journal desta janela."
      : "Plano ainda nao esta pronto para registro.";
    setChartStatus(message, "warn");
    return;
  }

  schedulePersistExecutionJournalState();
  setChartStatus("Plano registrado no Execution Journal.", "ok");
  renderDeepAnalysisPanel(chartLabState.snapshot);
}

function clearExecutionJournalState() {
  executionJournalState = createExecutionJournalState();
  schedulePersistExecutionJournalState();
  setChartStatus("Execution Journal limpo.", "ok");
  renderDeepAnalysisPanel(chartLabState.snapshot);
}

function openPaperTradingFromTiming() {
  navigateToRoute(APP_ROUTE_PAPER);
  setChartStatus("Paper Trading aberto para acompanhar simulacoes.", "ok");
}

function updateExecutionChartVisualState(executionGate, executionPlan, journal, quality) {
  if (!(chartViewport instanceof HTMLElement)) {
    return;
  }

  chartViewport.dataset.executionGate = typeof executionGate?.status === "string" ? executionGate.status : "watch";
  chartViewport.dataset.executionState = typeof executionPlan?.state === "string" ? executionPlan.state : "none";
  chartViewport.dataset.executionJournalTone = typeof journal?.tone === "string" ? journal.tone : "neutral";
  chartViewport.dataset.executionQuality = typeof quality?.grade === "string" ? quality.grade : "n/a";
}

function clearExecutionChartVisualState() {
  if (!(chartViewport instanceof HTMLElement)) {
    return;
  }

  delete chartViewport.dataset.executionGate;
  delete chartViewport.dataset.executionState;
  delete chartViewport.dataset.executionJournalTone;
  delete chartViewport.dataset.executionQuality;
}

function formatExecutionJournalStatus(status) {
  switch (status) {
    case "target2": return "TP2";
    case "stopped": return "STOP";
    case "partial": return "TP1";
    case "entered": return "EM TRADE";
    case "watch": return "WATCH";
    case "blocked": return "BLOCK";
    case "invalid": return "INVALIDO";
    default: return "MONITOR";
  }
}

function renderTimingExecutionJournalPanel(journal, recentEntries, currency) {
  const summary = journal ?? summarizeExecutionJournal(executionJournalState);
  const entries = Array.isArray(recentEntries) ? recentEntries : getRecentExecutionJournalEntries(executionJournalState, 5);
  const scoreLabel = summary.resolved >= 5 ? summary.score.toFixed(0) : "--";
  const winRateLabel = summary.resolved > 0 ? `${summary.winRate.toFixed(1)}%` : "n/d";
  const averageRLabel = summary.resolved > 0 ? `${summary.averageR >= 0 ? "+" : ""}${summary.averageR.toFixed(2)}R` : "n/d";
  const entriesHtml = entries.length > 0
    ? entries.map((entry) => {
        const openedAt = Number.isFinite(entry.openedAtMs)
          ? new Date(entry.openedAtMs).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          : "--:--";
        const outcome = Number.isFinite(entry.outcomeR)
          ? `${entry.outcomeR >= 0 ? "+" : ""}${entry.outcomeR.toFixed(2)}R`
          : entry.status === "partial"
            ? "TP1"
            : "aberto";

        return `
          <li class="timing-journal-row" data-status="${escapeHtml(entry.status)}">
            <span>${escapeHtml(openedAt)}</span>
            <strong>${escapeHtml(String(entry.side ?? "neutral").toUpperCase())}</strong>
            <span>${escapeHtml(formatExecutionJournalStatus(entry.status))}</span>
            <span>${escapeHtml(outcome)}</span>
          </li>
        `;
      }).join("")
    : `<li class="timing-journal-row" data-status="empty"><span>Sem planos registrados ainda.</span></li>`;

  return `
    <article class="analysis-block timing-block timing-execution-journal" data-tone="${escapeHtml(summary.tone)}" id="timing-execution-journal-panel">
      <header class="timing-execution-journal__head">
        <div>
          <h4>Execution Journal</h4>
          <p>${escapeHtml(summary.guidance)}</p>
        </div>
        <div class="timing-execution-journal__actions">
          <button type="button" data-execution-journal-action="record">Registrar plano</button>
          <button type="button" data-execution-journal-action="paper">Abrir Paper</button>
          <button type="button" data-execution-journal-action="clear">Limpar</button>
        </div>
      </header>
      <div class="timing-execution-journal__grid">
        <article><span>Score</span><strong>${escapeHtml(scoreLabel)}</strong><small>${escapeHtml(summary.sampleState)}</small></article>
        <article><span>Win rate ghost</span><strong>${escapeHtml(winRateLabel)}</strong><small>${summary.resolved} fechados</small></article>
        <article><span>Payoff medio</span><strong>${escapeHtml(averageRLabel)}</strong><small>${summary.open} abertos</small></article>
        <article><span>Total auditado</span><strong>${summary.total}</strong><small>${escapeHtml(formatPrice(resolveTimingCurrentPrice(chartLabState.snapshot), currency))}</small></article>
      </div>
      <ul class="timing-journal-list" role="list">${entriesHtml}</ul>
    </article>
  `;
}

function renderTimingDeskHtml(analysis, snapshot, currency) {
  const nowMs = Date.now();
  const session = getCurrentTradingSessionUtc(nowMs);
  const regime = getVolatilityRegime(analysis?.timing?.volatilityPercent);
  const assetClass = detectAssetClassForTiming(snapshot?.assetId);
  const killzones = getKillzonesForAssetClass(assetClass);
  const orderFlow = buildTimingOrderFlowSnapshot({ snapshot });
  const marketRegime = buildMarketRegimeSnapshot({ snapshot, orderFlow });
  const liquidityHeatmap = buildLiquidityHeatmapSnapshot({ snapshot });
  const executionGate = buildExecutionGateSnapshot({ analysis, liquidityHeatmap, marketRegime, orderFlow });
  const currentPrice = resolveTimingCurrentPrice(snapshot);
  const executionPlan = buildExecutionPlanSnapshot({ analysis, currentPrice, executionGate });
  const executionJournal = syncExecutionJournalFromTiming({ analysis, currentPrice, executionGate, executionPlan, snapshot });
  const executionQuality = buildExecutionQualitySnapshot({
    executionGate,
    executionPlan,
    journalSummary: executionJournal.summary,
  });
  const automationGuard = buildExecutionAutomationGuardSnapshot({
    executionGate,
    executionPlan,
    executionQuality,
    journalSummary: executionJournal.summary,
    operationalMode: chartLabState.operationalMode,
    snapshot,
  });
  updateExecutionChartVisualState(executionGate, executionPlan, executionJournal.summary, executionQuality);
  renderChartExecutionHud({ currency, currentPrice, executionGate, executionPlan, executionQuality });
  latestTimingExecutionContext = {
    ...(latestTimingExecutionContext ?? {}),
    automationGuard,
    executionQuality,
  };
  maybeDispatchOperatorAutoSignal({
    automationGuard,
    executionPlan,
    executionQuality,
    snapshot,
  });
  const utcHourNow = new Date(nowMs).getUTCHours();

  const macroRadar = snapshot?.institutional?.macroRadar;
  const macroEvents = Array.isArray(macroRadar?.upcomingEvents) ? macroRadar.upcomingEvents.slice(0, 6) : [];
  const newsProxy = Array.isArray(analysis?.newsProxy) ? analysis.newsProxy : [];

  const sessionsTimelineHtml = TIMING_DESK_SESSIONS.map((s) => {
    const isActive = isUtcHourInSession(utcHourNow, s.startUtcHour, s.endUtcHour);
    return `
      <li class="timing-session-row" data-active="${isActive}">
        <span class="timing-session-icon" aria-hidden="true">${s.icon}</span>
        <span class="timing-session-name">${escapeHtml(s.label)}</span>
        <span class="timing-session-hours">${String(s.startUtcHour).padStart(2, "0")}:00 → ${String(s.endUtcHour).padStart(2, "0")}:00 UTC</span>
        ${isActive ? `<span class="timing-session-tag">VOCE ESTA AQUI</span>` : ""}
      </li>`;
  }).join("");

  const killRecommendedHtml = killzones.recommended.map((k) => `
    <article class="timing-killzone-card" data-kind="recommended" title="${escapeHtml(k.hint)}">
      <header><span class="timing-killzone-range">${escapeHtml(k.range)}</span></header>
      <strong>${escapeHtml(k.title)}</strong>
      <p>${escapeHtml(k.hint)}</p>
    </article>`).join("");

  const killAvoidHtml = killzones.avoid.map((k) => `
    <article class="timing-killzone-card" data-kind="avoid" title="${escapeHtml(k.hint)}">
      <header><span class="timing-killzone-range">${escapeHtml(k.range)}</span></header>
      <strong>${escapeHtml(k.title)}</strong>
      <p>${escapeHtml(k.hint)}</p>
    </article>`).join("");

  const eventsHtml = macroEvents.length > 0
    ? macroEvents.map((ev) => {
        const name = typeof ev?.name === "string" ? ev.name : "Evento macro";
        const impact = typeof ev?.impact === "string" ? ev.impact.toLowerCase() : "medium";
        const hours = typeof ev?.hoursToEvent === "number" && Number.isFinite(ev.hoursToEvent) ? `em ${ev.hoursToEvent}h` : "n/d";
        const currencyTag = typeof ev?.currency === "string" ? ev.currency : (typeof ev?.region === "string" ? ev.region : "GLOBAL");
        const bias = typeof ev?.bias === "string" ? ev.bias : "neutro";
        return `
          <li class="timing-event-row" data-impact="${escapeHtml(impact)}">
            <span class="timing-event-when">${escapeHtml(hours)}</span>
            <span class="timing-event-currency">${escapeHtml(currencyTag)}</span>
            <span class="timing-event-name">${escapeHtml(name)}</span>
            <span class="timing-event-impact" data-impact="${escapeHtml(impact)}">${escapeHtml(impact.toUpperCase())}</span>
            <span class="timing-event-bias" data-bias="${escapeHtml(bias)}">${escapeHtml(bias)}</span>
          </li>`;
      }).join("")
    : newsProxy.map((item) => `
        <li class="timing-event-row" data-impact="proxy">
          <span class="timing-event-when">proxy</span>
          <span class="timing-event-currency">QUANT</span>
          <span class="timing-event-name">${escapeHtml(item)}</span>
          <span class="timing-event-impact" data-impact="proxy">SINAL</span>
          <span class="timing-event-bias" data-bias="neutro">derivado</span>
        </li>`).join("");

  const binaryWarnHtml = (typeof isBinaryOptionsOperationalMode === "function" && isBinaryOptionsOperationalMode())
    ? `<div class="timing-binary-warn" role="alert">⚠️ Modo Binario ativo: evite expiracoes curtas a ±15min de eventos HIGH impact.</div>`
    : "";

  return `
    <section class="timing-desk" aria-label="Timing Desk Institucional">
      <header class="timing-desk-header">
        <article class="timing-context-card" data-tone="${regime.tone}">
          <span class="timing-context-label">Volatilidade</span>
          <strong id="timing-vol-status">${escapeHtml(regime.label)}</strong>
          <span class="timing-context-meta">${(analysis?.timing?.volatilityPercent ?? 0).toFixed(2)}% (range recente)</span>
        </article>
        <article class="timing-context-card" data-tone="${session.primary === "overlap-london-ny" ? "hot" : "neutral"}">
          <span class="timing-context-label">Sessao Ativa</span>
          <strong id="timing-session-active" data-primary="${session.primary ?? "none"}">${escapeHtml(session.label)}</strong>
          <span class="timing-context-meta"><span class="timing-utc-clock" id="timing-utc-clock">${escapeHtml(formatUtcClock())}</span></span>
        </article>
        <article class="timing-context-card" data-tone="${escapeHtml(orderFlow.volume.anomaly ? orderFlow.volume.tone : orderFlow.cvd.tone)}">
          <span class="timing-context-label">Order Flow</span>
          <strong>${escapeHtml(orderFlow.cvd.label)}</strong>
          <span class="timing-context-meta">Vol z ${escapeHtml(orderFlow.volume.ready ? `${orderFlow.volume.zScore >= 0 ? "+" : ""}${orderFlow.volume.zScore.toFixed(2)}σ` : "n/d")}</span>
        </article>
        <article class="timing-context-card" data-tone="${escapeHtml(marketRegime.tone)}">
          <span class="timing-context-label">Regime</span>
          <strong id="timing-market-regime-status">${escapeHtml(marketRegime.label)}</strong>
          <span class="timing-context-meta">Risco ${Number.isFinite(marketRegime.riskMultiplier) ? Math.round(marketRegime.riskMultiplier * 100) : 0}%</span>
        </article>
      </header>

      ${binaryWarnHtml}

      ${renderTimingMarketRegimePanel(marketRegime)}

      ${renderTimingExecutionGatePanel(executionGate)}

      ${renderTimingExecutionPlanPanel(executionPlan, currency)}

      ${renderTimingExecutionQualityPanel(executionQuality)}

      ${renderTimingAutomationGuardPanel(automationGuard)}

      ${renderTimingExecutionJournalPanel(executionJournal.summary, executionJournal.recentEntries, currency)}

      ${renderTimingOrderFlowPanel(orderFlow)}

      <article class="analysis-block timing-block">
        <h4>🌐 Mapa de Liquidez Global (UTC)</h4>
        <ul class="timing-sessions-list" id="timing-sessions-list">${sessionsTimelineHtml}</ul>
      </article>

      <article class="analysis-block timing-block">
        <h4>🎯 Killzones ICT / SMC ${assetClass === "crypto" ? "<span class=\"timing-asset-tag\">CRYPTO 24/7 + funding</span>" : "<span class=\"timing-asset-tag\">FOREX</span>"}</h4>
        <div class="timing-killzone-grid" id="timing-killzone-list">
          <div class="timing-killzone-col" data-kind="recommended">
            <h5>✅ Janelas Recomendadas</h5>
            ${killRecommendedHtml}
          </div>
          <div class="timing-killzone-col" data-kind="avoid">
            <h5>❌ Zonas a Evitar</h5>
            ${killAvoidHtml}
          </div>
        </div>
      </article>

      <article class="analysis-block timing-block">
        <h4>📅 Calendario Macro ${macroEvents.length === 0 ? "<span class=\"timing-asset-tag\">fallback proxy</span>" : ""}</h4>
        <ul class="timing-events-list" id="timing-events-list">
          ${eventsHtml || `<li class="timing-event-row" data-impact="empty"><span class="timing-event-name">Sem eventos nas proximas horas.</span></li>`}
        </ul>
      </article>

      <article class="analysis-block timing-block">
        <h4>⏱️ Janela do Setup Atual</h4>
        <p>${escapeHtml(analysis.timing.executionWindow)}</p>
        <p class="timing-muted">Invalidacao: ${escapeHtml(formatPrice(analysis.timing.invalidationLevel, currency))} • ${escapeHtml(analysis.timing.note)}</p>
      </article>
    </section>
  `;
}

function renderDeepAnalysisPanelImmediate(snapshot) {
  if (!(analysisPanel instanceof HTMLElement)) {
    return;
  }

  // ADR-076 — para o relogio UTC ao re-renderizar; reinicia se a aba ativa for "timing".
  stopTimingUtcClock();

  ensureActiveAnalysisTabForOperationalMode(chartLabState.operationalMode);

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

    clearTriggerNarrative();
    clearEnsembleEngine();
    clearInstitutionalSummary();
    clearExecutionChartVisualState();
    clearChartExecutionHud();

    if (analysisTabsElement instanceof HTMLElement) {
      analysisTabsElement.innerHTML = "";
    }

    if (analysisTabContentElement instanceof HTMLElement) {
      analysisTabContentElement.innerHTML = "";
    }

    return;
  }

  if (analysisStatusElement instanceof HTMLElement) {
    analysisStatusElement.textContent = isBinaryOptionsOperationalMode()
      ? "Workspace Binario ativo: foco em micro-timing, CALL/PUT, gatilho frio/quente e ghost tracker de assertividade da sessao."
      : "Modelagem quantitativa desbloqueada: tecnica + SMC + harmonicos + WEGD + probabilidades + timing, sem bloqueio de plano.";
  }

  const precomputedMicroTiming = isBinaryOptionsOperationalMode()
    ? buildMicroTimingAnalysis(analysis, snapshot)
    : null;

  if (precomputedMicroTiming) {
    updateBinaryOptionsGhostTracker(snapshot, precomputedMicroTiming);
    void refreshBinaryOptionsGhostAuditHistory(snapshot);
  }

  if (!precomputedMicroTiming && isSpotMarginOperationalMode()) {
    updateSpotMarginGhostTracker(snapshot, analysis);
    void refreshBinaryOptionsGhostAuditHistory(snapshot);
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

  renderTriggerNarrative(analysis);
  renderEnsembleEngine(analysis, snapshot, {
    microTiming: precomputedMicroTiming,
    operationalMode: chartLabState.operationalMode,
  });

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

  renderInstitutionalSummary(analysis, snapshot, {
    microTiming: precomputedMicroTiming,
  });

  renderAnalysisTabs();
  renderAnalysisTabContent(analysis, snapshot, {
    microTiming: precomputedMicroTiming,
  });

  // ADR-069: hidrata o Relatório Executivo (modal) com o snapshot mais recente.
  generateExecutiveReport({
    ...analysis,
    microTiming: precomputedMicroTiming ?? analysis.microTiming,
    asset: snapshot?.asset ?? snapshot?.symbol,
    timeframe: snapshot?.timeframe,
    snapshotAt: snapshot?.fetchedAt ?? Date.now(),
  });
}

/**
 * Narrativa institucional do gatilho: combina sweep de liquidez SMC, estrutura
 * de mercado, zona Premium/Discount e nota de timing em uma frase humanizada.
 * Sem string fixa: tudo deriva do snapshot real ja computado.
 * WebSocket-ready: SSE/WS pode reescrever apenas textContent (sem reflow do DOM).
 */
function renderTriggerNarrative(analysis) {
  if (!(analysisTriggerNarrativeElement instanceof HTMLElement)) {
    return;
  }

  if (!analysis || typeof analysis !== "object") {
    clearTriggerNarrative();
    return;
  }

  const tone = typeof analysis.signal?.tone === "string" ? analysis.signal.tone : "neutral";
  const zone = typeof analysis.context?.zone === "string" ? analysis.context.zone : "";
  const sweep = typeof analysis.smc?.sweepRisk === "string" ? analysis.smc.sweepRisk.trim() : "";
  const structure = typeof analysis.smc?.structure === "string" ? analysis.smc.structure.trim() : "";
  const liquidity = typeof analysis.smc?.liquidity === "string" ? analysis.smc.liquidity.trim() : "";
  const note = typeof analysis.timing?.note === "string" ? analysis.timing.note.trim() : "";

  const parts = [];
  if (sweep) parts.push(sweep);
  if (structure) parts.push(structure);
  if (liquidity && parts.length < 2) parts.push(liquidity);
  if (note && parts.length < 3) parts.push(note);

  if (parts.length === 0) {
    clearTriggerNarrative();
    return;
  }

  const zoneSuffix = zone ? ` Zona atual: ${zone}.` : "";
  const narrative = `Gatilho: ${parts.slice(0, 2).join(" - ")}.${zoneSuffix}`;

  if (analysisTriggerNarrativeElement.textContent !== narrative) {
    analysisTriggerNarrativeElement.textContent = narrative;
  }
  analysisTriggerNarrativeElement.dataset.tone = tone;
  analysisTriggerNarrativeElement.hidden = false;
}

function clearTriggerNarrative() {
  if (!(analysisTriggerNarrativeElement instanceof HTMLElement)) return;
  analysisTriggerNarrativeElement.textContent = "";
  analysisTriggerNarrativeElement.hidden = true;
  analysisTriggerNarrativeElement.removeAttribute("data-tone");
}

/**
 * Pesos do Ensemble Engine (motor quantitativo).
 *
 * VETO ao anti-pattern de pesos fixos hardcoded (35/30/20/15): isso mente ao
 * usuario. Em vez disso, derivamos o peso de cada motor do snapshot real e
 * normalizamos a soma para 100%. O peso BASE de cada motor depende ainda do
 * operationalMode:
 *   - binary options: ghost+kinetic dominam (timing curto)
 *   - spot/margin:    smc+harmonic dominam (estrutura)
 *
 * Confianca individual (0-100) tambem deriva do snapshot:
 *   - ghost  -> winRate apos >=5 trades resolvidos (fail-honest)
 *   - smc    -> presenca de sweep/liquidity/structure detectados
 *   - hft    -> microTiming.momentumStrength (binary) ou signal.confidence (spot)
 *   - harm   -> analysis.harmonic.confidence
 *   - macro  -> distancia do extremo F&G (quanto mais fora do extremo, melhor)
 *
 * WebSocket-ready: cada barra tem id estavel + data-engine + data-weight +
 * data-confidence. Layer SSE pode atualizar atributos/largura sem reconstruir
 * o DOM (latest-wins via requestAnimationFrame ja em uso no projeto).
 */
function renderEnsembleEngine(analysis, snapshot, options = {}) {
  if (!(analysisEnsembleEngineElement instanceof HTMLElement)
    || !(analysisEnsembleListElement instanceof HTMLElement)) {
    return;
  }

  if (!analysis || typeof analysis !== "object" || !analysis.signal) {
    clearEnsembleEngine();
    return;
  }

  const microTiming = options?.microTiming ?? null;
  const operationalMode = options?.operationalMode ?? chartLabState.operationalMode;
  const isBinary = operationalMode === CHART_OPERATIONAL_MODE_BINARY_OPTIONS;
  const directionalBias = analysis.signal?.tone === "sell"
    ? "bear"
    : analysis.signal?.tone === "buy"
      ? "bull"
      : "neutral";
  const targetProfileWeights = Object.freeze({
    smc: 35,
    hft: 30,
    harmonic: 20,
    macro: 15,
  });

  // ---- Confianca de cada motor (0-100) ----
  const ghostStats = isBinary ? getBinaryOptionsGhostTrackerStats() : getSpotMarginGhostTrackerStats();
  const ghostResolved = Number.isFinite(ghostStats?.resolvedTrades) ? ghostStats.resolvedTrades : 0;
  const ghostWinRate = Number.isFinite(ghostStats?.winRate) ? ghostStats.winRate : 0;
  const ghostConfidence = ghostResolved >= 5 ? Math.max(0, Math.min(100, ghostWinRate)) : 0;

  const smcStructure = typeof analysis.smc?.structure === "string" ? analysis.smc.structure.trim() : "";
  const smcLiquidity = typeof analysis.smc?.liquidity === "string" ? analysis.smc.liquidity.trim() : "";
  const smcSweep = typeof analysis.smc?.sweepRisk === "string" ? analysis.smc.sweepRisk.trim() : "";
  const smcConfluence = deriveSmcConfluence({
    analysis,
    snapshot,
  });
  const smcSignals = [
    smcConfluence.checks.sweepConfirmed,
    smcConfluence.checks.fvgAligned,
    smcConfluence.checks.trendAligned,
  ].filter(Boolean).length;
  const smcConfidence = Math.round((smcSignals / 3) * 100);

  const hftConfidence = isBinary && microTiming
    ? Math.max(0, Math.min(100, Number(microTiming.momentumStrength ?? 0) * 100))
    : Math.max(0, Math.min(100, Number(analysis.signal?.confidence ?? 0)));

  const harmonicConfidence = Math.max(0, Math.min(100, Number(analysis.harmonic?.confidence ?? 0)));

  const fgScore = Number(analysis.fearGreed?.score ?? 50);
  const fgDistance = Math.abs(50 - fgScore);
  const macroConfidence = Math.max(0, Math.min(100, 100 - (fgDistance * 2)));

  // ---- Peso BASE adaptativo (soma = 100) ----
  // Binary: timing curto privilegia ghost+hft. Spot: estrutura privilegia smc+harmonic.
  const baseWeights = isBinary
    ? { ghost: 35, smc: 22, hft: 28, harmonic: 8, macro: 7 }
    : { ghost: 22, smc: 32, hft: 18, harmonic: 18, macro: 10 };

  // ---- Peso EFETIVO = base * (confianca/100). Renormaliza para somar 100. ----
  const raw = {
    ghost: baseWeights.ghost * (ghostConfidence / 100),
    smc: baseWeights.smc * (smcConfidence / 100),
    hft: baseWeights.hft * (hftConfidence / 100),
    harmonic: baseWeights.harmonic * (harmonicConfidence / 100),
    macro: baseWeights.macro * (macroConfidence / 100),
  };
  const rawTotal = raw.ghost + raw.smc + raw.hft + raw.harmonic + raw.macro;
  const norm = (v) => (rawTotal > 0 ? Math.round((v / rawTotal) * 100) : 0);
  const weights = {
    ghost: norm(raw.ghost),
    smc: norm(raw.smc),
    hft: norm(raw.hft),
    harmonic: norm(raw.harmonic),
    macro: norm(raw.macro),
  };

  const engines = [
    {
      id: "smc",
      label: "Smart Money Concepts",
      hint: smcSignals === 3 ? "3/3 sinais detectados" : `${smcSignals}/3 sinais ativos`,
      weight: weights.smc,
      targetWeight: targetProfileWeights.smc,
      role: "core",
      bias: directionalBias,
      confidence: smcConfidence,
      tooltip: `structure=${smcStructure || "n/d"} | liquidity=${smcLiquidity || "n/d"} | sweep=${smcSweep || "n/d"} | base ${baseWeights.smc}%`,
    },
    {
      id: "hft",
      label: "Exaustao Cinetica (HFT)",
      hint: isBinary
        ? (hftConfidence >= 70 ? "Momentum exausto" : hftConfidence >= 45 ? "Tick acelerando" : "Mercado frio")
        : (hftConfidence >= 70 ? "Edge alto" : hftConfidence >= 50 ? "Edge moderado" : "Edge fraco"),
      weight: weights.hft,
      targetWeight: targetProfileWeights.hft,
      role: "core",
      bias: directionalBias,
      confidence: Math.round(hftConfidence),
      tooltip: isBinary
        ? `momentumStrength=${(Number(microTiming?.momentumStrength ?? 0)).toFixed(2)} | base ${baseWeights.hft}%`
        : `signal.confidence=${Math.round(Number(analysis.signal?.confidence ?? 0))} | base ${baseWeights.hft}%`,
    },
    {
      id: "harmonic",
      label: "Geometria Harmonica",
      hint: `Padrao ${escapeHtml(String(analysis.harmonic?.pattern ?? "n/d"))}`,
      weight: weights.harmonic,
      targetWeight: targetProfileWeights.harmonic,
      role: "core",
      bias: directionalBias,
      confidence: Math.round(harmonicConfidence),
      tooltip: `pattern=${analysis.harmonic?.pattern ?? "n/d"} | ratio=${(Number(analysis.harmonic?.ratio ?? 0)).toFixed(3)} | base ${baseWeights.harmonic}%`,
    },
    {
      id: "macro",
      label: "Sentimento Macro/Micro",
      hint: `${fgScore.toFixed(0)} (${escapeHtml(String(analysis.fearGreed?.label ?? ""))})`,
      weight: weights.macro,
      targetWeight: targetProfileWeights.macro,
      role: "core",
      bias: directionalBias,
      confidence: Math.round(macroConfidence),
      tooltip: `Fear&Greed=${fgScore.toFixed(1)} | distancia do equilibrio=${fgDistance.toFixed(1)} | base ${baseWeights.macro}%`,
    },
    {
      id: "ghost",
      label: "Ghost Tracker (Auditoria Live)",
      hint: ghostResolved >= 5
        ? `${ghostResolved} trades auditados na sessao`
        : `Aquecendo: ${ghostResolved}/5 trades para confiar`,
      weight: weights.ghost,
      targetWeight: null,
      role: "audit",
      bias: "neutral",
      confidence: Math.round(ghostConfidence),
      tooltip: `Win rate ${ghostWinRate.toFixed(1)}% | trades resolvidos ${ghostResolved} | base ${baseWeights.ghost}% (${isBinary ? "binary" : "spot"})`,
    },
  ];

  if (analysisEnsembleModeElement instanceof HTMLElement) {
    const modeLabel = isBinary ? "Binary" : "Spot/Margem";
    if (analysisEnsembleModeElement.textContent !== modeLabel) {
      analysisEnsembleModeElement.textContent = modeLabel;
    }
    analysisEnsembleModeElement.dataset.mode = isBinary ? "binary" : "spot";
  }

  analysisEnsembleListElement.innerHTML = engines
    .map((engine) => `
      <article
        class="analysis-ensemble-row"
        role="listitem"
        id="ensemble-engine-${engine.id}"
        data-engine="${engine.id}"
        data-role="${engine.role}"
        data-bias="${engine.bias}"
        data-weight="${engine.weight}"
        data-confidence="${engine.confidence}"
        title="${escapeHtml(engine.tooltip)}"
      >
        <div class="analysis-ensemble-row-head">
          <span class="analysis-ensemble-row-label">${escapeHtml(engine.label)}</span>
          <strong class="analysis-ensemble-row-weight">${engine.weight}%</strong>
        </div>
        <div class="analysis-ensemble-bar" aria-hidden="true">
          <span class="analysis-ensemble-bar-fill" style="width: ${engine.weight}%"></span>
        </div>
        <div class="analysis-ensemble-row-foot">
          <span class="analysis-ensemble-row-hint">${escapeHtml(engine.hint)}</span>
          <span class="analysis-ensemble-row-meta">
            <span class="analysis-ensemble-row-target">${engine.targetWeight == null ? "auditoria" : `perfil ${engine.targetWeight}%`}</span>
            <span class="analysis-ensemble-row-conf">conf ${engine.confidence}%</span>
          </span>
        </div>
      </article>
    `)
    .join("");

  analysisEnsembleEngineElement.hidden = false;
}

function clearEnsembleEngine() {
  if (analysisEnsembleListElement instanceof HTMLElement) {
    analysisEnsembleListElement.innerHTML = "";
  }
  if (analysisEnsembleEngineElement instanceof HTMLElement) {
    analysisEnsembleEngineElement.hidden = true;
  }
}

function clearInstitutionalSummary() {
  if (institutionalConfluenceBadgeElement instanceof HTMLElement) {
    institutionalConfluenceBadgeElement.innerHTML = "";
    institutionalConfluenceBadgeElement.removeAttribute("data-score");
  }
  if (institutionalSummaryGridElement instanceof HTMLElement) {
    institutionalSummaryGridElement.innerHTML = "";
  }
  if (institutionalContextStripElement instanceof HTMLElement) {
    institutionalContextStripElement.innerHTML = "";
  }
  if (institutionalChecklistElement instanceof HTMLElement) {
    institutionalChecklistElement.innerHTML = "";
  }
  if (institutionalSummaryElement instanceof HTMLElement) {
    institutionalSummaryElement.removeAttribute("data-tone");
  }
}

/**
 * Deriva o KPI "Motor Cinético" adaptativo ao modo operacional.
 * - Binary options: usa microTiming (momentumStrength + neutralProbability)
 * - Spot/Margem: usa signal.confidence como proxy do edge probabilistico
 */
function buildKineticEngineKpi(analysis, microTiming, operationalMode) {
  if (operationalMode === CHART_OPERATIONAL_MODE_BINARY_OPTIONS && microTiming) {
    const strength = toFiniteNumber(microTiming.momentumStrength, 0);
    const neutral = toFiniteNumber(microTiming.neutralProbability, 1);

    if (strength >= 0.7 && neutral <= 0.4) {
      return { label: "HOT", tone: "bull", hint: "Exaustao direcional detectada" };
    }

    if (strength >= 0.45 && neutral <= 0.55) {
      return { label: "WARM", tone: "neutral", hint: "Tick acelerando, aguardando gatilho" };
    }

    return { label: "COLD", tone: "bear", hint: "Mercado frio, evite entradas" };
  }

  const confidence = toFiniteNumber(analysis?.signal?.confidence, 0);

  if (confidence >= 70) {
    return { label: "FORTE", tone: "bull", hint: "Edge probabilistico alto" };
  }

  if (confidence >= 50) {
    return { label: "MODERADO", tone: "neutral", hint: "Confluencia parcial" };
  }

  return { label: "FRACO", tone: "bear", hint: "Sem edge suficiente, aguardar" };
}

/**
 * Deriva o KPI "Estrutura de Mercado" combinando zona institucional,
 * tendencia dominante e tone do sinal. Sem inventar: tudo vem de campos
 * ja computados em analyzeChartSnapshot.
 */
function buildMarketStructureKpi(analysis) {
  const zone = typeof analysis?.context?.zone === "string" ? analysis.context.zone : "";
  const trend = typeof analysis?.context?.trend === "string"
    ? analysis.context.trend.toLowerCase()
    : "";
  const tone = typeof analysis?.signal?.tone === "string" ? analysis.signal.tone : "neutral";

  const normalizedZone = /premium/i.test(zone)
    ? "Premium Zone"
    : /discount|desconto/i.test(zone)
      ? "Discount Zone"
      : "Equilibrium";

  if (tone === "buy" || trend === "alta") {
    return { label: "Bullish", tone: "bull", hint: normalizedZone };
  }

  if (tone === "sell" || trend === "baixa") {
    return { label: "Bearish", tone: "bear", hint: normalizedZone };
  }

  return { label: "Lateral", tone: "neutral", hint: normalizedZone };
}

/**
 * Resumo institucional — grid de 4 KPIs + contexto + checklist HFT/SMC.
 * Consome dados ja computados (analysis, snapshot, ghostStats, propDeskState).
 */
function renderInstitutionalSummary(analysis, snapshot, options = {}) {
  if (!(institutionalSummaryGridElement instanceof HTMLElement)
    || !(institutionalContextStripElement instanceof HTMLElement)
    || !(institutionalChecklistElement instanceof HTMLElement)) {
    return;
  }

  if (!analysis || typeof analysis !== "object" || !analysis.signal) {
    clearInstitutionalSummary();
    return;
  }

  const microTiming = options?.microTiming ?? null;
  const operationalMode = chartLabState.operationalMode;

  // KPI 1 — Assertividade real (Ghost Tracker, fail-honest)
  const ghostStats = isBinaryOptionsOperationalMode()
    ? getBinaryOptionsGhostTrackerStats()
    : getSpotMarginGhostTrackerStats();
  const resolvedTrades = Number.isFinite(ghostStats?.resolvedTrades) ? ghostStats.resolvedTrades : 0;
  const winRate = Number.isFinite(ghostStats?.winRate) ? ghostStats.winRate : 0;
  const openSignalsCount = Number.isFinite(ghostStats?.openSignals) ? ghostStats.openSignals : 0;
  const winsCount = Number.isFinite(ghostStats?.wins) ? ghostStats.wins : 0;
  const lossesCount = Number.isFinite(ghostStats?.losses) ? ghostStats.losses : 0;
  const pushesCount = Number.isFinite(ghostStats?.pushes) ? ghostStats.pushes : 0;
  const hasEnoughSamples = resolvedTrades >= 5;
  const winRateKpi = hasEnoughSamples
    ? {
      label: `${winRate.toFixed(1)}%`,
      tone: winRate >= 60 ? "bull" : winRate >= 45 ? "neutral" : "bear",
      hint: `${resolvedTrades} trades auditados (sessao)`,
      tooltip: `Wins ${winsCount} · Losses ${lossesCount} · Pushes ${pushesCount} · Abertos ${openSignalsCount}`,
    }
    : {
      label: "Aquecendo",
      tone: "neutral",
      hint: `${resolvedTrades}/5 trades para ativar auditoria`,
      tooltip: `Amostra insuficiente: win rate honesto exige >= 5 trades resolvidos. Atual: ${resolvedTrades}`,
    };

  // KPI 2 — Estrutura de mercado (SMC)
  const structureKpi = buildMarketStructureKpi(analysis);
  structureKpi.tooltip = `Estrutura: ${analysis?.smc?.structure ?? "n/d"} · Zona: ${analysis?.context?.zone ?? "n/d"}`;

  // KPI 3 — Motor cinetico (adaptativo)
  const kineticKpi = buildKineticEngineKpi(analysis, microTiming, operationalMode);
  if (operationalMode === CHART_OPERATIONAL_MODE_BINARY_OPTIONS && microTiming) {
    const momentumPct = (toFiniteNumber(microTiming.momentumStrength, 0) * 100).toFixed(0);
    const neutralPct = (toFiniteNumber(microTiming.neutralProbability, 0) * 100).toFixed(0);
    kineticKpi.tooltip = `Momentum ${momentumPct}% · Neutro ${neutralPct}% · Thresholds HOT >=70/<=40`;
  } else {
    const confidencePct = toFiniteNumber(analysis?.signal?.confidence, 0).toFixed(0);
    kineticKpi.tooltip = `Confianca do sinal ${confidencePct}% · Thresholds FORTE >=70, MODERADO >=50`;
  }

  // KPI 4 — Risco base (dinamico do Prop Desk)
  const effectiveRiskPercent = propDeskState.propModeEnabled
    ? Math.min(propDeskState.riskPercent, 1)
    : propDeskState.riskPercent;
  const riskKpi = {
    label: `${effectiveRiskPercent.toFixed(2)}%`,
    tone: "neutral",
    hint: propDeskState.propModeEnabled
      ? "Mesa proprietaria: teto 1%/trade"
      : `Exposicao por trade • ${propDeskState.exitStrategy === "three_by_seven" ? "3x7" : "AB"}`,
    tooltip: `Estrategia de saida: ${propDeskState.exitStrategy ?? "n/d"} · Prop mode: ${propDeskState.propModeEnabled ? "on" : "off"}`,
  };

  const kpis = [
    { title: "Assertividade real", ...winRateKpi },
    { title: "Estrutura SMC", ...structureKpi },
    { title: operationalMode === CHART_OPERATIONAL_MODE_BINARY_OPTIONS ? "Motor cinetico" : "Edge probabilistico", ...kineticKpi },
    { title: "Risco base", ...riskKpi },
  ];

  institutionalSummaryGridElement.innerHTML = kpis.map((kpi) => `
    <article class="institutional-kpi" role="listitem" data-tone="${escapeHtml(kpi.tone)}" title="${escapeHtml(kpi.tooltip ?? "")}">
      <span class="institutional-kpi__title">${escapeHtml(kpi.title)}</span>
      <strong class="institutional-kpi__value">${escapeHtml(kpi.label)}</strong>
      <span class="institutional-kpi__hint">${escapeHtml(kpi.hint)}</span>
    </article>
  `).join("");

  // Context strip — 3 blocos (volatilidade, momento, confluencia)
  const rangeLow = toFiniteNumber(analysis?.context?.rangeLow, 0);
  const rangeHigh = toFiniteNumber(analysis?.context?.rangeHigh, 0);
  const rangePct = rangeLow > 0 && rangeHigh > rangeLow
    ? ((rangeHigh - rangeLow) / rangeLow) * 100
    : 0;
  const volatilityLabel = rangePct > 0 ? `${rangePct.toFixed(2)}% range` : "n/d";
  const energy = toFiniteNumber(analysis?.wegd?.energy, 0);
  const momentumLabel = operationalMode === CHART_OPERATIONAL_MODE_BINARY_OPTIONS && microTiming
    ? `${(toFiniteNumber(microTiming.momentumStrength, 0) * 100).toFixed(0)}% strength`
    : `${energy.toFixed(0)}/99 energy`;
  const confluenceSource = analysis?.smc?.structure ?? analysis?.context?.trend ?? "lateral";
  const confluenceLabel = /alta|bull/i.test(String(confluenceSource))
    ? "Bullish alinhada"
    : /baixa|bear/i.test(String(confluenceSource))
      ? "Bearish alinhada"
      : "Mista/lateral";

  const contextBlocks = [
    { label: "Volatilidade atual", value: volatilityLabel },
    { label: operationalMode === CHART_OPERATIONAL_MODE_BINARY_OPTIONS ? "Aceleracao do tick" : "Energia WEGD", value: momentumLabel },
    { label: "Confluencia maior", value: confluenceLabel },
  ];

  institutionalContextStripElement.innerHTML = contextBlocks.map((block) => `
    <article class="institutional-context-block" role="listitem">
      <span>${escapeHtml(block.label)}</span>
      <strong>${escapeHtml(block.value)}</strong>
    </article>
  `).join("");

  // Checklist HFT+SMC (flags numericas derivadas dos candles do snapshot)
  const smcConfluence = deriveSmcConfluence({
    analysis,
    snapshot,
  });
  const sweepConfirmed = smcConfluence.checks.sweepConfirmed;
  const fvgAligned = smcConfluence.checks.fvgAligned;
  const trendAligned = smcConfluence.checks.trendAligned;
  const fearGreedOk = smcConfluence.checks.fearGreedOk;
  const volatilityOk = smcConfluence.checks.volatilityOk;

  const checks = [
    {
      label: "Sweep de liquidez (PDL/PDH varridos)",
      ok: sweepConfirmed,
      hint: sweepConfirmed
        ? `Extremo ${smcConfluence.sweep.direction} varrido e rejeitado`
        : "Aguardando varredura real de extremos",
    },
    {
      label: "Mitigacao de FVG (Fair Value Gap)",
      ok: fvgAligned,
      hint: fvgAligned
        ? `FVG ${smcConfluence.fvg.bias} mitigado na janela`
        : "Sem FVG mitigado alinhado ao sinal",
    },
    {
      label: "Tendencia e sinal alinhados",
      ok: trendAligned,
      hint: trendAligned ? "Tendencia maior confirma o sinal" : "Sinal contratendencia: maior risco",
    },
    {
      label: "Fear & Greed fora de extremo",
      ok: fearGreedOk,
      hint: fearGreedOk ? "Regime psicologico neutro" : "Mercado em extremo: risco de reversao",
    },
    {
      label: "Volatilidade operacional saudavel",
      ok: volatilityOk,
      hint: volatilityOk ? `Range ${rangePct.toFixed(2)}% saudavel` : "Volatilidade fora do envelope seguro",
    },
  ];

  institutionalChecklistElement.innerHTML = checks.map((check) => `
    <li class="institutional-check" data-ok="${check.ok ? "true" : "false"}">
      <span class="institutional-check__icon" aria-hidden="true">${check.ok ? "✓" : "✕"}</span>
      <span class="institutional-check__label">${escapeHtml(check.label)}</span>
      <span class="institutional-check__hint">${escapeHtml(check.hint)}</span>
    </li>
  `).join("");

  // Badge de confluencia — score 0/5 derivado do proprio checklist (zero duplo compute)
  if (institutionalConfluenceBadgeElement instanceof HTMLElement) {
    const confluenceScore = checks.reduce((acc, check) => acc + (check.ok ? 1 : 0), 0);
    const confluenceTone = confluenceScore >= 4 ? "bull" : confluenceScore >= 2 ? "neutral" : "bear";
    const confluenceTitle = confluenceScore >= 4
      ? "Confluencia forte"
      : confluenceScore >= 2
        ? "Confluencia parcial"
        : "Confluencia fraca";
    const activeLabels = checks.filter((check) => check.ok).map((check) => check.label.split(" ")[0]).join(", ");
    const dots = checks.map((check) => `<span class="institutional-confluence-badge__dot" data-ok="${check.ok ? "true" : "false"}" aria-hidden="true"></span>`).join("");
    institutionalConfluenceBadgeElement.dataset.score = String(confluenceScore);
    institutionalConfluenceBadgeElement.dataset.tone = confluenceTone;
    institutionalConfluenceBadgeElement.innerHTML = `
      <div class="institutional-confluence-badge__score" title="${escapeHtml(activeLabels || "Nenhum fator confluente")}">
        <strong>${confluenceScore}/5</strong>
        <span>${escapeHtml(confluenceTitle)}</span>
      </div>
      <div class="institutional-confluence-badge__dots" aria-label="Fatores confluentes ${confluenceScore} de 5">${dots}</div>
    `;
  }

  if (institutionalSummaryElement instanceof HTMLElement) {
    institutionalSummaryElement.dataset.tone = analysis.signal.tone;
  }
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

function clearChartErrorStatusMode() {
  if (!(chartStatusElement instanceof HTMLElement)) {
    return;
  }

  if (chartStatusElement.getAttribute("data-mode") === "error") {
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

function setChartFallbackBadge(message = "", mode = "") {
  if (!(chartFallbackBadgeElement instanceof HTMLElement)) {
    return;
  }

  const normalizedMessage = typeof message === "string" ? message.trim() : "";

  if (normalizedMessage.length === 0) {
    chartFallbackBadgeElement.classList.add("is-hidden");
    chartFallbackBadgeElement.textContent = "";
    chartFallbackBadgeElement.removeAttribute("data-mode");
    chartFallbackBadgeElement.setAttribute("aria-hidden", "true");
    return;
  }

  chartFallbackBadgeElement.textContent = normalizedMessage;
  chartFallbackBadgeElement.classList.remove("is-hidden");
  chartFallbackBadgeElement.setAttribute("aria-hidden", "false");

  if (mode) {
    chartFallbackBadgeElement.setAttribute("data-mode", mode);
  } else {
    chartFallbackBadgeElement.removeAttribute("data-mode");
  }
}

function setChartLegendTransient(message, mode = "warn") {
  const nowMs = Date.now();

  if (
    message === chartLastTransientLegendMessage
    && nowMs - chartLastTransientLegendAtMs < CHART_TRANSIENT_LEGEND_MIN_INTERVAL_MS
  ) {
    return;
  }

  chartLastTransientLegendMessage = message;
  chartLastTransientLegendAtMs = nowMs;
  setChartLegend(message, mode);
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
    favoriteIntervals: getOrderedFavoriteTerminalIntervals(),
    interval: getSelectedTerminalInterval(),
    mode: chartModeSelect instanceof HTMLSelectElement ? chartModeSelect.value : "delayed",
    operationalMode: chartLabState.operationalMode,
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
    viewMode: chartLabState.viewMode,
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

  if (typeof preferences.operationalMode === "string") {
    chartLabState.operationalMode = normalizeChartOperationalMode(preferences.operationalMode);
  }

  if (chartOperationalModeSelect instanceof HTMLSelectElement) {
    chartOperationalModeSelect.value = chartLabState.operationalMode;
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

    if (sanitized.length >= 2) {
      chartSymbolInput.value = sanitized;
    }
  }

  if (Array.isArray(preferences.favoriteIntervals)) {
    const sanitizedFavorites = preferences.favoriteIntervals
      .map((value) => normalizeTerminalInterval(value))
      .filter((value, index, collection) => TERMINAL_INTERVAL_SET.has(value) && collection.indexOf(value) === index)
      .slice(0, TERMINAL_INTERVAL_MENU_MAX_FAVORITES);

    if (sanitizedFavorites.length >= TERMINAL_INTERVAL_MENU_MIN_FAVORITES) {
      favoriteTerminalIntervals = new Set(sanitizedFavorites);
    }
  }

  ensureFavoriteTerminalIntervalsSanity();

  setActiveTerminalInterval(preferences.interval, {
    closeMenu: true,
  });

  if (preferences.viewMode === "copilot" || preferences.viewMode === "tv") {
    chartLabState.viewMode = preferences.viewMode;
  }
}

function parseOptionalNumber(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();

    if (normalized.length > 0) {
      const parsed = Number.parseFloat(normalized);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

function sanitizePropDeskState(candidate) {
  const accountSize = roundNumber(
    clampNumber(
      parseOptionalNumber(candidate?.accountSize, PROP_DESK_DEFAULT_STATE.accountSize),
      100,
      100000000,
    ),
    2,
  );
  const riskPercent = roundNumber(
    clampNumber(
      parseOptionalNumber(candidate?.riskPercent, PROP_DESK_DEFAULT_STATE.riskPercent),
      0.1,
      5,
    ),
    2,
  );
  const stopLoss = roundNumber(
    clampNumber(
      parseOptionalNumber(candidate?.stopLoss, PROP_DESK_DEFAULT_STATE.stopLoss),
      0.1,
      10000,
    ),
    2,
  );
  const trackerWins = Math.round(
    clampNumber(
      parseOptionalNumber(candidate?.trackerWins, PROP_DESK_DEFAULT_STATE.trackerWins),
      0,
      10,
    ),
  );
  let trackerLosses = Math.round(
    clampNumber(
      parseOptionalNumber(candidate?.trackerLosses, PROP_DESK_DEFAULT_STATE.trackerLosses),
      0,
      10,
    ),
  );

  if (trackerWins + trackerLosses > 10) {
    trackerLosses = Math.max(0, 10 - trackerWins);
  }

  const exitStrategy = candidate?.exitStrategy === "arbitrage_ab"
    ? "arbitrage_ab"
    : "three_by_seven";

  return {
    accountSize,
    exitStrategy,
    propModeEnabled: candidate?.propModeEnabled === true,
    riskPercent,
    stopLoss,
    trackerLosses,
    trackerWins,
  };
}

function readStoredPropDeskPreferences() {
  try {
    const raw = localStorage.getItem(PROP_DESK_STORAGE_KEY);

    if (!raw) {
      return {
        ...PROP_DESK_DEFAULT_STATE,
      };
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return {
        ...PROP_DESK_DEFAULT_STATE,
      };
    }

    return sanitizePropDeskState(parsed);
  } catch {
    return {
      ...PROP_DESK_DEFAULT_STATE,
    };
  }
}

function readStoredWatchlistRiskSummaryCollapsed() {
  try {
    return localStorage.getItem(WATCHLIST_RISK_SUMMARY_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveWatchlistRiskSummaryCollapsed() {
  try {
    localStorage.setItem(
      WATCHLIST_RISK_SUMMARY_COLLAPSED_STORAGE_KEY,
      isWatchlistRiskSummaryCollapsed ? "1" : "0",
    );
  } catch {
    // Ignore storage errors and keep UX stateless.
  }
}

function savePropDeskPreferences() {
  try {
    localStorage.setItem(PROP_DESK_STORAGE_KEY, JSON.stringify(propDeskState));
  } catch {
    // Ignore storage errors and keep UX stateless.
  }
}

function updatePropStrategyHint(exitStrategy) {
  if (!(propStrategyHintElement instanceof HTMLElement)) {
    return;
  }

  propStrategyHintElement.textContent = PROP_DESK_EXIT_STRATEGY_LABELS[exitStrategy]
    ?? PROP_DESK_EXIT_STRATEGY_LABELS.three_by_seven;
}

function derivePropTrackerStatus(state) {
  const totalTrades = state.trackerWins + state.trackerLosses;

  if (totalTrades === 0) {
    return {
      message: "Ciclo pronto. Comece a registrar resultados.",
      mode: "",
    };
  }

  if (state.trackerWins >= 3 && totalTrades <= 10) {
    return {
      message: `Meta alcançada: ${state.trackerWins} wins em ${totalTrades} trades. Foque em preservar o ganho.`,
      mode: "good",
    };
  }

  const tradesLeft = Math.max(0, 10 - totalTrades);
  const winsNeeded = Math.max(0, 3 - state.trackerWins);

  if (tradesLeft === 0) {
    return {
      message: `Ciclo encerrado com ${state.trackerWins} wins e ${state.trackerLosses} losses.`,
      mode: state.trackerWins >= 3 ? "good" : "alert",
    };
  }

  if (winsNeeded > tradesLeft) {
    return {
      message: `Alerta: meta 3x7 quase inviavel (${winsNeeded} wins faltando para ${tradesLeft} trades restantes).`,
      mode: "alert",
    };
  }

  return {
    message: `${winsNeeded} wins necessarios nos proximos ${tradesLeft} trades para fechar o ciclo.`,
    mode: "warn",
  };
}

function renderPropDesk() {
  const effectiveRiskPercent = propDeskState.propModeEnabled
    ? Math.min(propDeskState.riskPercent, 1)
    : propDeskState.riskPercent;
  const riskBudget = propDeskState.accountSize * (effectiveRiskPercent / 100);
  const stopLoss = Math.max(0.1, propDeskState.stopLoss);
  const usdPerPointPerLot = 10;
  const recommendedLot = Math.max(0.01, roundNumber(riskBudget / (stopLoss * usdPerPointPerLot), 2));
  const maxLossAtLot = roundNumber(recommendedLot * stopLoss * usdPerPointPerLot, 2);
  const modeLabel = propDeskState.propModeEnabled
    ? "Mesa proprietaria ativa: risco efetivo limitado a 1% por trade."
    : "Modo padrao ativo. Use controle de risco fixo para preservar capital.";
  const lotLabel = `Lote sugerido: ${recommendedLot.toFixed(2)} | risco maximo: USD ${maxLossAtLot.toFixed(2)} (${effectiveRiskPercent.toFixed(2)}%)`;
  const trackerStatus = derivePropTrackerStatus(propDeskState);
  const totalTrades = propDeskState.trackerWins + propDeskState.trackerLosses;
  const canRegisterTrade = totalTrades < 10;

  if (propModeToggle instanceof HTMLInputElement) {
    propModeToggle.checked = propDeskState.propModeEnabled;
  }

  if (propAccountSizeInput instanceof HTMLInputElement) {
    propAccountSizeInput.value = String(propDeskState.accountSize);
  }

  if (propRiskPercentInput instanceof HTMLInputElement) {
    propRiskPercentInput.value = String(propDeskState.riskPercent);
  }

  if (propStopLossInput instanceof HTMLInputElement) {
    propStopLossInput.value = String(propDeskState.stopLoss);
  }

  if (propExitStrategySelect instanceof HTMLSelectElement) {
    propExitStrategySelect.value = propDeskState.exitStrategy;
  }

  if (propModeStatusElement instanceof HTMLElement) {
    propModeStatusElement.textContent = modeLabel;
  }

  if (propLotResultElement instanceof HTMLElement) {
    propLotResultElement.textContent = lotLabel;
  }

  if (prop3x7WinsElement instanceof HTMLElement) {
    prop3x7WinsElement.textContent = String(propDeskState.trackerWins);
  }

  if (prop3x7LossesElement instanceof HTMLElement) {
    prop3x7LossesElement.textContent = String(propDeskState.trackerLosses);
  }

  if (prop3x7StatusElement instanceof HTMLElement) {
    prop3x7StatusElement.textContent = trackerStatus.message;

    if (trackerStatus.mode.length > 0) {
      prop3x7StatusElement.setAttribute("data-state", trackerStatus.mode);
    } else {
      prop3x7StatusElement.removeAttribute("data-state");
    }
  }

  if (prop3x7WinButton instanceof HTMLButtonElement) {
    prop3x7WinButton.disabled = !canRegisterTrade;
  }

  if (prop3x7LossButton instanceof HTMLButtonElement) {
    prop3x7LossButton.disabled = !canRegisterTrade;
  }

  updatePropStrategyHint(propDeskState.exitStrategy);
  renderWatchlistRiskSummary();
}

function updatePropDeskStateFromInputs() {
  propDeskState = sanitizePropDeskState({
    ...propDeskState,
    accountSize: propAccountSizeInput instanceof HTMLInputElement
      ? propAccountSizeInput.value
      : propDeskState.accountSize,
    exitStrategy: propExitStrategySelect instanceof HTMLSelectElement
      ? propExitStrategySelect.value
      : propDeskState.exitStrategy,
    propModeEnabled: propModeToggle instanceof HTMLInputElement
      ? propModeToggle.checked
      : propDeskState.propModeEnabled,
    riskPercent: propRiskPercentInput instanceof HTMLInputElement
      ? propRiskPercentInput.value
      : propDeskState.riskPercent,
    stopLoss: propStopLossInput instanceof HTMLInputElement
      ? propStopLossInput.value
      : propDeskState.stopLoss,
  });

  savePropDeskPreferences();
  renderPropDesk();
}

function setupPropDesk() {
  const hasRequiredFields =
    propModeToggle instanceof HTMLInputElement
    && propAccountSizeInput instanceof HTMLInputElement
    && propRiskPercentInput instanceof HTMLInputElement
    && propStopLossInput instanceof HTMLInputElement
    && propExitStrategySelect instanceof HTMLSelectElement;

  if (!hasRequiredFields) {
    return;
  }

  propDeskState = readStoredPropDeskPreferences();
  renderPropDesk();

  if (isPropDeskInitialized) {
    return;
  }

  isPropDeskInitialized = true;

  propModeToggle.addEventListener("change", () => {
    updatePropDeskStateFromInputs();
  });

  propAccountSizeInput.addEventListener("input", () => {
    updatePropDeskStateFromInputs();
  });

  propRiskPercentInput.addEventListener("input", () => {
    updatePropDeskStateFromInputs();
  });

  propStopLossInput.addEventListener("input", () => {
    updatePropDeskStateFromInputs();
  });

  propExitStrategySelect.addEventListener("change", () => {
    updatePropDeskStateFromInputs();
  });

  if (prop3x7WinButton instanceof HTMLButtonElement) {
    prop3x7WinButton.addEventListener("click", () => {
      if (propDeskState.trackerWins + propDeskState.trackerLosses >= 10) {
        return;
      }

      propDeskState = sanitizePropDeskState({
        ...propDeskState,
        trackerWins: propDeskState.trackerWins + 1,
      });

      savePropDeskPreferences();
      renderPropDesk();
    });
  }

  if (prop3x7LossButton instanceof HTMLButtonElement) {
    prop3x7LossButton.addEventListener("click", () => {
      if (propDeskState.trackerWins + propDeskState.trackerLosses >= 10) {
        return;
      }

      propDeskState = sanitizePropDeskState({
        ...propDeskState,
        trackerLosses: propDeskState.trackerLosses + 1,
      });

      savePropDeskPreferences();
      renderPropDesk();
    });
  }

  if (prop3x7ResetButton instanceof HTMLButtonElement) {
    prop3x7ResetButton.addEventListener("click", () => {
      propDeskState = sanitizePropDeskState({
        ...propDeskState,
        trackerLosses: 0,
        trackerWins: 0,
      });

      savePropDeskPreferences();
      renderPropDesk();
    });
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

function renderWatchlistRiskSummary() {
  if (!(watchlistRiskSummaryElement instanceof HTMLElement)) {
    return;
  }

  const isCollapsed = isWatchlistRiskSummaryCollapsed;
  const collapseLabel = isCollapsed ? "Expandir" : "Recolher";
  const collapseAriaLabel = isCollapsed
    ? "Expandir snapshot de risco"
    : "Recolher snapshot de risco";

  watchlistRiskSummaryElement.classList.toggle("is-collapsed", isCollapsed);

  const effectiveRiskPercent = propDeskState.propModeEnabled
    ? Math.min(propDeskState.riskPercent, 1)
    : propDeskState.riskPercent;
  const riskBudget = roundNumber(propDeskState.accountSize * (effectiveRiskPercent / 100), 2);
  const stopLoss = Math.max(0.1, propDeskState.stopLoss);
  const usdPerPointPerLot = 10;
  const recommendedLot = Math.max(0.01, roundNumber(riskBudget / (stopLoss * usdPerPointPerLot), 2));
  const totalTrades = propDeskState.trackerWins + propDeskState.trackerLosses;
  const trackerStatus = derivePropTrackerStatus(propDeskState);
  const strategyLabel = propDeskState.exitStrategy === "arbitrage_ab" ? "AB" : "3x7";
  const modeLabel = propDeskState.propModeEnabled ? "Mesa ON" : "Mesa OFF";
  const statusMode = trackerStatus.mode.length > 0 ? trackerStatus.mode : "ok";
  const trackerHint = trackerStatus.message.length > 86
    ? `${trackerStatus.message.slice(0, 83)}...`
    : trackerStatus.message;

  const riskGridHtml = isCollapsed
    ? ""
    : `
      <div class="watchlist-risk-grid">
        <div class="watchlist-risk-chip">
          Modo
          <span>${modeLabel}</span>
        </div>
        <div class="watchlist-risk-chip">
          Estrategia
          <span>${strategyLabel}</span>
        </div>
        <div class="watchlist-risk-chip">
          Risco
          <span>${effectiveRiskPercent.toFixed(2)}%</span>
        </div>
        <div class="watchlist-risk-chip">
          Lote
          <span>${recommendedLot.toFixed(2)}</span>
        </div>
        <div class="watchlist-risk-chip">
          Perda max.
          <span>USD ${riskBudget.toFixed(2)}</span>
        </div>
        <div class="watchlist-risk-chip">
          Ciclo
          <span>${propDeskState.trackerWins}W / ${propDeskState.trackerLosses}L (${Math.min(totalTrades, 10)}/10)</span>
        </div>
      </div>
    `;

  const riskNoteHtml = isCollapsed
    ? ""
    : `<p class="watchlist-risk-note" data-state="${statusMode}">${escapeHtml(trackerHint)}</p>`;

  watchlistRiskSummaryElement.innerHTML = `
    <div class="watchlist-risk-head">
      <strong>Risk Snapshot</strong>
      <div class="watchlist-risk-actions">
        <button
          type="button"
          class="watchlist-risk-collapse"
          aria-expanded="${String(!isCollapsed)}"
          aria-label="${collapseAriaLabel}"
        >${collapseLabel}</button>
        <button type="button" class="watchlist-risk-open">Abrir gestao</button>
      </div>
    </div>
    ${riskGridHtml}
    ${riskNoteHtml}
  `;
}

function getSelectedTerminalSymbol() {
  const selectedExchange = getSelectedTerminalExchange();
  const symbolFromInput = sanitizeTerminalSymbol(
    chartSymbolInput instanceof HTMLInputElement ? chartSymbolInput.value : "",
  );

  if (symbolFromInput.length >= 2) {
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

function getTradingViewTerminalExchange() {
  const exchange = getSelectedTerminalExchange();
  return exchange === "AUTO" ? "BINANCE" : exchange;
}

function getTerminalIntervalDefinition(interval) {
  return TERMINAL_INTERVAL_DEFINITION_MAP.get(String(interval ?? ""))
    ?? TERMINAL_INTERVAL_DEFINITION_MAP.get(TERMINAL_INTERVAL_DEFAULT)
    ?? null;
}

function normalizeTerminalInterval(interval) {
  const rawInterval = String(interval ?? "").trim().toUpperCase();

  if (rawInterval === "D") {
    return "1D";
  }

  if (rawInterval === "W") {
    return "1W";
  }

  if (rawInterval === "M") {
    return "1M";
  }

  if (TERMINAL_INTERVAL_SET.has(rawInterval)) {
    return rawInterval;
  }

  return TERMINAL_INTERVAL_DEFAULT;
}

function getTerminalIntervalDisplayLabel(interval) {
  const definition = getTerminalIntervalDefinition(interval);
  return definition?.label ?? "1 hora";
}

function getTradingViewResolutionForTerminalInterval(interval) {
  const definition = getTerminalIntervalDefinition(interval);
  return definition?.tvResolution ?? TERMINAL_INTERVAL_DEFAULT;
}

function getBackendResolutionForTerminalInterval(interval) {
  const definition = getTerminalIntervalDefinition(interval);
  return typeof definition?.backendResolution === "string" ? definition.backendResolution : null;
}

function isNonTimeBasedTerminalInterval(interval) {
  const definition = getTerminalIntervalDefinition(interval);
  return definition?.group === "ticks" || definition?.group === "ranges";
}

function isSubMinuteTerminalInterval(interval) {
  const backendResolution = getBackendResolutionForTerminalInterval(interval);
  return typeof backendResolution === "string" && backendResolution.endsWith("S");
}

function getOrderedFavoriteTerminalIntervals() {
  const intervalOrderMap = new Map(
    TERMINAL_INTERVAL_DEFINITIONS.map((definition, index) => [definition.value, index]),
  );

  return [...favoriteTerminalIntervals]
    .map((value) => normalizeTerminalInterval(value))
    .filter((value, index, collection) => TERMINAL_INTERVAL_SET.has(value) && collection.indexOf(value) === index)
    .sort((left, right) => {
      const leftOrder = intervalOrderMap.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = intervalOrderMap.get(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}

function ensureFavoriteTerminalIntervalsSanity() {
  const orderedFavorites = getOrderedFavoriteTerminalIntervals();

  if (orderedFavorites.length >= TERMINAL_INTERVAL_MENU_MIN_FAVORITES) {
    favoriteTerminalIntervals = new Set(orderedFavorites.slice(0, TERMINAL_INTERVAL_MENU_MAX_FAVORITES));
    return;
  }

  favoriteTerminalIntervals = new Set(TERMINAL_INTERVAL_FAVORITE_DEFAULTS);
}

function getTerminalIntervalMenuMeta(definition) {
  if (!definition || definition.backendResolution === null) {
    return TERMINAL_INTERVAL_MENU_TV_ONLY_META;
  }

  if (Object.values(TERMINAL_INTERVAL_SHORTCUTS).includes(definition.value)) {
    return TERMINAL_INTERVAL_MENU_SHORTCUT_META;
  }

  return TERMINAL_INTERVAL_MENU_INSTITUTIONAL_META;
}

function renderTerminalIntervalFavorites() {
  if (!(chartIntervalSwitch instanceof HTMLElement)) {
    return;
  }

  ensureFavoriteTerminalIntervalsSanity();
  const orderedFavorites = getOrderedFavoriteTerminalIntervals();
  chartIntervalSwitch.innerHTML = "";

  for (const interval of orderedFavorites) {
    const definition = getTerminalIntervalDefinition(interval);

    if (!definition) {
      continue;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = `interval-chip${activeTerminalInterval === definition.value ? " is-active" : ""}`;
    button.dataset.interval = definition.value;
    button.textContent = definition.label;
    chartIntervalSwitch.append(button);
  }
}

function renderTerminalIntervalMenu() {
  if (!(chartIntervalMenuList instanceof HTMLElement)) {
    return;
  }

  const rows = [];

  for (const groupId of TERMINAL_INTERVAL_GROUP_ORDER) {
    const groupItems = TERMINAL_INTERVAL_DEFINITIONS.filter((definition) => definition.group === groupId);

    if (groupItems.length === 0) {
      continue;
    }

    const optionsHtml = groupItems.map((definition) => {
      const isActive = activeTerminalInterval === definition.value;
      const isFavorite = favoriteTerminalIntervals.has(definition.value);
      const activeClass = isActive ? " is-active" : "";
      const favoriteClass = isFavorite ? " is-favorite" : "";
      const starLabel = isFavorite ? "Remover favorito" : "Favoritar";

      return `
        <div class="chart-interval-option">
          <button
            type="button"
            class="chart-interval-option-select${activeClass}"
            data-interval="${definition.value}"
            role="menuitemradio"
            aria-checked="${isActive ? "true" : "false"}"
          >
            <span>${definition.label}</span>
            <span class="chart-interval-option-meta">${getTerminalIntervalMenuMeta(definition)}</span>
          </button>
          <button
            type="button"
            class="chart-interval-option-star${favoriteClass}"
            data-interval-star="${definition.value}"
            aria-label="${starLabel}: ${definition.label}"
            title="${starLabel}"
          >★</button>
        </div>
      `;
    }).join("");

    rows.push(`
      <section class="chart-interval-group" aria-label="${TERMINAL_INTERVAL_GROUP_LABELS[groupId] ?? groupId}">
        <div class="chart-interval-group-title">${TERMINAL_INTERVAL_GROUP_LABELS[groupId] ?? groupId}</div>
        ${optionsHtml}
      </section>
    `);
  }

  chartIntervalMenuList.innerHTML = rows.join("");
}

function setChartIntervalMenuOpen(nextState) {
  const shouldOpen = nextState === true;
  isChartIntervalMenuOpen = shouldOpen;

  if (chartIntervalMenuButton instanceof HTMLButtonElement) {
    chartIntervalMenuButton.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  }

  if (chartIntervalMenu instanceof HTMLElement) {
    chartIntervalMenu.classList.toggle("is-hidden", !shouldOpen);
  }

  if (shouldOpen) {
    renderTerminalIntervalMenu();
  }
}

function getSelectedTerminalInterval() {
  return activeTerminalInterval;
}

function setActiveTerminalInterval(interval, options = {}) {
  const normalizedInterval = normalizeTerminalInterval(interval);
  activeTerminalInterval = normalizedInterval;

  if (chartIntervalMenuCurrent instanceof HTMLElement) {
    chartIntervalMenuCurrent.textContent = getTerminalIntervalDisplayLabel(normalizedInterval);
  }

  if (options.skipRender !== true) {
    renderTerminalIntervalFavorites();
    renderTerminalIntervalMenu();
  }

  if (options.closeMenu !== false) {
    setChartIntervalMenuOpen(false);
  }
}

function toggleFavoriteTerminalInterval(interval) {
  const normalizedInterval = normalizeTerminalInterval(interval);

  if (favoriteTerminalIntervals.has(normalizedInterval)) {
    if (favoriteTerminalIntervals.size <= TERMINAL_INTERVAL_MENU_MIN_FAVORITES) {
      return;
    }

    favoriteTerminalIntervals.delete(normalizedInterval);
  } else {
    if (favoriteTerminalIntervals.size >= TERMINAL_INTERVAL_MENU_MAX_FAVORITES) {
      const firstFavorite = getOrderedFavoriteTerminalIntervals()[0];

      if (typeof firstFavorite === "string") {
        favoriteTerminalIntervals.delete(firstFavorite);
      }
    }

    favoriteTerminalIntervals.add(normalizedInterval);
  }

  ensureFavoriteTerminalIntervalsSanity();
  renderTerminalIntervalFavorites();
  renderTerminalIntervalMenu();
}

function resolveChartRangeForTerminalInterval(interval) {
  const normalizedInterval = normalizeTerminalInterval(interval);
  return TERMINAL_INTERVAL_TO_CHART_RANGE[normalizedInterval] ?? "7d";
}

function computeLatencyPercentile(samples, percentile) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return 0;
  }

  const normalizedPercentile = Math.min(1, Math.max(0, percentile));
  const sortedSamples = [...samples].sort((left, right) => left - right);
  const index = Math.min(
    sortedSamples.length - 1,
    Math.max(0, Math.floor((sortedSamples.length - 1) * normalizedPercentile)),
  );

  return sortedSamples[index] ?? 0;
}

function createIntelligenceSyncCorrelationId() {
  return `sync_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getActiveIntelligenceSyncCorrelationId() {
  return intelligenceSyncActiveCorrelationId;
}

function buildIntelligenceSyncContextId(reason) {
  const normalizedReason = typeof reason === "string" && reason.trim().length > 0
    ? reason.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 40)
    : "context_sync";

  return `ctx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${normalizedReason}`;
}

function resolveIntelligenceSyncAlertLevel(summary) {
  const requests = Number.isFinite(summary?.requests) ? Number(summary.requests) : 0;

  if (requests <= 0) {
    return "ok";
  }

  const p95LatencyMs = Number.isFinite(summary?.p95LatencyMs) ? Number(summary.p95LatencyMs) : 0;
  const successRatePercent = Number.isFinite(summary?.successRatePercent)
    ? Number(summary.successRatePercent)
    : 0;

  if (
    p95LatencyMs >= INTELLIGENCE_SYNC_ALERT_CRITICAL_P95_MS
    || successRatePercent <= INTELLIGENCE_SYNC_ALERT_CRITICAL_SUCCESS_RATE_PERCENT
  ) {
    return "critical";
  }

  if (
    p95LatencyMs >= INTELLIGENCE_SYNC_ALERT_WARNING_P95_MS
    || successRatePercent <= INTELLIGENCE_SYNC_ALERT_WARNING_SUCCESS_RATE_PERCENT
  ) {
    return "warning";
  }

  return "ok";
}

function normalizeIntelligenceSyncThresholds(thresholds) {
  return {
    criticalP95LatencyMs: Number.isFinite(thresholds?.criticalP95LatencyMs)
      ? Math.max(0, Number(thresholds.criticalP95LatencyMs))
      : INTELLIGENCE_SYNC_ALERT_CRITICAL_P95_MS,
    criticalSuccessRatePercent: Number.isFinite(thresholds?.criticalSuccessRatePercent)
      ? clampNumber(Number(thresholds.criticalSuccessRatePercent), 0, 100)
      : INTELLIGENCE_SYNC_ALERT_CRITICAL_SUCCESS_RATE_PERCENT,
    warningP95LatencyMs: Number.isFinite(thresholds?.warningP95LatencyMs)
      ? Math.max(0, Number(thresholds.warningP95LatencyMs))
      : INTELLIGENCE_SYNC_ALERT_WARNING_P95_MS,
    warningSuccessRatePercent: Number.isFinite(thresholds?.warningSuccessRatePercent)
      ? clampNumber(Number(thresholds.warningSuccessRatePercent), 0, 100)
      : INTELLIGENCE_SYNC_ALERT_WARNING_SUCCESS_RATE_PERCENT,
  };
}

function normalizeIntelligenceSyncSummary(summary = {}) {
  const requests = Number.isFinite(summary?.requests) ? Math.max(0, Number(summary.requests)) : 0;
  const p95LatencyMs = Number.isFinite(summary?.p95LatencyMs) ? Math.max(0, Number(summary.p95LatencyMs)) : 0;
  const averageLatencyMs = Number.isFinite(summary?.averageLatencyMs)
    ? Math.max(0, Number(summary.averageLatencyMs))
    : 0;
  const successRatePercent = Number.isFinite(summary?.successRatePercent)
    ? clampNumber(Number(summary.successRatePercent), 0, 100)
    : 0;
  const lastRecordedAt = typeof summary?.lastRecordedAt === "string" && summary.lastRecordedAt.length > 0
    ? summary.lastRecordedAt
    : (typeof summary?.lastSyncedAt === "string" && summary.lastSyncedAt.length > 0 ? summary.lastSyncedAt : "");
  const fallbackAlertLevel = resolveIntelligenceSyncAlertLevel({
    p95LatencyMs,
    requests,
    successRatePercent,
  });
  const alertLevel = summary?.alertLevel === "ok" || summary?.alertLevel === "warning" || summary?.alertLevel === "critical"
    ? summary.alertLevel
    : fallbackAlertLevel;

  return {
    alertLevel,
    averageLatencyMs: Number(averageLatencyMs.toFixed(2)),
    lastRecordedAt,
    p95LatencyMs: Number(p95LatencyMs.toFixed(2)),
    requests,
    successRatePercent: Number(successRatePercent.toFixed(2)),
  };
}

function resolveLocalIntelligenceSyncOpsSnapshot() {
  const summary = normalizeIntelligenceSyncSummary({
    alertLevel: intelligenceSyncMetrics.alertLevel,
    averageLatencyMs: intelligenceSyncMetrics.averageLatencyMs,
    lastRecordedAt: intelligenceSyncMetrics.lastSyncedAt,
    p95LatencyMs: intelligenceSyncMetrics.p95LatencyMs,
    requests: intelligenceSyncMetrics.requests,
    successRatePercent: intelligenceSyncMetrics.successRatePercent,
  });

  return {
    generatedAt: summary.lastRecordedAt.length > 0 ? summary.lastRecordedAt : new Date().toISOString(),
    source: "local",
    summary,
    thresholds: normalizeIntelligenceSyncThresholds(undefined),
  };
}

function resolveIntelligenceSyncOpsSnapshot() {
  const hasFreshBackendSnapshot =
    intelligenceSyncBackendHealthSnapshot
    && Date.now() - intelligenceSyncBackendHealthSnapshot.fetchedAtMs <= INTELLIGENCE_SYNC_HEALTH_STALE_AFTER_MS;

  if (hasFreshBackendSnapshot) {
    return intelligenceSyncBackendHealthSnapshot;
  }

  return resolveLocalIntelligenceSyncOpsSnapshot();
}

function formatIntelligenceSyncOpsAlertLabel(level) {
  if (level === "critical") {
    return "CRITICO";
  }

  if (level === "warning") {
    return "WARNING";
  }

  return "OK";
}

function buildIntelligenceSyncOpsStatusMessage(snapshot) {
  const summary = snapshot.summary;

  if (summary.requests <= 0) {
    const baseMessage = "Aguardando primeiro ciclo de sincronizacao.";

    if (!hasIntelligenceSyncInternalToken()) {
      return `${baseMessage} Backend health requer VITE_INTERNAL_API_TOKEN ou window.__botfinanceiroSetInternalToken('...').`;
    }

    if (snapshot.source === "local" && intelligenceSyncBackendHealthError.length > 0) {
      return `${baseMessage} Backend health indisponivel; mantendo telemetria local.`;
    }

    return baseMessage;
  }

  if (summary.alertLevel === "critical") {
    return `SLA critico: p95 ${summary.p95LatencyMs.toFixed(2)}ms e sucesso ${summary.successRatePercent.toFixed(2)}%.`;
  }

  if (summary.alertLevel === "warning") {
    return `SLA em atencao: p95 ${summary.p95LatencyMs.toFixed(2)}ms e sucesso ${summary.successRatePercent.toFixed(2)}%.`;
  }

  return `SLA estavel: p95 ${summary.p95LatencyMs.toFixed(2)}ms e sucesso ${summary.successRatePercent.toFixed(2)}%.`;
}

function renderIntelligenceSyncOpsPanel() {
  if (!(intelligenceSyncOpsPanelElement instanceof HTMLElement)) {
    return;
  }

  const snapshot = resolveIntelligenceSyncOpsSnapshot();
  const summary = snapshot.summary;

  intelligenceSyncOpsPanelElement.dataset.level = summary.alertLevel;
  intelligenceSyncOpsPanelElement.dataset.source = snapshot.source;

  if (intelligenceSyncOpsBadgeElement instanceof HTMLElement) {
    intelligenceSyncOpsBadgeElement.dataset.level = summary.alertLevel;
    intelligenceSyncOpsBadgeElement.textContent = formatIntelligenceSyncOpsAlertLabel(summary.alertLevel);
  }

  if (intelligenceSyncOpsStatusElement instanceof HTMLElement) {
    intelligenceSyncOpsStatusElement.textContent = buildIntelligenceSyncOpsStatusMessage(snapshot);
  }

  if (intelligenceSyncOpsSuccessRateElement instanceof HTMLElement) {
    intelligenceSyncOpsSuccessRateElement.textContent = `${summary.successRatePercent.toFixed(2)}%`;
  }

  if (intelligenceSyncOpsP95Element instanceof HTMLElement) {
    intelligenceSyncOpsP95Element.textContent = `${summary.p95LatencyMs.toFixed(2)} ms`;
  }

  if (intelligenceSyncOpsAvgElement instanceof HTMLElement) {
    intelligenceSyncOpsAvgElement.textContent = `${summary.averageLatencyMs.toFixed(2)} ms`;
  }

  if (intelligenceSyncOpsRequestsElement instanceof HTMLElement) {
    intelligenceSyncOpsRequestsElement.textContent = String(summary.requests);
  }

  if (intelligenceSyncOpsUpdatedElement instanceof HTMLElement) {
    const sourceLabel = snapshot.source === "backend" ? "fonte backend" : "fonte local";
    intelligenceSyncOpsUpdatedElement.textContent = `Atualizado ${formatShortTime(snapshot.generatedAt)} • ${sourceLabel}`;
  }
}

function stopIntelligenceSyncHealthPolling() {
  if (intelligenceSyncHealthPollTimer !== null) {
    window.clearTimeout(intelligenceSyncHealthPollTimer);
    intelligenceSyncHealthPollTimer = null;
  }
}

function scheduleIntelligenceSyncHealthPolling() {
  stopIntelligenceSyncHealthPolling();

  intelligenceSyncHealthPollTimer = window.setTimeout(() => {
    void refreshIntelligenceSyncHealthSnapshot({
      reschedule: true,
    });
  }, INTELLIGENCE_SYNC_HEALTH_REFRESH_MS);
}

async function refreshIntelligenceSyncHealthSnapshot(options = {}) {
  if (typeof fetch !== "function") {
    return;
  }

  if (!hasIntelligenceSyncInternalToken()) {
    return;
  }

  if (activeAppRoute !== APP_ROUTE_CHART_LAB) {
    return;
  }

  if (intelligenceSyncHealthInFlight) {
    return;
  }

  intelligenceSyncHealthInFlight = true;

  try {
    const internalToken = getIntelligenceSyncInternalToken();
    const response = await fetch(buildApiUrl(INTELLIGENCE_SYNC_HEALTH_ENDPOINT), {
      headers: {
        "x-internal-token": internalToken,
      },
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`health-status-${response.status}`);
    }

    const payload = await response.json();
    const payloadData = payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
      ? payload.data
      : null;

    if (!payloadData) {
      throw new Error("health-payload-invalid");
    }

    intelligenceSyncBackendHealthSnapshot = {
      fetchedAtMs: Date.now(),
      generatedAt: typeof payloadData.generatedAt === "string" && payloadData.generatedAt.length > 0
        ? payloadData.generatedAt
        : new Date().toISOString(),
      source: "backend",
      summary: normalizeIntelligenceSyncSummary(payloadData.summary),
      thresholds: normalizeIntelligenceSyncThresholds(payloadData.thresholds),
    };
    intelligenceSyncBackendHealthError = "";
    renderIntelligenceSyncOpsPanel();
  } catch (error) {
    intelligenceSyncBackendHealthError = error instanceof Error ? error.message : "health-fetch-failed";
    renderIntelligenceSyncOpsPanel();
  } finally {
    intelligenceSyncHealthInFlight = false;

    if (options.reschedule === true && activeAppRoute === APP_ROUTE_CHART_LAB) {
      scheduleIntelligenceSyncHealthPolling();
    }
  }
}

function startIntelligenceSyncHealthPolling() {
  renderIntelligenceSyncOpsPanel();

  if (!hasIntelligenceSyncInternalToken()) {
    return;
  }

  stopIntelligenceSyncHealthPolling();

  void refreshIntelligenceSyncHealthSnapshot({
    reschedule: true,
  });
}

function handleIntelligenceSyncOpsRouteChange(route) {
  if (route === APP_ROUTE_CHART_LAB) {
    startIntelligenceSyncHealthPolling();
    return;
  }

  stopIntelligenceSyncHealthPolling();
}

function maybeNotifyIntelligenceSyncBudgetAlert(summary) {
  const nextAlertLevel = resolveIntelligenceSyncAlertLevel(summary);
  const nowMs = Date.now();
  const changedLevel = intelligenceSyncAlertLevel !== nextAlertLevel;

  intelligenceSyncAlertLevel = nextAlertLevel;

  if (nextAlertLevel === "ok") {
    return;
  }

  if (!changedLevel && nowMs - intelligenceSyncLastAlertAtMs < INTELLIGENCE_SYNC_ALERT_MIN_INTERVAL_MS) {
    return;
  }

  intelligenceSyncLastAlertAtMs = nowMs;

  const p95LatencyMs = Number.isFinite(summary?.p95LatencyMs) ? Number(summary.p95LatencyMs) : 0;
  const successRatePercent = Number.isFinite(summary?.successRatePercent)
    ? Number(summary.successRatePercent)
    : 0;
  const levelLabel = nextAlertLevel === "critical" ? "CRITICO" : "WARNING";

  setChartLegendTransient(
    `SLA Intelligence Desk ${levelLabel}: p95 ${p95LatencyMs.toFixed(2)}ms • sucesso ${successRatePercent.toFixed(2)}%`,
    nextAlertLevel === "critical" ? "error" : "warn",
  );
}

function resolveIntelligenceSyncTelemetryStrategy(symbol) {
  const pipelineStrategy = resolveChartPipelineStrategy(symbol);

  if (pipelineStrategy === "institutional_macro") {
    return canRunInstitutionalMacroForSymbol(symbol) ? "institutional_macro" : "external_symbol";
  }

  return "crypto";
}

function buildIntelligenceSyncTelemetryPayload(input = {}) {
  const reason = typeof input.reason === "string" && input.reason.length > 0
    ? input.reason
    : "context-sync";
  const latencyMs = Number.isFinite(input.latencyMs) ? Math.max(0, Number(input.latencyMs)) : 0;
  const correlationId = typeof input.correlationId === "string" && input.correlationId.length > 0
    ? input.correlationId
    : getActiveIntelligenceSyncCorrelationId();
  const contextId = typeof input.contextId === "string" && input.contextId.length > 0
    ? input.contextId
    : buildIntelligenceSyncContextId(reason);
  const selectedAssetId = chartAssetSelect instanceof HTMLSelectElement
    ? chartAssetSelect.value
    : "";
  const selectedRange = chartRangeSelect instanceof HTMLSelectElement
    ? chartRangeSelect.value
    : "";
  const hasKnownRange = Object.prototype.hasOwnProperty.call(CHART_RANGE_LABELS, selectedRange);
  const selectedTerminalSymbol = sanitizeTerminalSymbol(getSelectedTerminalSymbol());
  const selectedRequestedBroker = normalizeRequestedBroker(getSelectedBroker());
  const strategy = resolveIntelligenceSyncTelemetryStrategy(selectedTerminalSymbol);

  return {
    chartAssetId: selectedAssetId.length > 0 ? selectedAssetId : undefined,
    chartRange: hasKnownRange ? selectedRange : undefined,
    contextId,
    correlationId,
    exchange:
      selectedRequestedBroker === "auto" || BROKER_FAILOVER_ORDER.includes(selectedRequestedBroker)
        ? selectedRequestedBroker
        : undefined,
    latencyMs,
    reason,
    sessionId: chatSessionId,
    strategy,
    success: input.ok !== false,
    terminalSymbol: selectedTerminalSymbol.length > 0 ? selectedTerminalSymbol : undefined,
  };
}

async function publishIntelligenceSyncTelemetryToBackend(input = {}) {
  if (typeof fetch !== "function") {
    return;
  }

  const payload = buildIntelligenceSyncTelemetryPayload(input);

  if (!payload.correlationId || !payload.contextId || !payload.sessionId) {
    return;
  }

  try {
    await fetch(buildApiUrl(INTELLIGENCE_SYNC_TELEMETRY_ENDPOINT), {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      keepalive: true,
      method: "POST",
    });
  } catch {
    // Telemetria nunca deve interromper a UX do Desk.
  }
}

function publishIntelligenceSyncTelemetry() {
  const safeSummary = {
    alertLevel: intelligenceSyncMetrics.alertLevel,
    averageLatencyMs: intelligenceSyncMetrics.averageLatencyMs,
    failed: intelligenceSyncMetrics.failed,
    lastContextId: intelligenceSyncMetrics.lastContextId,
    lastCorrelationId: intelligenceSyncMetrics.lastCorrelationId,
    lastLatencyMs: intelligenceSyncMetrics.lastLatencyMs,
    lastReason: intelligenceSyncMetrics.lastReason,
    lastSyncedAt: intelligenceSyncMetrics.lastSyncedAt,
    p95LatencyMs: intelligenceSyncMetrics.p95LatencyMs,
    requests: intelligenceSyncMetrics.requests,
    success: intelligenceSyncMetrics.success,
    successRatePercent: intelligenceSyncMetrics.successRatePercent,
    thresholds: {
      criticalP95LatencyMs: INTELLIGENCE_SYNC_ALERT_CRITICAL_P95_MS,
      criticalSuccessRatePercent: INTELLIGENCE_SYNC_ALERT_CRITICAL_SUCCESS_RATE_PERCENT,
      warningP95LatencyMs: INTELLIGENCE_SYNC_ALERT_WARNING_P95_MS,
      warningSuccessRatePercent: INTELLIGENCE_SYNC_ALERT_WARNING_SUCCESS_RATE_PERCENT,
    },
  };

  const nextAlertLevel = resolveIntelligenceSyncAlertLevel(safeSummary);
  safeSummary.alertLevel = nextAlertLevel;
  intelligenceSyncMetrics.alertLevel = nextAlertLevel;

  if (analysisPanel instanceof HTMLElement) {
    analysisPanel.dataset.syncAvgMs = String(safeSummary.averageLatencyMs);
    analysisPanel.dataset.syncAlertLevel = safeSummary.alertLevel;
    analysisPanel.dataset.syncP95Ms = String(safeSummary.p95LatencyMs);
    analysisPanel.dataset.syncRequests = String(safeSummary.requests);
    analysisPanel.dataset.syncSuccessRate = String(safeSummary.successRatePercent);
  }

  maybeNotifyIntelligenceSyncBudgetAlert(safeSummary);
  renderIntelligenceSyncOpsPanel();

  if (typeof window === "object") {
    window.__botfinanceiroIntelligenceSyncTelemetry = safeSummary;

    if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
      window.dispatchEvent(
        new CustomEvent("botfinanceiro:intelligence-sync-metrics", {
          detail: safeSummary,
        }),
      );
    }
  }
}

function startIntelligenceSyncTelemetry(reason) {
  intelligenceSyncPendingStartedAtMs = performance.now();
  intelligenceSyncActiveCorrelationId = createIntelligenceSyncCorrelationId();
  intelligenceSyncMetrics.requests += 1;
  intelligenceSyncMetrics.lastCorrelationId = intelligenceSyncActiveCorrelationId;
  intelligenceSyncMetrics.lastReason = reason;
}

function finishIntelligenceSyncTelemetry(input = {}) {
  const ok = input.ok !== false;
  const reason = typeof input.reason === "string" ? input.reason : "context-sync";
  const correlationId = typeof input.correlationId === "string" && input.correlationId.length > 0
    ? input.correlationId
    : (intelligenceSyncActiveCorrelationId || createIntelligenceSyncCorrelationId());
  const contextId = typeof input.contextId === "string" && input.contextId.length > 0
    ? input.contextId
    : buildIntelligenceSyncContextId(reason);
  const endedAtMs = performance.now();
  const latencyMs = intelligenceSyncPendingStartedAtMs > 0
    ? Math.max(0, Number((endedAtMs - intelligenceSyncPendingStartedAtMs).toFixed(2)))
    : 0;

  intelligenceSyncPendingStartedAtMs = 0;
  intelligenceSyncActiveCorrelationId = "";
  intelligenceSyncMetrics.lastContextId = contextId;
  intelligenceSyncMetrics.lastCorrelationId = correlationId;
  intelligenceSyncMetrics.lastReason = reason;
  intelligenceSyncMetrics.lastLatencyMs = latencyMs;
  intelligenceSyncMetrics.lastSyncedAt = new Date().toISOString();

  if (ok) {
    intelligenceSyncMetrics.success += 1;
    intelligenceSyncLatencySamplesMs.push(latencyMs);

    if (intelligenceSyncLatencySamplesMs.length > INTELLIGENCE_SYNC_METRICS_MAX_SAMPLES) {
      intelligenceSyncLatencySamplesMs = intelligenceSyncLatencySamplesMs.slice(
        intelligenceSyncLatencySamplesMs.length - INTELLIGENCE_SYNC_METRICS_MAX_SAMPLES,
      );
    }
  } else {
    intelligenceSyncMetrics.failed += 1;
  }

  const sampleCount = intelligenceSyncLatencySamplesMs.length;
  const averageLatencyMs = sampleCount > 0
    ? intelligenceSyncLatencySamplesMs.reduce((sum, sample) => sum + sample, 0) / sampleCount
    : 0;
  const successRatePercent = intelligenceSyncMetrics.requests > 0
    ? (intelligenceSyncMetrics.success / intelligenceSyncMetrics.requests) * 100
    : 0;

  intelligenceSyncMetrics.averageLatencyMs = Number(averageLatencyMs.toFixed(2));
  intelligenceSyncMetrics.p95LatencyMs = Number(computeLatencyPercentile(intelligenceSyncLatencySamplesMs, 0.95).toFixed(2));
  intelligenceSyncMetrics.successRatePercent = Number(successRatePercent.toFixed(2));

  publishIntelligenceSyncTelemetry();

  void publishIntelligenceSyncTelemetryToBackend({
    contextId,
    correlationId,
    latencyMs,
    ok,
    reason,
  });
}

function syncChartRangeWithTerminalInterval(interval, options = {}) {
  if (!(chartRangeSelect instanceof HTMLSelectElement)) {
    return false;
  }

  const nextRange = resolveChartRangeForTerminalInterval(interval);

  if (!isValueInSelect(chartRangeSelect, nextRange) || chartRangeSelect.value === nextRange) {
    return false;
  }

  chartRangeSelect.value = nextRange;

  if (options.announce === true) {
    const rangeLabel = CHART_RANGE_LABELS[nextRange] ?? nextRange;
    setChartLegend(`Janela sincronizada para ${rangeLabel}.`);
  }

  return true;
}

function applyTerminalIntervalSelection(interval, options = {}) {
  const normalizedInterval = normalizeTerminalInterval(interval);
  setActiveTerminalInterval(normalizedInterval, {
    closeMenu: options.closeMenu !== false,
  });

  const didSyncRange = syncChartRangeWithTerminalInterval(normalizedInterval, {
    announce: options.announce === true,
  });

  if (didSyncRange) {
    configureChartAutoRefresh();
    void syncIntelligenceDeskForCurrentContext({
      reason: typeof options.reason === "string" ? options.reason : "interval-change",
      silent: options.silentSync !== false,
    });
  }

  if (options.refreshTerminal !== false) {
    scheduleTradingViewRefresh();
  }

  if (options.persist !== false) {
    saveChartPreferences();
  }

  if (options.showLegend !== false) {
    const linkedRange = CHART_RANGE_LABELS[resolveChartRangeForTerminalInterval(normalizedInterval)]
      ?? resolveChartRangeForTerminalInterval(normalizedInterval);

    setChartLegend(
      `Intervalo ${getTerminalIntervalDisplayLabel(normalizedInterval)} ativo • janela ${linkedRange}`,
    );
  }

  return {
    didSyncRange,
    interval: normalizedInterval,
  };
}

const manualMarketAnalysisCounter = createCounter();
const MANUAL_ANALYSIS_MIN_LOADING_MS = 220;
const MANUAL_ANALYSIS_INVALID_FEEDBACK_MS = 360;
// Fases HONESTAS (nao "efeito laboratorio"): so aparecem se o pipeline
// real ultrapassar o threshold. Backend rapido => so fase 1 (ou nem aparece).
// Backend lento (provider stale, fallback de broker) => o usuario ve a sequencia
// inteira contando uma historia verdadeira do que esta acontecendo.
const MANUAL_ANALYSIS_PHASES = [
  {
    key: "snapshot",
    label: "Sincronizando snapshot fresh do livro institucional...",
    minElapsedMs: 0,
  },
  {
    key: "analysis",
    label: "Mapeando zonas SMC e padroes harmonicos...",
    minElapsedMs: 600,
  },
  {
    key: "render",
    label: "Auditando confluencia e Ghost Tracker...",
    minElapsedMs: 1400,
  },
];

let pendingFreshFetchScope = false;

if (typeof window !== "undefined") {
  window.__botfinanceiroDebug = window.__botfinanceiroDebug ?? {};
  window.__botfinanceiroDebug.manualMarketAnalysisSnapshot = () =>
    manualMarketAnalysisCounter.snapshot();
}

let manualMarketAnalysisInFlight = false;

function setManualAnalysisButtonState(state) {
  if (!(chartAnalyzeMarketButton instanceof HTMLButtonElement)) {
    return;
  }

  const labelElement = chartAnalyzeMarketButton.querySelector(
    ".chart-analyze-market-button__label",
  );

  chartAnalyzeMarketButton.dataset.state = state;

  if (state === "loading") {
    chartAnalyzeMarketButton.setAttribute("aria-busy", "true");
    chartAnalyzeMarketButton.setAttribute("aria-disabled", "true");
    chartAnalyzeMarketButton.disabled = true;

    if (labelElement instanceof HTMLElement) {
      labelElement.textContent = MANUAL_ANALYSIS_PHASES[0].label;
    }

    return;
  }

  chartAnalyzeMarketButton.removeAttribute("aria-busy");
  chartAnalyzeMarketButton.removeAttribute("aria-disabled");
  chartAnalyzeMarketButton.disabled = false;
  delete chartAnalyzeMarketButton.dataset.phase;

  if (labelElement instanceof HTMLElement) {
    labelElement.textContent = "ANALISAR MERCADO";
  }
}

function setManualAnalysisPhase(phaseIndex) {
  if (!(chartAnalyzeMarketButton instanceof HTMLButtonElement)) {
    return;
  }

  const phase = MANUAL_ANALYSIS_PHASES[phaseIndex];
  if (!phase) {
    return;
  }

  if (chartAnalyzeMarketButton.dataset.state !== "loading") {
    return;
  }

  chartAnalyzeMarketButton.dataset.phase = phase.key;

  const labelElement = chartAnalyzeMarketButton.querySelector(
    ".chart-analyze-market-button__label",
  );

  if (labelElement instanceof HTMLElement) {
    labelElement.textContent = phase.label;
  }

  manualMarketAnalysisCounter.increment(`phase:${phase.key}`);
}

function flashManualAnalysisInvalid(message) {
  if (!(chartAnalyzeMarketButton instanceof HTMLButtonElement)) {
    return;
  }

  manualMarketAnalysisCounter.increment("invalid");
  chartAnalyzeMarketButton.dataset.state = "invalid";

  if (typeof message === "string" && message.length > 0) {
    setChartStatus(message, "warn");
  }

  window.setTimeout(() => {
    if (chartAnalyzeMarketButton.dataset.state === "invalid") {
      chartAnalyzeMarketButton.dataset.state = "idle";
    }
  }, MANUAL_ANALYSIS_INVALID_FEEDBACK_MS);
}

async function runManualMarketAnalysis(options = {}) {
  if (manualMarketAnalysisInFlight) {
    manualMarketAnalysisCounter.increment("blocked");
    return;
  }

  const selectedAssetId =
    chartAssetSelect instanceof HTMLSelectElement ? chartAssetSelect.value.trim() : "";

  if (selectedAssetId.length === 0) {
    flashManualAnalysisInvalid("Selecione um ativo antes de rodar a analise institucional.");
    return;
  }

  manualMarketAnalysisInFlight = true;
  manualMarketAnalysisCounter.increment(
    options.source === "keyboard" ? "trigger:keyboard" : "trigger:click",
  );

  setManualAnalysisButtonState("loading");
  setManualAnalysisPhase(0);
  updateChartLiveStatus(LIVE_STATUS.RECONNECTING, {
    title: "Sincronizando Intelligence Desk com snapshot fresh",
  });

  // Fases honestas: agendamos os timers, mas eles SO disparam se o pipeline
  // real ainda estiver rodando quando o threshold for atingido. Backend rapido
  // => timers cancelados no finally, usuario nem ve as fases extras.
  const phaseTimers = [];
  for (let i = 1; i < MANUAL_ANALYSIS_PHASES.length; i++) {
    const targetPhase = MANUAL_ANALYSIS_PHASES[i];
    const timer = window.setTimeout(() => {
      setManualAnalysisPhase(i);
    }, targetPhase.minElapsedMs);
    phaseTimers.push(timer);
  }

  const startedAt =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  let outcome = "ok";

  pendingFreshFetchScope = true;
  manualMarketAnalysisCounter.increment("fresh-fetch");

  try {
    await syncIntelligenceDeskForCurrentContext({
      reason: `manual-cta:${options.source ?? "click"}`,
      silent: false,
    });
  } catch (error) {
    outcome = "error";
    manualMarketAnalysisCounter.increment("error");

    if (error instanceof Error) {
      setChartStatus(`Falha ao rodar analise institucional: ${error.message}`, "error");
    } else {
      setChartStatus("Falha ao rodar analise institucional.", "error");
    }
  } finally {
    for (const timer of phaseTimers) {
      window.clearTimeout(timer);
    }
    pendingFreshFetchScope = false;
    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const elapsed = now - startedAt;
    const remaining = Math.max(0, MANUAL_ANALYSIS_MIN_LOADING_MS - elapsed);

    window.setTimeout(() => {
      setManualAnalysisButtonState("idle");
      manualMarketAnalysisInFlight = false;

      if (outcome === "ok") {
        manualMarketAnalysisCounter.increment("success");
      }
    }, remaining);
  }
}

async function syncIntelligenceDeskForCurrentContext(options = {}) {
  const silent = options.silent === true;
  const reason = typeof options.reason === "string" && options.reason.length > 0
    ? options.reason
    : "context-sync";

  if (chartLoadController.isLoading()) {
    scheduleChartContextSync({
      delayMs: 140,
      reason,
      silent,
    });
    return;
  }

  startIntelligenceSyncTelemetry(reason);

  await loadChart({
    silent,
  });

  const hasSnapshot =
    chartLabState.snapshot !== null
    && typeof chartLabState.snapshot === "object"
    && Array.isArray(chartLabState.snapshot.points)
    && chartLabState.snapshot.points.length > 0;
  const statusIsError =
    chartStatusElement instanceof HTMLElement
    && chartStatusElement.getAttribute("data-mode") === "error";

  finishIntelligenceSyncTelemetry({
    ok: hasSnapshot || !statusIsError,
    reason,
  });
}

function scheduleChartContextSync(options = {}) {
  const reason = typeof options.reason === "string" && options.reason.length > 0
    ? options.reason
    : "context-sync";
  const silent = options.silent !== false;
  const requestedDelay = Number.isFinite(options.delayMs)
    ? Number(options.delayMs)
    : CHART_CONTEXT_SYNC_DEBOUNCE_MS;
  const delayMs = Math.max(0, requestedDelay);

  if (chartContextSyncTimer !== null) {
    window.clearTimeout(chartContextSyncTimer);
  }

  chartContextSyncTimer = window.setTimeout(() => {
    chartContextSyncTimer = null;
    void syncIntelligenceDeskForCurrentContext({
      reason,
      silent,
    });
  }, delayMs);
}

function getSelectedTerminalStyle() {
  const rawStyle = chartStyleSelect instanceof HTMLSelectElement ? chartStyleSelect.value : "candles";

  if (rawStyle in TERMINAL_STYLE_TO_TV) {
    return rawStyle;
  }

  return "candles";
}

function resolveTradingViewExchangePrefix(symbol) {
  const normalizedSymbol = sanitizeTerminalSymbol(symbol);

  if (normalizedSymbol.length < 2) {
    return getTradingViewTerminalExchange();
  }

  if (chartLabState.symbolSourceModule === "b3" || chartLabState.symbolSourceModule === "fiis") {
    return "BMFBOVESPA";
  }

  if (/^[A-Z]{4}\d{1,2}$/.test(normalizedSymbol) || /^(IBOV|IFIX)/.test(normalizedSymbol)) {
    return "BMFBOVESPA";
  }

  if (chartLabState.symbolSourceModule === "forex" || isLikelyForexPairSymbol(normalizedSymbol)) {
    return "FX_IDC";
  }

  if (isLikelyCryptoTerminalSymbol(normalizedSymbol)) {
    return getTradingViewTerminalExchange();
  }

  if (/^(DXY|VIX|DJI|NDX|SPX|RUT|TNX|FVX|IRX|US0?2Y|US0?5Y|US10Y|US30Y)/.test(normalizedSymbol)) {
    return "TVC";
  }

  if (
    chartLabState.symbolSourceModule === "equities"
    || chartLabState.symbolSourceModule === "wall-street"
    || chartLabState.symbolSourceModule === "etfs"
    || chartLabState.symbolSourceModule === "options"
  ) {
    return "NASDAQ";
  }

  if (
    chartLabState.symbolSourceModule === "fixed-income"
    || chartLabState.symbolSourceModule === "macro-rates"
    || chartLabState.symbolSourceModule === "commodities"
    || chartLabState.symbolSourceModule === "futures"
  ) {
    return "TVC";
  }

  return "NASDAQ";
}

function buildTradingViewSymbol() {
  const symbol = getSelectedTerminalSymbol();
  return `${resolveTradingViewExchangePrefix(symbol)}:${symbol}`;
}

function buildTerminalReadyStatus() {
  const styleLabel = CHART_STYLE_LABELS[getSelectedTerminalStyle()] ?? getSelectedTerminalStyle();
  return `Terminal ${buildTradingViewSymbol()} ativo • intervalo ${getTerminalIntervalDisplayLabel(getSelectedTerminalInterval())} • estilo ${styleLabel}`;
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

  chartLabState.symbolSourceModule = "crypto";
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
  const normalizedBroker = normalizeBrokerName(broker);

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

  return runMarketRequestWithRetry(async () => {
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
      throw new Error(
        normalizeBrokerApiErrorMessage(message, "Falha ao consultar batch do broker"),
      );
    }

    return payload?.data ?? null;
  });
}

async function requestBrokerLiveQuoteBatchWithFailover(assetIds, broker) {
  const normalizedRequestedBroker = normalizeRequestedBroker(broker);
  const normalizedPrimaryBroker = normalizedRequestedBroker === "auto"
    ? resolveAutoWatchlistPrimaryBroker()
    : normalizeBrokerName(normalizedRequestedBroker);
  const failoverChain = buildBrokerFailoverChain(normalizedPrimaryBroker);
  const primarySkippedByCircuit =
    failoverChain.length > 0
    && failoverChain[0] !== normalizedPrimaryBroker
    && isBrokerCircuitOpen(normalizedPrimaryBroker);
  const primaryCircuitSummary = primarySkippedByCircuit
    ? getBrokerCircuitSummary(normalizedPrimaryBroker)
    : "";
  const failures = [];

  for (const candidateBroker of failoverChain) {
    try {
      const batch = await requestBrokerLiveQuoteBatch(assetIds, candidateBroker);
      markBrokerSuccess(candidateBroker);

      if (normalizedRequestedBroker === "auto") {
        watchlistAutoPreferredBroker = candidateBroker;
      }

      const failoverReasonParts = [];

      if (primaryCircuitSummary.length > 0) {
        failoverReasonParts.push(primaryCircuitSummary);
      }

      if (candidateBroker !== normalizedPrimaryBroker) {
        failoverReasonParts.push(
          `Failover da watchlist: ${normalizedPrimaryBroker.toUpperCase()} -> ${candidateBroker.toUpperCase()}`,
        );
      }

      const failoverReason = failoverReasonParts.join(" • ");

      return {
        batch,
        failoverReason,
        resolvedBroker: candidateBroker,
      };
    } catch (error) {
      const message = getErrorMessage(error, "Falha ao consultar batch do broker");
      const normalizedMessage = normalizeBrokerApiErrorMessage(message, "Falha ao consultar batch do broker");
      markBrokerFailure(candidateBroker, normalizedMessage);
      failures.push({
        broker: candidateBroker,
        message: normalizedMessage,
      });

      if (!isRetryableMarketApiErrorMessage(message)) {
        throw new Error(normalizeBrokerApiErrorMessage(normalizedMessage, "Falha na sincronizacao da watchlist"));
      }
    }
  }

  const lastFailure = failures[failures.length - 1];
  const baseMessage = normalizeBrokerApiErrorMessage(lastFailure?.message, "Falha na sincronizacao da watchlist");

  if (primaryCircuitSummary.length > 0) {
    throw new Error(`${primaryCircuitSummary} • ${baseMessage}`);
  }

  throw new Error(baseMessage);
}

function buildBrokerLiveQuoteStreamUrl(assetIds, broker, intervalMs) {
  const normalizedAssetIds = normalizeAssetIds(assetIds);
  const normalizedBroker = normalizeBrokerName(broker);
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

  return runMarketRequestWithRetry(async () => {
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
      throw new Error(
        normalizeBrokerApiErrorMessage(message, "Falha ao consultar batch spot fallback"),
      );
    }

    return payload?.data ?? null;
  });
}

async function applyWatchlistBatchSnapshot(brokerBatch, options = {}) {
  const silent = options.silent === true;
  const transportMode = options.transport === "stream" ? "stream" : "polling";
  const resolvedBroker = normalizeBrokerName(options.resolvedBroker ?? getSelectedBroker());
  const failoverReason = typeof options.failoverReason === "string" ? options.failoverReason : "";
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

  const failoverLabel = failoverReason.length > 0 ? " • failover" : "";
  const statusLabel = `${successCount}/${TERMINAL_WATCHLIST.length} live • fb ${fallbackCount} • cfg ${unavailableCount} • err ${errorCount} • broker ${resolvedBroker}${failoverLabel} • ${formatShortTime(watchlistLastUpdatedAt)}`;
  setWatchlistStatus(statusLabel);

  watchlistDiagnostics = {
    ...watchlistDiagnostics,
    broker: resolvedBroker,
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
    const brokerResult = await requestBrokerLiveQuoteBatchWithFailover(requestedAssetIds, selectedBroker);
    await applyWatchlistBatchSnapshot(brokerResult.batch, {
      failoverReason: brokerResult.failoverReason,
      latencyMs: performance.now() - startedAt,
      resolvedBroker: brokerResult.resolvedBroker,
      silent,
      transport: "polling",
    });
  } catch (error) {
    const message = normalizeBrokerApiErrorMessage(
      getErrorMessage(error, "Falha na sincronizacao da watchlist"),
      "Falha na sincronizacao da watchlist",
    );
    const selectedRequestedBroker = normalizeRequestedBroker(getSelectedBroker());
    const diagnosticsBroker = selectedRequestedBroker === "auto"
      ? resolveAutoWatchlistPrimaryBroker()
      : normalizeBrokerName(selectedRequestedBroker);
    setWatchlistStatus(message, "error");
    watchlistDiagnostics = {
      ...watchlistDiagnostics,
      broker: diagnosticsBroker,
      mode: "polling",
    };
    renderWatchlistDiagnostics();
  } finally {
    isWatchlistLoading = false;
    setWatchlistLoadingState(false);
  }
}

function stopWatchlistStream() {
  stopWatchlistStreamFallbackPolling();

  if (watchlistStreamBackoffTimer !== null) {
    window.clearTimeout(watchlistStreamBackoffTimer);
    watchlistStreamBackoffTimer = null;
  }

  if (watchlistStream) {
    watchlistStream.close();
    watchlistStream = null;
  }
}

function stopWatchlistStreamFallbackPolling() {
  if (watchlistStreamFallbackPollTimer === null) {
    return;
  }

  window.clearInterval(watchlistStreamFallbackPollTimer);
  watchlistStreamFallbackPollTimer = null;
}

function startWatchlistStreamFallbackPolling() {
  if (watchlistStreamFallbackPollTimer !== null) {
    return;
  }

  watchlistStreamFallbackPollTimer = window.setInterval(() => {
    void refreshWatchlistMarket({
      silent: true,
    });
  }, WATCHLIST_STREAM_FALLBACK_POLL_MS);
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

  const selectedRequestedBroker = normalizeRequestedBroker(getSelectedBroker());
  const selectedBroker = selectedRequestedBroker === "auto"
    ? resolveAutoWatchlistPrimaryBroker()
    : normalizeBrokerName(selectedRequestedBroker);
  const streamFailoverChain = buildBrokerFailoverChain(selectedBroker);
  const streamBroker = streamFailoverChain[0] ?? selectedBroker;
  const streamFailoverReason = streamBroker === selectedBroker
    ? ""
    : `Failover do stream watchlist: ${selectedBroker.toUpperCase()} -> ${streamBroker.toUpperCase()}`;
  watchlistStreamBroker = streamBroker;
  const streamUrl = buildBrokerLiveQuoteStreamUrl(
    TERMINAL_WATCHLIST.map((item) => item.assetId),
    streamBroker,
    intervalMs,
  );

  const eventSource = new EventSource(streamUrl);
  watchlistStream = eventSource;

  eventSource.addEventListener("snapshot", (event) => {
    const payload = parseStreamPayload(event, "watchlist");

    const batch = payload?.batch ?? null;

    if (!batch || !Array.isArray(batch.quotes)) {
      return;
    }

    markBrokerSuccess(streamBroker);

    if (selectedRequestedBroker === "auto") {
      watchlistAutoPreferredBroker = streamBroker;
    }

    stopWatchlistStreamFallbackPolling();
    watchlistStreamReconnectAttempt = 0;
    const generatedAtMs = typeof payload?.generatedAt === "string" ? Date.parse(payload.generatedAt) : Number.NaN;
    const latencyMs = Number.isFinite(generatedAtMs) ? Date.now() - generatedAtMs : null;

    void applyWatchlistBatchSnapshot(batch, {
      failoverReason: streamFailoverReason,
      latencyMs,
      resolvedBroker: streamBroker,
      silent: true,
      transport: "stream",
    });
  });

  eventSource.addEventListener("stream-error", (event) => {
    const payload = parseStreamPayload(event, "watchlist:stream-error");

    const message = typeof payload?.message === "string"
      ? payload.message
      : "Stream de watchlist reportou falha";
    markBrokerFailure(streamBroker, message);
    startWatchlistStreamFallbackPolling();
    setWatchlistStatus(
      normalizeBrokerApiErrorMessage(message, "Stream de watchlist reportou falha"),
      "error",
    );
  });

  eventSource.onerror = () => {
    if (!watchlistStream || normalizeRequestedBroker(getSelectedBroker()) !== selectedRequestedBroker) {
      return;
    }

    markBrokerFailure(streamBroker, "Stream de watchlist desconectado");
    stopWatchlistStream();
    startWatchlistStreamFallbackPolling();
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
  chartLabState.viewMode = nextMode === "copilot" ? "copilot" : "tv";

  if (chartViewSwitch instanceof HTMLElement) {
    const buttons = chartViewSwitch.querySelectorAll(".view-chip");

    buttons.forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }

      const isActive = button.dataset.view === chartLabState.viewMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  if (tvStage instanceof HTMLElement) {
    tvStage.classList.toggle("is-hidden", chartLabState.viewMode !== "tv");
  }

  if (chartCopilotStage instanceof HTMLElement) {
    chartCopilotStage.classList.toggle("is-hidden", chartLabState.viewMode !== "copilot");
  }

  if (chartLabState.viewMode === "tv") {
    setChartLegend(
      "Modo Terminal PRO ativo. Use a barra lateral para desenhar linha, texto, fibo e anotacoes.",
    );
    saveChartPreferences();
    void mountTradingViewWidget();
    return;
  }

  if (chartLabState.snapshot) {
    renderInteractiveChart(chartLabState.snapshot);
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
  if (chartLabState.viewMode !== "tv" || !(tvWidgetContainer instanceof HTMLElement)) {
    return;
  }

  try {
    setChartStatus("Carregando terminal profissional...", "loading");
    const mountId = createTradingViewMountId();
    tvWidgetContainer.innerHTML = "";

    const symbol = buildTradingViewSymbol();
    const interval = getTradingViewResolutionForTerminalInterval(getSelectedTerminalInterval());
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

    setChartStatus(`${buildTerminalReadyStatus()} • desenho liberado na barra lateral`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao montar terminal";
    setChartStatus(message, "error");
    setChartLegend("Nao foi possivel abrir o terminal. Voltando para Insights IA.", "error");
    setChartViewMode("copilot");
  }
}

function scheduleTradingViewRefresh() {
  if (chartLabState.viewMode !== "tv") {
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
  // ADR-077: alias semântico clearChartAnnotations — limpa priceLines E zonas do primitive.
  if (chartZonesPrimitive) {
    chartZonesPrimitive.clear();
  }

  if (!chartBaseSeries || chartPriceLines.length === 0) {
    return;
  }

  for (const priceLine of chartPriceLines) {
    chartBaseSeries.removePriceLine(priceLine);
  }

  chartPriceLines = [];
}

// ADR-077: detach explícito do primitive (chamado em destroyInteractiveChart e quando trocamos série base).
function detachChartZonesPrimitive() {
  if (chartZonesPrimitive && chartBaseSeries) {
    try {
      chartBaseSeries.detachPrimitive(chartZonesPrimitive);
    } catch (_err) {
      // série pode já ter sido removida — ignore.
    }
  }
  chartZonesPrimitive = null;
}

// ADR-077: garante 1 instância anexada à série base ativa.
function ensureChartZonesPrimitive() {
  if (!chartBaseSeries) return null;
  if (chartZonesPrimitive) return chartZonesPrimitive;
  chartZonesPrimitive = new PriceZonesPrimitive();
  try {
    chartBaseSeries.attachPrimitive(chartZonesPrimitive);
  } catch (_err) {
    chartZonesPrimitive = null;
  }
  return chartZonesPrimitive;
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
  detachChartZonesPrimitive();

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

// ADR-077: Camada de Anota\u00e7\u00f5es do Gr\u00e1fico Interativo \u2014 paleta sem\u00e2ntica.
const ANNO_PALETTE = Object.freeze({
  entry: "#36bffa",       // Azul institucional
  fvg: "#ffd166",         // Amarelo (desequil\u00edbrio)
  obBear: "#ff6b80",      // OB de venda
  obBull: "#33d9b2",      // OB de compra
  resistance: "#ff8fab",  // Resist\u00eancia
  rrProfit: "#43aa8b",    // R:R lucro (Position Tool)
  rrRisk: "#f94144",      // R:R risco (Position Tool)
  stop: "#f94144",        // Stop Loss
  support: "#16d6b3",     // Suporte
  tp: "#43aa8b",          // Take Profit
});

// ADR-077: classifica status de toque baseado no preco corrente vs nivel.
function classifyLevelTouch(currentPrice, level, kind) {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(level)) return "";
  // tol: 0.05% do preco para considerar "testado"
  const tol = Math.abs(currentPrice) * 0.0005;
  const diff = currentPrice - level;
  if (kind === "support" || kind === "obBull") {
    if (currentPrice <= level) return "Mitigado";
    if (Math.abs(diff) <= tol) return "Testado";
    return "N\u00e3o testado";
  }
  if (kind === "resistance" || kind === "obBear") {
    if (currentPrice >= level) return "Mitigado";
    if (Math.abs(diff) <= tol) return "Testado";
    return "N\u00e3o testado";
  }
  return "";
}

// ADR-077: infere lado do trade pelos tradeLevels.
function inferTradeSide(entry, sl, tp) {
  if (!Number.isFinite(entry) || !Number.isFinite(sl) || !Number.isFinite(tp)) return "buy";
  if (tp > entry && entry > sl) return "buy";
  if (tp < entry && entry < sl) return "sell";
  return tp >= entry ? "buy" : "sell";
}

function formatRR(rr) {
  if (!Number.isFinite(rr) || rr <= 0) return "";
  return `1:${rr >= 10 ? rr.toFixed(0) : rr.toFixed(1)}`;
}

function applyChartLevels(snapshot, enabled) {
  clearChartPriceLines();

  if (!enabled || !chartBaseSeries || !snapshot?.insights) {
    return;
  }

  const insights = snapshot.insights;
  const tradeLevels = insights.tradeLevels ?? {};
  const ms = insights.marketStructure ?? {};
  const liquidityHeatmap = buildLiquidityHeatmapSnapshot({ snapshot });
  const currentPrice = Number(insights.currentPrice ?? snapshot.currentPrice ?? 0);
  const intervalLabel = (typeof activeTerminalInterval === "string" ? activeTerminalInterval : "").toUpperCase();
  const entryLow = Number(tradeLevels.entryZoneLow);
  const entryHigh = Number(tradeLevels.entryZoneHigh);

  const entryRef = Number.isFinite(entryLow) && Number.isFinite(entryHigh)
    ? (entryLow + entryHigh) / 2
    : Number(insights.lastClose ?? currentPrice);
  const sl = Number(tradeLevels.stopLoss);
  const tp1 = Number(tradeLevels.takeProfit1);
  const tp2 = Number(tradeLevels.takeProfit2);
  const side = inferTradeSide(entryRef, sl, Number.isFinite(tp1) ? tp1 : tp2);

  // R:R numerico para axis labels (ADR-077 item C)
  let rr1 = NaN;
  let rr2 = NaN;
  try {
    if (Number.isFinite(entryRef) && Number.isFinite(sl)) {
      if (Number.isFinite(tp1)) rr1 = computeRiskReward(entryRef, sl, tp1, side);
      if (Number.isFinite(tp2)) rr2 = computeRiskReward(entryRef, sl, tp2, side);
    }
  } catch (_e) { /* graceful */ }

  // PriceLines com paleta semantica + status + R:R no title
  const supTouch = classifyLevelTouch(currentPrice, Number(insights.supportLevel), "support");
  const resTouch = classifyLevelTouch(currentPrice, Number(insights.resistanceLevel), "resistance");
  const lines = [
    { color: ANNO_PALETTE.support, price: Number(insights.supportLevel), title: `SUP${supTouch ? " \u00b7 " + supTouch : ""}`, width: 1 },
    { color: ANNO_PALETTE.resistance, price: Number(insights.resistanceLevel), title: `RES${resTouch ? " \u00b7 " + resTouch : ""}`, width: 1 },
    { color: ANNO_PALETTE.entry, price: entryRef, title: "ENTRY", width: 2 },
    { color: ANNO_PALETTE.entry, price: entryLow, title: "ENT LO", width: 1 },
    { color: ANNO_PALETTE.entry, price: entryHigh, title: "ENT HI", width: 1 },
    { color: ANNO_PALETTE.stop, price: sl, title: "STOP", width: 2 },
    { color: ANNO_PALETTE.tp, price: tp1, title: `TP1${formatRR(rr1) ? " (" + formatRR(rr1) + ")" : ""}`, width: 2 },
    { color: ANNO_PALETTE.tp, price: tp2, title: `TP2${formatRR(rr2) ? " (" + formatRR(rr2) + ")" : ""}`, width: 2 },
  ];

  for (const level of lines) {
    if (!Number.isFinite(level.price) || level.price <= 0) continue;
    const priceLine = chartBaseSeries.createPriceLine({
      axisLabelVisible: true,
      color: level.color,
      lineVisible: true,
      lineWidth: level.width,
      price: level.price,
      title: level.title,
    });
    chartPriceLines.push(priceLine);
  }

  // Zonas sombreadas via Series Primitive (ADR-077 itens 2, 3, A, F)
  const primitive = ensureChartZonesPrimitive();
  if (!primitive) return;

  const zones = [];

  // Zona Entry (azul)
  if (Number.isFinite(entryLow) && Number.isFinite(entryHigh) && entryHigh > entryLow) {
    zones.push({
      bottom: entryLow,
      top: entryHigh,
      fill: "rgba(54, 191, 250, 0.10)",
      stroke: "rgba(54, 191, 250, 0.55)",
      label: `ENTRY${intervalLabel ? " " + intervalLabel : ""}`,
      labelColor: ANNO_PALETTE.entry,
    });
  }

  // Position Tool R:R \u2014 lucro (entry\u2192tp2)
  if (Number.isFinite(entryRef) && Number.isFinite(tp2)) {
    zones.push({
      bottom: Math.min(entryRef, tp2),
      top: Math.max(entryRef, tp2),
      fill: "rgba(67, 170, 139, 0.20)",
      stroke: "rgba(67, 170, 139, 0.45)",
      label: `LUCRO ${formatRR(rr2) || ""}`.trim(),
      labelColor: ANNO_PALETTE.rrProfit,
      labelAlign: "center",
    });
  }

  // Position Tool R:R \u2014 risco (entry\u2192sl)
  if (Number.isFinite(entryRef) && Number.isFinite(sl)) {
    zones.push({
      bottom: Math.min(entryRef, sl),
      top: Math.max(entryRef, sl),
      fill: "rgba(249, 65, 68, 0.20)",
      stroke: "rgba(249, 65, 68, 0.45)",
      label: "RISCO",
      labelColor: ANNO_PALETTE.rrRisk,
      labelAlign: "center",
    });
  }

  // FVG ativo (amarelo)
  const fvgActive = Boolean(ms.fairValueGapActive);
  const fvgLower = Number(ms.fairValueGapLower);
  const fvgUpper = Number(ms.fairValueGapUpper);
  if (fvgActive && Number.isFinite(fvgLower) && Number.isFinite(fvgUpper) && fvgUpper > fvgLower) {
    zones.push({
      bottom: fvgLower,
      top: fvgUpper,
      fill: "rgba(255, 209, 102, 0.10)",
      stroke: "rgba(255, 209, 102, 0.55)",
      label: `FVG${intervalLabel ? " " + intervalLabel : ""}`,
      labelColor: ANNO_PALETTE.fvg,
      dashed: true,
    });
  }

  for (const zone of liquidityHeatmap.zones) {
    if (!Number.isFinite(zone.bottom) || !Number.isFinite(zone.top) || zone.top <= zone.bottom) continue;
    zones.push({
      bottom: zone.bottom,
      dashed: true,
      fill: zone.fill,
      label: zone.label,
      labelColor: zone.labelColor,
      stroke: zone.stroke,
      top: zone.top,
    });
  }

  // Order Blocks candidatos \u2014 swings como faixas estreitas
  const obSpec = [
    { kind: "obBull", level: Number(ms.swingLow), prefix: "OB\u2191", color: ANNO_PALETTE.obBull, fill: "rgba(51, 217, 178, 0.10)", stroke: "rgba(51, 217, 178, 0.50)" },
    { kind: "obBear", level: Number(ms.swingHigh), prefix: "OB\u2193", color: ANNO_PALETTE.obBear, fill: "rgba(255, 107, 128, 0.10)", stroke: "rgba(255, 107, 128, 0.50)" },
  ];
  for (const ob of obSpec) {
    if (!Number.isFinite(ob.level) || ob.level <= 0) continue;
    const status = classifyLevelTouch(currentPrice, ob.level, ob.kind);
    if (status === "Mitigado") continue; // OB mitigado n\u00e3o pinta zona (apenas ru\u00eddo visual)
    const halfBand = Math.abs(ob.level) * 0.0005; // \u00b10.05%
    zones.push({
      bottom: ob.level - halfBand,
      top: ob.level + halfBand,
      fill: ob.fill,
      stroke: ob.stroke,
      label: `${ob.prefix}${intervalLabel ? " " + intervalLabel : ""}${status ? " \u00b7 " + status : ""}`,
      labelColor: ob.color,
    });
  }

  primitive.setZones(zones);
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
    if (!chartLabState.snapshot) {
      return;
    }

    const time = parseTimeToUnixSeconds(param.time, Number.NaN);

    if (Number.isFinite(time) && chartCandleByTime.has(time)) {
      updateChartLegendFromCandle(chartCandleByTime.get(time), chartLabState.snapshot, true);
      return;
    }

    if (chartLatestCandles.length > 0) {
      updateChartLegendFromCandle(
        chartLatestCandles[chartLatestCandles.length - 1],
        chartLabState.snapshot,
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
  setChartFallbackBadge("", "");

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

  if (chartContextSyncTimer !== null) {
    window.clearTimeout(chartContextSyncTimer);
    chartContextSyncTimer = null;
  }

  chartLoadController.clearPending();
  intelligenceSyncActiveCorrelationId = "";
  stopIntelligenceSyncHealthPolling();

  stopChartAutoRefresh();
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
  chartZonesPrimitive = null; // ADR-077
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

function normalizeBrokerName(broker) {
  if (typeof broker !== "string") {
    return "binance";
  }

  const normalized = broker.trim().toLowerCase();
  return BROKER_FAILOVER_ORDER.includes(normalized) ? normalized : "binance";
}

function normalizeRequestedBroker(broker) {
  if (typeof broker !== "string") {
    return "binance";
  }

  const normalized = broker.trim().toLowerCase();

  if (normalized === "auto") {
    return "auto";
  }

  return normalizeBrokerName(normalized);
}

function resolveAutoChartPrimaryBroker() {
  return normalizeBrokerName(chartAutoPreferredBroker);
}

function updateAutoChartPreferredBroker(nextBroker, options = {}) {
  const normalizedBroker = normalizeBrokerName(nextBroker);
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const force = options.force === true;
  const canSwitchBroker =
    force
    || normalizedBroker === chartAutoPreferredBroker
    || nowMs >= chartAutoPreferredBrokerLockUntilMs;

  if (!canSwitchBroker) {
    return false;
  }

  chartAutoPreferredBroker = normalizedBroker;
  chartAutoPreferredBrokerLockUntilMs = nowMs + CHART_AUTO_BROKER_STICKY_MS;
  return true;
}

function resolveAutoWatchlistPrimaryBroker() {
  return normalizeBrokerName(watchlistAutoPreferredBroker);
}

function resolveExchangeLabelFromBroker(broker) {
  const normalizedBroker = normalizeBrokerName(broker);

  if (normalizedBroker === "bybit") {
    return "BYBIT";
  }

  if (normalizedBroker === "coinbase") {
    return "COINBASE";
  }

  if (normalizedBroker === "kraken") {
    return "KRAKEN";
  }

  if (normalizedBroker === "okx") {
    return "OKX";
  }

  return "BINANCE";
}

function getBrokerFailureStreak(broker) {
  const normalizedBroker = normalizeBrokerName(broker);
  const streak = brokerFailureStreakByName.get(normalizedBroker);

  if (!Number.isInteger(streak) || streak <= 0) {
    return 0;
  }

  return streak;
}

function getBrokerCircuitRemainingMs(broker, nowMs = Date.now()) {
  const normalizedBroker = normalizeBrokerName(broker);
  const openUntil = brokerCircuitOpenUntilByName.get(normalizedBroker);

  if (typeof openUntil !== "number" || Number.isNaN(openUntil)) {
    return 0;
  }

  return Math.max(0, Math.round(openUntil - nowMs));
}

function isBrokerCircuitOpen(broker, nowMs = Date.now()) {
  return getBrokerCircuitRemainingMs(broker, nowMs) > 0;
}

function markBrokerSuccess(broker) {
  const normalizedBroker = normalizeBrokerName(broker);
  brokerFailureStreakByName.set(normalizedBroker, 0);
  brokerCircuitOpenUntilByName.delete(normalizedBroker);
}

function markBrokerFailure(broker, message) {
  if (!isRetryableMarketApiErrorMessage(message)) {
    return;
  }

  const normalizedBroker = normalizeBrokerName(broker);
  const nextStreak = getBrokerFailureStreak(normalizedBroker) + 1;
  brokerFailureStreakByName.set(normalizedBroker, nextStreak);

  if (nextStreak < BROKER_CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    return;
  }

  brokerCircuitOpenUntilByName.set(
    normalizedBroker,
    Date.now() + BROKER_CIRCUIT_BREAKER_COOLDOWN_MS,
  );
  brokerFailureStreakByName.set(normalizedBroker, 0);
}

function getBrokerCircuitSummary(broker) {
  const remainingMs = getBrokerCircuitRemainingMs(broker);

  if (remainingMs <= 0) {
    return "";
  }

  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return `Circuit breaker ativo para ${normalizeBrokerName(broker).toUpperCase()} (${seconds}s restantes)`;
}

function buildBrokerFailoverChain(primaryBroker, options = {}) {
  const normalizedPrimary = normalizeBrokerName(primaryBroker);
  const strictChain = [normalizedPrimary];

  for (const candidate of BROKER_FAILOVER_ORDER) {
    if (candidate === normalizedPrimary) {
      continue;
    }

    strictChain.push(candidate);
  }

  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const activeChain = strictChain.filter((candidate) => !isBrokerCircuitOpen(candidate, nowMs));

  if (activeChain.length > 0) {
    return activeChain;
  }

  return strictChain;
}

function getErrorMessage(error, fallbackMessage) {
  return error instanceof Error && typeof error.message === "string" && error.message.length > 0
    ? error.message
    : fallbackMessage;
}

function isRetryableMarketApiErrorMessage(message) {
  if (typeof message !== "string") {
    return true;
  }

  const normalized = message.toLowerCase();

  if (
    normalized.includes("non-success status")
    || normalized.includes("failed to fetch")
    || normalized.includes("network")
    || normalized.includes("timeout")
    || normalized.includes("temporarily unavailable")
    || normalized.includes("service unavailable")
    || normalized.includes("gateway timeout")
    || normalized.includes("too many requests")
    || normalized.includes("bad gateway")
    || normalized.includes("indisponivel")
    || normalized.includes("request failed")
  ) {
    return true;
  }

  return false;
}

function normalizeBrokerApiErrorMessage(message, fallbackMessage) {
  if (typeof message !== "string") {
    return fallbackMessage;
  }

  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("returned a non-success status")) {
    return "Provedor de mercado indisponivel no momento. Failover automatico ativado.";
  }

  if (normalizedMessage.includes("failed to fetch") || normalizedMessage.includes("network")) {
    return "Falha de rede ao consultar provedores de mercado.";
  }

  if (normalizedMessage.includes("too many requests")) {
    return "Provedor de mercado saturado (rate limit). Aplicando contingencia automatica.";
  }

  if (normalizedMessage.includes("timeout")) {
    return "Timeout no provedor de mercado. Reprocessando em rota de contingencia.";
  }

  return message;
}

function normalizeChartApiErrorMessage(message, fallbackMessage) {
  return normalizeBrokerApiErrorMessage(
    message,
    fallbackMessage,
  );
}

function waitFor(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function runMarketRequestWithRetry(requestFactory, options = {}) {
  const maxAttempts = Number.isInteger(options.maxAttempts)
    ? Math.max(1, options.maxAttempts)
    : MARKET_HTTP_RETRY_MAX_ATTEMPTS;
  const baseDelayMs = Number.isFinite(options.baseDelayMs)
    ? Math.max(80, options.baseDelayMs)
    : MARKET_HTTP_RETRY_BASE_DELAY_MS;

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requestFactory();
    } catch (error) {
      lastError = error;

      const message = getErrorMessage(error, "Falha no provedor de mercado");
      const canRetry = attempt < maxAttempts && isRetryableMarketApiErrorMessage(message);

      if (!canRetry) {
        throw error;
      }

      const jitterMs = Math.round(Math.random() * 120);
      const backoffMs = Math.min(3000, Math.round(baseDelayMs * 2 ** (attempt - 1)) + jitterMs);
      await waitFor(backoffMs);
    }
  }

  throw lastError ?? new Error("Falha ao consultar provedor de mercado");
}

function buildIntelligenceSyncCorrelationHeaders() {
  const correlationId = getActiveIntelligenceSyncCorrelationId();

  if (!correlationId) {
    return undefined;
  }

  return {
    "x-intelligence-correlation-id": correlationId,
  };
}

function normalizeRequestedChartResolution(interval) {
  const normalizedInterval = normalizeTerminalInterval(interval);
  return getBackendResolutionForTerminalInterval(normalizedInterval);
}

const BINARY_OPTIONS_RANGE_TO_TICK_RESOLUTION_MAP = {
  "1000R": "1000T",
  "100R": "100T",
  "10R": "10T",
};

function normalizeRequestedBinaryOptionsResolution(interval) {
  const normalizedInterval = normalizeTerminalInterval(interval);
  const backendResolution = getBackendResolutionForTerminalInterval(normalizedInterval);

  if (typeof backendResolution === "string" && backendResolution.length > 0) {
    return backendResolution;
  }

  if (normalizedInterval.endsWith("T")) {
    return normalizedInterval;
  }

  if (normalizedInterval.endsWith("R")) {
    return BINARY_OPTIONS_RANGE_TO_TICK_RESOLUTION_MAP[normalizedInterval] ?? null;
  }

  return null;
}

function shouldUseResolutionFallback(interval, message) {
  const normalizedInterval = normalizeTerminalInterval(interval);

  if (normalizedInterval === TERMINAL_INTERVAL_BACKEND_FALLBACK) {
    return false;
  }

  const normalizedMessage = String(message ?? "").toLowerCase();
  const hasUnsupportedHint =
    normalizedMessage.includes("resolu")
    || normalizedMessage.includes("unsupported")
    || normalizedMessage.includes("granularity")
    || normalizedMessage.includes("interval");

  if (isNonTimeBasedTerminalInterval(normalizedInterval)) {
    return true;
  }

  if (isSubMinuteTerminalInterval(normalizedInterval)) {
    return hasUnsupportedHint || isRetryableMarketApiErrorMessage(normalizedMessage);
  }

  return hasUnsupportedHint;
}

function buildResolutionFallbackMessage(interval, fallbackInterval = TERMINAL_INTERVAL_BACKEND_FALLBACK) {
  const label = getTerminalIntervalDisplayLabel(interval);
  const fallbackLabel = getTerminalIntervalDisplayLabel(fallbackInterval);

  return TERMINAL_INTERVAL_MENU_FALLBACK_MESSAGE
    .replace("%INTERVAL%", label)
    .replace("%FALLBACK%", fallbackLabel);
}

function hasDelayedFallbackReason(message) {
  const normalizedMessage = String(message ?? "").toLowerCase();

  return normalizedMessage.includes("live indisponivel")
    || normalizedMessage.includes("fallback delayed");
}

function hasIntervalFallbackReason(message) {
  const normalizedMessage = String(message ?? "").toLowerCase();

  return normalizedMessage.includes("corretora atual nao fornece dados")
    || normalizedMessage.includes("fallback automatico para");
}

async function requestCryptoChartEndpoint(assetId, range, mode, exchange = "binance", resolution = null, options = {}) {
  return runMarketRequestWithRetry(async () => {
    const normalizedExchange = normalizeRequestedBroker(exchange);
    const normalizedMode = mode === "live" ? "live" : "delayed";
    const params = new URLSearchParams({
      assetId,
      exchange: normalizedExchange,
      mode: normalizedMode,
      range,
    });

    if (typeof resolution === "string" && resolution.length > 0) {
      params.set("resolution", resolution);
    }

    if ((options && options.fresh === true) || pendingFreshFetchScope === true) {
      params.set("fresh", "true");
    }

    const response = await fetch(buildApiUrl(`/v1/crypto/strategy-chart?${params.toString()}`), {
      headers: buildIntelligenceSyncCorrelationHeaders(),
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
      throw new Error(normalizeChartApiErrorMessage(errorMessage, "Nao foi possivel carregar o grafico"));
    }

    chartAssetGeneration.assertCurrent(options.assetGenerationToken);
    return payload?.data ?? null;
  });
}

async function requestBinaryOptionsChartEndpoint(assetId, range, mode, exchange = "binance", resolution = "1S", options = {}) {
  return runMarketRequestWithRetry(async () => {
    const normalizedExchange = normalizeRequestedBroker(exchange);
    const normalizedMode = mode === "live" ? "live" : "delayed";
    const params = new URLSearchParams({
      assetId,
      exchange: normalizedExchange,
      mode: normalizedMode,
      range,
      resolution,
    });

    const response = await fetch(buildApiUrl(`/v1/binary-options/strategy-chart?${params.toString()}`), {
      headers: buildIntelligenceSyncCorrelationHeaders(),
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
      throw new Error(normalizeChartApiErrorMessage(errorMessage, "Nao foi possivel carregar o grafico de binarias"));
    }

    chartAssetGeneration.assertCurrent(options.assetGenerationToken);
    return payload?.data ?? null;
  });
}

async function requestBinaryOptionsChart(assetId, range, mode, exchange, interval, options = {}) {
  const normalizedInterval = normalizeTerminalInterval(interval);
  const requestedResolution = normalizeRequestedBinaryOptionsResolution(normalizedInterval);
  const fallbackResolution = TERMINAL_INTERVAL_BINARY_OPTIONS_FALLBACK;

  if (typeof fallbackResolution !== "string" || fallbackResolution.length === 0) {
    throw new Error("Fallback de resolucao indisponivel para o modo operacional de binarias");
  }

  if (typeof requestedResolution !== "string" || requestedResolution.length === 0) {
    const snapshot = await requestBinaryOptionsChartEndpoint(
      assetId,
      range,
      mode,
      exchange,
      fallbackResolution,
      options,
    );
    const fallbackReason = [
      buildResolutionFallbackMessage(normalizedInterval, TERMINAL_INTERVAL_BINARY_OPTIONS_FALLBACK),
      typeof snapshot?.fallbackReason === "string" ? snapshot.fallbackReason : "",
    ].filter((item) => item.length > 0).join(" • ");
    const resolvedBroker = typeof snapshot?.exchange?.resolved === "string"
      ? snapshot.exchange.resolved
      : "binance";

    return {
      fallbackReason,
      resolvedBroker,
      resolvedResolution: fallbackResolution,
      snapshot,
    };
  }

  try {
    const snapshot = await requestBinaryOptionsChartEndpoint(
      assetId,
      range,
      mode,
      exchange,
      requestedResolution,
      options,
    );
    const fallbackReason = typeof snapshot?.fallbackReason === "string" ? snapshot.fallbackReason : "";
    const resolvedBroker = typeof snapshot?.exchange?.resolved === "string"
      ? snapshot.exchange.resolved
      : "binance";

    return {
      fallbackReason,
      resolvedBroker,
      resolvedResolution: requestedResolution,
      snapshot,
    };
  } catch (error) {
    if (isStaleChartAssetGenerationError(error)) {
      throw error;
    }

    const canFallback =
      normalizedInterval !== TERMINAL_INTERVAL_BINARY_OPTIONS_FALLBACK;

    if (!canFallback) {
      throw error;
    }

    const snapshot = await requestBinaryOptionsChartEndpoint(
      assetId,
      range,
      mode,
      exchange,
      fallbackResolution,
      options,
    );
    const fallbackReason = [
      buildResolutionFallbackMessage(normalizedInterval, TERMINAL_INTERVAL_BINARY_OPTIONS_FALLBACK),
      typeof snapshot?.fallbackReason === "string" ? snapshot.fallbackReason : "",
    ].filter((item) => item.length > 0).join(" • ");
    const resolvedBroker = typeof snapshot?.exchange?.resolved === "string"
      ? snapshot.exchange.resolved
      : "binance";

    return {
      fallbackReason,
      resolvedBroker,
      resolvedResolution: fallbackResolution,
      snapshot,
    };
  }
}

async function requestCryptoChart(assetId, range, mode, exchange, interval, options = {}) {
  const normalizedInterval = normalizeTerminalInterval(interval);
  const requestedResolution = normalizeRequestedChartResolution(normalizedInterval);

  if (requestedResolution === null) {
    const fallbackResolution = normalizeRequestedChartResolution(TERMINAL_INTERVAL_BACKEND_FALLBACK);
    const fallbackResult = await requestCryptoChartCore(
      assetId,
      range,
      mode,
      exchange,
      fallbackResolution,
      options,
    );

    return {
      ...fallbackResult,
      fallbackReason: [
        buildResolutionFallbackMessage(normalizedInterval),
        fallbackResult.fallbackReason,
      ].filter((item) => typeof item === "string" && item.length > 0).join(" • "),
      resolvedResolution: fallbackResolution,
    };
  }

  try {
    const result = await requestCryptoChartCore(assetId, range, mode, exchange, requestedResolution, options);

    return {
      ...result,
      resolvedResolution: requestedResolution,
    };
  } catch (error) {
    if (isStaleChartAssetGenerationError(error)) {
      throw error;
    }

    const message = getErrorMessage(error, "Falha ao consultar grafico");

    if (!shouldUseResolutionFallback(normalizedInterval, message)) {
      throw error;
    }

    const fallbackResolution = normalizeRequestedChartResolution(TERMINAL_INTERVAL_BACKEND_FALLBACK);
    const fallbackResult = await requestCryptoChartCore(
      assetId,
      range,
      mode,
      exchange,
      fallbackResolution,
      options,
    );

    return {
      ...fallbackResult,
      fallbackReason: [
        buildResolutionFallbackMessage(normalizedInterval),
        fallbackResult.fallbackReason,
      ].filter((item) => typeof item === "string" && item.length > 0).join(" • "),
      resolvedResolution: fallbackResolution,
    };
  }
}

async function requestCryptoChartCore(assetId, range, mode, exchange, resolution, options = {}) {
  const requestedBroker = normalizeRequestedBroker(exchange);

  if (requestedBroker === "auto") {
    const resolveAutoSnapshot = async (targetMode) => {
      const preferredBroker = resolveAutoChartPrimaryBroker();

      try {
        const snapshot = await requestCryptoChartEndpoint(
          assetId,
          range,
          targetMode,
          preferredBroker,
          resolution,
          options,
        );
        markBrokerSuccess(preferredBroker);
        updateAutoChartPreferredBroker(preferredBroker);

        return {
          fallbackReason: "",
          resolvedBroker: preferredBroker,
          resolvedMode: snapshot?.mode === "live" ? "live" : "delayed",
          snapshot,
        };
      } catch (preferredError) {
        const preferredMessage = getErrorMessage(preferredError, "Falha ao consultar grafico");
        const normalizedPreferredMessage = normalizeChartApiErrorMessage(preferredMessage, "Falha ao consultar grafico");
        markBrokerFailure(preferredBroker, normalizedPreferredMessage);

        if (!isRetryableMarketApiErrorMessage(preferredMessage)) {
          throw new Error(normalizedPreferredMessage);
        }

        const snapshot = await requestCryptoChartEndpoint(
          assetId,
          range,
          targetMode,
          "auto",
          resolution,
          options,
        );
        const resolvedBroker = normalizeBrokerName(snapshot?.provider ?? preferredBroker);
        const switchedBroker = resolvedBroker !== preferredBroker;

        markBrokerSuccess(resolvedBroker);
        updateAutoChartPreferredBroker(resolvedBroker, {
          force: switchedBroker,
        });

        return {
          fallbackReason: switchedBroker
            ? `AUTO inteligente: ajuste de provider ${preferredBroker.toUpperCase()} -> ${resolvedBroker.toUpperCase()}`
            : "",
          resolvedBroker,
          resolvedMode: snapshot?.mode === "live" ? "live" : "delayed",
          snapshot,
        };
      }
    };

    try {
      const targetMode = mode === "live" ? "live" : "delayed";
      return await resolveAutoSnapshot(targetMode);
    } catch (error) {
      const message = getErrorMessage(error, "Falha ao consultar grafico");
      const normalizedMessage = normalizeChartApiErrorMessage(message, "Falha ao consultar grafico");

      if (mode !== "live" || !isRetryableMarketApiErrorMessage(message)) {
        throw new Error(normalizedMessage);
      }

      const delayedResult = await resolveAutoSnapshot("delayed");

      return {
        ...delayedResult,
        fallbackReason: [
          "Live indisponivel, fallback delayed acionado (auto broker)",
          delayedResult.fallbackReason,
        ].filter((item) => item.length > 0).join(" • "),
        resolvedMode: "delayed",
      };
    }
  }

  const primaryChain = buildBrokerFailoverChain(requestedBroker);
  const primarySkippedByCircuit =
    primaryChain.length > 0
    && primaryChain[0] !== requestedBroker
    && isBrokerCircuitOpen(requestedBroker);
  const primaryCircuitSummary = primarySkippedByCircuit
    ? getBrokerCircuitSummary(requestedBroker)
    : "";
  const failureTrail = [];

  const tryResolveSnapshot = async (targetMode, brokerChain) => {
    for (const broker of brokerChain) {
      try {
        const snapshot = await requestCryptoChartEndpoint(assetId, range, targetMode, broker, resolution, options);
        markBrokerSuccess(broker);
        return {
          broker,
          mode: targetMode,
          snapshot,
        };
      } catch (error) {
        const message = getErrorMessage(error, "Falha ao consultar grafico");
        const normalizedMessage = normalizeChartApiErrorMessage(message, "Falha ao consultar grafico");
        markBrokerFailure(broker, normalizedMessage);
        failureTrail.push({
          broker,
          message: normalizedMessage,
        });

        if (!isRetryableMarketApiErrorMessage(message)) {
          throw new Error(normalizedMessage);
        }
      }
    }

    return null;
  };

  const liveOrDelayedSnapshot = await tryResolveSnapshot(mode === "live" ? "live" : "delayed", primaryChain);

  if (liveOrDelayedSnapshot) {
    const usedFailoverBroker = liveOrDelayedSnapshot.broker !== requestedBroker;
    const fallbackReasonParts = [];

    if (primaryCircuitSummary.length > 0) {
      fallbackReasonParts.push(primaryCircuitSummary);
    }

    if (usedFailoverBroker) {
      fallbackReasonParts.push(
        `Failover de corretora ativo: ${requestedBroker.toUpperCase()} -> ${liveOrDelayedSnapshot.broker.toUpperCase()}`,
      );
    }

    const fallbackReason = fallbackReasonParts.join(" • ");

    return {
      fallbackReason,
      resolvedBroker: liveOrDelayedSnapshot.broker,
      resolvedMode: liveOrDelayedSnapshot.mode,
      snapshot: liveOrDelayedSnapshot.snapshot,
    };
  }

  if (mode !== "live") {
    const lastFailure = failureTrail[failureTrail.length - 1];
    throw new Error(normalizeChartApiErrorMessage(lastFailure?.message, "Nao foi possivel carregar o grafico"));
  }

  const delayedSnapshot = await tryResolveSnapshot("delayed", buildBrokerFailoverChain(requestedBroker));

  if (delayedSnapshot) {
    const usedFailoverBroker = delayedSnapshot.broker !== requestedBroker;
    const fallbackReasonParts = [
      "Live indisponivel, fallback delayed acionado",
      primaryCircuitSummary,
      usedFailoverBroker
        ? `rota de contingencia ${requestedBroker.toUpperCase()} -> ${delayedSnapshot.broker.toUpperCase()}`
        : "",
    ].filter((item) => item.length > 0);

    return {
      fallbackReason: fallbackReasonParts.join(" • "),
      resolvedBroker: delayedSnapshot.broker,
      resolvedMode: delayedSnapshot.mode,
      snapshot: delayedSnapshot.snapshot,
    };
  }

  const lastFailure = failureTrail[failureTrail.length - 1];
  throw new Error(normalizeChartApiErrorMessage(lastFailure?.message, "Nao foi possivel carregar o grafico"));
}

async function requestInstitutionalMacroSnapshot(symbol, range, mode, moduleName = "forex", interval, options = {}) {
  const normalizedInterval = normalizeTerminalInterval(interval);
  const requestedResolution = normalizeRequestedChartResolution(normalizedInterval);

  if (requestedResolution === null) {
    const fallbackResolution = normalizeRequestedChartResolution(TERMINAL_INTERVAL_BACKEND_FALLBACK);
    const snapshot = await requestInstitutionalMacroSnapshotCore(
      symbol,
      range,
      mode,
      moduleName,
      fallbackResolution,
      options,
    );

    return {
      fallbackReason: buildResolutionFallbackMessage(normalizedInterval),
      resolvedResolution: fallbackResolution,
      snapshot,
    };
  }

  try {
    const snapshot = await requestInstitutionalMacroSnapshotCore(
      symbol,
      range,
      mode,
      moduleName,
      requestedResolution,
      options,
    );

    return {
      fallbackReason: "",
      resolvedResolution: requestedResolution,
      snapshot,
    };
  } catch (error) {
    if (isStaleChartAssetGenerationError(error)) {
      throw error;
    }

    const message = getErrorMessage(error, "Falha ao carregar o motor institucional");

    if (!shouldUseResolutionFallback(normalizedInterval, message)) {
      throw error;
    }

    const fallbackResolution = normalizeRequestedChartResolution(TERMINAL_INTERVAL_BACKEND_FALLBACK);
    const snapshot = await requestInstitutionalMacroSnapshotCore(
      symbol,
      range,
      mode,
      moduleName,
      fallbackResolution,
      options,
    );

    return {
      fallbackReason: buildResolutionFallbackMessage(normalizedInterval),
      resolvedResolution: fallbackResolution,
      snapshot,
    };
  }
}

async function requestInstitutionalMacroSnapshotCore(symbol, range, mode, moduleName, resolution, options = {}) {
  const sanitizedSymbol = sanitizeTerminalSymbol(symbol);

  if (sanitizedSymbol.length < 2) {
    throw new Error("Simbolo institucional invalido para analise");
  }

  const safeMode = mode === "live" ? "live" : "delayed";
  const normalizedModule = typeof moduleName === "string" && moduleName.length > 0
    ? moduleName
    : "forex";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Etc/UTC";
  const params = new URLSearchParams({
    mode: safeMode,
    module: normalizedModule,
    range,
    resolution,
    symbol: sanitizedSymbol,
    timezone,
  });
  const response = await fetch(buildApiUrl(`/v1/forex/strategy-chart?${params.toString()}`), {
    headers: buildIntelligenceSyncCorrelationHeaders(),
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
    throw new Error(
      normalizeChartApiErrorMessage(
        errorMessage,
        "Nao foi possivel carregar o motor institucional",
      ),
    );
  }

  chartAssetGeneration.assertCurrent(options.assetGenerationToken);
  return payload?.data ?? null;
}

function applyChartSnapshot(snapshot, options = {}) {
  chartAssetGeneration.assertCurrent(options.assetGenerationToken);

  if (!snapshot || !Array.isArray(snapshot.points)) {
    throw new Error("Resposta de grafico invalida");
  }

  chartLabState.snapshot = snapshot;
  chartLabState.strategy = snapshot?.strategy === "institutional_macro" ? "institutional_macro" : "crypto";

  if (chartLabState.strategy === "crypto") {
    void loadNewsIntelligence(snapshot.assetId);
  } else {
    newsIntelligencePayload = null;
    newsIntelligenceLastAssetId = "";
    newsIntelligenceLastFetchedAtMs = 0;
  }

  if (chartLabState.viewMode === "copilot") {
    renderInteractiveChart(snapshot);
  }

  renderChartMetrics(snapshot);

  const forcedModeReason = typeof options.forcedModeReason === "string" ? options.forcedModeReason : "";
  const fallbackReason = typeof options.fallbackReason === "string" ? options.fallbackReason : "";
  const combinedFallbackReason = [forcedModeReason, fallbackReason].filter((item) => item.length > 0).join(" | ");
  const hasFallbackReason = combinedFallbackReason.length > 0;
  const hasDelayedFallback = hasDelayedFallbackReason(combinedFallbackReason);
  const hasIntervalFallback = hasIntervalFallbackReason(combinedFallbackReason);
  const selectedExchange = typeof options.selectedExchange === "string"
    ? options.selectedExchange
    : getSelectedTerminalExchange();
  const transport = options.transport === "stream" ? "stream" : "polling";
  const cacheLabel = snapshot.cache?.state ? `cache ${snapshot.cache.state}` : "cache n/d";
  const rangeLabel = CHART_RANGE_LABELS[snapshot.range] ?? snapshot.range;
  const modeLabel = CHART_MODE_LABELS[snapshot.mode] ?? snapshot.mode;
  const intervalLabel = getTerminalIntervalDisplayLabel(getSelectedTerminalInterval());
  const styleLabel = chartLabState.viewMode === "tv"
    ? CHART_STYLE_LABELS[getSelectedTerminalStyle()] ?? getSelectedTerminalStyle()
    : CHART_STYLE_LABELS[resolveChartStyle()] ?? resolveChartStyle();
  const strategyLabel = chartLabState.strategy === "institutional_macro" ? "institucional" : "crypto";
  const operationalModeLabel = getChartOperationalModeLabel(chartLabState.operationalMode);
  const displayProvider = typeof options.displayProvider === "string"
    ? options.displayProvider
    : snapshot.provider;
  const providerLabel = String(displayProvider ?? "n/d").toUpperCase();
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
  const fallbackLabel = hasFallbackReason
    ? hasDelayedFallback
      ? " • fallback delayed ativo"
      : hasIntervalFallback
        ? " • fallback de intervalo ativo"
        : " • fallback operacional ativo"
    : "";
  const fallbackBadgeMode = hasFallbackReason
    ? hasIntervalFallback
      ? "interval"
      : hasDelayedFallback
        ? "delayed"
        : "operational"
    : "";
  const fallbackBadgeLabel = hasFallbackReason
    ? hasIntervalFallback
      ? "Fallback intervalo"
      : hasDelayedFallback
        ? "Fallback delayed"
        : "Fallback operacional"
    : "";
  const statusMode = hasFallbackReason ? "warn" : "";
  const updatedAtLabel = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const transportLabel = transport === "stream" ? " • transporte stream" : "";

  setChartFallbackBadge(fallbackBadgeLabel, fallbackBadgeMode);

  setChartStatus(
    `Grafico ${snapshot.assetId.toUpperCase()} (${modeLabel}, ${rangeLabel}, ${styleLabel}, ${intervalLabel}) • workspace ${operationalModeLabel} • estrategia ${strategyLabel} • exchange ${selectedExchange} • provider ${providerLabel} • ${cacheLabel}${refreshLabel}${liveLabel}${transportLabel}${fallbackLabel} • atualizado ${updatedAtLabel}`,
    statusMode,
  );

  if (chartLabState.viewMode !== "tv" && hasFallbackReason) {
    const fallbackLegendMessage = hasDelayedFallback
      ? `Fallback ativo: ${combinedFallbackReason}. Exibindo delayed temporariamente.`
      : hasIntervalFallback
        ? `Fallback de intervalo ativo: ${combinedFallbackReason}. Ajustando a granularidade automaticamente.`
        : `Fallback operacional ativo: ${combinedFallbackReason}.`;

    setChartLegend(fallbackLegendMessage, "warn");
  }
}

function stopChartLiveStream(options) {
  chartLiveStreamController.stopStream(options);
}

function stopChartLiveFallbackPolling() {
  chartLiveStreamController.stopFallbackPolling();
}

function startChartLiveFallbackPolling() {
  chartLiveStreamController.startFallbackPolling(() => {
    if (chartModeSelect?.value !== "live") {
      stopChartLiveFallbackPolling();
      return;
    }

    void loadChart({
      mode: "live",
      silent: true,
    });
  }, CHART_STREAM_FALLBACK_POLL_MS);
}

function connectBinaryOptionsLiveStream(intervalMs) {
  if (!(chartAssetSelect instanceof HTMLSelectElement) || !(chartRangeSelect instanceof HTMLSelectElement)) {
    return false;
  }

  if (chartModeSelect?.value !== "live" || !isNativeLiveModeSupported()) {
    stopChartLiveStream();
    return false;
  }

  const assetId = chartAssetSelect.value;
  const range = chartRangeSelect.value;
  const selectedInterval = getSelectedTerminalInterval();
  const streamResolution = normalizeRequestedBinaryOptionsResolution(selectedInterval);

  if (typeof streamResolution !== "string" || streamResolution.length === 0) {
    startChartLiveFallbackPolling();
    return false;
  }

  const selectedRequestedBroker = normalizeRequestedBroker(getSelectedBroker());
  const exchange = selectedRequestedBroker === "auto" ? "binance" : normalizeBrokerName(selectedRequestedBroker);
  const streamDescriptor = buildBinaryOptionsLiveStreamDescriptor({
    apiBaseUrl: API_BASE_URL,
    assetId,
    exchange,
    intervalMs,
    range,
    requestedBroker: selectedRequestedBroker,
    resolution: streamResolution,
  });

  if (streamDescriptor === null) {
    startChartLiveFallbackPolling();
    return false;
  }

  const { streamKey, streamUrl } = streamDescriptor;

  if (chartLiveStreamController.isActiveStream(streamKey)) {
    return true;
  }

  stopChartLiveStream();

  const eventSource = new EventSource(streamUrl);
  chartLiveStreamController.attachStream(streamKey, eventSource);

  eventSource.addEventListener("snapshot", (event) => {
    const payload = parseStreamPayload(event, "binary");

    const snapshot = payload?.chart ?? null;

    if (!snapshot || !Array.isArray(snapshot.points)) {
      return;
    }

    if (chartAssetSelect.value !== snapshot.assetId) {
      return;
    }

    if (chartRangeSelect.value !== snapshot.range) {
      return;
    }

    chartLiveStreamController.markLiveSnapshotReceived();

    const resolvedStreamBroker = normalizeBrokerName(snapshot?.exchange?.resolved ?? snapshot?.provider ?? exchange);
    const selectedExchangeForStatus = resolveExchangeLabelFromBroker(resolvedStreamBroker);
    const fallbackReason = typeof snapshot?.fallbackReason === "string" ? snapshot.fallbackReason : "";

    try {
      applyChartSnapshot(snapshot, {
        displayProvider: resolvedStreamBroker,
        fallbackReason,
        selectedExchange: selectedExchangeForStatus,
        transport: "stream",
      });
    } catch {
      // Keep stream alive even if a malformed snapshot arrives.
    }
  });

  eventSource.addEventListener("stream-error", (event) => {
    const payload = parseStreamPayload(event, "binary:stream-error");

    const message = typeof payload?.message === "string"
      ? payload.message
      : "Stream de binarias reportou falha";

    startChartLiveFallbackPolling();
    const normalizedMessage = normalizeChartApiErrorMessage(message, "Stream de binarias reportou falha");

    if (chartLabState.viewMode === "tv" && chartLabState.snapshot) {
      setChartLegendTransient(`Stream com oscilacao: ${normalizedMessage}`, "warn");
    } else {
      setChartStatus(normalizedMessage, "error");
    }
  });

  eventSource.onerror = () => {
    if (normalizeRequestedBroker(getSelectedBroker()) !== selectedRequestedBroker) {
      return;
    }

    if (!chartLiveStreamController.isActiveStream(streamKey)) {
      return;
    }

    stopChartLiveStream({ transitioning: true });
    startChartLiveFallbackPolling();
    const backoffMs = chartLiveStreamController.nextReconnectBackoffMs();

    if (chartLabState.viewMode === "tv" && chartLabState.snapshot) {
      setChartLegendTransient(`Reconectando stream live em ${Math.round(backoffMs / 1000)}s...`, "warn");
    } else {
      setChartStatus(`Reconectando stream live em ${Math.round(backoffMs / 1000)}s...`, "loading");
    }

    chartLiveStreamController.scheduleReconnect(() => {
      if (chartModeSelect?.value !== "live") {
        return;
      }

      configureChartAutoRefresh();

      if (!chartLiveStreamController.hasStream()) {
        void loadChart({
          silent: true,
        });
      }
    }, backoffMs);
  };

  return true;
}

function connectChartLiveStream(intervalMs) {
  if (typeof EventSource !== "function") {
    return false;
  }

  if (!(chartAssetSelect instanceof HTMLSelectElement) || !(chartRangeSelect instanceof HTMLSelectElement)) {
    return false;
  }

  const selectedTerminalSymbol = getSelectedTerminalSymbol();

  if (resolveChartPipelineStrategy(selectedTerminalSymbol) !== "crypto") {
    stopChartLiveStream();
    return false;
  }

  if (isBinaryOptionsOperationalMode()) {
    return connectBinaryOptionsLiveStream(intervalMs);
  }

  if (chartModeSelect?.value !== "live" || !isNativeLiveModeSupported()) {
    stopChartLiveStream();
    return false;
  }

  const assetId = chartAssetSelect.value;
  const range = chartRangeSelect.value;
  const selectedInterval = getSelectedTerminalInterval();
  const requestedResolution = normalizeRequestedChartResolution(selectedInterval);
  const streamResolution = requestedResolution
    ?? normalizeRequestedChartResolution(TERMINAL_INTERVAL_BACKEND_FALLBACK);
  const {
    contingencyLegend,
    exchange,
    isContingency,
    selectedRequestedBroker,
  } = resolveChartLiveStreamBrokerSelection({
    autoBroker: resolveAutoChartPrimaryBroker(),
    buildBrokerFailoverChain,
    normalizeBrokerName,
    normalizeRequestedBroker,
    requestedBroker: getSelectedBroker(),
  });
  const streamDescriptor = buildCryptoLiveStreamDescriptor({
    apiBaseUrl: API_BASE_URL,
    assetId,
    exchange,
    intervalMs,
    range,
    requestedBroker: selectedRequestedBroker,
    resolution: streamResolution,
  });

  if (streamDescriptor === null) {
    startChartLiveFallbackPolling();
    return false;
  }

  const { streamKey, streamUrl } = streamDescriptor;

  if (chartLiveStreamController.isActiveStream(streamKey)) {
    return true;
  }

  stopChartLiveStream();

  const eventSource = new EventSource(streamUrl);
  chartLiveStreamController.attachStream(streamKey, eventSource);

  if (isContingency) {
    setChartLegend(contingencyLegend, "warn");
  }

  eventSource.addEventListener("snapshot", (event) => {
    const payload = parseStreamPayload(event, "chart");

    const snapshot = payload?.chart ?? null;

    if (!snapshot || !Array.isArray(snapshot.points)) {
      return;
    }

    if (chartAssetSelect.value !== snapshot.assetId) {
      return;
    }

    if (chartRangeSelect.value !== snapshot.range) {
      return;
    }

    const resolvedStreamBroker = normalizeBrokerName(snapshot?.provider ?? exchange);
    markBrokerSuccess(resolvedStreamBroker);

    if (selectedRequestedBroker === "auto") {
      updateAutoChartPreferredBroker(resolvedStreamBroker);
    }

    chartLiveStreamController.markLiveSnapshotReceived();

    try {
      const statusBroker = selectedRequestedBroker === "auto"
        ? resolveAutoChartPrimaryBroker()
        : resolvedStreamBroker;
      const selectedExchangeForStatus = resolveExchangeLabelFromBroker(statusBroker);
      applyChartSnapshot(snapshot, {
        displayProvider: statusBroker,
        selectedExchange: selectedExchangeForStatus,
        transport: "stream",
      });
    } catch {
      // Keep stream alive even if a malformed snapshot arrives.
    }
  });

  eventSource.addEventListener("stream-error", (event) => {
    const payload = parseStreamPayload(event, "chart:stream-error");

    const message = typeof payload?.message === "string"
      ? payload.message
      : "Stream de chart reportou falha";

    markBrokerFailure(exchange, message);

    const nextBroker = resolveNextAutoBrokerAfterLiveFailure({
      buildBrokerFailoverChain,
      exchange,
      isBrokerCircuitOpen,
      normalizeBrokerName,
      normalizeRequestedBroker,
      selectedRequestedBroker,
    });

    if (nextBroker) {
      updateAutoChartPreferredBroker(nextBroker, {
        force: true,
      });
    }

    startChartLiveFallbackPolling();
    const normalizedMessage = normalizeBrokerApiErrorMessage(message, "Stream de chart reportou falha");

    if (chartLabState.viewMode === "tv" && chartLabState.snapshot) {
      chartLiveStreamController.scheduleDeferredLegend(() => {
        setChartLegendTransient(`Stream com oscilacao: ${normalizedMessage}`, "warn");
      }, CHART_STREAM_ERROR_LEGEND_DEFER_MS);
    } else {
      setChartStatus(normalizedMessage, "error");
    }
  });

  eventSource.onerror = () => {
    if (normalizeRequestedBroker(getSelectedBroker()) !== selectedRequestedBroker) {
      return;
    }

    if (!chartLiveStreamController.isActiveStream(streamKey)) {
      return;
    }

    markBrokerFailure(exchange, "Stream live desconectado");

    const nextBroker = resolveNextAutoBrokerAfterLiveFailure({
      buildBrokerFailoverChain,
      exchange,
      isBrokerCircuitOpen,
      normalizeBrokerName,
      normalizeRequestedBroker,
      selectedRequestedBroker,
    });

    if (nextBroker) {
      updateAutoChartPreferredBroker(nextBroker, {
        force: true,
      });
    }

    stopChartLiveStream({ transitioning: true });
    startChartLiveFallbackPolling();
    const backoffMs = chartLiveStreamController.nextReconnectBackoffMs();

    if (chartLabState.viewMode === "tv" && chartLabState.snapshot) {
      setChartLegendTransient(`Reconectando stream live em ${Math.round(backoffMs / 1000)}s...`, "warn");
    } else {
      setChartStatus(`Reconectando stream live em ${Math.round(backoffMs / 1000)}s...`, "loading");
    }

    chartLiveStreamController.scheduleReconnect(() => {
      if (chartModeSelect?.value !== "live") {
        return;
      }

      configureChartAutoRefresh();

      if (!chartLiveStreamController.hasStream()) {
        void loadChart({
          silent: true,
        });
      }
    }, backoffMs);
  };

  return true;
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
      renderDeepAnalysisPanel(chartLabState.snapshot);
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
      renderDeepAnalysisPanel(chartLabState.snapshot);
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

/**
 * Hidrata dinamicamente o `<select id="chart-asset">` com o catalogo canonico
 * exposto por `GET /v1/crypto/asset-catalog`. Mantem a selecao atual quando
 * possivel e degrada silenciosamente para a lista estatica do HTML se o
 * endpoint falhar (preserva offline-first e SSR-less).
 */
async function hydrateChartAssetCatalog() {
  if (!(chartAssetSelect instanceof HTMLSelectElement)) {
    return;
  }

  try {
    const response = await fetch(buildApiUrl("/v1/crypto/asset-catalog"), {
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    const assets = Array.isArray(payload?.data?.assets) ? payload.data.assets : [];

    if (assets.length === 0) {
      return;
    }

    const previousValue = chartAssetSelect.value;
    const previousValueStillValid = assets.some((asset) => asset?.id === previousValue);
    const fragment = document.createDocumentFragment();

    for (const asset of assets) {
      if (!asset || typeof asset.id !== "string" || typeof asset.name !== "string") {
        continue;
      }

      const option = document.createElement("option");
      option.value = asset.id;
      option.textContent = typeof asset.symbol === "string" && asset.symbol.length > 0
        ? `${asset.name} (${asset.symbol})`
        : asset.name;
      fragment.appendChild(option);
    }

    chartAssetSelect.replaceChildren(fragment);

    if (previousValueStillValid) {
      chartAssetSelect.value = previousValue;
    }
  } catch {
    // Silencioso: o `<select>` ja vem populado com a lista estatica de fallback.
  }
}

async function loadChart(options = {}) {
  if (!chartAssetSelect || !chartRangeSelect) {
    return;
  }

  const loadOptions = {
    ...options,
    assetGenerationToken: chartAssetGeneration.resolveToken(options.assetGenerationToken),
  };

  if (chartLoadController.queueIfBusy(loadOptions)) {
    return;
  }

  const assetGenerationToken = loadOptions.assetGenerationToken;
  const assetId = loadOptions.assetId ?? chartAssetSelect.value;
  const requestedMode = loadOptions.mode ?? chartModeSelect?.value ?? "delayed";
  const selectedTerminalSymbol = getSelectedTerminalSymbol();
  const selectedInterval = getSelectedTerminalInterval();
  const pipelineStrategy = resolveChartPipelineStrategy(selectedTerminalSymbol);
  const selectedExchange = getSelectedTerminalExchange();
  const selectedBroker = getSelectedBroker();
  const mode = requestedMode === "live" && pipelineStrategy === "crypto" && !isNativeLiveModeSupported()
    ? "delayed"
    : requestedMode;
  const forcedModeReason = (() => {
    if (requestedMode !== "live") {
      return "";
    }

    if (pipelineStrategy !== "crypto") {
      return "Modo institucional live em rollout; mantendo analise institucional em polling resiliente";
    }

    if (mode !== "live") {
      return `Live nativo ainda em rollout para ${selectedExchange}; exibindo delayed resiliente`;
    }

    return "";
  })();
  const range = loadOptions.range ?? chartRangeSelect.value;
  const silent = loadOptions.silent === true;

  resetChartAssetScopedState({
    assetId,
    operationalMode: chartLabState.operationalMode,
    strategy: pipelineStrategy,
    symbol: selectedTerminalSymbol,
  }, {
    reason: "load-chart",
  });
  chartLabState.strategy = pipelineStrategy;

  chartLabStore.patchSelection({
    assetId,
    broker: selectedBroker,
    exchange: selectedExchange,
    interval: selectedInterval,
    mode,
    range,
    symbol: selectedTerminalSymbol,
  });

  if (pipelineStrategy === "institutional_macro" && !canRunInstitutionalMacroForSymbol(selectedTerminalSymbol)) {
    stopChartLiveStream();
    applyExternalSymbolChartState(selectedTerminalSymbol, {
      silent,
    });
    return;
  }

  chartLoadController.start();

  if (chartRefreshButton instanceof HTMLButtonElement && !silent) {
    chartRefreshButton.disabled = true;
    chartRefreshButton.textContent = "Atualizando...";
  }

  if (!silent) {
    setChartStatus("Atualizando dados de grafico...", "loading");
  } else {
    clearChartErrorStatusMode();
  }

  try {
    const binaryOperationalMode = isBinaryOptionsOperationalMode();

    if (pipelineStrategy === "institutional_macro") {
      const {
        fallbackReason,
        resolvedResolution,
        snapshot,
      } = await requestInstitutionalMacroSnapshot(
        selectedTerminalSymbol,
        range,
        mode,
        chartLabState.symbolSourceModule,
        selectedInterval,
        { assetGenerationToken },
      );

      chartAssetGeneration.assertCurrent(assetGenerationToken);

      const requestedResolution = normalizeRequestedChartResolution(selectedInterval);
      const usedFallbackResolution =
        typeof resolvedResolution === "string"
        && resolvedResolution === TERMINAL_INTERVAL_BACKEND_FALLBACK
        && requestedResolution !== resolvedResolution;

      if (usedFallbackResolution) {
        setActiveTerminalInterval(TERMINAL_INTERVAL_BACKEND_FALLBACK, {
          closeMenu: true,
        });
        syncChartRangeWithTerminalInterval(TERMINAL_INTERVAL_BACKEND_FALLBACK);
      }

      applyChartSnapshot(snapshot, {
        assetGenerationToken,
        fallbackReason,
        forcedModeReason,
        selectedExchange,
        transport: "polling",
      });

      if (usedFallbackResolution) {
        saveChartPreferences();
      }

      return;
    }

    const {
      fallbackReason,
      resolvedBroker,
      resolvedResolution,
      snapshot,
    } = binaryOperationalMode
      ? await requestBinaryOptionsChart(
        assetId,
        range,
        mode,
        selectedBroker,
        selectedInterval,
        { assetGenerationToken },
      )
      : await requestCryptoChart(
        assetId,
        range,
        mode,
        selectedBroker,
        selectedInterval,
        { assetGenerationToken },
      );

    chartAssetGeneration.assertCurrent(assetGenerationToken);

    const requestedResolution = binaryOperationalMode
      ? normalizeRequestedBinaryOptionsResolution(selectedInterval)
      : normalizeRequestedChartResolution(selectedInterval);
    const fallbackInterval = binaryOperationalMode
      ? TERMINAL_INTERVAL_BINARY_OPTIONS_FALLBACK
      : TERMINAL_INTERVAL_BACKEND_FALLBACK;
    const fallbackResolution = binaryOperationalMode
      ? fallbackInterval
      : normalizeRequestedChartResolution(fallbackInterval);
    const usedFallbackResolution =
      typeof fallbackResolution === "string"
      &&
      typeof resolvedResolution === "string"
      && resolvedResolution === fallbackResolution
      && requestedResolution !== resolvedResolution;

    if (usedFallbackResolution) {
      setActiveTerminalInterval(fallbackInterval, {
        closeMenu: true,
      });
      syncChartRangeWithTerminalInterval(fallbackInterval);
      saveChartPreferences();
    }

    const requestedBroker = normalizeRequestedBroker(selectedBroker);
    const statusBroker = binaryOperationalMode
      ? normalizeBrokerName(resolvedBroker)
      : requestedBroker === "auto"
        ? resolveAutoChartPrimaryBroker()
        : normalizeBrokerName(resolvedBroker);
    const selectedExchangeForStatus = resolveExchangeLabelFromBroker(statusBroker);

    applyChartSnapshot(snapshot, {
      assetGenerationToken,
      displayProvider: statusBroker,
      fallbackReason,
      forcedModeReason,
      selectedExchange: selectedExchangeForStatus,
      transport: "polling",
    });
  } catch (error) {
    if (isStaleChartAssetGenerationError(error) || !chartAssetGeneration.isCurrent(assetGenerationToken)) {
      return;
    }

    const errorMessage = error instanceof Error ? error.message : "Erro ao carregar grafico";
    const shouldSurfaceStatusError = !silent || chartLabState.viewMode !== "tv";

    if (pipelineStrategy === "institutional_macro") {
      if (!shouldSurfaceStatusError) {
        return;
      }

      setChartStatus(errorMessage, "error");

      if (chartLabState.snapshot && chartLabState.viewMode === "copilot") {
        renderInteractiveChart(chartLabState.snapshot);
        setChartLegend("Falha na atualizacao institucional. Mantendo ultimo snapshot valido.", "error");
      } else {
        clearChartSurface();
        setChartLegend("Falha ao carregar o motor institucional. Tente atualizar.", "error");
        renderChartMetrics(null);
        chartLabState.snapshot = null;
      }

      return;
    }

    let spotQuote = null;

    try {
      const spotBatch = await requestSpotPriceBatch([assetId]);
      spotQuote = Array.isArray(spotBatch?.quotes)
        ? spotBatch.quotes.find((item) => item.assetId === assetId && item.status === "ok")
        : null;
    } catch {
      spotQuote = null;
    }

    if (!chartAssetGeneration.isCurrent(assetGenerationToken)) {
      return;
    }

    if (spotQuote?.quote?.price && Number.isFinite(spotQuote.quote.price)) {
      const contingencySnapshot = buildContingencyChartSnapshot({
        assetId,
        price: spotQuote.quote.price,
        provider: spotQuote.quote.provider,
        range,
      });

      chartLabState.snapshot = contingencySnapshot;
      void loadNewsIntelligence(assetId);

      if (chartLabState.viewMode === "copilot") {
        renderInteractiveChart(contingencySnapshot);
      }

      renderChartMetrics(contingencySnapshot);

      if (shouldSurfaceStatusError) {
        const contingencyProvider = String(spotQuote.quote.provider ?? "secundario").toUpperCase();
        setChartStatus(`Modo contingencia ativo via ${contingencyProvider}. Dados secundarios em uso.`, "warn");
        setChartLegend("Sem historico no momento. Exibindo preco de contingencia para manter acompanhamento operacional.", "warn");
      }
    } else {
      if (!shouldSurfaceStatusError) {
        return;
      }

      setChartStatus(errorMessage, "error");

      if (chartLabState.snapshot && chartLabState.viewMode === "copilot") {
        renderInteractiveChart(chartLabState.snapshot);
        setChartLegend("Falha na atualizacao. Mantendo ultimo snapshot valido.", "error");
      } else {
        clearChartSurface();
        setChartLegend("Falha ao carregar o grafico. Tente atualizar.", "error");
        renderChartMetrics(null);
        chartLabState.snapshot = null;
      }
    }
  } finally {
    if (chartRefreshButton instanceof HTMLButtonElement && !silent) {
      chartRefreshButton.disabled = false;
      chartRefreshButton.textContent = "Atualizar grafico";
    }

    const nextRequest = chartLoadController.finish();

    if (nextRequest !== null) {
      void loadChart(nextRequest);
    }
  }
}

function stopChartAutoRefresh() {
  stopChartLiveStream();

  if (chartAutoRefreshTimer !== null) {
    window.clearInterval(chartAutoRefreshTimer);
    chartAutoRefreshTimer = null;
  }
}

function configureChartAutoRefresh() {
  stopChartAutoRefresh();

  if (!chartModeSelect) {
    stopChartLiveFallbackPolling();
    return;
  }

  const refreshIntervalMs = resolveAutoRefreshIntervalMs();

  if (refreshIntervalMs <= 0) {
    stopChartLiveFallbackPolling();
    return;
  }

  if (chartModeSelect.value === "live" && connectChartLiveStream(refreshIntervalMs)) {
    return;
  }

  stopChartLiveFallbackPolling();

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

  return messages.length - 1;
}

function updateMessageAt(index, options = {}) {
  const targetMessage = messages[index];

  if (!targetMessage) {
    return;
  }

  if (typeof options.content === "string") {
    targetMessage.content = options.content;
  }

  if (typeof options.error === "boolean") {
    targetMessage.error = options.error;
  }

  if (options.meta) {
    targetMessage.meta = options.meta;
  }

  const persist = options.persist !== false;

  if (persist) {
    saveMessagesToLocalStorage();
    renderRecentHistory();
  }

  renderMessages();
}

function setSendingState(nextValue) {
  isSending = nextValue;

  if (sendButton) {
    sendButton.disabled = nextValue || isChatLockedByAuth;
    sendButton.textContent = nextValue ? "Consultando desk..." : "Enviar ao desk";
  }

  if (chatInput) {
    chatInput.disabled = nextValue || isChatLockedByAuth;
  }

  setStatus(nextValue ? "loading" : "", nextValue ? "Consultando desk" : "Desk pronto");
}

async function requestCopilotCompletion(message) {
  const headers = await buildCopilotRequestHeaders();

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

async function buildCopilotRequestHeaders() {
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

  return headers;
}

async function requestCopilotCompletionStream(message, options = {}) {
  const headers = await buildCopilotRequestHeaders();
  const requestSessionId = isCloudHistoryEnabled() && activeConversationId.length > 0
    ? activeConversationId
    : chatSessionId;
  const response = await fetch(buildApiUrl("/v1/copilot/chat/stream"), {
    body: JSON.stringify({
      maxTokens: 350,
      message,
      sessionId: requestSessionId,
      temperature: 0.1,
    }),
    headers,
    method: "POST",
  });

  if (!response.ok) {
    let errorPayload = null;

    try {
      errorPayload = await response.json();
    } catch {
      errorPayload = null;
    }

    const apiMessage = errorPayload?.error?.message;
    throw new Error(typeof apiMessage === "string" ? apiMessage : "Falha ao consultar o Copiloto");
  }

  if (!response.body) {
    throw new Error("Stream da IA indisponivel");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let streamBuffer = "";
  const streamMeta = {
    answer: "",
    model: "",
    toolCallsUsed: [],
    usage: null,
  };

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    streamBuffer += decoder.decode(value, {
      stream: true,
    });

    while (true) {
      const lineBreakIndex = streamBuffer.indexOf("\n");

      if (lineBreakIndex < 0) {
        break;
      }

      const line = streamBuffer.slice(0, lineBreakIndex).trim();
      streamBuffer = streamBuffer.slice(lineBreakIndex + 1);

      if (line.length === 0) {
        continue;
      }

      let eventPayload = null;

      try {
        eventPayload = JSON.parse(line);
      } catch {
        eventPayload = null;
      }

      if (!eventPayload || typeof eventPayload !== "object") {
        continue;
      }

      if (eventPayload.type === "chunk" && typeof eventPayload.data === "string") {
        if (typeof options.onChunk === "function") {
          options.onChunk(eventPayload.data);
        }
        continue;
      }

      if (eventPayload.type === "done") {
        streamMeta.answer = typeof eventPayload?.data?.answer === "string" ? eventPayload.data.answer : "";
        streamMeta.model = typeof eventPayload?.data?.model === "string" ? eventPayload.data.model : "";
        streamMeta.toolCallsUsed = Array.isArray(eventPayload?.data?.toolCallsUsed)
          ? eventPayload.data.toolCallsUsed
          : [];
        streamMeta.usage = eventPayload?.data?.usage ?? null;
        continue;
      }

      if (eventPayload.type === "error") {
        const messageText = typeof eventPayload?.data?.message === "string"
          ? eventPayload.data.message
          : "Falha ao consultar o Copiloto";
        throw new Error(messageText);
      }
    }
  }

  return streamMeta;
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
      const shouldRefreshTitle = !currentConversation
        || currentConversation.title === "Nova conversa"
        || currentConversation.title === "Nova thread";
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
  let assistantMessageIndex = -1;

  try {
    const assistantTime = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    let assistantAnswer = "";
    let assistantModel = "";
    let assistantUsage = null;

    assistantMessageIndex = pushMessage("assistant", "", {
      meta: {
        time: assistantTime,
      },
    });

    try {
      const streamMeta = await requestCopilotCompletionStream(prompt, {
        onChunk: (chunk) => {
          assistantAnswer += chunk;
          updateMessageAt(assistantMessageIndex, {
            content: assistantAnswer,
            persist: false,
          });
        },
      });

      const finalStreamAnswer = typeof streamMeta.answer === "string" ? streamMeta.answer.trim() : "";

      if (assistantAnswer.trim().length === 0 && finalStreamAnswer.length === 0) {
        throw new Error("Stream da IA sem conteudo util");
      }

      if (finalStreamAnswer.length > 0) {
        assistantAnswer = streamMeta.answer;
      }

      assistantModel = typeof streamMeta.model === "string" ? streamMeta.model : "";
      assistantUsage = streamMeta.usage;
    } catch {
      const payload = await requestCopilotCompletion(prompt);
      const aiData = payload?.data;

      if (!aiData || typeof aiData.answer !== "string") {
        throw new Error("Resposta da IA sem formato esperado");
      }

      assistantAnswer = aiData.answer;
      assistantModel = typeof aiData.model === "string" ? aiData.model : "";
      assistantUsage = aiData.usage ?? null;
    }

    if (assistantModel.length > 0 && activeModelElement) {
      activeModelElement.textContent = assistantModel;
    }

    const assistantMessageMeta = {
      model: assistantModel,
      time: assistantTime,
      totalTokens: assistantUsage?.totalTokens,
    };

    updateMessageAt(assistantMessageIndex, {
      content: assistantAnswer,
      meta: assistantMessageMeta,
      persist: true,
    });

    if (isCloudHistoryEnabled() && activeConversationId.length > 0) {
      try {
        await persistCloudMessage(activeConversationId, {
          content: assistantAnswer,
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

    setStatus("", "Desk pronto");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao consultar a IA";

    const assistantErrorTime = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (assistantMessageIndex >= 0) {
      updateMessageAt(assistantMessageIndex, {
        content: message,
        error: true,
        meta: {
          time: assistantErrorTime,
        },
      });
    } else {
      pushMessage("assistant", message, {
        error: true,
        meta: {
          time: assistantErrorTime,
        },
      });
    }

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
      setStatus("", "Nova sessao local iniciada");
      chatInput?.focus();
    });
  }

  if (conversationListElement instanceof HTMLElement) {
    conversationListElement.addEventListener("click", (event) => {
      const target = event.target;
      const button = target instanceof HTMLElement
        ? target.closest("button[data-action][data-conversation-id]")
        : null;

      if (!(button instanceof HTMLButtonElement)) {
        return;
      }

      const action = button.dataset.action;
      const nextConversationId = button.dataset.conversationId?.trim() ?? "";

      if (nextConversationId.length < 8) {
        return;
      }

      if (action === "delete-conversation") {
        const conversation = conversationItems.find((item) => item.id === nextConversationId);
        const conversationTitle = conversation?.title ?? "esta thread";
        const shouldDelete = window.confirm(
          `Apagar \"${conversationTitle}\"? Essa acao nao pode ser desfeita.`,
        );

        if (!shouldDelete) {
          return;
        }

        void (async () => {
          try {
            setStatus("loading", "Apagando thread...");

            const wasActiveConversation = nextConversationId === activeConversationId;
            await deleteConversationInCloud(nextConversationId);

            if (wasActiveConversation) {
              if (conversationItems.length > 0) {
                await setActiveConversation(conversationItems[0].id);
              } else {
                const createdConversation = await createConversationInCloud("Nova thread");

                if (createdConversation) {
                  await setActiveConversation(createdConversation.id, {
                    hydrateMessages: false,
                  });
                } else {
                  persistActiveConversationId("");
                  replaceMessages([]);
                }
              }
            }

            setStatus("", "Thread apagada");
          } catch (error) {
            setStatus(
              "error",
              error instanceof Error ? error.message : "Falha ao apagar thread",
            );
          }
        })();

        return;
      }

      if (!nextConversationId || nextConversationId === activeConversationId) {
        return;
      }

      void (async () => {
        try {
          setStatus("loading", "Abrindo conversa...");
          await setActiveConversation(nextConversationId);
          setStatus("", "Thread carregada");
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

function openRiskManagementTab(options = {}) {
  if (activeAppRoute !== APP_ROUTE_CHART_LAB) {
    navigateToRoute(APP_ROUTE_CHART_LAB);
  }

  activeAnalysisTabId = "gestao_risco";
  renderDeepAnalysisPanel(chartLabState.snapshot);

  if (options.scroll === true && analysisPanel instanceof HTMLElement) {
    analysisPanel.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}

function setupChartKeyboardShortcuts() {
  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) {
      return;
    }

    const intervalShortcut = TERMINAL_INTERVAL_SHORTCUTS[event.code];

    if (event.altKey && !event.metaKey && !event.ctrlKey && intervalShortcut) {
      event.preventDefault();
      applyTerminalIntervalSelection(intervalShortcut, {
        reason: "interval-shortcut",
        showLegend: false,
      });
      const linkedRange = CHART_RANGE_LABELS[resolveChartRangeForTerminalInterval(intervalShortcut)]
        ?? resolveChartRangeForTerminalInterval(intervalShortcut);
      setChartLegend(`Atalho ativo: intervalo ${getTerminalIntervalDisplayLabel(intervalShortcut)} • janela ${linkedRange}`);
      return;
    }

    if (event.key === "Escape" && isChartIntervalMenuOpen) {
      setChartIntervalMenuOpen(false);
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

    if (lowerKey === "g") {
      event.preventDefault();
      openRiskManagementTab({
        scroll: true,
      });
      setChartLegend("Atalho ativo: Gestao de Risco (Alt+G).");
      return;
    }

    if (lowerKey === "v") {
      event.preventDefault();
      setChartViewMode(chartLabState.viewMode === "tv" ? "copilot" : "tv");
      setChartLegend(`Atalho ativo: modo ${chartLabState.viewMode === "tv" ? "Terminal PRO" : "Insights IA"}.`);
      return;
    }

    if (lowerKey === "r") {
      event.preventDefault();
      void loadChart();
      void refreshWatchlistMarket({
        silent: true,
      });

      if (chartLabState.viewMode === "tv") {
        scheduleTradingViewRefresh();
      }

      setChartLegend("Atalho ativo: refresh completo do workspace.");
      return;
    }

    if (lowerKey === "f") {
      event.preventDefault();

      if (chartLabState.viewMode === "copilot") {
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
  binaryOptionsRiskState = readStoredBinaryOptionsRiskState();
  updateOperationalModeTag();
  ensureActiveAnalysisTabForOperationalMode(chartLabState.operationalMode);

  if (
    chartSymbolInput instanceof HTMLInputElement
    && sanitizeTerminalSymbol(chartSymbolInput.value).length < 2
  ) {
    syncTerminalSymbolWithAsset();
  } else if (chartSymbolInput instanceof HTMLInputElement) {
    chartSymbolInput.value = mapSymbolToExchange(chartSymbolInput.value, getSelectedTerminalExchange());
  }

  setActiveTerminalInterval(getSelectedTerminalInterval(), {
    closeMenu: true,
  });
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
  isWatchlistRiskSummaryCollapsed = readStoredWatchlistRiskSummaryCollapsed();
  setupPropDesk();
  renderWatchlistRiskSummary();

  chartControlsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    configureChartAutoRefresh();
    void loadChart();
    void refreshWatchlistMarket({
      silent: true,
    });

    if (chartLabState.viewMode === "tv") {
      scheduleTradingViewRefresh();
    }

    saveChartPreferences();
  });

  chartAssetSelect.addEventListener("change", () => {
    const assetGenerationToken = chartAssetGeneration.advance();
    chartHasInitialFit = false;
    chartLabState.symbolSourceModule = "crypto";
    syncTerminalSymbolWithAsset();
    renderWatchlist();
    configureChartAutoRefresh();
    void loadChart({
      assetGenerationToken,
      assetId: chartAssetSelect.value,
    });
    void refreshWatchlistMarket({
      silent: true,
    });

    if (chartLabState.viewMode === "tv") {
      scheduleTradingViewRefresh();
    }

    saveChartPreferences();
  });

  chartRangeSelect.addEventListener("change", () => {
    chartHasInitialFit = false;
    configureChartAutoRefresh();
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

      if (chartLabState.viewMode === "tv") {
        scheduleTradingViewRefresh();
      }

      saveChartPreferences();
    });
  }

  if (chartOperationalModeSelect instanceof HTMLSelectElement) {
    chartOperationalModeSelect.addEventListener("change", () => {
      setChartOperationalMode(chartOperationalModeSelect.value, {
        announce: true,
        persist: true,
        refreshChart: true,
      });
    });
  }

  if (chartStyleSelect) {
    chartStyleSelect.addEventListener("change", () => {
      chartHasInitialFit = false;

      if (chartLabState.viewMode === "copilot" && chartLabState.snapshot) {
        renderInteractiveChart(chartLabState.snapshot);
      }

      if (chartLabState.viewMode === "tv") {
        scheduleTradingViewRefresh();
      }

      saveChartPreferences();
    });
  }

  if (chartExchangeSelect) {
    chartExchangeSelect.addEventListener("change", () => {
      const requestedBroker = normalizeRequestedBroker(getSelectedBroker());

      if (requestedBroker !== "auto") {
        updateAutoChartPreferredBroker(requestedBroker, {
          force: true,
        });
      }

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
      chartAssetGeneration.advance();
      chartLabState.symbolSourceModule = "";
      chartSymbolInput.value = mapSymbolToExchange(
        sanitizeTerminalSymbol(chartSymbolInput.value),
        getSelectedTerminalExchange(),
      );
      renderWatchlist();
      scheduleChartContextSync({
        reason: "symbol-input",
        silent: true,
      });
      scheduleTradingViewRefresh();
      saveChartPreferences();
    });

    chartSymbolInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      chartSymbolInput.blur();
      void syncIntelligenceDeskForCurrentContext({
        reason: "symbol-enter",
        silent: false,
      });
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

      if (chartLabState.viewMode === "tv") {
        scheduleTradingViewRefresh();
      }

      saveChartPreferences();
    });
  }

  if (chartOverlayEmaToggle) {
    chartOverlayEmaToggle.addEventListener("change", () => {
      if (chartLabState.viewMode === "copilot" && chartLabState.snapshot) {
        renderInteractiveChart(chartLabState.snapshot);
      }

      saveChartPreferences();
    });
  }

  if (chartOverlayLevelsToggle) {
    chartOverlayLevelsToggle.addEventListener("change", () => {
      if (chartLabState.viewMode === "copilot" && chartLabState.snapshot) {
        renderInteractiveChart(chartLabState.snapshot);
      }

      saveChartPreferences();
    });
  }

  if (chartFitButton) {
    chartFitButton.addEventListener("click", () => {
      if (chartLabState.viewMode === "copilot") {
        fitChartContent();
      }

      if (chartLabState.viewMode === "tv") {
        scheduleTradingViewRefresh();
      }

      saveChartPreferences();
    });
  }

  if (chartAnalyzeMarketButton instanceof HTMLButtonElement) {
    chartAnalyzeMarketButton.addEventListener("click", () => {
      void runManualMarketAnalysis({ source: "click" });
    });

    document.addEventListener("keydown", (event) => {
      if (!event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const key = typeof event.key === "string" ? event.key.toLowerCase() : "";

      if (key !== "i") {
        return;
      }

      const activeElement = document.activeElement;
      const isTypingInField =
        activeElement instanceof HTMLInputElement
        || activeElement instanceof HTMLTextAreaElement
        || (activeElement instanceof HTMLElement && activeElement.isContentEditable);

      if (isTypingInField) {
        return;
      }

      event.preventDefault();
      void runManualMarketAnalysis({ source: "keyboard" });
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

      applyTerminalIntervalSelection(interval, {
        reason: "interval-chip",
      });
    });
  }

  if (chartIntervalMenuButton instanceof HTMLButtonElement) {
    chartIntervalMenuButton.addEventListener("click", () => {
      setChartIntervalMenuOpen(!isChartIntervalMenuOpen);
    });
  }

  if (chartIntervalMenuList instanceof HTMLElement) {
    chartIntervalMenuList.addEventListener("click", (event) => {
      const target = event.target;

      if (!(target instanceof HTMLElement)) {
        return;
      }

      const starButton = target.closest("button.chart-interval-option-star");

      if (starButton instanceof HTMLButtonElement && typeof starButton.dataset.intervalStar === "string") {
        toggleFavoriteTerminalInterval(starButton.dataset.intervalStar);
        saveChartPreferences();
        return;
      }

      const selectButton = target.closest("button.chart-interval-option-select");

      if (!(selectButton instanceof HTMLButtonElement) || typeof selectButton.dataset.interval !== "string") {
        return;
      }

      applyTerminalIntervalSelection(selectButton.dataset.interval, {
        reason: "interval-menu",
      });
    });
  }

  window.addEventListener("click", (event) => {
    if (!isChartIntervalMenuOpen) {
      return;
    }

    const target = event.target;

    if (!(target instanceof Node)) {
      return;
    }

    const clickedInsideMenu = chartIntervalMenu instanceof HTMLElement && chartIntervalMenu.contains(target);
    const clickedMenuButton = chartIntervalMenuButton instanceof HTMLButtonElement && chartIntervalMenuButton.contains(target);

    if (clickedInsideMenu || clickedMenuButton) {
      return;
    }

    setChartIntervalMenuOpen(false);
  });

  if (watchlistGrid instanceof HTMLElement) {
    if (watchlistRiskSummaryElement instanceof HTMLElement) {
      watchlistRiskSummaryElement.addEventListener("click", (event) => {
        const target = event.target;
        const collapseButton = target instanceof HTMLElement
          ? target.closest("button.watchlist-risk-collapse")
          : null;

        if (collapseButton instanceof HTMLButtonElement) {
          isWatchlistRiskSummaryCollapsed = !isWatchlistRiskSummaryCollapsed;
          saveWatchlistRiskSummaryCollapsed();
          renderWatchlistRiskSummary();
          setStatus("", isWatchlistRiskSummaryCollapsed ? "Snapshot de risco recolhido" : "Snapshot de risco expandido");
          return;
        }

        const openButton = target instanceof HTMLElement
          ? target.closest("button.watchlist-risk-open")
          : null;

        if (!(openButton instanceof HTMLButtonElement)) {
          return;
        }

        openRiskManagementTab({
          scroll: true,
        });
        setStatus("", "Gestao de risco aberta");
      });
    }

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

      const assetGenerationToken = chartAssetGeneration.advance();
      chartLabState.symbolSourceModule = "crypto";

      renderWatchlist();
      chartHasInitialFit = false;
      configureChartAutoRefresh();
      void loadChart({
        assetGenerationToken,
        assetId: chartAssetSelect instanceof HTMLSelectElement ? chartAssetSelect.value : assetId,
      });
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
      const operationalModeLabel = getChartOperationalModeLabel(chartLabState.operationalMode);
      const trend = chartLabState.snapshot?.insights?.trend
        ? formatTrendLabel(chartLabState.snapshot.insights.trend).toLowerCase()
        : "viés indefinido";

      if (isBinaryOptionsOperationalMode()) {
        chatInput.value = `Analise o grafico de ${assetId} em ${rangeLabel}, corretora ${exchange}, modo ${modeLabel}, workspace ${operationalModeLabel}. Foque em micro-timing para opcoes binarias: probabilidade CALL/PUT, forca de momentum em segundos, janela de expiracao sugerida e controle de stake por payout. Traga leitura objetiva com gatilho de entrada, condicao de invalidacao rapida e cenario neutro. Se faltar dado, declare a limitacao com clareza. Contexto atual: ${trend}.`;
      } else {
        chatInput.value = `Analise tecnicamente o grafico de ${assetId} em ${rangeLabel}, corretora ${exchange}, modo ${modeLabel}, workspace ${operationalModeLabel}. Quero um report completo com todos os blocos: resumo executivo, tecnica, SMC, harmonicos, WEGD, probabilistica, calculo de risco/retorno, timing, visual IA e noticias operacionais. Traga cenario de compra e venda com probabilidades, gatilho, invalidacao, TP1/TP2/TP3, confluencias e plano de gestao de risco. Se faltar dado, declare a limitacao e mantenha a analise objetiva com grau de confianca. Contexto atual: ${trend}.`;
      }
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
      const availableTabs = resolveVisibleAnalysisTabs(chartLabState.operationalMode);

      if (!tabId || !availableTabs.some((item) => item.id === tabId)) {
        return;
      }

      activeAnalysisTabId = tabId;
      renderDeepAnalysisPanel(chartLabState.snapshot);

      if (tabId === "noticias" && chartLabState.strategy === "crypto" && chartAssetSelect instanceof HTMLSelectElement) {
        void loadNewsIntelligence(chartAssetSelect.value);
      }
    });
  }

  if (analysisTabContentElement instanceof HTMLElement) {
    analysisTabContentElement.addEventListener("click", (event) => {
      const target = event.target;
      const button = target instanceof HTMLElement
        ? target.closest("button[data-execution-journal-action]")
        : null;

      if (!(button instanceof HTMLButtonElement)) {
        return;
      }

      const action = button.dataset.executionJournalAction;

      if (action === "record") {
        registerCurrentExecutionPlan("manual");
        return;
      }

      if (action === "paper") {
        openPaperTradingFromTiming();
        return;
      }

      if (action === "clear") {
        clearExecutionJournalState();
      }
    });

    analysisTabContentElement.addEventListener("input", (event) => {
      const target = event.target;

      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      if (typeof target.dataset.binaryRiskInput !== "string") {
        return;
      }

      updateBinaryOptionsRiskStateFromInput(target);
    });
  }

  renderIntelligenceSyncOpsPanel();

  ensureInteractiveChart();
  setChartViewMode(chartLabState.viewMode);
  setChartOperationalMode(chartLabState.operationalMode, {
    announce: false,
    persist: false,
    refreshChart: false,
  });
  configureChartAutoRefresh();
  configureWatchlistAutoRefresh();
  setupChartKeyboardShortcuts();
  saveChartPreferences();
  void hydrateChartAssetCatalog();
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
    clearLocalHistoryButton.textContent = "Nova thread";
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
    setAuthUserLabel("Supabase indisponivel.");
    setAuthStatusMessage("Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no frontend.");
    setAuthFeedback("Login indisponivel: configuracao do Supabase ausente.", "error");
    setAuthFormDisabled(true);
    setStatus("error", "Configurar Supabase para liberar o desk");
  } else {
    setAuthUserLabel("Login obrigatorio para historico por usuario.");
    setAuthFeedback("");
    setAuthFormDisabled(false);
    setStatus("", "Aguardando autenticacao");
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
        setAuthStatusMessage("Aguardando confirmacao de e-mail para liberar o desk.");
        return;
      }

      await handleAuthenticatedUser(data.session.user);
      setStatus("", "Conta conectada ao desk");
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
    setStatus("", "Conta conectada ao desk");
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
    setAuthStatusMessage("Supabase indisponivel. Login obrigatorio para continuar.");
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
  setStatus("loading", "Sincronizando contexto");

  if (isCloudHistoryEnabled()) {
    try {
      await loadConversationsFromCloud();

      const hasActiveConversation = conversationItems.some((item) => item.id === activeConversationId);

      if (!hasActiveConversation) {
        const firstConversation = conversationItems[0];
        persistActiveConversationId(firstConversation?.id ?? "");
      }

      if (activeConversationId.length < 8) {
        const createdConversation = await createConversationInCloud("Nova thread");
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
          "Desk pronto para apoiar. Abra uma conversa e diga o objetivo do momento.",
          {
            meta: {
              time: new Date().toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          },
        );
      }

      setStatus("", "Contexto da conta carregado");
      return;
    } catch (error) {
      setStatus(
        "error",
        error instanceof Error ? error.message : "Falha ao sincronizar contexto da conta",
      );
      replaceMessages([]);
      return;
    }
  }

  try {
    const loadedFromBackend = await loadMessagesFromBackend();

    if (loadedFromBackend) {
      setStatus("", "Historico remoto sincronizado");
      return;
    }
  } catch {
    // Fallback para historico local quando API estiver indisponivel.
  }

  const storedMessages = loadMessagesFromLocalStorage();

  if (storedMessages.length > 0) {
    replaceMessages(storedMessages);
    setStatus("", "Historico local restaurado");
    return;
  }

  pushMessage(
    "assistant",
    "Desk pronto para ajudar. Peça um resumo de mercado, riscos de curto prazo, panorama macro ou analise tecnica.",
    {
      meta: {
        time: new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    },
  );

  setStatus("", "Desk pronto");
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

hydrateIntelligenceSyncInternalToken();
exposeIntelligenceSyncInternalTokenHelpers();

setupQuickPrompts();
setupAppShellRouting();
setupLocalHistoryControls();
setupMarketNavigator();
setupChartLab();
setupAirdropRadarPanel();
setupMemecoinRadarPanel();
initPushNotifications();
initPaperTradingPanel();
bindOperatorAutoPaperPanel();
initBacktestingPanel();
bootstrapLiveSignals({
  // ADR-080 — Auditar Sinal: abre o ativo no Chart Lab e dispara
  // o pipeline completo (SMC + HFT + Probabilistica + ...).
  onAuditSignal: ({ symbol }) => {
    try {
      navigateToRoute(APP_ROUTE_CHART_LAB);
      const chartAssetSelect = document.querySelector("#chart-asset");
      if (chartAssetSelect instanceof HTMLSelectElement && typeof symbol === "string" && symbol.length > 0) {
        const slug = symbol.toLowerCase().replace(/\s+/g, "-");
        const candidates = [symbol, symbol.toLowerCase(), slug];
        const match = Array.from(chartAssetSelect.options).find((opt) =>
          candidates.includes(opt.value) || candidates.includes(opt.textContent?.trim().toLowerCase() ?? ""),
        );
        if (match) {
          chartAssetSelect.value = match.value;
          chartAssetSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    } catch {
      // Falha silenciosa — graceful degradation.
    }
  },
});
bootstrapExecutiveReport({ openTrigger: document.getElementById("btn-open-executive-report") });
void (async () => {
  await initializeAuth();
})();