const DEFAULT_RECONNECT_BASE_MS = 1200;
const DEFAULT_RECONNECT_MAX_MS = 30000;

function resolveTimers(timers) {
  return timers && typeof timers === "object" ? timers : globalThis;
}

function closeStream(stream) {
  if (!stream || typeof stream.close !== "function") {
    return;
  }

  stream.close();
}

export function createChartLiveStreamController(input = {}) {
  const timers = resolveTimers(input.timers);
  const liveStatus = input.liveStatus && typeof input.liveStatus === "object"
    ? input.liveStatus
    : { LIVE: "live", OFFLINE: "offline", RECONNECTING: "reconnecting" };
  const updateLiveStatus = typeof input.updateLiveStatus === "function"
    ? input.updateLiveStatus
    : () => {};
  const reconnectBaseMs = Number.isFinite(input.reconnectBaseMs)
    ? Number(input.reconnectBaseMs)
    : DEFAULT_RECONNECT_BASE_MS;
  const reconnectMaxMs = Number.isFinite(input.reconnectMaxMs)
    ? Number(input.reconnectMaxMs)
    : DEFAULT_RECONNECT_MAX_MS;

  let stream = null;
  let streamKey = "";
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let fallbackPollTimer = null;
  let deferredLegendTimer = null;

  const clearReconnectTimer = () => {
    if (reconnectTimer === null || typeof timers.clearTimeout !== "function") {
      reconnectTimer = null;
      return;
    }

    timers.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const stopFallbackPolling = () => {
    if (fallbackPollTimer === null || typeof timers.clearInterval !== "function") {
      fallbackPollTimer = null;
      return false;
    }

    timers.clearInterval(fallbackPollTimer);
    fallbackPollTimer = null;
    return true;
  };

  const cancelDeferredLegend = () => {
    if (deferredLegendTimer === null || typeof timers.clearTimeout !== "function") {
      deferredLegendTimer = null;
      return false;
    }

    timers.clearTimeout(deferredLegendTimer);
    deferredLegendTimer = null;
    return true;
  };

  return {
    attachStream(nextStreamKey, nextStream) {
      streamKey = typeof nextStreamKey === "string" ? nextStreamKey : "";
      stream = nextStream ?? null;
      return stream;
    },

    hasStream() {
      return stream !== null;
    },

    isActiveStream(candidateKey) {
      return stream !== null && streamKey === candidateKey;
    },

    getStreamKey() {
      return streamKey;
    },

    stopStream(options = {}) {
      if (options.stopFallbackPolling !== false) {
        stopFallbackPolling();
      }

      clearReconnectTimer();
      cancelDeferredLegend();
      closeStream(stream);
      stream = null;
      streamKey = "";

      updateLiveStatus(options.transitioning === true ? liveStatus.RECONNECTING : liveStatus.OFFLINE);
    },

    startFallbackPolling(callback, intervalMs) {
      if (fallbackPollTimer !== null) {
        return false;
      }

      if (typeof timers.setInterval !== "function" || typeof callback !== "function") {
        return false;
      }

      fallbackPollTimer = timers.setInterval(callback, intervalMs);
      return true;
    },

    stopFallbackPolling,

    markLiveSnapshotReceived() {
      stopFallbackPolling();
      reconnectAttempt = 0;
      cancelDeferredLegend();
      updateLiveStatus(liveStatus.LIVE);
    },

    nextReconnectBackoffMs() {
      reconnectAttempt += 1;
      return Math.min(reconnectMaxMs, reconnectBaseMs * 2 ** reconnectAttempt);
    },

    scheduleReconnect(callback, delayMs) {
      clearReconnectTimer();

      if (typeof timers.setTimeout !== "function" || typeof callback !== "function") {
        return null;
      }

      reconnectTimer = timers.setTimeout(() => {
        reconnectTimer = null;
        callback();
      }, delayMs);
      return reconnectTimer;
    },

    scheduleDeferredLegend(callback, delayMs) {
      cancelDeferredLegend();

      if (typeof timers.setTimeout !== "function" || typeof callback !== "function") {
        return null;
      }

      deferredLegendTimer = timers.setTimeout(() => {
        deferredLegendTimer = null;
        callback();
      }, delayMs);
      return deferredLegendTimer;
    },

    cancelDeferredLegend,

    getReconnectAttempt() {
      return reconnectAttempt;
    },
  };
}
