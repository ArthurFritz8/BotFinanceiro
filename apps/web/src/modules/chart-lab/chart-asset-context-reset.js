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
  const reason = typeof input.reason === "string" ? input.reason : "asset-context-change";

  for (const callback of callbacks) {
    if (typeof callback === "function") {
      callback({
        next,
        previous,
        reason,
      });
    }
  }

  // ADR-118: dispara registry global para invalidar caches em outras abas
  // (newsIntelligence, marketNavigator, wegd subtab, etc.) sem exigir que cada
  // call site conheca a lista. Handlers se registram via registerAssetContextResetHandler().
  for (const handler of globalResetHandlers) {
    try {
      handler({ next, previous, reason });
    } catch (error) {
      // Handlers nao devem derrubar o pipeline de reset; falhas sao logadas e ignoradas.
      // eslint-disable-next-line no-console
      console.warn("[chart-asset-context-reset] handler global falhou", error);
    }
  }

  return {
    changed: true,
    next,
    previous,
  };
}

// ---------------------------------------------------------------------------
// Registry global (ADR-118): permite a modulos externos (news, market-navigator,
// wegd subtab, ghost tracker, etc.) se inscreverem para invalidar seus proprios
// caches ao trocar de ativo, broker, intervalo ou modo operacional, sem que o
// orquestrador (main.js) precise conhecer cada lista de callbacks.
// ---------------------------------------------------------------------------
const globalResetHandlers = new Set();

export function registerAssetContextResetHandler(handler) {
  if (typeof handler !== "function") {
    return () => {};
  }
  globalResetHandlers.add(handler);
  return function unregister() {
    globalResetHandlers.delete(handler);
  };
}

export function clearAssetContextResetHandlers() {
  globalResetHandlers.clear();
}

export function getAssetContextResetHandlerCount() {
  return globalResetHandlers.size;
}
