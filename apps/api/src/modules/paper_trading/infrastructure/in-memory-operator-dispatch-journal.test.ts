import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InMemoryOperatorDispatchJournal } from "./in-memory-operator-dispatch-journal.js";

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
});
