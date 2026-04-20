import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BacktestingService } from "../modules/backtesting/application/backtesting-service.js";
import { RegimeAlertsScannerJobRunner } from "./regime-alerts-scanner-job-runner.js";

void describe("RegimeAlertsScannerJobRunner", () => {
  void it("tick chama service.computeRegimeAlerts (Wave 25)", () => {
    let callCount = 0;
    const fakeService = {
      computeRegimeAlerts: (): readonly unknown[] => {
        callCount += 1;
        return [];
      },
    } as unknown as BacktestingService;
    const runner = new RegimeAlertsScannerJobRunner({ service: fakeService });
    runner.tick();
    runner.tick();
    assert.equal(callCount, 2);
  });

  void it("tick e failure-soft (erro nao propaga) (Wave 25)", () => {
    const fakeService = {
      computeRegimeAlerts: (): readonly unknown[] => {
        throw new Error("boom");
      },
    } as unknown as BacktestingService;
    const runner = new RegimeAlertsScannerJobRunner({ service: fakeService });
    assert.doesNotThrow(() => {
      runner.tick();
    });
  });

  void it("getStatus reflete sucesso do ultimo tick (Wave 27)", () => {
    let callCount = 0;
    const fakeService = {
      computeRegimeAlerts: (): readonly unknown[] => {
        callCount += 1;
        return [
          { severity: "critical" },
          { severity: "warning" },
          { severity: "critical" },
        ];
      },
    } as unknown as BacktestingService;
    const ticks = [1_700_000_000_000, 1_700_000_000_005];
    let i = 0;
    const runner = new RegimeAlertsScannerJobRunner({
      service: fakeService,
      intervalMs: 60_000,
      clock: () => ticks[i++] ?? 1_700_000_000_999,
    });
    runner.tick();
    const status = runner.getStatus();
    assert.equal(callCount, 1);
    assert.equal(status.ticksTotal, 1);
    assert.equal(status.ticksFailed, 0);
    assert.equal(status.lastAlertsTotal, 3);
    assert.equal(status.lastAlertsCritical, 2);
    assert.equal(status.lastDurationMs, 5);
    assert.equal(status.lastErrorMessage, null);
    assert.equal(status.intervalMs, 60_000);
    assert.equal(status.lastTickAtMs, 1_700_000_000_005);
    // running e nextTickAtMs ficam null sem start() (so tick() manual)
    assert.equal(status.running, false);
    assert.equal(status.nextTickAtMs, null);
  });

  void it("getStatus reflete falha + contadores cumulativos (Wave 27)", () => {
    let throwNext = false;
    const fakeService = {
      computeRegimeAlerts: (): readonly unknown[] => {
        if (throwNext) throw new Error("boom");
        return [];
      },
    } as unknown as BacktestingService;
    const runner = new RegimeAlertsScannerJobRunner({
      service: fakeService,
      intervalMs: 60_000,
    });
    runner.tick();
    throwNext = true;
    runner.tick();
    const status = runner.getStatus();
    assert.equal(status.ticksTotal, 2);
    assert.equal(status.ticksFailed, 1);
    assert.equal(status.lastErrorMessage, "boom");
    assert.equal(status.lastAlertsTotal, null);
    assert.equal(status.lastAlertsCritical, null);
  });
});
