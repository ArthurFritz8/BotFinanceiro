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
});
