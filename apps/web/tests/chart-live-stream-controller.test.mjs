import assert from "node:assert/strict";
import test from "node:test";

import { createChartLiveStreamController } from "../src/modules/chart-lab/chart-live-stream-controller.js";

function createFakeTimers() {
  let nextId = 1;
  const timeouts = new Map();
  const intervals = new Map();

  return {
    clearIntervalCalls: [],
    clearTimeoutCalls: [],
    intervals,
    timeouts,
    setInterval(callback, intervalMs) {
      const id = nextId;
      nextId += 1;
      intervals.set(id, { callback, intervalMs });
      return id;
    },
    clearInterval(id) {
      this.clearIntervalCalls.push(id);
      intervals.delete(id);
    },
    setTimeout(callback, delayMs) {
      const id = nextId;
      nextId += 1;
      timeouts.set(id, { callback, delayMs });
      return id;
    },
    clearTimeout(id) {
      this.clearTimeoutCalls.push(id);
      timeouts.delete(id);
    },
    runTimeout(id) {
      const item = timeouts.get(id);
      assert.ok(item, `timeout ${id} deveria existir`);
      timeouts.delete(id);
      item.callback();
    },
  };
}

test("Chart live stream controller fecha stream e publica status offline/reconnecting", () => {
  const timers = createFakeTimers();
  const statuses = [];
  let closeCount = 0;
  const controller = createChartLiveStreamController({
    liveStatus: { LIVE: "live", OFFLINE: "offline", RECONNECTING: "reconnecting" },
    timers,
    updateLiveStatus: (status) => statuses.push(status),
  });

  controller.attachStream("btc:live", {
    close: () => {
      closeCount += 1;
    },
  });

  assert.equal(controller.hasStream(), true);
  assert.equal(controller.isActiveStream("btc:live"), true);

  controller.stopStream({ transitioning: true });

  assert.equal(closeCount, 1);
  assert.equal(controller.hasStream(), false);
  assert.deepEqual(statuses, ["reconnecting"]);

  controller.stopStream();

  assert.deepEqual(statuses, ["reconnecting", "offline"]);
});

test("Chart live stream controller controla fallback polling sem duplicar intervalos", () => {
  const timers = createFakeTimers();
  let pollCount = 0;
  const controller = createChartLiveStreamController({ timers });

  assert.equal(controller.startFallbackPolling(() => {
    pollCount += 1;
  }, 4000), true);
  assert.equal(controller.startFallbackPolling(() => {
    pollCount += 1;
  }, 4000), false);
  assert.equal(timers.intervals.size, 1);

  const [intervalId, interval] = Array.from(timers.intervals.entries())[0];
  interval.callback();

  assert.equal(pollCount, 1);
  assert.equal(controller.stopFallbackPolling(), true);
  assert.equal(timers.intervals.size, 0);
  assert.deepEqual(timers.clearIntervalCalls, [intervalId]);
});

test("Chart live stream controller reseta backoff e cancela legenda diferida ao receber snapshot", () => {
  const timers = createFakeTimers();
  const statuses = [];
  let legendCount = 0;
  let reconnectCount = 0;
  const controller = createChartLiveStreamController({
    reconnectBaseMs: 100,
    reconnectMaxMs: 500,
    timers,
    updateLiveStatus: (status) => statuses.push(status),
  });

  const firstBackoff = controller.nextReconnectBackoffMs();
  const secondBackoff = controller.nextReconnectBackoffMs();
  const reconnectTimerId = controller.scheduleReconnect(() => {
    reconnectCount += 1;
  }, secondBackoff);
  const legendTimerId = controller.scheduleDeferredLegend(() => {
    legendCount += 1;
  }, 2500);

  assert.equal(firstBackoff, 200);
  assert.equal(secondBackoff, 400);
  assert.equal(controller.getReconnectAttempt(), 2);

  assert.equal(controller.startFallbackPolling(() => {}, 4000), true);
  controller.markLiveSnapshotReceived();

  assert.equal(controller.getReconnectAttempt(), 0);
  assert.deepEqual(statuses, ["live"]);
  assert.equal(timers.intervals.size, 0);
  assert.ok(timers.clearTimeoutCalls.includes(legendTimerId));
  assert.equal(timers.timeouts.has(legendTimerId), false);

  timers.runTimeout(reconnectTimerId);

  assert.equal(reconnectCount, 1);
  assert.equal(legendCount, 0);
});
