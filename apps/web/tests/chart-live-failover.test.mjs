import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChartLiveContingencyLegend,
  resolveChartLiveStreamBrokerSelection,
  resolveNextAutoBrokerAfterLiveFailure,
} from "../src/modules/chart-lab/chart-live-failover.js";

const normalizeBrokerName = (broker) => {
  const normalized = String(broker ?? "").trim().toLowerCase();
  return ["binance", "bybit", "coinbase", "kraken", "okx"].includes(normalized) ? normalized : "binance";
};

const normalizeRequestedBroker = (broker) => {
  const normalized = String(broker ?? "").trim().toLowerCase();
  return normalized === "auto" ? "auto" : normalizeBrokerName(normalized);
};

test("Chart live failover resolve broker auto usando preferencia atual", () => {
  const selection = resolveChartLiveStreamBrokerSelection({
    autoBroker: "bybit",
    buildBrokerFailoverChain: (broker) => [broker, "binance", "okx"],
    normalizeBrokerName,
    normalizeRequestedBroker,
    requestedBroker: "auto",
  });

  assert.deepEqual(selection, {
    contingencyLegend: "",
    exchange: "bybit",
    isContingency: false,
    selectedBroker: "bybit",
    selectedRequestedBroker: "auto",
    streamFailoverChain: ["bybit", "binance", "okx"],
  });
});

test("Chart live failover gera contingencia quando primary esta em circuito", () => {
  const selection = resolveChartLiveStreamBrokerSelection({
    autoBroker: "binance",
    buildBrokerFailoverChain: () => ["okx", "binance", "bybit"],
    normalizeBrokerName,
    normalizeRequestedBroker,
    requestedBroker: "auto",
  });

  assert.equal(selection.selectedBroker, "binance");
  assert.equal(selection.exchange, "okx");
  assert.equal(selection.isContingency, true);
  assert.equal(selection.contingencyLegend, "Stream live em contingencia: BINANCE -> OKX.");
  assert.equal(buildChartLiveContingencyLegend("kraken", "coinbase"), "Stream live em contingencia: KRAKEN -> COINBASE.");
});

test("Chart live failover respeita broker manual", () => {
  const selection = resolveChartLiveStreamBrokerSelection({
    autoBroker: "binance",
    buildBrokerFailoverChain: (broker) => [broker, "binance"],
    normalizeBrokerName,
    normalizeRequestedBroker,
    requestedBroker: "coinbase",
  });

  assert.equal(selection.selectedRequestedBroker, "coinbase");
  assert.equal(selection.selectedBroker, "coinbase");
  assert.equal(selection.exchange, "coinbase");
});

test("Chart live failover escolhe proximo broker apenas em auto com circuito aberto", () => {
  const baseInput = {
    buildBrokerFailoverChain: () => ["binance", "kraken", "okx"],
    exchange: "binance",
    isBrokerCircuitOpen: (broker) => broker === "binance",
    normalizeBrokerName,
    normalizeRequestedBroker,
  };

  assert.equal(resolveNextAutoBrokerAfterLiveFailure({
    ...baseInput,
    selectedRequestedBroker: "auto",
  }), "kraken");
  assert.equal(resolveNextAutoBrokerAfterLiveFailure({
    ...baseInput,
    selectedRequestedBroker: "binance",
  }), null);
  assert.equal(resolveNextAutoBrokerAfterLiveFailure({
    ...baseInput,
    exchange: "okx",
    selectedRequestedBroker: "auto",
  }), null);
});
