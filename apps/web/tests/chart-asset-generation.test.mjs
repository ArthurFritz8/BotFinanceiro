import assert from "node:assert/strict";
import test from "node:test";

import {
  createChartAssetGeneration,
  isStaleChartAssetGenerationError,
  normalizeChartAssetGenerationToken,
  STALE_CHART_ASSET_GENERATION_ERROR,
} from "../src/modules/chart-lab/chart-asset-generation.js";

test("Chart asset generation normaliza tokens seguros", () => {
  assert.equal(normalizeChartAssetGenerationToken(0), 0);
  assert.equal(normalizeChartAssetGenerationToken(42), 42);
  assert.equal(normalizeChartAssetGenerationToken(-1), null);
  assert.equal(normalizeChartAssetGenerationToken(1.5), null);
  assert.equal(normalizeChartAssetGenerationToken("1"), null);
});

test("Chart asset generation avanca e resolve token atual", () => {
  const generation = createChartAssetGeneration({ initialToken: 2 });

  assert.equal(generation.getToken(), 2);
  assert.equal(generation.resolveToken(undefined), 2);
  assert.equal(generation.resolveToken(1), 1);
  assert.equal(generation.advance(), 3);
  assert.equal(generation.getToken(), 3);
});

test("Chart asset generation considera token ausente como sem barreira", () => {
  const generation = createChartAssetGeneration();

  assert.equal(generation.isCurrent(undefined), true);
  assert.equal(generation.isCurrent(null), true);
  assert.equal(generation.assertCurrent(undefined), true);
});

test("Chart asset generation rejeita resposta atrasada", () => {
  const generation = createChartAssetGeneration();
  const requestToken = generation.getToken();

  generation.advance();

  assert.equal(generation.isCurrent(requestToken), false);
  assert.throws(
    () => generation.assertCurrent(requestToken),
    (error) => {
      assert.equal(error.name, STALE_CHART_ASSET_GENERATION_ERROR);
      assert.equal(error.requestToken, requestToken);
      assert.equal(error.currentToken, generation.getToken());
      assert.equal(isStaleChartAssetGenerationError(error), true);
      return true;
    },
  );
});
