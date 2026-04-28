import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAutoSignalPayload,
  canSubmitAutoSignal,
  clearOperatorSettings,
  loadOperatorSettings,
  PAPER_TRADING_OPERATOR_ENDPOINT,
  PAPER_TRADING_OPERATOR_HEADER,
  PAPER_TRADING_OPERATOR_MIN_TOKEN_LENGTH,
  sanitizePersistedOperatorSettings,
  saveOperatorSettings,
  submitAutoSignal,
} from "../src/modules/chart-lab/quant/paper-trading-operator-client.js";

function createMemoryStorage() {
  const store = new Map();
  return {
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    removeItem: (key) => { store.delete(key); },
    setItem: (key, value) => { store.set(key, String(value)); },
  };
}

const validToken = "operator_token_abcdef_1234"; // 26 chars

test("sanitizePersistedOperatorSettings retorna default para shape invalido", () => {
  assert.deepEqual(sanitizePersistedOperatorSettings(null), { autoArmed: false, token: "" });
  assert.deepEqual(sanitizePersistedOperatorSettings("not object"), { autoArmed: false, token: "" });
  assert.deepEqual(sanitizePersistedOperatorSettings({}), { autoArmed: false, token: "" });
});

test("sanitizePersistedOperatorSettings forca autoArmed=false quando token curto", () => {
  const result = sanitizePersistedOperatorSettings({ autoArmed: true, token: "short" });
  assert.equal(result.autoArmed, false);
  assert.equal(result.token, "short");
});

test("sanitizePersistedOperatorSettings preserva autoArmed=true com token valido", () => {
  const result = sanitizePersistedOperatorSettings({ autoArmed: true, token: validToken });
  assert.equal(result.autoArmed, true);
  assert.equal(result.token, validToken);
});

test("save/load/clear operator settings round-trip via storage memoria", () => {
  const storage = createMemoryStorage();
  assert.deepEqual(loadOperatorSettings(storage), { autoArmed: false, token: "" });

  assert.equal(saveOperatorSettings({ autoArmed: true, token: validToken }, storage), true);
  assert.deepEqual(loadOperatorSettings(storage), { autoArmed: true, token: validToken });

  assert.equal(clearOperatorSettings(storage), true);
  assert.deepEqual(loadOperatorSettings(storage), { autoArmed: false, token: "" });
});

test("loadOperatorSettings degrada silenciosamente quando storage ausente", () => {
  assert.deepEqual(loadOperatorSettings(null), { autoArmed: false, token: "" });
});

test("buildAutoSignalPayload normaliza inputs validos", () => {
  const payload = buildAutoSignalPayload({
    asset: "  BITCOIN  ",
    confluenceScore: 88,
    entryPrice: 100,
    side: "Long",
    stopPrice: 95,
    targetPrice: 112,
    tier: "HIGH",
  });
  assert.deepEqual(payload, {
    asset: "bitcoin",
    confluenceScore: 88,
    entryPrice: 100,
    side: "long",
    stopPrice: 95,
    targetPrice: 112,
    tier: "high",
  });
});

test("buildAutoSignalPayload retorna null para campos invalidos", () => {
  assert.equal(buildAutoSignalPayload({}), null);
  assert.equal(buildAutoSignalPayload({ asset: "btc", side: "spot", entryPrice: 1, stopPrice: 1, targetPrice: 1, confluenceScore: 50, tier: "high" }), null);
  assert.equal(buildAutoSignalPayload({ asset: "btc", side: "long", entryPrice: -1, stopPrice: 1, targetPrice: 1, confluenceScore: 50, tier: "high" }), null);
  assert.equal(buildAutoSignalPayload({ asset: "btc", side: "long", entryPrice: 1, stopPrice: 1, targetPrice: 1, confluenceScore: 150, tier: "high" }), null);
  assert.equal(buildAutoSignalPayload({ asset: "btc", side: "long", entryPrice: 1, stopPrice: 1, targetPrice: 1, confluenceScore: 50, tier: "epic" }), null);
});

