import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testsDir, "..");

async function readWebFile(relativePath) {
  const absolutePath = path.join(webRoot, relativePath);
  return readFile(absolutePath, "utf8");
}

test("index.html move risk desk para painel de analise profunda", async () => {
  const html = await readWebFile("index.html");
  const watchlistStart = html.indexOf("<aside class=\"market-watch\"");
  const watchlistEnd = watchlistStart >= 0 ? html.indexOf("</aside>", watchlistStart) : -1;
  const watchlistMarkup = watchlistStart >= 0 && watchlistEnd > watchlistStart
    ? html.slice(watchlistStart, watchlistEnd)
    : "";

  assert.match(html, /id="risk-management-tab-panel"/);
  assert.match(html, /id="prop-desk"/);
  assert.match(html, /id="prop-mode-toggle"/);
  assert.match(html, /id="prop-exit-strategy"/);
  assert.match(html, /id="prop-3x7-status"/);
  assert.match(html, /id="intelligence-sync-ops"/);
  assert.match(html, /id="intelligence-sync-ops-badge"/);
  assert.match(html, /id="intelligence-sync-ops-status"/);
  assert.match(html, /id="intelligence-sync-ops-success-rate"/);
  assert.match(html, /id="intelligence-sync-ops-p95"/);
  assert.match(html, /id="intelligence-sync-ops-avg"/);
  assert.match(html, /id="intelligence-sync-ops-requests"/);
  assert.match(html, /id="intelligence-sync-ops-updated"/);
  assert.match(html, /grid grid-cols-1 md:grid-cols-3 gap-6/);
  assert.match(html, /id="watchlist-risk-summary"/);
  assert.match(html, /Alt\+G gestao de risco/);
  assert.doesNotMatch(watchlistMarkup, /id="prop-desk"/);
});

