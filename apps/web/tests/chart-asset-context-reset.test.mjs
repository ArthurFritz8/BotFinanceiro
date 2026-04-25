import assert from "node:assert/strict";
import test from "node:test";

import {
  hasChartAssetContextChanged,
  normalizeChartAssetContext,
  resetChartAssetContext,
} from "../src/modules/chart-lab/chart-asset-context-reset.js";

test("Chart asset context reset normaliza contexto relevante", () => {
  assert.deepEqual(normalizeChartAssetContext({
    assetId: " Bitcoin ",
    operationalMode: " Spot_Margin ",
    strategy: " Crypto ",
    symbol: " BTCUSDT ",
  }), {
    assetId: "bitcoin",
    operationalMode: "spot_margin",
    strategy: "crypto",
    symbol: "btcusdt",
  });
});

test("Chart asset context reset detecta mudancas de ativo simbolo estrategia e modo operacional", () => {
  const previous = {
    assetId: "bitcoin",
    operationalMode: "spot_margin",
    strategy: "crypto",
    symbol: "BTCUSDT",
  };

  assert.equal(hasChartAssetContextChanged(previous, {
    assetId: "bitcoin",
    operationalMode: "spot_margin",
    strategy: "crypto",
    symbol: "btcusdt",
  }), false);
  assert.equal(hasChartAssetContextChanged(previous, { ...previous, assetId: "ethereum" }), true);
  assert.equal(hasChartAssetContextChanged(previous, { ...previous, symbol: "ETHUSDT" }), true);
  assert.equal(hasChartAssetContextChanged(previous, { ...previous, strategy: "institutional_macro" }), true);
  assert.equal(hasChartAssetContextChanged(previous, { ...previous, operationalMode: "binary_options" }), true);
});

test("Chart asset context reset executa callbacks apenas quando contexto muda", () => {
  const calls = [];
  const callback = (input) => calls.push(input);
  const previousContext = {
    assetId: "bitcoin",
    operationalMode: "spot_margin",
    strategy: "crypto",
    symbol: "BTCUSDT",
  };

  const unchanged = resetChartAssetContext({
    callbacks: [callback],
    nextContext: { ...previousContext, symbol: "btcusdt" },
    previousContext,
  });

  assert.equal(unchanged.changed, false);
  assert.equal(calls.length, 0);

  const changed = resetChartAssetContext({
    callbacks: [callback],
    nextContext: { ...previousContext, assetId: "ethereum", symbol: "ETHUSDT" },
    previousContext,
    reason: "asset-select",
  });

  assert.equal(changed.changed, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].reason, "asset-select");
  assert.equal(calls[0].previous.assetId, "bitcoin");
  assert.equal(calls[0].next.assetId, "ethereum");
});

test("Chart asset context reset permite reset forçado", () => {
  let callCount = 0;

  const result = resetChartAssetContext({
    callbacks: [() => {
      callCount += 1;
    }],
    force: true,
    nextContext: { assetId: "bitcoin", strategy: "crypto", symbol: "BTCUSDT" },
    previousContext: { assetId: "bitcoin", strategy: "crypto", symbol: "BTCUSDT" },
  });

  assert.equal(result.changed, true);
  assert.equal(callCount, 1);
});
