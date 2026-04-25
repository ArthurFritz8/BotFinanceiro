import assert from "node:assert/strict";
import test from "node:test";

import { createChartLoadController } from "../src/modules/chart-lab/chart-load-controller.js";

test("Chart load controller inicia e finaliza loading pelo adaptador externo", () => {
  let loading = false;
  const controller = createChartLoadController({
    getLoading: () => loading,
    setLoading: (nextLoading) => {
      loading = nextLoading;
    },
  });

  assert.equal(controller.isLoading(), false);

  controller.start();
  assert.equal(controller.isLoading(), true);

  const nextRequest = controller.finish();
  assert.equal(controller.isLoading(), false);
  assert.equal(nextRequest, null);
});

test("Chart load controller guarda apenas a ultima requisicao pendente sanitizada", () => {
  let loading = true;
  const controller = createChartLoadController({
    getLoading: () => loading,
    setLoading: (nextLoading) => {
      loading = nextLoading;
    },
  });

  assert.equal(controller.queueIfBusy({ assetGenerationToken: 1, assetId: "bitcoin", mode: "live", ignored: "x" }), true);
  assert.equal(controller.queueIfBusy({ assetGenerationToken: 2, assetId: "ethereum", range: "24h", silent: true }), true);

  assert.deepEqual(controller.getPendingRequest(), {
    assetGenerationToken: 2,
    assetId: "ethereum",
    range: "24h",
    silent: true,
  });

  const pendingCopy = controller.getPendingRequest();
  pendingCopy.assetId = "mutated";

  assert.equal(controller.getPendingRequest().assetId, "ethereum");

  const nextRequest = controller.finish();
  assert.equal(loading, false);
  assert.deepEqual(nextRequest, {
    assetGenerationToken: 2,
    assetId: "ethereum",
    range: "24h",
    silent: true,
  });
  assert.equal(controller.getPendingRequest(), null);
});

test("Chart load controller nao enfileira quando nao ha loading ativo", () => {
  const controller = createChartLoadController({
    getLoading: () => false,
    setLoading: () => {},
  });

  assert.equal(controller.queueIfBusy({ assetId: "bitcoin" }), false);
  assert.equal(controller.getPendingRequest(), null);

  controller.queue({ assetGenerationToken: 3, assetId: "solana", mode: "delayed", range: "7d", silent: false });
  assert.deepEqual(controller.getPendingRequest(), {
    assetGenerationToken: 3,
    assetId: "solana",
    mode: "delayed",
    range: "7d",
  });

  controller.clearPending();
  assert.equal(controller.getPendingRequest(), null);
});
