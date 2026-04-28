// ADR-120 — Onda 2 frontend: testes unitarios dos helpers puros do
// institutional-derivatives-card. Sem jsdom: testamos apenas as pure functions
// expostas via _testables (formatadores + classificadores de tone).

import assert from "node:assert/strict";
import test from "node:test";

import { _testables, renderFundingSparkline } from "../src/modules/intelligence-desk/institutional-derivatives-card.js";

const {
  formatBps,
  formatNumberCompact,
  formatPrice,
  fundingTone,
  imbalanceTone,
  cvdTone,
  humanInterpretation,
  fundingTrendLabel,
} = _testables;

test("formatBps prefixa sinal e usa 2 casas decimais", () => {
  assert.equal(formatBps(6), "+6.00 bps");
  assert.equal(formatBps(-3.456), "-3.46 bps");
  assert.equal(formatBps(0), "0.00 bps");
  assert.equal(formatBps(null), "—");
  assert.equal(formatBps(Number.NaN), "—");
});

test("formatNumberCompact usa sufixos k/M/B", () => {
  assert.equal(formatNumberCompact(1500), "1.50k");
  assert.equal(formatNumberCompact(2.5e6), "2.50M");
  assert.equal(formatNumberCompact(8.5e9), "8.50B");
  assert.equal(formatNumberCompact(42.7), "42.70");
  assert.equal(formatNumberCompact(null), "—");
});

test("formatPrice ajusta precisao por magnitude", () => {
  assert.equal(formatPrice(64210.55), "64210.55");
  assert.equal(formatPrice(12.3456), "12.3456");
  assert.equal(formatPrice(0.000123), "0.000123");
  assert.equal(formatPrice(undefined), "—");
});

test("fundingTone inverte a leitura: longs sobreestendidos = bear, panico shorts = bull", () => {
  assert.equal(fundingTone("extreme_long"), "bear");
  assert.equal(fundingTone("long_pressure"), "bear");
  assert.equal(fundingTone("extreme_short"), "bull");
  assert.equal(fundingTone("short_pressure"), "bull");
  assert.equal(fundingTone("neutral"), "neutral");
  assert.equal(fundingTone("unknown_value"), "neutral");
});

test("imbalanceTone usa threshold 0.15", () => {
  assert.equal(imbalanceTone(0.2), "bull");
  assert.equal(imbalanceTone(-0.2), "bear");
  assert.equal(imbalanceTone(0.1), "neutral");
  assert.equal(imbalanceTone(-0.1), "neutral");
  assert.equal(imbalanceTone(null), "neutral");
});

test("cvdTone segue o sinal estritamente", () => {
  assert.equal(cvdTone(10), "bull");
  assert.equal(cvdTone(-5), "bear");
  assert.equal(cvdTone(0), "neutral");
  assert.equal(cvdTone(undefined), "neutral");
});

test("humanInterpretation expoe rotulos PT-BR para todos os estados", () => {
  assert.equal(humanInterpretation("extreme_long"), "longs sobreestendidos");
  assert.equal(humanInterpretation("long_pressure"), "pressao long");
  assert.equal(humanInterpretation("short_pressure"), "pressao short");
  assert.equal(humanInterpretation("extreme_short"), "shorts em panico");
  assert.equal(humanInterpretation("neutral"), "neutro");
  assert.equal(humanInterpretation("unknown"), "neutro");
});

// ADR-125: sparkline funding 24h.
test("renderFundingSparkline retorna SVG path com viewBox correto e M/L points", () => {
  const svg = renderFundingSparkline([1, 2, 3, 4], { width: 80, height: 24 });
  assert.ok(svg.startsWith('<svg viewBox="0 0 80 24"'));
  assert.ok(svg.includes('<path'));
  assert.ok(svg.includes('d="M0.00,24.00 L'));
  // 4 pontos: 3 segmentos L
  const lCount = (svg.match(/ L\d/g) ?? []).length;
  assert.equal(lCount, 3);
});

test("renderFundingSparkline retorna string vazia quando entrada e curta ou invalida", () => {
  assert.equal(renderFundingSparkline([], {}), "");
  assert.equal(renderFundingSparkline([1], {}), "");
  assert.equal(renderFundingSparkline(null, {}), "");
  assert.equal(renderFundingSparkline([Number.NaN, 1], {}), "");
});

test("renderFundingSparkline achata em linha central quando todos valores iguais (range=0)", () => {
  const svg = renderFundingSparkline([2, 2, 2], { width: 60, height: 20 });
  // Sem range, normalized=0.5 => y = 20 - 0.5*20 = 10 para todos os pontos.
  assert.ok(svg.includes("M0.00,10.00"));
  assert.ok(svg.includes("30.00,10.00"));
  assert.ok(svg.includes("60.00,10.00"));
});

test("fundingTrendLabel formata seta + bps por trend", () => {
  assert.equal(fundingTrendLabel("up", 2.5, 24), "24h ↑ +2.50 bps");
  assert.equal(fundingTrendLabel("down", -1.2, 24), "24h ↓ -1.20 bps");
  assert.equal(fundingTrendLabel("flat", 0.1, 24), "24h → +0.10 bps");
  assert.equal(fundingTrendLabel("n/a", null, 48), "48h —");
});
