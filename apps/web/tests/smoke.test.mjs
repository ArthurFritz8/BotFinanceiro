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
  assert.match(mainSource, /const TERMINAL_INTERVAL_TO_CHART_RANGE = \{/);
  assert.match(mainSource, /let chartAutoPreferredBroker = "binance";/);
  assert.match(mainSource, /function resolveAutoChartPrimaryBroker\(\)/);
  assert.match(mainSource, /function resolveChartRangeForTerminalInterval\(interval\)/);
  assert.match(mainSource, /function syncChartRangeWithTerminalInterval\(interval, options = \{\}\)/);
  assert.match(mainSource, /function canRunInstitutionalMacroForSymbol\(symbol\)/);
  assert.match(mainSource, /function syncIntelligenceDeskForCurrentContext\(options = \{\}\)/);
  assert.match(mainSource, /function scheduleChartContextSync\(options = \{\}\)/);
  assert.match(mainSource, /if \(pipelineStrategy === "institutional_macro" && !canRunInstitutionalMacroForSymbol\(selectedTerminalSymbol\)\)/);
  assert.match(mainSource, /function updateAutoChartPreferredBroker\(nextBroker, options = \{\}\)/);
  assert.match(mainSource, /if \(requestedBroker === "auto"\) \{/);
  assert.match(mainSource, /const preferredBroker = resolveAutoChartPrimaryBroker\(\);/);
  assert.match(mainSource, /requestCryptoChartEndpoint\(assetId, range, targetMode, preferredBroker\)/);
  assert.match(mainSource, /requestCryptoChartEndpoint\(assetId, range, targetMode, "auto"\)/);
  assert.match(mainSource, /AUTO inteligente: ajuste de provider/);
  assert.match(mainSource, /displayProvider: statusBroker,/);
  assert.match(
    mainSource,
    /chartSymbolInput\.addEventListener\("input", \(\) => \{[\s\S]*scheduleChartContextSync\(\{[\s\S]*silent: true,[\s\S]*\}\);/,
  );
  assert.match(
    mainSource,
    /chartSymbolInput\.addEventListener\("keydown", \(event\) => \{[\s\S]*syncIntelligenceDeskForCurrentContext\(\{[\s\S]*silent: false,[\s\S]*\}\);/,
  );
  assert.match(mainSource, /const didSyncRange = syncChartRangeWithTerminalInterval\(intervalShortcut\);/);
  assert.match(mainSource, /const didSyncRange = syncChartRangeWithTerminalInterval\(interval\);/);
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
  assert.match(stylesSource, /\.prop-tracker-status\[data-state="good"\]/);
  assert.match(stylesSource, /\.prop-tracker-status\[data-state="alert"\]/);
  assert.match(stylesSource, /\.chart-status\[data-mode="warn"\]/);
});
