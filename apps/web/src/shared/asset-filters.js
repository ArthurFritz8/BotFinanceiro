import { createCounter } from "@botfinanceiro/shared-utils";

const OTC_PATTERN = /\botc\b/i;
const SYNTHETIC_PATTERN = /\b(synthetic|sintetico|sintético)\b/i;

const filterCounter = createCounter();

function getField(asset, key) {
  if (asset === null || typeof asset !== "object") {
    return "";
  }

  const value = asset[key];

  if (typeof value !== "string") {
    return "";
  }

  return value;
}

function matchesAny(asset, pattern) {
  return (
    pattern.test(getField(asset, "assetId")) ||
    pattern.test(getField(asset, "symbol")) ||
    pattern.test(getField(asset, "label")) ||
    pattern.test(getField(asset, "exchange"))
  );
}

export function isOtcAsset(asset) {
  return matchesAny(asset, OTC_PATTERN);
}

export function isSyntheticAsset(asset) {
  return matchesAny(asset, SYNTHETIC_PATTERN);
}

export function filterOutOtc(assets) {
  if (!Array.isArray(assets)) {
    return [];
  }

  const allowed = [];

  for (const asset of assets) {
    if (isOtcAsset(asset)) {
      filterCounter.increment("otc");
      continue;
    }

    if (isSyntheticAsset(asset)) {
      filterCounter.increment("synthetic");
      continue;
    }

    allowed.push(asset);
  }

  return allowed;
}

export function getAssetFilterSnapshot() {
  return filterCounter.snapshot();
}

export function resetAssetFilterCounter() {
  filterCounter.reset();
}
