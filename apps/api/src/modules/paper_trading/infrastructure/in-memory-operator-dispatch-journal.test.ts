import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InMemoryOperatorDispatchJournal, renderOperatorDispatchPrometheusFragment } from "./in-memory-operator-dispatch-journal.js";

void describe("InMemoryOperatorDispatchJournal", () => {
  void it("registra entrada e calcula contadores agregados", () => {
    const journal = new InMemoryOperatorDispatchJournal();
    journal.record({
      asset: "bitcoin",
      side: "long",
      tier: "high",
      confluenceScore: 88,
      action: "opened",
      occurredAtMs: 1_000,
    });
    journal.record({
      asset: "ethereum",
      side: "short",
      tier: "medium",
      confluenceScore: 62,
      action: "skipped",
      reason: "duplicate_open_trade",
      occurredAtMs: 2_000,
    });
    journal.record({
      asset: "solana",
      side: "long",
      tier: "low",
      confluenceScore: 41,
      action: "error",
      reason: "below_min_tier",
      occurredAtMs: 3_000,
    });

    const snapshot = journal.snapshot();

    assert.equal(snapshot.total, 3);
    assert.equal(snapshot.opened, 1);
    assert.equal(snapshot.skipped, 1);
    assert.equal(snapshot.errors, 1);
    assert.equal(snapshot.entries.length, 3);
    assert.equal(snapshot.entries[0]?.asset, "solana");
    assert.equal(snapshot.entries[2]?.asset, "bitcoin");
  });

  void it("respeita ring buffer descartando entradas mais antigas", () => {
    const journal = new InMemoryOperatorDispatchJournal(2);
    for (let index = 0; index < 5; index += 1) {
      journal.record({
        asset: `asset-${index}`,
        side: "long",
        tier: "high",
        confluenceScore: 80,
        action: "opened",
        occurredAtMs: 1_000 + index,
      });
    }
    const snapshot = journal.snapshot();
    assert.equal(snapshot.total, 2);
    assert.equal(snapshot.entries[0]?.asset, "asset-4");
    assert.equal(snapshot.entries[1]?.asset, "asset-3");
  });

  void it("aplica limite consultado sem ultrapassar o teto interno", () => {
    const journal = new InMemoryOperatorDispatchJournal(10);
    for (let index = 0; index < 6; index += 1) {
      journal.record({
        asset: `a-${index}`,
        side: "long",
        tier: "high",
        confluenceScore: 80,
        action: "opened",
        occurredAtMs: index + 1,
      });
    }
    const limited = journal.snapshot(2);
    assert.equal(limited.entries.length, 2);
    assert.equal(limited.total, 6);
  });

  void it("clear zera as entradas mantendo limite", () => {
    const journal = new InMemoryOperatorDispatchJournal(5);
    journal.record({
      asset: "btc",
      side: "long",
      tier: "high",
      confluenceScore: 80,
      action: "opened",
    });
    assert.equal(journal.size(), 1);
    journal.clear();
    assert.equal(journal.size(), 0);
    assert.equal(journal.snapshot().total, 0);
  });

  void it("filtra por janela temporal fromMs/toMs (ADR-106)", () => {
    const journal = new InMemoryOperatorDispatchJournal();
    for (let index = 0; index < 5; index += 1) {
      journal.record({
        asset: `asset-${index}`,
        side: "long",
        tier: "high",
        confluenceScore: 80,
        action: "opened",
        occurredAtMs: 1_000 + index * 1_000,
      });
    }
    const snapshot = journal.snapshot({ fromMs: 2_500, toMs: 4_500 });
    assert.equal(snapshot.total, 2);
    assert.deepEqual(
      snapshot.entries.map((entry) => entry.asset),
      ["asset-3", "asset-2"],
    );
  });

  void it("filtra por action e por asset case-insensitive (ADR-106)", () => {
    const journal = new InMemoryOperatorDispatchJournal();
    journal.record({
      asset: "Bitcoin",
      side: "long",
      tier: "high",
      confluenceScore: 80,
      action: "opened",
      occurredAtMs: 1_000,
    });
    journal.record({
      asset: "bitcoin",
      side: "long",
      tier: "high",
      confluenceScore: 60,
      action: "skipped",
      reason: "duplicate_open_trade",
      occurredAtMs: 2_000,
    });
    journal.record({
      asset: "ethereum",
      side: "short",
      tier: "medium",
      confluenceScore: 70,
      action: "opened",
      occurredAtMs: 3_000,
    });

    const onlyBitcoinOpened = journal.snapshot({
      action: "opened",
      asset: "BITCOIN",
    });
    assert.equal(onlyBitcoinOpened.total, 1);
    assert.equal(onlyBitcoinOpened.opened, 1);
    assert.equal(onlyBitcoinOpened.entries[0]?.asset, "Bitcoin");
  });

  void it("ADR-108: contadores cumulativos crescem por action e sobrevivem ao ring buffer", () => {
    const journal = new InMemoryOperatorDispatchJournal(2);
    for (let index = 0; index < 5; index += 1) {
      journal.record({
        asset: "bitcoin",
        side: "long",
        tier: "high",
        confluenceScore: 80,
        action: "opened",
        occurredAtMs: 1_000 + index,
      });
    }
    journal.record({
      asset: "ethereum",
      side: "short",
      tier: "medium",
      confluenceScore: 55,
      action: "skipped",
      reason: "duplicate_open_trade",
      occurredAtMs: 2_000,
    });
    journal.record({
      asset: "solana",
      side: "long",
      tier: "low",
      confluenceScore: 35,
      action: "error",
      reason: "below_min_tier",
      occurredAtMs: 3_000,
    });

    const totals = journal.cumulativeTotals();
    // Ring buffer mantem so 2 entradas, mas o cumulativo deve refletir TODAS.
    assert.equal(journal.size(), 2);
    assert.equal(totals.opened, 5);
    assert.equal(totals.skipped, 1);
    assert.equal(totals.error, 1);
    assert.equal(totals.total, 7);
  });

  void it("ADR-108: clear() reseta contadores cumulativos", () => {
    const journal = new InMemoryOperatorDispatchJournal();
    journal.record({
      asset: "bitcoin",
      side: "long",
      tier: "high",
      confluenceScore: 90,
      action: "opened",
      occurredAtMs: 1_000,
    });
    assert.equal(journal.cumulativeTotals().total, 1);
    journal.clear();
    assert.deepEqual(journal.cumulativeTotals(), {
      opened: 0,
      skipped: 0,
      error: 0,
      total: 0,
    });
  });

  void it("ADR-108: renderOperatorDispatchPrometheusFragment emite counter com 3 series", () => {
    const journal = new InMemoryOperatorDispatchJournal();
    journal.record({
      asset: "bitcoin",
      side: "long",
      tier: "high",
      confluenceScore: 88,
      action: "opened",
      occurredAtMs: 1_000,
    });
    journal.record({
      asset: "ethereum",
      side: "short",
      tier: "medium",
      confluenceScore: 60,
      action: "skipped",
      reason: "duplicate_open_trade",
      occurredAtMs: 2_000,
    });

    const fragment = renderOperatorDispatchPrometheusFragment(journal);

    assert.match(fragment, /# HELP paper_trading_operator_dispatches_total /);
    assert.match(fragment, /# TYPE paper_trading_operator_dispatches_total counter/);
    assert.match(fragment, /paper_trading_operator_dispatches_total\{action="opened"\} 1/);
    assert.match(fragment, /paper_trading_operator_dispatches_total\{action="skipped"\} 1/);
    assert.match(fragment, /paper_trading_operator_dispatches_total\{action="error"\} 0/);
    assert.ok(fragment.endsWith("\n"));
  });
});
