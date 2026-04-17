import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveInstitutionalZone,
  resolveZonePosition,
} from "./institutional-zone.js";

void describe("resolveInstitutionalZone", () => {
  void it("classifica preço próximo do suporte como discount", () => {
    assert.equal(resolveInstitutionalZone(101, 100, 200), "discount");
    assert.equal(resolveInstitutionalZone(134, 100, 200), "discount");
  });

  void it("classifica preço próximo da resistência como premium", () => {
    assert.equal(resolveInstitutionalZone(166, 100, 200), "premium");
    assert.equal(resolveInstitutionalZone(200, 100, 200), "premium");
  });

  void it("classifica preço em faixa central como equilibrium", () => {
    assert.equal(resolveInstitutionalZone(150, 100, 200), "equilibrium");
    assert.equal(resolveInstitutionalZone(140, 100, 200), "equilibrium");
    assert.equal(resolveInstitutionalZone(160, 100, 200), "equilibrium");
  });

  void it("trata suporte==resistência sem divisão por zero", () => {
    const zone = resolveInstitutionalZone(100, 100, 100);
    assert.ok(["discount", "equilibrium", "premium"].includes(zone));
  });

  void it("respeita limiares customizados", () => {
    const thresholds = { discountMax: 0.2, premiumMin: 0.8 };
    assert.equal(resolveInstitutionalZone(130, 100, 200, thresholds), "equilibrium");
    assert.equal(resolveInstitutionalZone(110, 100, 200, thresholds), "discount");
    assert.equal(resolveInstitutionalZone(190, 100, 200, thresholds), "premium");
  });
});

void describe("resolveZonePosition", () => {
  void it("retorna 0 no suporte e 1 na resistência", () => {
    assert.equal(resolveZonePosition(100, 100, 200), 0);
    assert.equal(resolveZonePosition(200, 100, 200), 1);
    assert.equal(resolveZonePosition(150, 100, 200), 0.5);
  });

  void it("faz clamp para valores fora do range", () => {
    assert.equal(resolveZonePosition(50, 100, 200), 0);
    assert.equal(resolveZonePosition(300, 100, 200), 1);
  });
});
