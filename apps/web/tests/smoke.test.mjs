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

test("index.html expoe painel prop desk no Chart Lab", async () => {
  const html = await readWebFile("index.html");

  assert.match(html, /id="prop-desk"/);
  assert.match(html, /id="prop-mode-toggle"/);
  assert.match(html, /id="prop-exit-strategy"/);
  assert.match(html, /id="prop-3x7-status"/);
});

test("main.js inicializa estado e setup do prop desk", async () => {
  const mainSource = await readWebFile("src/main.js");

  assert.match(mainSource, /const PROP_DESK_STORAGE_KEY = "botfinanceiro\.chart\.propDesk\.v1"/);
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
  assert.match(stylesSource, /\.prop-tracker-status\[data-state="good"\]/);
  assert.match(stylesSource, /\.prop-tracker-status\[data-state="alert"\]/);
  assert.match(stylesSource, /\.market-watch\s*\{[\s\S]*overflow:\s*hidden;/);
  assert.match(stylesSource, /\.prop-desk\s*\{[\s\S]*max-height:\s*252px;[\s\S]*overflow-y:\s*auto;/);
  assert.match(stylesSource, /\.chart-status\[data-mode="warn"\]/);
});
