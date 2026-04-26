import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCentralJournalUrl,
  fetchCentralOperatorJournal,
  PAPER_TRADING_OPERATOR_CENTRAL_JOURNAL_MAX_LIMIT,
  PAPER_TRADING_OPERATOR_JOURNAL_ENDPOINT,
  sanitizeCentralJournalFilters,
  summarizeCentralJournalSnapshot,
} from "../src/modules/chart-lab/quant/paper-trading-operator-central-journal.js";
import { PAPER_TRADING_OPERATOR_HEADER } from "../src/modules/chart-lab/quant/paper-trading-operator-client.js";

const validToken = "operator_token_abcdef_1234"; // 26 chars

test("sanitizeCentralJournalFilters retorna nulls para input vazio", () => {
  assert.deepEqual(sanitizeCentralJournalFilters({}), {
    action: null,
    asset: null,
    from: null,
    limit: null,
    to: null,
  });
});

test("sanitizeCentralJournalFilters mantem ISO valido e descarta invalido", () => {
  const result = sanitizeCentralJournalFilters({
    from: "2026-04-26T10:00:00Z",
    to: "not-a-date",
  });
  assert.equal(result.from, "2026-04-26T10:00:00Z");
  assert.equal(result.to, null);
});

test("sanitizeCentralJournalFilters satura limit no teto", () => {
  const result = sanitizeCentralJournalFilters({ limit: 99999 });
  assert.equal(result.limit, PAPER_TRADING_OPERATOR_CENTRAL_JOURNAL_MAX_LIMIT);
});

test("sanitizeCentralJournalFilters aceita limit como string", () => {
  assert.equal(sanitizeCentralJournalFilters({ limit: "25" }).limit, 25);
});

test("sanitizeCentralJournalFilters descarta action invalida", () => {
  assert.equal(sanitizeCentralJournalFilters({ action: "FOO" }).action, null);
  assert.equal(sanitizeCentralJournalFilters({ action: "OPENED" }).action, "opened");
});

test("sanitizeCentralJournalFilters normaliza asset para lowercase", () => {
  assert.equal(sanitizeCentralJournalFilters({ asset: "  BITCOIN  " }).asset, "bitcoin");
});

test("buildCentralJournalUrl sem filtros retorna endpoint puro", () => {
  assert.equal(buildCentralJournalUrl(""), PAPER_TRADING_OPERATOR_JOURNAL_ENDPOINT);
  assert.equal(
    buildCentralJournalUrl("https://api.example.com/"),
    `https://api.example.com${PAPER_TRADING_OPERATOR_JOURNAL_ENDPOINT}`,
  );
});

test("buildCentralJournalUrl serializa filtros com ordem alfabetica", () => {
  const url = buildCentralJournalUrl("", {
    action: "error",
    asset: "ethereum",
    from: "2026-04-26T10:00:00Z",
    limit: 10,
    to: "2026-04-26T11:00:00Z",
  });
  assert.equal(
    url,
    `${PAPER_TRADING_OPERATOR_JOURNAL_ENDPOINT}?action=error&asset=ethereum&from=2026-04-26T10%3A00%3A00Z&limit=10&to=2026-04-26T11%3A00%3A00Z`,
  );
});

test("summarizeCentralJournalSnapshot retorna rates null quando total=0", () => {
  const summary = summarizeCentralJournalSnapshot({
    enabled: true,
    entries: [],
    errors: 0,
    opened: 0,
    skipped: 0,
    total: 0,
  });
  assert.equal(summary.successRate, null);
  assert.equal(summary.errorRate, null);
});

test("summarizeCentralJournalSnapshot calcula rates inteiros", () => {
  const summary = summarizeCentralJournalSnapshot({
    enabled: true,
    entries: [],
    errors: 1,
    opened: 6,
    skipped: 3,
    total: 10,
  });
  assert.equal(summary.successRate, 60);
  assert.equal(summary.errorRate, 10);
});

test("summarizeCentralJournalSnapshot tolera payload invalido (degrada)", () => {
  const summary = summarizeCentralJournalSnapshot(null);
  assert.equal(summary.total, 0);
  assert.equal(summary.enabled, false);
  assert.deepEqual(summary.entries, []);
});

test("fetchCentralOperatorJournal exige token >= min length", async () => {
  const result = await fetchCentralOperatorJournal({
    fetchImpl: async () => new Response(),
    token: "short",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "OPERATOR_TOKEN_TOO_SHORT");
});

test("fetchCentralOperatorJournal envia header autenticado e parsea envelope", async () => {
  let capturedUrl = null;
  let capturedHeaders = null;
  const fakePayload = {
    data: {
      enabled: true,
      entries: [
        {
          action: "opened",
          asset: "bitcoin",
          confluenceScore: 80,
          id: "00000000-0000-0000-0000-000000000001",
          occurredAtMs: 1714000000000,
          reason: null,
          side: "long",
          tier: "high",
        },
      ],
      errors: 0,
      opened: 1,
      skipped: 0,
      total: 1,
    },
    ok: true,
  };
  const fakeFetch = async (url, init) => {
    capturedUrl = url;
    capturedHeaders = init?.headers ?? null;
    return new Response(JSON.stringify(fakePayload), { status: 200 });
  };
  const result = await fetchCentralOperatorJournal({
    baseUrl: "https://api.example.com",
    fetchImpl: fakeFetch,
    filters: { action: "opened", asset: "bitcoin", limit: 5 },
    token: validToken,
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.enabled, true);
  assert.equal(result.data.entries.length, 1);
  assert.equal(result.data.entries[0].asset, "bitcoin");
  assert.equal(
    capturedUrl,
    "https://api.example.com/v1/paper-trading/operator/journal?action=opened&asset=bitcoin&limit=5",
  );
  assert.equal(capturedHeaders[PAPER_TRADING_OPERATOR_HEADER], validToken);
});

test("fetchCentralOperatorJournal trata HTTP 401 sem lancar", async () => {
  const fakeFetch = async () =>
    new Response(JSON.stringify({ error: { code: "OPERATOR_AUTH_REQUIRED", message: "401" } }), {
      status: 401,
    });
  const result = await fetchCentralOperatorJournal({ fetchImpl: fakeFetch, token: validToken });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.error.code, "OPERATOR_AUTH_REQUIRED");
});

test("fetchCentralOperatorJournal mapeia network error para NETWORK_ERROR", async () => {
  const fakeFetch = async () => {
    throw new Error("offline");
  };
  const result = await fetchCentralOperatorJournal({ fetchImpl: fakeFetch, token: validToken });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NETWORK_ERROR");
  assert.match(result.error.message, /offline/);
});
