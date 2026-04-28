import assert from "node:assert/strict";
import test from "node:test";

import { createChartLabStore } from "../src/modules/chart-lab/chart-lab-store.js";

test("Chart Lab store centraliza contexto minimo e retorna copias defensivas", () => {
  const store = createChartLabStore({
    operationalMode: "binary_options",
    selection: {
      assetId: "ethereum",
      broker: "bybit",
      exchange: "BYBIT",
      interval: "1m",
      mode: "live",
      range: "24h",
      symbol: "ETHUSDT",
    },
    viewMode: "copilot",
  });

  assert.deepEqual(store.getSelection(), {
    assetId: "ethereum",
    broker: "bybit",
    exchange: "BYBIT",
    interval: "1m",
    mode: "live",
    range: "24h",
    symbol: "ETHUSDT",
  });
  assert.equal(store.getOperationalMode(), "binary_options");
  assert.equal(store.getViewMode(), "copilot");

  const stateCopy = store.getState();
  stateCopy.selection.assetId = "mutated";

  assert.equal(store.getSelection().assetId, "ethereum");
});

test("Chart Lab store normaliza loading, snapshot e estrategia", () => {
  const store = createChartLabStore();
  const snapshot = {
    assetId: "bitcoin",
    points: [{ close: 100, timestamp: "2026-04-25T00:00:00.000Z" }],
  };

  assert.equal(store.getLoading(), false);
  assert.equal(store.hasSnapshot(), false);

  store.setLoading(true);
  store.setSnapshot(snapshot);
  store.setStrategy("institutional_macro");

  assert.equal(store.getLoading(), true);
  assert.equal(store.getSnapshot(), snapshot);
  assert.equal(store.hasSnapshot(), true);
  assert.equal(store.getStrategy(), "institutional_macro");

  store.patch({
    isLoading: "yes",
    snapshot: null,
    strategy: "unknown",
    viewMode: "unknown",
  });

  assert.equal(store.getLoading(), false);
  assert.equal(store.getSnapshot(), null);
  assert.equal(store.getStrategy(), "crypto");
  assert.equal(store.getViewMode(), "tv");
});

test("Chart Lab store atualiza selecao incremental sem apagar campos validos", () => {
  const store = createChartLabStore();

  store.patchSelection({
    assetId: "solana",
    broker: "auto",
    range: "7d",
  });
  store.patchSelection({
    interval: "5m",
    mode: "delayed",
    symbol: "SOLUSDT",
  });

  assert.deepEqual(store.getSelection(), {
    assetId: "solana",
    broker: "auto",
    exchange: "BINANCE",
    interval: "5m",
    mode: "delayed",
    range: "7d",
    symbol: "SOLUSDT",
  });
});

test("Chart Lab store expoe snapshotEpoch monotonico para deteccao de race", () => {
  const store = createChartLabStore();

  assert.equal(store.getSnapshotEpoch(), 0);

  store.setSnapshot({ assetId: "bitcoin", points: [] });
  const epoch1 = store.getSnapshotEpoch();
  assert.equal(epoch1, 1);

  store.setSnapshot({ assetId: "bitcoin", points: [{ close: 100 }] });
  const epoch2 = store.getSnapshotEpoch();
  assert.equal(epoch2, 2);
  assert.ok(epoch2 > epoch1, "epoch deve incrementar monotonicamente");

  // Reset para null tambem incrementa (sinaliza invalidacao explicita).
  store.setSnapshot(null);
  assert.equal(store.getSnapshotEpoch(), 3);
});

test("Chart Lab store expoe selectionEpoch que so incrementa em mudanca real", () => {
  const store = createChartLabStore();
  const initial = store.getSelectionEpoch();

  // Patch sem mudanca real (mesmos valores) NAO deve incrementar.
  store.patchSelection({ assetId: store.getSelection().assetId });
  assert.equal(store.getSelectionEpoch(), initial);

  store.patchSelection({ assetId: "ethereum" });
  assert.equal(store.getSelectionEpoch(), initial + 1);

  store.patchSelection({ broker: "bybit" });
  assert.equal(store.getSelectionEpoch(), initial + 2);
});
