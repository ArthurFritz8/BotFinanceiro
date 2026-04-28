// ADR-121 — Tests para /v1/macro/upcoming-events.

import assert from "node:assert/strict";
import { after, beforeEach, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";

const { buildApp } = await import("../../../main/app.js");

const app = buildApp();
await app.ready();

const originalFetch = globalThis.fetch;
const originalCalendarUrl = process.env.FOREX_MACRO_CALENDAR_URL;
const originalCalendarKey = process.env.FOREX_MACRO_CALENDAR_API_KEY;

void beforeEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.FOREX_MACRO_CALENDAR_URL;
  delete process.env.FOREX_MACRO_CALENDAR_API_KEY;
});

void after(async () => {
  globalThis.fetch = originalFetch;
  if (typeof originalCalendarUrl === "string") process.env.FOREX_MACRO_CALENDAR_URL = originalCalendarUrl;
  if (typeof originalCalendarKey === "string") process.env.FOREX_MACRO_CALENDAR_API_KEY = originalCalendarKey;
  await app.close();
});

void it("GET /v1/macro/upcoming-events retorna fallback sintetico sem URL configurada", async () => {
  const response = await app.inject({ method: "GET", url: "/v1/macro/upcoming-events" });
  assert.equal(response.statusCode, 200);
  const body = response.json<{
    data: {
      alertLevel: "red" | "yellow" | "green";
      blockDirectionalRisk: boolean;
      events: Array<{ name: string; impact: string; minutesToEvent: number; hoursToEvent: number }>;
      minutesToNextHighImpact: number | null;
      nextEvent: { name: string; impact: string } | null;
      source: string;
    };
  }>();
  assert.equal(body.data.source, "fallback");
  assert.ok(body.data.events.length >= 1);
  assert.ok(["red", "yellow", "green"].includes(body.data.alertLevel));
  assert.equal(body.data.blockDirectionalRisk, body.data.alertLevel === "red");
  // Fallback inclui CPI (high), NFP (high), FOMC Minutes (medium).
  assert.ok(body.data.events.some((e) => e.impact === "high"));
});

void it("blockDirectionalRisk fica true quando high-impact <=3h via fallback", async () => {
  // Forca cenario com agenda externa que coloca evento high em 1h.
  process.env.FOREX_MACRO_CALENDAR_URL = "https://example.test/calendar";
  globalThis.fetch = ((input) => {
    const url = String(input);
    if (url.includes("example.test/calendar")) {
      const oneHourFromNow = Date.now() + 60 * 60 * 1000;
      return Promise.resolve(new Response(JSON.stringify([
        { event: "FOMC Rate Decision", country: "US", impact: "high", timestamp: oneHourFromNow },
        { event: "ECB Press Conf", country: "EU", impact: "medium", timestamp: oneHourFromNow + 4 * 60 * 60 * 1000 },
      ]), { status: 200, headers: { "content-type": "application/json" } }));
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  }) as typeof fetch;

  const response = await app.inject({ method: "GET", url: "/v1/macro/upcoming-events" });
  assert.equal(response.statusCode, 200);
  const body = response.json<{
    data: {
      alertLevel: "red" | "yellow" | "green";
      blockDirectionalRisk: boolean;
      source: string;
      minutesToNextHighImpact: number;
      nextEvent: { impact: string };
    };
  }>();
  assert.equal(body.data.source, "external");
  assert.equal(body.data.alertLevel, "red");
  assert.equal(body.data.blockDirectionalRisk, true);
  assert.ok(body.data.minutesToNextHighImpact <= 60);
});
