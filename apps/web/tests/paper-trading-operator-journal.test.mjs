import assert from "node:assert/strict";
import { test } from "node:test";

import {
  appendOperatorJournalEntry,
  clearOperatorJournal,
  createOperatorJournalEntry,
  loadOperatorJournal,
  PAPER_TRADING_OPERATOR_BREAKER_FAILURE_THRESHOLD,
  PAPER_TRADING_OPERATOR_JOURNAL_LIMIT,
  sanitizePersistedOperatorJournal,
  saveOperatorJournal,
  shouldTripOperatorBreaker,
  summarizeOperatorJournal,
} from "../src/modules/chart-lab/quant/paper-trading-operator-journal.js";

function memoryStorage() {
  const store = new Map();
  return {
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    removeItem: (key) => { store.delete(key); },
    setItem: (key, value) => { store.set(key, String(value)); },
  };
}

function basePayload() {
  return {
    asset: "bitcoin",
    confluenceScore: 80,
    entryPrice: 100,
    side: "long",
    stopPrice: 95,
    targetPrice: 110,
    tier: "high",
  };
}

test("sanitizePersistedOperatorJournal devolve default para shape invalido", () => {
  assert.deepEqual(sanitizePersistedOperatorJournal(null), { entries: [] });
  assert.deepEqual(sanitizePersistedOperatorJournal({ entries: "x" }), { entries: [] });
  assert.deepEqual(sanitizePersistedOperatorJournal({}), { entries: [] });
});

test("sanitizePersistedOperatorJournal descarta entradas invalidas e mantem validas", () => {
  const result = sanitizePersistedOperatorJournal({
    entries: [
      null,
      { outcome: "success", occurredAtMs: 100, asset: "bitcoin", side: "long" },
      { outcome: "weird", occurredAtMs: 200, asset: "eth", side: "short" },
      { outcome: "failure", occurredAtMs: 300, asset: "ETH", side: "short", errorCode: "X" },
    ],
  });
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].asset, "bitcoin");
  assert.equal(result.entries[1].asset, "eth");
  assert.equal(result.entries[1].errorCode, "X");
});

test("sanitizePersistedOperatorJournal aplica ring buffer ao limite", () => {
  const big = {
    entries: Array.from({ length: PAPER_TRADING_OPERATOR_JOURNAL_LIMIT + 5 }, (_, i) => ({
      asset: "bitcoin",
      occurredAtMs: 1000 + i,
      outcome: "success",
      side: "long",
    })),
  };
  const result = sanitizePersistedOperatorJournal(big);
  assert.equal(result.entries.length, PAPER_TRADING_OPERATOR_JOURNAL_LIMIT);
  assert.equal(result.entries[0].occurredAtMs, 1005);
});

test("createOperatorJournalEntry deriva sucesso a partir de result.ok", () => {
  const entry = createOperatorJournalEntry({
    occurredAtMs: 500,
    payload: basePayload(),
    result: { data: { action: "opened" }, ok: true, status: 201 },
  });
  assert.equal(entry.outcome, "success");
  assert.equal(entry.errorCode, null);
  assert.equal(entry.status, 201);
  assert.equal(entry.asset, "bitcoin");
});

test("createOperatorJournalEntry registra falha com codigo do erro", () => {
  const entry = createOperatorJournalEntry({
    occurredAtMs: 600,
    payload: basePayload(),
    result: { error: { code: "PAPER_TRADING_OPERATOR_AUTH_INVALID_TOKEN", message: "x" }, ok: false, status: 401 },
  });
  assert.equal(entry.outcome, "failure");
  assert.equal(entry.errorCode, "PAPER_TRADING_OPERATOR_AUTH_INVALID_TOKEN");
  assert.equal(entry.status, 401);
});

test("createOperatorJournalEntry retorna null para input invalido", () => {
  assert.equal(createOperatorJournalEntry({ payload: null, result: { ok: true } }), null);
  assert.equal(createOperatorJournalEntry({ payload: basePayload(), result: null }), null);
});

