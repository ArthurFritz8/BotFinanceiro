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
  assert.match(mainSource, /id:\s*"gestao_risco"/);
  assert.match(mainSource, /if \(activeAnalysisTabId === "gestao_risco"\)/);
  assert.match(mainSource, /analysisTabContentElement\.append\(riskManagementTabPanel\);/);
  assert.match(mainSource, /function renderWatchlistRiskSummary\(\)/);
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

test("styles.css contem classes base do prop desk", async () => {
  const stylesSource = await readWebFile("src/styles.css");

  assert.match(stylesSource, /\.prop-desk\s*\{/);
  assert.match(stylesSource, /\.analysis-risk-tab-panel\s*\{/);
  assert.match(stylesSource, /\.prop-desk-risk-tab\s*\{/);
  assert.match(stylesSource, /\.prop-risk-card\s*\{/);
  assert.match(stylesSource, /\.watchlist-risk-summary\s*\{/);
  assert.match(stylesSource, /\.watchlist-risk-open\s*\{/);
  assert.match(stylesSource, /\.watchlist-risk-grid\s*\{/);
  assert.match(stylesSource, /\.prop-tracker-status\[data-state="good"\]/);
  assert.match(stylesSource, /\.prop-tracker-status\[data-state="alert"\]/);
  assert.match(stylesSource, /\.chart-status\[data-mode="warn"\]/);
});