test("canSubmitAutoSignal exige token, autoArmed, guard armado e payload", () => {
  const guardArmed = { canAutoPaper: true };
  const guardBlocked = { canAutoPaper: false };
  const settingsOk = { autoArmed: true, token: validToken };
  const payload = { asset: "bitcoin" };

  assert.equal(canSubmitAutoSignal({ automationGuard: guardArmed, operatorSettings: settingsOk, payload }), true);
  assert.equal(canSubmitAutoSignal({ automationGuard: guardBlocked, operatorSettings: settingsOk, payload }), false);
  assert.equal(canSubmitAutoSignal({ automationGuard: guardArmed, operatorSettings: { autoArmed: false, token: validToken }, payload }), false);
  assert.equal(canSubmitAutoSignal({ automationGuard: guardArmed, operatorSettings: { autoArmed: true, token: "short" }, payload }), false);
  assert.equal(canSubmitAutoSignal({ automationGuard: guardArmed, operatorSettings: settingsOk, payload: null }), false);
});

test("canSubmitAutoSignal veta submissao quando macro blackout esta ativo (ADR-123)", () => {
  const guardArmed = { canAutoPaper: true };
  const settingsOk = { autoArmed: true, token: validToken };
  const payload = { asset: "bitcoin" };
  const macroBlackout = { alertLevel: "red", blockDirectionalRisk: true };
  const macroGreen = { alertLevel: "green", blockDirectionalRisk: false };

  assert.equal(
    canSubmitAutoSignal({ automationGuard: guardArmed, macroGate: macroBlackout, operatorSettings: settingsOk, payload }),
    false,
    "blackout macro deve vetar submissao automatica",
  );
  assert.equal(
    canSubmitAutoSignal({ automationGuard: guardArmed, macroGate: macroGreen, operatorSettings: settingsOk, payload }),
    true,
    "macro green nao deve vetar",
  );
  assert.equal(
    canSubmitAutoSignal({ automationGuard: guardArmed, macroGate: null, operatorSettings: settingsOk, payload }),
    true,
    "ausencia de macroGate preserva backward-compat",
  );
});

test("submitAutoSignal envia header dedicado e parseia envelope sucesso", async () => {
  let capturedUrl = null;
  let capturedInit = null;
  const fakeFetch = async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ data: { action: "opened", trade: { asset: "bitcoin", status: "open" } }, ok: true }),
    };
  };

  const result = await submitAutoSignal({
    baseUrl: "https://api.example.com/",
    fetchImpl: fakeFetch,
    payload: buildAutoSignalPayload({ asset: "bitcoin", confluenceScore: 88, entryPrice: 100, side: "long", stopPrice: 95, targetPrice: 112, tier: "high" }),
    token: validToken,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(result.data.action, "opened");
  assert.equal(capturedUrl, `https://api.example.com${PAPER_TRADING_OPERATOR_ENDPOINT}`);
  assert.equal(capturedInit.method, "POST");
  assert.equal(capturedInit.headers[PAPER_TRADING_OPERATOR_HEADER], validToken);
  assert.equal(capturedInit.headers["Content-Type"], "application/json");
});

test("submitAutoSignal devolve erro tipado em 401", async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ error: { code: "PAPER_TRADING_OPERATOR_AUTH_INVALID_TOKEN", message: "token invalido" }, ok: false }),
  });

  const result = await submitAutoSignal({
    fetchImpl: fakeFetch,
    payload: buildAutoSignalPayload({ asset: "bitcoin", confluenceScore: 88, entryPrice: 100, side: "long", stopPrice: 95, targetPrice: 112, tier: "high" }),
    token: validToken,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.error.code, "PAPER_TRADING_OPERATOR_AUTH_INVALID_TOKEN");
});

test("submitAutoSignal recusa token curto sem chamar fetch", async () => {
  let called = false;
  const fakeFetch = async () => { called = true; return { ok: true, status: 200, text: async () => "{}" }; };
  const result = await submitAutoSignal({
    fetchImpl: fakeFetch,
    payload: { asset: "bitcoin" },
    token: "short",
  });
  assert.equal(called, false);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "OPERATOR_TOKEN_TOO_SHORT");
});

test("submitAutoSignal captura erro de rede sem lancar", async () => {
  const fakeFetch = async () => { throw new Error("ECONNREFUSED"); };
  const result = await submitAutoSignal({
    fetchImpl: fakeFetch,
    payload: { asset: "bitcoin" },
    token: validToken,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NETWORK_ERROR");
  assert.match(result.error.message, /ECONNREFUSED/);
});

test("PAPER_TRADING_OPERATOR_MIN_TOKEN_LENGTH expoe limite minimo", () => {
  assert.equal(PAPER_TRADING_OPERATOR_MIN_TOKEN_LENGTH, 16);
});