test("appendOperatorJournalEntry mantem ordem e respeita limite", () => {
  let state = { entries: [] };
  for (let i = 0; i < PAPER_TRADING_OPERATOR_JOURNAL_LIMIT + 3; i += 1) {
    const entry = createOperatorJournalEntry({
      occurredAtMs: 1000 + i,
      payload: basePayload(),
      result: { ok: i % 2 === 0, status: i % 2 === 0 ? 201 : 500, error: { code: "X", message: "y" } },
    });
    state = appendOperatorJournalEntry(state, entry);
  }
  assert.equal(state.entries.length, PAPER_TRADING_OPERATOR_JOURNAL_LIMIT);
  assert.equal(state.entries.at(-1).occurredAtMs, 1000 + PAPER_TRADING_OPERATOR_JOURNAL_LIMIT + 2);
});

test("appendOperatorJournalEntry ignora entrada invalida sem mutar", () => {
  const state = { entries: [{ asset: "btc", occurredAtMs: 1, outcome: "success", side: "long" }] };
  const next = appendOperatorJournalEntry(state, null);
  assert.equal(next.entries.length, 1);
});

test("summarizeOperatorJournal calcula contagens, taxa e falhas consecutivas", () => {
  const entries = [
    { asset: "btc", occurredAtMs: 1, outcome: "success", side: "long" },
    { asset: "btc", occurredAtMs: 2, outcome: "success", side: "long" },
    { asset: "btc", occurredAtMs: 3, outcome: "failure", side: "long", errorCode: "X" },
    { asset: "btc", occurredAtMs: 4, outcome: "failure", side: "long", errorCode: "Y" },
  ];
  const summary = summarizeOperatorJournal({ entries });
  assert.equal(summary.total, 4);
  assert.equal(summary.successes, 2);
  assert.equal(summary.failures, 2);
  assert.equal(summary.consecutiveFailures, 2);
  assert.equal(summary.successRate, 50);
  assert.equal(summary.last.errorCode, "Y");
});

test("summarizeOperatorJournal devolve null em ausencia de entradas", () => {
  const summary = summarizeOperatorJournal({ entries: [] });
  assert.equal(summary.total, 0);
  assert.equal(summary.last, null);
  assert.equal(summary.successRate, null);
});

test("shouldTripOperatorBreaker dispara apenas no threshold", () => {
  assert.equal(shouldTripOperatorBreaker({ consecutiveFailures: 2 }), false);
  assert.equal(shouldTripOperatorBreaker({ consecutiveFailures: PAPER_TRADING_OPERATOR_BREAKER_FAILURE_THRESHOLD }), true);
  assert.equal(shouldTripOperatorBreaker({ consecutiveFailures: 5 }), true);
  assert.equal(shouldTripOperatorBreaker(null), false);
  assert.equal(shouldTripOperatorBreaker({ consecutiveFailures: 2 }, { threshold: 2 }), true);
});

test("save/load/clear journal round-trip via storage memoria", () => {
  const storage = memoryStorage();
  assert.deepEqual(loadOperatorJournal(storage), { entries: [] });
  saveOperatorJournal({ entries: [{ asset: "btc", occurredAtMs: 1, outcome: "success", side: "long" }] }, storage);
  const reloaded = loadOperatorJournal(storage);
  assert.equal(reloaded.entries.length, 1);
  assert.equal(reloaded.entries[0].asset, "btc");
  clearOperatorJournal(storage);
  assert.deepEqual(loadOperatorJournal(storage), { entries: [] });
});

test("loadOperatorJournal degrada silenciosamente sem storage", () => {
  assert.deepEqual(loadOperatorJournal(null), { entries: [] });
});

test("saveOperatorJournal nao lanca quando storage estoura quota", () => {
  const storage = {
    getItem: () => null,
    removeItem: () => {},
    setItem: () => { throw new Error("QUOTA"); },
  };
  assert.equal(saveOperatorJournal({ entries: [] }, storage), false);
});
