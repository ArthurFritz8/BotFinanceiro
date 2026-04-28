// ADR-121 — Tests pure-helpers do macro-gate-pill.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { _testables } = await import("../src/modules/intelligence-desk/macro-gate-pill.js");

void describe("macro-gate-pill formatCountdown", () => {
  void it("retorna 'agora' para minutos negativos", () => {
    assert.equal(_testables.formatCountdown(-3), "agora");
  });

  void it("formata minutos sub-hora com sufixo min", () => {
    assert.equal(_testables.formatCountdown(28), "28min");
  });

  void it("formata horas inteiras sem minutos", () => {
    assert.equal(_testables.formatCountdown(120), "2h");
  });

  void it("formata horas + minutos quando fracionado", () => {
    assert.equal(_testables.formatCountdown(95), "1h35m");
  });

  void it("retorna em-dash para valores invalidos", () => {
    assert.equal(_testables.formatCountdown(Number.NaN), "—");
    assert.equal(_testables.formatCountdown(undefined), "—");
  });
});
