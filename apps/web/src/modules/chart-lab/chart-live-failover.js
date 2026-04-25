const DEFAULT_BROKER_ORDER = Object.freeze(["binance", "bybit", "coinbase", "kraken", "okx"]);

function defaultNormalizeBrokerName(broker) {
  if (typeof broker !== "string") {
    return "binance";
  }

  const normalized = broker.trim().toLowerCase();
  return DEFAULT_BROKER_ORDER.includes(normalized) ? normalized : "binance";
}

function defaultNormalizeRequestedBroker(broker) {
  if (typeof broker !== "string") {
    return "binance";
  }

  const normalized = broker.trim().toLowerCase();

  if (normalized === "auto") {
    return "auto";
  }

  return defaultNormalizeBrokerName(normalized);
}

function resolveNormalizeBrokerName(input = {}) {
  return typeof input.normalizeBrokerName === "function"
    ? input.normalizeBrokerName
    : defaultNormalizeBrokerName;
}

function resolveNormalizeRequestedBroker(input = {}) {
  return typeof input.normalizeRequestedBroker === "function"
    ? input.normalizeRequestedBroker
    : defaultNormalizeRequestedBroker;
}

function normalizeChain(chain, normalizeBrokerName) {
  if (!Array.isArray(chain)) {
    return [];
  }

  return chain
    .map((broker) => normalizeBrokerName(broker))
    .filter((broker, index, collection) => collection.indexOf(broker) === index);
}

export function buildChartLiveContingencyLegend(selectedBroker, exchange) {
  return `Stream live em contingencia: ${String(selectedBroker).toUpperCase()} -> ${String(exchange).toUpperCase()}.`;
}

export function resolveChartLiveStreamBrokerSelection(input = {}) {
  const normalizeBrokerName = resolveNormalizeBrokerName(input);
  const normalizeRequestedBroker = resolveNormalizeRequestedBroker(input);
  const buildBrokerFailoverChain = typeof input.buildBrokerFailoverChain === "function"
    ? input.buildBrokerFailoverChain
    : (broker) => [normalizeBrokerName(broker)];

  const selectedRequestedBroker = normalizeRequestedBroker(input.requestedBroker);
  const selectedBroker = selectedRequestedBroker === "auto"
    ? normalizeBrokerName(input.autoBroker)
    : normalizeBrokerName(selectedRequestedBroker);
  const streamFailoverChain = normalizeChain(buildBrokerFailoverChain(selectedBroker), normalizeBrokerName);
  const exchange = streamFailoverChain[0] ?? selectedBroker;
  const isContingency = exchange !== selectedBroker;

  return {
    contingencyLegend: isContingency ? buildChartLiveContingencyLegend(selectedBroker, exchange) : "",
    exchange,
    isContingency,
    selectedBroker,
    selectedRequestedBroker,
    streamFailoverChain,
  };
}

export function resolveNextAutoBrokerAfterLiveFailure(input = {}) {
  const normalizeBrokerName = resolveNormalizeBrokerName(input);
  const normalizeRequestedBroker = resolveNormalizeRequestedBroker(input);
  const buildBrokerFailoverChain = typeof input.buildBrokerFailoverChain === "function"
    ? input.buildBrokerFailoverChain
    : (broker) => [normalizeBrokerName(broker)];
  const isBrokerCircuitOpen = typeof input.isBrokerCircuitOpen === "function"
    ? input.isBrokerCircuitOpen
    : () => false;
  const selectedRequestedBroker = normalizeRequestedBroker(input.selectedRequestedBroker);
  const exchange = normalizeBrokerName(input.exchange);

  if (selectedRequestedBroker !== "auto" || !isBrokerCircuitOpen(exchange)) {
    return null;
  }

  const failoverChain = normalizeChain(buildBrokerFailoverChain(exchange), normalizeBrokerName);
  return failoverChain.find((candidate) => candidate !== exchange) ?? null;
}
