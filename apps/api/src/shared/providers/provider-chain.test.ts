import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CircuitBreaker } from "../resilience/circuit-breaker.js";
import {
  ProviderChain,
  type Provider,
  type ProviderChainTelemetryEvent,
} from "./provider-chain.js";

function makeProvider<TInput, TValue>(
  name: string,
  impl: (input: TInput) => Promise<TValue>,
): Provider<TInput, TValue> {
  return { execute: impl, name };
}

void describe("ProviderChain", () => {
  void it("retorna sucesso do primeiro provider e nao chama os seguintes", async () => {
    let callsB = 0;

    const chain = new ProviderChain<void, string>({
      providers: [
        makeProvider("A", () => Promise.resolve("a")),
        makeProvider("B", () => {
          callsB += 1;
          return Promise.resolve("b");
        }),
      ],
    });

    const result = await chain.execute();

    assert.equal(result.status, "success");
    if (result.status === "success") {
      assert.equal(result.providerName, "A");
      assert.equal(result.value, "a");
    }
    assert.equal(callsB, 0);
  });

  void it("faz fallback quando provider primario lanca", async () => {
    const events: ProviderChainTelemetryEvent[] = [];

    const chain = new ProviderChain<void, string>({
      providers: [
        makeProvider("primary", () => Promise.reject(new Error("primary down"))),
        makeProvider("secondary", () => Promise.resolve("ok")),
      ],
      telemetry: {
        onEvent: (event) => {
          events.push(event);
        },
      },
    });

    const result = await chain.execute();

    assert.equal(result.status, "success");
    if (result.status === "success") {
      assert.equal(result.providerName, "secondary");
      assert.equal(result.value, "ok");
    }

    const attemptNames = events.filter((event) => event.kind === "attempt").map((event) => event.providerName);
    assert.deepEqual(attemptNames, ["primary", "secondary"]);

    const failureEvent = events.find((event) => event.kind === "failure");
    assert.ok(failureEvent);
  });

  void it("retorna exhausted acumulando erros quando todos falham", async () => {
    const chain = new ProviderChain<void, string>({
      providers: [
        makeProvider("A", () => Promise.reject(new Error("a-fail"))),
        makeProvider("B", () => Promise.reject(new Error("b-fail"))),
      ],
    });

    const result = await chain.execute();

    assert.equal(result.status, "exhausted");
    if (result.status === "exhausted") {
      assert.equal(result.errors.length, 2);
      assert.equal(result.errors[0]?.providerName, "A");
      assert.equal(result.errors[1]?.providerName, "B");
    }
  });

  void it("respeita circuit breaker aberto pulando o provider", async () => {
    const breaker = new CircuitBreaker(1, 60_000);
    breaker.onFailure(); // abre

    let callsA = 0;
    const chain = new ProviderChain<void, string>({
      breakerByProvider: new Map([["A", breaker]]),
      providers: [
        makeProvider("A", () => {
          callsA += 1;
          return Promise.resolve("a");
        }),
        makeProvider("B", () => Promise.resolve("b")),
      ],
    });

    const result = await chain.execute();

    assert.equal(callsA, 0);
    assert.equal(result.status, "success");
    if (result.status === "success") {
      assert.equal(result.providerName, "B");
    }
  });

  void it("interrompe cadeia quando shouldAbortChain devolve true", async () => {
    let callsB = 0;
    const chain = new ProviderChain<void, string>({
      providers: [
        makeProvider("A", () => Promise.reject(new Error("non-transient"))),
        makeProvider("B", () => {
          callsB += 1;
          return Promise.resolve("b");
        }),
      ],
      shouldAbortChain: (error) => error instanceof Error && error.message.includes("non-transient"),
    });

    const result = await chain.execute();

    assert.equal(callsB, 0);
    assert.equal(result.status, "exhausted");
  });
});