test("main.js inicializa estado, aba e render da gestao de risco", async () => {
  const mainSource = await readWebFile("src/main.js");

  assert.match(mainSource, /const PROP_DESK_STORAGE_KEY = "botfinanceiro\.chart\.propDesk\.v1"/);
  assert.match(mainSource, /const WATCHLIST_RISK_SUMMARY_COLLAPSED_STORAGE_KEY = "botfinanceiro\.chart\.watchlistRiskSummaryCollapsed\.v1"/);
  assert.match(mainSource, /id:\s*"gestao_risco"/);
  assert.match(mainSource, /if \(activeAnalysisTabId === "gestao_risco"\)/);
  assert.match(mainSource, /analysisTabContentElement\.append\(riskManagementTabPanel\);/);
  assert.match(mainSource, /function renderWatchlistRiskSummary\(\)/);
  assert.match(mainSource, /function readStoredWatchlistRiskSummaryCollapsed\(\)/);
  assert.match(mainSource, /function saveWatchlistRiskSummaryCollapsed\(\)/);
  assert.match(mainSource, /classList\.toggle\("is-collapsed", isCollapsed\)/);
  assert.match(mainSource, /watchlist-risk-collapse/);
  assert.match(mainSource, /const BROKER_FAILOVER_ORDER = \["binance", "bybit", "coinbase", "kraken", "okx"\]/);
  assert.match(mainSource, /const BROKER_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3/);
  assert.match(mainSource, /const BROKER_CIRCUIT_BREAKER_COOLDOWN_MS = 120000/);
  assert.match(mainSource, /const WATCHLIST_STREAM_FALLBACK_POLL_MS = 6000/);
  assert.match(mainSource, /const CHART_STREAM_FALLBACK_POLL_MS = 4000/);
  assert.match(mainSource, /function getBrokerCircuitRemainingMs\(broker, nowMs = Date\.now\(\)\)/);
  assert.match(mainSource, /function markBrokerFailure\(broker, message\)/);
  assert.match(mainSource, /function getBrokerCircuitSummary\(broker\)/);
  assert.match(mainSource, /function buildBrokerFailoverChain\(primaryBroker, options = \{\}\)/);
  assert.match(mainSource, /function startWatchlistStreamFallbackPolling\(\)/);
  assert.match(mainSource, /function startChartLiveFallbackPolling\(\)/);
  assert.match(mainSource, /void loadChart\(\{[\s\S]*mode: "live",[\s\S]*silent: true,[\s\S]*\}\);/);
  assert.match(mainSource, /function runMarketRequestWithRetry\(requestFactory, options = \{\}\)/);
  assert.match(mainSource, /requestBrokerLiveQuoteBatchWithFailover\(/);
  assert.match(mainSource, /Failover do stream watchlist:/);
  assert.match(mainSource, /Stream live em contingencia:/);
  assert.match(mainSource, /openRiskManagementTab\(\{[\s\S]*scroll: true,[\s\S]*\}\);/);
  assert.match(mainSource, /if \(lowerKey === "g"\)/);
  assert.match(mainSource, /function setupPropDesk\(\)/);
  assert.match(mainSource, /setupPropDesk\(\);/);
});

test("main.js prioriza prefixo cripto no TradingView e reseta modulo na watchlist", async () => {
  const mainSource = await readWebFile("src/main.js");

  const cryptoPrefixIndex = mainSource.indexOf("if (isLikelyCryptoTerminalSymbol(normalizedSymbol)) {");
  const fixedIncomePrefixIndex = mainSource.indexOf("chartSymbolSourceModule === \"fixed-income\"");

  assert.ok(cryptoPrefixIndex >= 0, "bloco de prefixo cripto nao encontrado");
  assert.ok(fixedIncomePrefixIndex >= 0, "bloco de prefixo institucional nao encontrado");
  assert.ok(
    cryptoPrefixIndex < fixedIncomePrefixIndex,
    "prefixo cripto deve ser avaliado antes de modulos institucionais",
  );

  assert.match(
    mainSource,
    /watchlistGrid\.addEventListener\("click", \(event\) => \{[\s\S]*chartSymbolSourceModule = "crypto";/,
  );
});

test("main.js preserva semantica AUTO na watchlist", async () => {
  const mainSource = await readWebFile("src/main.js");

  assert.match(mainSource, /let watchlistAutoPreferredBroker = "binance";/);
  assert.match(mainSource, /function resolveAutoWatchlistPrimaryBroker\(\)/);

  assert.match(mainSource, /const normalizedRequestedBroker = normalizeRequestedBroker\(broker\);/);
  assert.match(
    mainSource,
    /const normalizedPrimaryBroker = normalizedRequestedBroker === "auto"[\s\S]*\? resolveAutoWatchlistPrimaryBroker\(\)[\s\S]*: normalizeBrokerName\(normalizedRequestedBroker\);/,
  );
  assert.match(
    mainSource,
    /if \(normalizedRequestedBroker === "auto"\) \{[\s\S]*watchlistAutoPreferredBroker = candidateBroker;/,
  );

  assert.match(mainSource, /const selectedRequestedBroker = normalizeRequestedBroker\(getSelectedBroker\(\)\);/);
  assert.match(
    mainSource,
    /if \(selectedRequestedBroker === "auto"\) \{[\s\S]*watchlistAutoPreferredBroker = streamBroker;/,
  );
  assert.match(
    mainSource,
    /if \(!watchlistStream \|\| normalizeRequestedBroker\(getSelectedBroker\(\)\) !== selectedRequestedBroker\) \{/,
  );
});

test("main.js aplica AUTO inteligente com estabilidade no chart", async () => {
  const mainSource = await readWebFile("src/main.js");

  assert.match(mainSource, /const CHART_AUTO_BROKER_STICKY_MS = 180000/);
  assert.match(mainSource, /const CHART_CONTEXT_SYNC_DEBOUNCE_MS = 280/);
  assert.match(mainSource, /const INTELLIGENCE_SYNC_METRICS_MAX_SAMPLES = 60/);
  assert.match(mainSource, /const INTELLIGENCE_SYNC_ALERT_WARNING_P95_MS = 1200/);
  assert.match(mainSource, /const INTELLIGENCE_SYNC_ALERT_CRITICAL_P95_MS = 2000/);
  assert.match(mainSource, /const INTELLIGENCE_SYNC_TELEMETRY_ENDPOINT = "\/v1\/crypto\/intelligence-sync\/telemetry"/);
  assert.match(mainSource, /const BINARY_OPTIONS_GHOST_AUDIT_SETTLEMENT_ENDPOINT = "\/v1\/binary-options\/ghost-audit\/settlements"/);
  assert.match(mainSource, /const BINARY_OPTIONS_GHOST_AUDIT_HISTORY_ENDPOINT = "\/v1\/binary-options\/ghost-audit\/history"/);
  assert.match(mainSource, /const BINARY_OPTIONS_GHOST_AUDIT_HISTORY_REFRESH_MS = 20000/);
  assert.match(mainSource, /const BINARY_OPTIONS_GHOST_AUDIT_HISTORY_LIMIT = 300/);
  assert.match(mainSource, /const GHOST_AUDIT_OPERATIONAL_MODE_BINARY_OPTIONS = "binary_options"/);
  assert.match(mainSource, /const GHOST_AUDIT_OPERATIONAL_MODE_SPOT_MARGIN = "spot_margin"/);
  assert.match(mainSource, /const BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_SESSION = "session"/);
  assert.match(mainSource, /const BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_INSTITUTIONAL = "institutional"/);
  assert.match(mainSource, /const INTELLIGENCE_SYNC_HEALTH_ENDPOINT = "\/internal\/health\/intelligence-sync"/);
  assert.match(mainSource, /const INTELLIGENCE_SYNC_HEALTH_REFRESH_MS = 20000/);
  assert.match(mainSource, /const INTELLIGENCE_SYNC_HEALTH_STALE_AFTER_MS = 90000/);
  assert.match(mainSource, /const INTELLIGENCE_SYNC_INTERNAL_TOKEN = \(import\.meta\.env\.VITE_INTERNAL_API_TOKEN \?\? ""\)\.trim\(\);/);
  assert.match(mainSource, /const TERMINAL_INTERVAL_TO_CHART_RANGE = \{/);
  assert.match(mainSource, /let chartAutoPreferredBroker = "binance";/);
  assert.match(mainSource, /let pendingChartLoadRequest = null;/);
  assert.match(mainSource, /let intelligenceSyncActiveCorrelationId = "";/);
  assert.match(mainSource, /let intelligenceSyncHealthPollTimer = null;/);
  assert.match(mainSource, /let intelligenceSyncHealthInFlight = false;/);
  assert.match(mainSource, /let intelligenceSyncBackendHealthSnapshot = null;/);
  assert.match(mainSource, /let intelligenceSyncBackendHealthError = "";/);
  assert.match(mainSource, /let spotMarginGhostTrackerState = createSpotMarginGhostTrackerState\(\);/);
  assert.match(mainSource, /let binaryOptionsGhostAuditBackendState = createBinaryOptionsGhostAuditBackendState\(\);/);
  assert.match(mainSource, /let binaryOptionsGhostAuditViewMode = BINARY_OPTIONS_GHOST_AUDIT_VIEW_MODE_SESSION;/);
  assert.match(mainSource, /function resolveAutoChartPrimaryBroker\(\)/);
  assert.match(mainSource, /function isSpotMarginOperationalMode\(mode = chartOperationalMode\)/);
  assert.match(mainSource, /function resolveGhostAuditOperationalMode\(mode = chartOperationalMode\)/);
  assert.match(mainSource, /function resolveChartRangeForTerminalInterval\(interval\)/);
  assert.match(mainSource, /function syncChartRangeWithTerminalInterval\(interval, options = \{\}\)/);
  assert.match(mainSource, /function queuePendingChartLoadRequest\(options = \{\}\)/);
  assert.match(mainSource, /function canRunInstitutionalMacroForSymbol\(symbol\)/);
  assert.match(mainSource, /function createIntelligenceSyncCorrelationId\(\)/);
  assert.match(mainSource, /function publishIntelligenceSyncTelemetryToBackend\(input = \{\}\)/);
  assert.match(mainSource, /function createSpotMarginGhostTrackerState\(\)/);
  assert.match(mainSource, /function resetSpotMarginGhostTrackerSession\(\)/);
  assert.match(mainSource, /function createBinaryOptionsGhostAuditBackendState\(\)/);
  assert.match(mainSource, /function normalizeBinaryOptionsGhostAuditViewMode\(value\)/);
  assert.match(mainSource, /function getBinaryOptionsGhostAuditSessionId\(\)/);
  assert.match(mainSource, /function resetBinaryOptionsGhostAuditBackendState\(\)/);
  assert.match(mainSource, /function setBinaryOptionsGhostAuditViewMode\(nextMode, options = \{\}\)/);
  assert.match(mainSource, /function bindGhostAuditViewModeButtons\(container\)/);
  assert.match(mainSource, /function buildBinaryOptionsGhostAuditHistoryRequestKey\(snapshot\)/);
  assert.match(mainSource, /function refreshBinaryOptionsGhostAuditHistory\(snapshot, options = \{\}\)/);
  assert.match(mainSource, /function updateSpotMarginGhostTracker\(snapshot, analysis\)/);
  assert.match(mainSource, /function getBinaryOptionsGhostBackendStats\(state = binaryOptionsGhostAuditBackendState\)/);
  assert.match(mainSource, /function buildBinaryOptionsGhostBackendStatusMessage\(ghostBackendStats\)/);
  assert.match(mainSource, /function syncIntelligenceDeskForCurrentContext\(options = \{\}\)/);
  assert.match(mainSource, /function scheduleChartContextSync\(options = \{\}\)/);
  assert.match(mainSource, /function publishIntelligenceSyncTelemetry\(\)/);
  assert.match(mainSource, /function startIntelligenceSyncTelemetry\(reason\)/);
  assert.match(mainSource, /function finishIntelligenceSyncTelemetry\(input = \{\}\)/);
  assert.match(mainSource, /function renderIntelligenceSyncOpsPanel\(\)/);
  assert.match(mainSource, /function refreshIntelligenceSyncHealthSnapshot\(options = \{\}\)/);
  assert.match(mainSource, /function startIntelligenceSyncHealthPolling\(\)/);
  assert.match(mainSource, /function handleIntelligenceSyncOpsRouteChange\(route\)/);
  assert.match(mainSource, /window\.__botfinanceiroIntelligenceSyncTelemetry = safeSummary/);
  assert.match(mainSource, /botfinanceiro:intelligence-sync-metrics/);
  assert.match(mainSource, /analysisPanel\.dataset\.syncAlertLevel = safeSummary\.alertLevel/);
  assert.match(mainSource, /handleIntelligenceSyncOpsRouteChange\(safeRoute\);/);
  assert.match(mainSource, /buildApiUrl\(INTELLIGENCE_SYNC_HEALTH_ENDPOINT\)/);
  assert.match(mainSource, /buildApiUrl\(requestPath\)/);
  assert.match(mainSource, /"x-internal-token": INTELLIGENCE_SYNC_INTERNAL_TOKEN/);
  assert.match(mainSource, /"x-intelligence-correlation-id": correlationId/);
  assert.match(mainSource, /buildApiUrl\(INTELLIGENCE_SYNC_TELEMETRY_ENDPOINT\)/);
  assert.match(mainSource, /if \(pipelineStrategy === "institutional_macro" && !canRunInstitutionalMacroForSymbol\(selectedTerminalSymbol\)\)/);
  assert.match(mainSource, /if \(isChartLoading\) \{[\s\S]*queuePendingChartLoadRequest\(options\);[\s\S]*return;[\s\S]*\}/);
  assert.match(mainSource, /if \(pendingChartLoadRequest !== null\) \{[\s\S]*const nextRequest = pendingChartLoadRequest;[\s\S]*pendingChartLoadRequest = null;[\s\S]*void loadChart\(nextRequest\);[\s\S]*\}/);
  assert.match(mainSource, /function updateAutoChartPreferredBroker\(nextBroker, options = \{\}\)/);
  assert.match(mainSource, /if \(requestedBroker === "auto"\) \{/);
  assert.match(mainSource, /const preferredBroker = resolveAutoChartPrimaryBroker\(\);/);
  assert.match(mainSource, /requestCryptoChartEndpoint\([\s\S]*targetMode,[\s\S]*preferredBroker,[\s\S]*resolution,[\s\S]*\)/);
  assert.match(mainSource, /requestCryptoChartEndpoint\([\s\S]*targetMode,[\s\S]*"auto",[\s\S]*resolution,[\s\S]*\)/);
  assert.match(mainSource, /AUTO inteligente: ajuste de provider/);
  assert.match(mainSource, /displayProvider: statusBroker,/);
  assert.match(mainSource, /Ghost Tracker Spot\/Margem \(Sessao\)/);
  assert.match(mainSource, /Ghost Institucional Spot\/Margem/);
  assert.match(mainSource, /Ghost Tracker Persistido \(Sessao Atual\)/);
  assert.match(mainSource, /Ghost Tracker Institucional \(Backend\)/);
  assert.match(mainSource, /data-ghost-audit-view-mode=/);
  assert.match(
    mainSource,
    /chartSymbolInput\.addEventListener\("input", \(\) => \{[\s\S]*scheduleChartContextSync\(\{[\s\S]*silent: true,[\s\S]*\}\);/,
  );
  assert.match(
    mainSource,
    /chartSymbolInput\.addEventListener\("keydown", \(event\) => \{[\s\S]*syncIntelligenceDeskForCurrentContext\(\{[\s\S]*silent: false,[\s\S]*\}\);/,
  );
  assert.match(mainSource, /const didSyncRange = syncChartRangeWithTerminalInterval\(normalizedInterval, \{/);
  assert.match(mainSource, /applyTerminalIntervalSelection\(intervalShortcut, \{/);
});

test("styles.css contem classes base do prop desk", async () => {
  const stylesSource = await readWebFile("src/styles.css");

  assert.match(stylesSource, /\.prop-desk\s*\{/);
  assert.match(stylesSource, /\.analysis-risk-tab-panel\s*\{/);
  assert.match(stylesSource, /\.prop-desk-risk-tab\s*\{/);
  assert.match(stylesSource, /\.prop-risk-card\s*\{/);
  assert.match(stylesSource, /\.watchlist-risk-summary\s*\{/);
  assert.match(stylesSource, /\.watchlist-risk-summary\.is-collapsed\s*\{/);
  assert.match(stylesSource, /\.watchlist-risk-actions\s*\{/);
  assert.match(stylesSource, /\.watchlist-risk-collapse\s*\{/);
  assert.match(stylesSource, /\.watchlist-risk-open\s*\{/);
  assert.match(stylesSource, /\.watchlist-risk-grid\s*\{/);
  assert.match(stylesSource, /\.analysis-sync-ops\s*\{/);
  assert.match(stylesSource, /\.analysis-sync-ops\[data-level="warning"\]/);
  assert.match(stylesSource, /\.analysis-sync-ops\[data-level="critical"\]/);
  assert.match(stylesSource, /\.analysis-sync-ops-badge\s*\{/);
  assert.match(stylesSource, /\.analysis-sync-ops-badge\[data-level="warning"\]/);
  assert.match(stylesSource, /\.analysis-sync-ops-badge\[data-level="critical"\]/);
  assert.match(stylesSource, /\.analysis-sync-ops-grid\s*\{/);
  assert.match(stylesSource, /\.analysis-sync-ops-updated\s*\{/);
  assert.match(stylesSource, /\.analysis-binary-ghost-view-toggle\s*\{/);
  assert.match(stylesSource, /\.analysis-binary-ghost-view-button\s*\{/);
  assert.match(stylesSource, /\.analysis-binary-ghost-view-button\.is-active\s*\{/);
  assert.match(stylesSource, /\.prop-tracker-status\[data-state="good"\]/);
  assert.match(stylesSource, /\.prop-tracker-status\[data-state="alert"\]/);
  assert.match(stylesSource, /\.chart-status\[data-mode="warn"\]/);
});
