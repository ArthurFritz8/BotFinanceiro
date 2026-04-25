function readContextValue(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeChartAssetContext(input = {}) {
  return {
    assetId: readContextValue(input.assetId),
    operationalMode: readContextValue(input.operationalMode),
    strategy: readContextValue(input.strategy),
    symbol: readContextValue(input.symbol),
  };
}

export function hasChartAssetContextChanged(previousContext = {}, nextContext = {}) {
  const previous = normalizeChartAssetContext(previousContext);
  const next = normalizeChartAssetContext(nextContext);

  return previous.assetId !== next.assetId
    || previous.symbol !== next.symbol
    || previous.strategy !== next.strategy
    || previous.operationalMode !== next.operationalMode;
}

export function resetChartAssetContext(input = {}) {
  const previous = normalizeChartAssetContext(input.previousContext);
  const next = normalizeChartAssetContext(input.nextContext);
  const changed = input.force === true || hasChartAssetContextChanged(previous, next);

  if (!changed) {
    return {
      changed: false,
      next,
      previous,
    };
  }

  const callbacks = Array.isArray(input.callbacks) ? input.callbacks : [];

  for (const callback of callbacks) {
    if (typeof callback === "function") {
      callback({
        next,
        previous,
        reason: typeof input.reason === "string" ? input.reason : "asset-context-change",
      });
    }
  }

  return {
    changed: true,
    next,
    previous,
  };
}
