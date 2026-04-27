function readContextValue(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

const CHART_ASSET_CONTEXT_KEYS = Object.freeze([
  "assetId",
  "broker",
  "exchange",
  "interval",
  "mode",
  "operationalMode",
  "range",
  "strategy",
  "symbol",
]);

export function normalizeChartAssetContext(input = {}) {
  return {
    assetId: readContextValue(input.assetId),
    broker: readContextValue(input.broker),
    exchange: readContextValue(input.exchange),
    interval: readContextValue(input.interval),
    mode: readContextValue(input.mode),
    operationalMode: readContextValue(input.operationalMode),
    range: readContextValue(input.range),
    strategy: readContextValue(input.strategy),
    symbol: readContextValue(input.symbol),
  };
}

export function hasChartAssetContextChanged(previousContext = {}, nextContext = {}) {
  const previous = normalizeChartAssetContext(previousContext);
  const next = normalizeChartAssetContext(nextContext);

  return CHART_ASSET_CONTEXT_KEYS.some((key) => previous[key] !== next[key]);
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
