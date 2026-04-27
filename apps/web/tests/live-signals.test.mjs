import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeLiveSignal,
  normalizeLiveSignals,
} from "../src/live-signals.js";

test("Live Signals normaliza payload minimo com clamp de score e defaults", () => {
  const normalized = normalizeLiveSignal({
    assetId: "bitcoin",
    entry: 100,
    module: "crypto",
    score: 145,
    status: "ativo",
    stop: 95,
    strategy: "crypto",
    symbol: "BTCUSDT",
    take: 112,
    tf: "5m",
    tone: "bull",
  }, 1_715_000_000_000);

  assert.ok(normalized);
  assert.equal(normalized.score, 99);
  assert.equal(normalized.tf, "5m");
  assert.equal(normalized.tone, "bull");
  assert.equal(normalized.status, "ativo");
  assert.equal(normalized.assetId, "bitcoin");
  assert.equal(typeof normalized.signalId, "string");
  assert.ok(normalized.signalId.length > 0);
  assert.equal(normalized.snapshotAtMs, 1_715_000_000_000);
  assert.ok(normalized.rr > 0);
});

test("Live Signals descarta payload invalido sem entrada/stop/take finitos", () => {
  const normalized = normalizeLiveSignal({
    entry: Number.NaN,
    score: 88,
    stop: 10,
    symbol: "BTCUSDT",
    take: 11,
  });

  assert.equal(normalized, null);
});

test("Live Signals normaliza lista, remove invalidos e ordena por score", () => {
  const list = normalizeLiveSignals([
    {
      entry: 10,
      score: 86,
      stop: 9,
      symbol: "ETHUSDT",
      take: 11,
      tone: "bull",
    },
    {
      entry: 1.2,
      score: 93,
      stop: 1.25,
      symbol: "EURUSD",
      take: 1.1,
      tone: "bear",
      tf: "15m",
    },
    {
      entry: Number.NaN,
      score: 80,
      stop: 1,
      symbol: "INVALID",
      take: 2,
    },
  ], 1_715_000_100_000);

  assert.equal(list.length, 2);
  assert.equal(list[0]?.score, 93);
  assert.equal(list[0]?.symbol, "EURUSD");
  assert.equal(list[1]?.score, 86);
  assert.equal(list[1]?.symbol, "ETHUSDT");
});
