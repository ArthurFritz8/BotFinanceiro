import assert from "node:assert/strict";
import test from "node:test";

import { createCoalescer, sharedCoalescer } from "../src/shared/coalesce.js";

test("Coalescer reaproveita promise in-flight para mesma chave", async () => {
  const coalescer = createCoalescer();
  let calls = 0;
  let resolve;
  const fn = () => {
    calls += 1;
    return new Promise((r) => { resolve = r; });
  };

  const p1 = coalescer.run("k1", fn);
  const p2 = coalescer.run("k1", fn);
  const p3 = coalescer.run("k1", fn);

  assert.equal(calls, 1, "fn deve ser chamado apenas uma vez");
  assert.equal(coalescer.inFlight("k1"), true);
  assert.equal(coalescer.size(), 1);
  assert.strictEqual(p1, p2);
  assert.strictEqual(p2, p3);

  resolve("ok");
  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
  assert.equal(r1, "ok");
  assert.equal(r2, "ok");
  assert.equal(r3, "ok");
  assert.equal(coalescer.inFlight("k1"), false);
  assert.equal(coalescer.size(), 0);
});

test("Coalescer isola chaves diferentes", async () => {
  const coalescer = createCoalescer();
  const p1 = coalescer.run("a", async () => "A");
  const p2 = coalescer.run("b", async () => "B");
  assert.notStrictEqual(p1, p2);
  assert.equal(await p1, "A");
  assert.equal(await p2, "B");
});

test("Coalescer permite nova chamada apos settlement", async () => {
  const coalescer = createCoalescer();
  let calls = 0;
  await coalescer.run("k", async () => { calls += 1; return calls; });
  await coalescer.run("k", async () => { calls += 1; return calls; });
  assert.equal(calls, 2, "depois de settle, nova run dispara fn novamente");
});

test("Coalescer libera entrada em caso de rejeicao", async () => {
  const coalescer = createCoalescer();
  await assert.rejects(coalescer.run("err", async () => { throw new Error("boom"); }));
  assert.equal(coalescer.inFlight("err"), false);
});

test("Coalescer rejeita chave invalida", () => {
  const coalescer = createCoalescer();
  assert.throws(() => coalescer.run("", async () => 1), TypeError);
  assert.throws(() => coalescer.run("k", null), TypeError);
});

test("Coalescer.clear remove chave especifica ou todas", () => {
  const coalescer = createCoalescer();
  coalescer.run("a", () => new Promise(() => {}));
  coalescer.run("b", () => new Promise(() => {}));
  assert.equal(coalescer.size(), 2);
  coalescer.clear("a");
  assert.equal(coalescer.inFlight("a"), false);
  assert.equal(coalescer.inFlight("b"), true);
  coalescer.clear();
  assert.equal(coalescer.size(), 0);
});

test("sharedCoalescer e instancia isolavel", () => {
  assert.equal(typeof sharedCoalescer.run, "function");
  assert.equal(typeof sharedCoalescer.clear, "function");
});
