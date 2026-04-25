const DEFAULT_SELECTION = Object.freeze({
  assetId: "bitcoin",
  broker: "binance",
  exchange: "BINANCE",
  interval: "1h",
  mode: "delayed",
  range: "7d",
  symbol: "BTCUSDT",
});

const DEFAULT_STATE = Object.freeze({
  isLoading: false,
  operationalMode: "spot_margin",
  selection: DEFAULT_SELECTION,
  snapshot: null,
  strategy: "crypto",
  symbolSourceModule: "crypto",
  viewMode: "tv",
});

function readNonEmptyString(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeViewMode(value) {
  return value === "copilot" ? "copilot" : "tv";
}

function normalizeStrategy(value) {
  return value === "institutional_macro" ? "institutional_macro" : "crypto";
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeSnapshot(value) {
  return value && typeof value === "object" ? value : null;
}

function normalizeSelection(value = {}, fallback = DEFAULT_SELECTION) {
  return {
    assetId: readNonEmptyString(value.assetId, fallback.assetId),
    broker: readNonEmptyString(value.broker, fallback.broker),
    exchange: readNonEmptyString(value.exchange, fallback.exchange),
    interval: readNonEmptyString(value.interval, fallback.interval),
    mode: readNonEmptyString(value.mode, fallback.mode),
    range: readNonEmptyString(value.range, fallback.range),
    symbol: readNonEmptyString(value.symbol, fallback.symbol),
  };
}

function normalizeState(value = {}, fallback = DEFAULT_STATE) {
  return {
    isLoading: normalizeBoolean(value.isLoading),
    operationalMode: readNonEmptyString(value.operationalMode, fallback.operationalMode),
    selection: normalizeSelection(value.selection, fallback.selection),
    snapshot: normalizeSnapshot(value.snapshot),
    strategy: normalizeStrategy(value.strategy),
    symbolSourceModule: readNonEmptyString(value.symbolSourceModule, fallback.symbolSourceModule),
    viewMode: normalizeViewMode(value.viewMode),
  };
}

function cloneSelection(selection) {
  return { ...selection };
}

function cloneState(state) {
  return {
    ...state,
    selection: cloneSelection(state.selection),
  };
}

export function createChartLabStore(initialState = {}) {
  let state = normalizeState({
    ...DEFAULT_STATE,
    ...initialState,
    selection: {
      ...DEFAULT_SELECTION,
      ...(initialState.selection && typeof initialState.selection === "object" ? initialState.selection : {}),
    },
  });

  return {
    getState() {
      return cloneState(state);
    },

    patch(patch = {}) {
      state = normalizeState({
        ...state,
        ...patch,
        selection: {
          ...state.selection,
          ...(patch.selection && typeof patch.selection === "object" ? patch.selection : {}),
        },
      }, state);
      return cloneState(state);
    },

    getSelection() {
      return cloneSelection(state.selection);
    },

    patchSelection(patch = {}) {
      state = {
        ...state,
        selection: normalizeSelection({
          ...state.selection,
          ...(patch && typeof patch === "object" ? patch : {}),
        }, state.selection),
      };
      return cloneSelection(state.selection);
    },

    getSnapshot() {
      return state.snapshot;
    },

    hasSnapshot() {
      return state.snapshot !== null && typeof state.snapshot === "object";
    },

    setSnapshot(snapshot) {
      state = {
        ...state,
        snapshot: normalizeSnapshot(snapshot),
      };
      return state.snapshot;
    },

    getLoading() {
      return state.isLoading;
    },

    setLoading(isLoading) {
      state = {
        ...state,
        isLoading: normalizeBoolean(isLoading),
      };
      return state.isLoading;
    },

    getViewMode() {
      return state.viewMode;
    },

    setViewMode(viewMode) {
      state = {
        ...state,
        viewMode: normalizeViewMode(viewMode),
      };
      return state.viewMode;
    },

    getOperationalMode() {
      return state.operationalMode;
    },

    setOperationalMode(operationalMode) {
      state = {
        ...state,
        operationalMode: readNonEmptyString(operationalMode, state.operationalMode),
      };
      return state.operationalMode;
    },

    getSymbolSourceModule() {
      return state.symbolSourceModule;
    },

    setSymbolSourceModule(symbolSourceModule) {
      state = {
        ...state,
        symbolSourceModule: readNonEmptyString(symbolSourceModule, ""),
      };
      return state.symbolSourceModule;
    },

    getStrategy() {
      return state.strategy;
    },

    setStrategy(strategy) {
      state = {
        ...state,
        strategy: normalizeStrategy(strategy),
      };
      return state.strategy;
    },
  };
}
