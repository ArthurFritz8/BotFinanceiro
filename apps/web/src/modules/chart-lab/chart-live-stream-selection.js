function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function hasValidInterval(intervalMs) {
  return intervalMs !== null && intervalMs !== undefined && String(intervalMs).length > 0;
}

function withApiBaseUrl(apiBaseUrl, path) {
  return isNonEmptyString(apiBaseUrl) ? `${apiBaseUrl}${path}` : path;
}

export function buildCryptoLiveStreamKey(input = {}) {
  const resolution = isNonEmptyString(input.resolution) ? input.resolution : "1";
  return `${input.assetId}:${input.requestedBroker}:${input.exchange}:${input.range}:${resolution}:${input.intervalMs}`;
}

export function buildBinaryOptionsLiveStreamKey(input = {}) {
  return `${input.assetId}:binary:${input.requestedBroker}:${input.exchange}:${input.range}:${input.resolution}:${input.intervalMs}`;
}

export function buildCryptoLiveStreamUrl(input = {}) {
  const params = new URLSearchParams({
    assetId: input.assetId,
    exchange: input.exchange,
    intervalMs: String(input.intervalMs),
    range: input.range,
  });

  if (isNonEmptyString(input.resolution)) {
    params.set("resolution", input.resolution);
  }

  return withApiBaseUrl(input.apiBaseUrl, `/v1/crypto/live-stream?${params.toString()}`);
}

export function buildBinaryOptionsLiveStreamUrl(input = {}) {
  const params = new URLSearchParams({
    assetId: input.assetId,
    exchange: input.exchange,
    intervalMs: String(input.intervalMs),
    range: input.range,
    resolution: input.resolution,
  });

  return withApiBaseUrl(input.apiBaseUrl, `/v1/binary-options/live-stream?${params.toString()}`);
}

export function buildCryptoLiveStreamDescriptor(input = {}) {
  if (
    !isNonEmptyString(input.assetId)
    || !isNonEmptyString(input.requestedBroker)
    || !isNonEmptyString(input.exchange)
    || !isNonEmptyString(input.range)
    || !hasValidInterval(input.intervalMs)
  ) {
    return null;
  }

  return {
    streamKey: buildCryptoLiveStreamKey(input),
    streamUrl: buildCryptoLiveStreamUrl(input),
  };
}

export function buildBinaryOptionsLiveStreamDescriptor(input = {}) {
  if (
    !isNonEmptyString(input.assetId)
    || !isNonEmptyString(input.requestedBroker)
    || !isNonEmptyString(input.exchange)
    || !isNonEmptyString(input.range)
    || !isNonEmptyString(input.resolution)
    || !hasValidInterval(input.intervalMs)
  ) {
    return null;
  }

  return {
    streamKey: buildBinaryOptionsLiveStreamKey(input),
    streamUrl: buildBinaryOptionsLiveStreamUrl(input),
  };
}
