import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBinaryOptionsLiveStreamDescriptor,
  buildBinaryOptionsLiveStreamKey,
  buildCryptoLiveStreamDescriptor,
  buildCryptoLiveStreamKey,
} from "../src/modules/chart-lab/chart-live-stream-selection.js";

test("Chart live stream selection monta descriptor cripto com key e URL canonicas", () => {
  const descriptor = buildCryptoLiveStreamDescriptor({
    apiBaseUrl: "https://api.example.test",
    assetId: "bitcoin",
    exchange: "binance",
    intervalMs: 5000,
    range: "7d",
    requestedBroker: "auto",
    resolution: "1h",
  });

  assert.deepEqual(descriptor, {
    streamKey: "bitcoin:auto:binance:7d:1h:5000",
    streamUrl: "https://api.example.test/v1/crypto/live-stream?assetId=bitcoin&exchange=binance&intervalMs=5000&range=7d&resolution=1h",
  });
});

test("Chart live stream selection preserva fallback de resolucao cripto na key", () => {
  assert.equal(
    buildCryptoLiveStreamKey({
      assetId: "ethereum",
      exchange: "bybit",
      intervalMs: 4000,
      range: "24h",
      requestedBroker: "bybit",
      resolution: null,
    }),
    "ethereum:bybit:bybit:24h:1:4000",
  );

  const descriptor = buildCryptoLiveStreamDescriptor({
    assetId: "ethereum",
    exchange: "bybit",
    intervalMs: 4000,
    range: "24h",
    requestedBroker: "bybit",
    resolution: null,
  });

  assert.equal(
    descriptor.streamUrl,
    "/v1/crypto/live-stream?assetId=ethereum&exchange=bybit&intervalMs=4000&range=24h",
  );
});

test("Chart live stream selection monta descriptor de binarias com resolucao obrigatoria", () => {
  const descriptor = buildBinaryOptionsLiveStreamDescriptor({
    assetId: "solana",
    exchange: "binance",
    intervalMs: 1000,
    range: "24h",
    requestedBroker: "auto",
    resolution: "1S",
  });

  assert.deepEqual(descriptor, {
    streamKey: "solana:binary:auto:binance:24h:1S:1000",
    streamUrl: "/v1/binary-options/live-stream?assetId=solana&exchange=binance&intervalMs=1000&range=24h&resolution=1S",
  });

  assert.equal(
    buildBinaryOptionsLiveStreamKey({
      assetId: "solana",
      exchange: "binance",
      intervalMs: 1000,
      range: "24h",
      requestedBroker: "auto",
      resolution: "1S",
    }),
    descriptor.streamKey,
  );
});

test("Chart live stream selection rejeita selecao live incompleta", () => {
  assert.equal(buildCryptoLiveStreamDescriptor({ assetId: "", exchange: "binance", intervalMs: 5000, range: "7d", requestedBroker: "auto" }), null);
  assert.equal(buildCryptoLiveStreamDescriptor({ assetId: "bitcoin", exchange: "", intervalMs: 5000, range: "7d", requestedBroker: "auto" }), null);
  assert.equal(buildBinaryOptionsLiveStreamDescriptor({ assetId: "bitcoin", exchange: "binance", intervalMs: 1000, range: "24h", requestedBroker: "auto", resolution: "" }), null);
});
