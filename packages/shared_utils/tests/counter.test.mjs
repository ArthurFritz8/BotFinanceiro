import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createCounter } from "../src/counter.js";

describe("createCounter", () => {
  void it("incrementa label default e retorna valor atual", () => {
    const counter = createCounter();
    assert.equal(counter.increment(), 1);
    assert.equal(counter.increment(), 2);
    assert.equal(counter.get(), 2);
  });

  void it("mantém contagens independentes por label", () => {
    const counter = createCounter();
    counter.increment("a");
    counter.increment("a");
    counter.increment("b");
    assert.equal(counter.get("a"), 2);
    assert.equal(counter.get("b"), 1);
    assert.equal(counter.get("c"), 0);
  });

  void it("snapshot retorna objeto plano e reset zera tudo", () => {
    const counter = createCounter();
    counter.increment("x");
    counter.increment("y");
    const snap = counter.snapshot();
    assert.deepEqual(snap, { x: 1, y: 1 });
    counter.reset();
    assert.deepEqual(counter.snapshot(), {});
  });
});
