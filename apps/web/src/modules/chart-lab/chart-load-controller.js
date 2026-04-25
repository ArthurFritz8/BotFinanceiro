function sanitizeChartLoadRequest(options = {}) {
  const nextRequest = {};

  if (typeof options.assetId === "string" && options.assetId.length > 0) {
    nextRequest.assetId = options.assetId;
  }

  if (Number.isSafeInteger(options.assetGenerationToken) && options.assetGenerationToken >= 0) {
    nextRequest.assetGenerationToken = options.assetGenerationToken;
  }

  if (typeof options.mode === "string" && options.mode.length > 0) {
    nextRequest.mode = options.mode;
  }

  if (typeof options.range === "string" && options.range.length > 0) {
    nextRequest.range = options.range;
  }

  if (options.silent === true) {
    nextRequest.silent = true;
  }

  return nextRequest;
}

function cloneRequest(request) {
  return request === null ? null : { ...request };
}

export function createChartLoadController(input = {}) {
  const getLoading = typeof input.getLoading === "function" ? input.getLoading : () => false;
  const setLoading = typeof input.setLoading === "function" ? input.setLoading : () => {};
  let pendingRequest = null;

  const isLoading = () => getLoading() === true;

  return {
    isLoading,

    queue(options = {}) {
      pendingRequest = sanitizeChartLoadRequest(options);
      return cloneRequest(pendingRequest);
    },

    queueIfBusy(options = {}) {
      if (!isLoading()) {
        return false;
      }

      pendingRequest = sanitizeChartLoadRequest(options);
      return true;
    },

    start() {
      setLoading(true);
    },

    finish() {
      setLoading(false);
      const nextRequest = pendingRequest;
      pendingRequest = null;
      return cloneRequest(nextRequest);
    },

    clearPending() {
      pendingRequest = null;
    },

    getPendingRequest() {
      return cloneRequest(pendingRequest);
    },
  };
}
