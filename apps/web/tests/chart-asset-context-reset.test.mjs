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
    broker: " BINANCE ",
    exchange: " ByBit ",
    interval: " 1H ",
    mode: " LIVE ",
    operationalMode: " Spot_Margin ",
    range: " 7D ",
    strategy: " Crypto ",
    symbol: " BTCUSDT ",
  }), {
    assetId: "bitcoin",
    broker: "binance",
    exchange: "bybit",
    interval: "1h",
    mode: "live",
    operationalMode: "spot_margin",
    range: "7d",
    strategy: "crypto",
    symbol: "btcusdt",
  });
});

test("Chart asset context reset detecta mudancas em todas as dimensoes de contexto", () => {
  const previous = {
    assetId: "bitcoin",
    broker: "binance",
    exchange: "BINANCE",
    interval: "1h",
    mode: "delayed",
    operationalMode: "spot_margin",
    range: "7d",
    strategy: "crypto",
    symbol: "BTCUSDT",
  };

  assert.equal(hasChartAssetContextChanged(previous, {
    assetId: "bitcoin",
    broker: "BINANCE",
    exchange: "binance",
    interval: "1H",
    mode: "DELAYED",
    operationalMode: "spot_margin",
    range: "7D",
    strategy: "crypto",
    symbol: "btcusdt",
  }), false);
  assert.equal(hasChartAssetContextChanged(previous, { ...previous, assetId: "ethereum" }), true);
  assert.equal(hasChartAssetContextChanged(previous, { ...previous, broker: "bybit" }), true);
  assert.equal(hasChartAssetContextChanged(previous, { ...previous, exchange: "BYBIT" }), true);
  assert.equal(hasChartAssetContextChanged(previous, { ...previous, interval: "4h" }), true);
  assert.equal(hasChartAssetContextChanged(previous, { ...previous, mode: "live" }), true);
  assert.equal(hasChartAssetContextChanged(previous, { ...previous, range: "30d" }), true);
  assert.equal(hasChartAssetContextChanged(previous, { ...previous, symbol: "ETHUSDT" }), true);
  assert.equal(hasChartAssetContextChanged(previous, { ...previous, strategy: "institutional_macro" }), true);
  assert.equal(hasChartAssetContextChanged(previous, { ...previous, operationalMode: "binary_options" }), true);
});

test("Chart asset context reset executa callbacks apenas quando contexto muda", () => {
  const calls = [];
  const callback = (input) => calls.push(input);
  const previousContext = {
    assetId: "bitcoin",
    broker: "binance",
    exchange: "binance",
    interval: "1h",
    mode: "delayed",
    operationalMode: "spot_margin",
    range: "7d",
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
