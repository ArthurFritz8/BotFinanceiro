const POSITION_CALC_STORAGE_KEY = "botfinanceiro:position-calc:v1";

export const POSITION_CALC_PROFILES = [
  { id: "conservative", label: "Conservador", riskMin: 0.5, riskMax: 1.0, default: 0.75 },
  { id: "moderate", label: "Moderado", riskMin: 1.0, riskMax: 2.0, default: 1.5 },
  { id: "aggressive", label: "Agressivo", riskMin: 2.0, riskMax: 3.0, default: 2.5 },
];

function clampNumber(value, minimum, maximum) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

function toFiniteNumber(value, fallback = 0) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return value;
}

function roundNumber(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function compactAssetId(assetId) {
  return String(assetId ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const FOREX_FIAT_CODES = new Set([
  "aud", "brl", "cad", "chf", "cnh", "cny", "eur", "gbp", "hkd", "jpy", "mxn", "nzd", "sek", "sgd", "try", "usd", "zar",
]);

const CRYPTO_ASSET_ALIASES = new Set([
  "1inch", "aave", "ada", "apt", "aptos", "arb", "arbitrum", "atom", "avax", "avalanche", "bch", "bitcoin", "bnb", "btc", "btcusd", "btcusdt", "cardano", "chainlink", "doge", "dogecoin", "dot", "eth", "ethereum", "fil", "filecoin", "icp", "internetcomputer", "link", "litecoin", "ltc", "matic", "maker", "mkr", "monero", "near", "optimism", "op", "pol", "polkadot", "polygon", "ripple", "shib", "shibainu", "sol", "solana", "stellar", "sui", "ton", "toncoin", "tron", "trx", "uni", "uniswap", "usdt", "xmr", "xrp", "xlm",
]);

const INDEX_ASSET_SPECS = [
  { aliases: ["spx500", "sp500", "us500", "gspc", "spy"], label: "SPX500", defaultSpreadPips: 0.6 },
  { aliases: ["nas100", "us100", "ndx", "nasdaq100", "qqq"], label: "NAS100", defaultSpreadPips: 1.5 },
  { aliases: ["us30", "dow30", "dji", "djia"], label: "US30", defaultSpreadPips: 2 },
  { aliases: ["ger40", "de40", "dax", "dax40"], label: "GER40", defaultSpreadPips: 1 },
  { aliases: ["uk100", "ftse", "ftse100"], label: "UK100", defaultSpreadPips: 1 },
  { aliases: ["cac40", "fr40"], label: "CAC40", defaultSpreadPips: 1 },
  { aliases: ["jp225", "nikkei", "nikkei225"], label: "JP225", defaultSpreadPips: 8 },
  { aliases: ["hk50", "hsi", "hangseng"], label: "HK50", defaultSpreadPips: 8 },
];

const COMMODITY_ASSET_SPECS = [
  { aliases: ["xau", "xauusd", "gold", "ouro"], label: "XAUUSD", contractSize: 100, contractUnit: "oz", pipSize: 0.01, defaultSpreadPips: 30 },
  { aliases: ["xag", "xagusd", "silver", "prata"], label: "XAGUSD", contractSize: 5000, contractUnit: "oz", pipSize: 0.001, defaultSpreadPips: 30 },
  { aliases: ["wti", "usoil", "uscrude", "cl"], label: "WTI", contractSize: 1000, contractUnit: "barris", pipSize: 0.01, defaultSpreadPips: 4 },
  { aliases: ["brent", "ukoil", "ukcrude"], label: "BRENT", contractSize: 1000, contractUnit: "barris", pipSize: 0.01, defaultSpreadPips: 4 },
  { aliases: ["ngas", "naturalgas"], label: "NGAS", contractSize: 10000, contractUnit: "MMBtu", pipSize: 0.001, defaultSpreadPips: 8 },
];

function findSpecByAlias(specs, compactId) {
  return specs.find((spec) => spec.aliases.some((alias) => compactId === alias || compactId.includes(alias)));
}

function isForexPair(compactId) {
  if (compactId.length !== 6) {
    return false;
  }

  return FOREX_FIAT_CODES.has(compactId.slice(0, 3)) && FOREX_FIAT_CODES.has(compactId.slice(3));
}

function isCryptoAsset(compactId) {
  if (CRYPTO_ASSET_ALIASES.has(compactId)) {
    return true;
  }

  return /(?:btc|eth|usdt|usdc|bnb|sol|xrp|ada|doge|dot|avax|matic)$/.test(compactId);
}

function usesPipValueModel(spec) {
  return Number.isFinite(spec?.pipSize) && spec.pipSize > 0
    && Number.isFinite(spec?.contractSize) && spec.contractSize > 0
    && spec.kind !== "crypto"
    && spec.kind !== "generic";
}

export function classifyPositionAssetSpec(assetId, currency) {
  const id = compactAssetId(assetId);

  if (isForexPair(id)) {
    const isJpy = id.endsWith("jpy");
    return {
      kind: "forex",
      label: id.toUpperCase(),
      pipSize: isJpy ? 0.01 : 0.0001,
      contractSize: 100000,
      contractUnit: "moeda base",
      lotMin: 0.01,
      lotStep: 0.01,
      lotDecimals: 2,
      defaultSpreadPips: 0.8,
      unitLabel: "lote",
      pipLabel: "pips",
      isFallback: false,
      pricingModel: "pip-value",
    };
  }

  const indexSpec = findSpecByAlias(INDEX_ASSET_SPECS, id);
  if (indexSpec) {
    return {
      kind: "index",
      label: indexSpec.label,
      pipSize: 1,
      contractSize: 1,
      contractUnit: "USD/ponto",
      lotMin: 0.01,
      lotStep: 0.01,
      lotDecimals: 2,
      defaultSpreadPips: indexSpec.defaultSpreadPips,
      unitLabel: "contratos",
      pipLabel: "pontos",
      isFallback: false,
      pricingModel: "linear-contract",
    };
  }

  const commoditySpec = findSpecByAlias(COMMODITY_ASSET_SPECS, id);
  if (commoditySpec) {
    return {
      kind: "commodity",
      label: commoditySpec.label,
      pipSize: commoditySpec.pipSize,
      contractSize: commoditySpec.contractSize,
      contractUnit: commoditySpec.contractUnit,
      lotMin: 0.01,
      lotStep: 0.01,
      lotDecimals: 2,
      defaultSpreadPips: commoditySpec.defaultSpreadPips,
      unitLabel: "lotes",
      pipLabel: "ticks",
      isFallback: false,
      pricingModel: "linear-contract",
    };
  }

  if (isCryptoAsset(id)) {
    return {
      kind: "crypto",
      label: id.toUpperCase() || "CRYPTO",
      pipSize: null,
      contractSize: 1,
      contractUnit: "unidade base",
      lotMin: 0.0001,
      lotStep: 0.0001,
      lotDecimals: 4,
      defaultSpreadPips: 0,
      unitLabel: "unidades",
      pipLabel: "ticks",
      currency,
      isFallback: false,
      pricingModel: "unit-notional",
    };
  }

  return {
    kind: "generic",
    label: id.toUpperCase() || "ATIVO",
    pipSize: null,
    contractSize: 1,
    contractUnit: "unidade",
    lotMin: 0.0001,
    lotStep: 0.0001,
    lotDecimals: 4,
    defaultSpreadPips: 0,
    unitLabel: "unidades",
    pipLabel: "ticks",
    currency,
    isFallback: true,
    pricingModel: "unit-notional",
  };
}

export function describePositionAssetSpec(spec) {
  if (!spec || typeof spec !== "object") {
    return "Especificacao indisponivel. Calculo bloqueado ate receber um ativo valido.";
  }

  if (spec.isFallback) {
    return `Sem especificacao cadastrada para ${spec.label}. O calculo usa unidade/notional bruto; confirme contrato, tick e lote minimo no seu broker antes de executar.`;
  }

  if (spec.kind === "forex") {
    return `Contrato padrao ${spec.contractSize.toLocaleString("pt-BR")} (${spec.contractUnit}), pip ${spec.pipSize}, spread medio ${spec.defaultSpreadPips} ${spec.pipLabel}.`;
  }

  if (spec.kind === "index") {
    return `CFD padrao ${spec.contractSize} ${spec.contractUnit} por contrato, tick ${spec.pipSize} ponto, spread medio ${spec.defaultSpreadPips} ${spec.pipLabel}.`;
  }

  if (spec.kind === "commodity") {
    return `Contrato padrao ${spec.contractSize.toLocaleString("pt-BR")} ${spec.contractUnit} por lote, tick ${spec.pipSize}, spread medio ${spec.defaultSpreadPips} ${spec.pipLabel}.`;
  }

  return "Notional em unidades base; spread padrao zero e risco calculado pela distancia absoluta entre entrada e stop.";
}

export function loadPositionCalcState(defaults) {
  try {
    const raw = globalThis.window?.localStorage?.getItem(POSITION_CALC_STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...defaults };
    return {
      capital: Number.isFinite(parsed.capital) ? parsed.capital : defaults.capital,
      profile: typeof parsed.profile === "string" ? parsed.profile : defaults.profile,
      spreadPips: Number.isFinite(parsed.spreadPips) ? parsed.spreadPips : defaults.spreadPips,
    };
  } catch (_error) {
    return { ...defaults };
  }
}

export function persistPositionCalcState(state) {
  try {
    globalThis.window?.localStorage?.setItem(POSITION_CALC_STORAGE_KEY, JSON.stringify(state));
  } catch (_error) {
    /* noop */
  }
}

export function computePositionCalc({ capital, riskPct, signal, spec, spreadPips }) {
  const safeCapital = Math.max(0, toFiniteNumber(capital, 0));
  const safeRiskPct = clampNumber(toFiniteNumber(riskPct, 1), 0.05, 25);
  const entry = toFiniteNumber(signal?.entryLow, Number.NaN);
  const stop = toFiniteNumber(signal?.stopLoss, Number.NaN);
  const tp1 = toFiniteNumber(signal?.takeProfit1, Number.NaN);
  const tp2 = toFiniteNumber(signal?.takeProfit2, Number.NaN);
  const tp3 = toFiniteNumber(signal?.takeProfit3 ?? signal?.takeProfit2, Number.NaN);
  const ready = safeCapital > 0 && Number.isFinite(entry) && Number.isFinite(stop) && entry !== stop;
  if (!ready) {
    return { ready: false, capital: safeCapital, riskPct: safeRiskPct };
  }
  const riskBudget = safeCapital * (safeRiskPct / 100);
  const stopDistanceAbs = Math.abs(entry - stop);
  const isLong = entry > stop;

  const pipSize = spec.pipSize;
  const stopDistancePips = pipSize ? stopDistanceAbs / pipSize : null;
  const pipValueModel = usesPipValueModel(spec);
  let suggestedLot;
  let pipValuePerLot;
  if (pipValueModel) {
    pipValuePerLot = spec.contractSize * pipSize;
    const riskPerLot = stopDistancePips * pipValuePerLot;
    suggestedLot = riskPerLot > 0 ? riskBudget / riskPerLot : 0;
  } else {
    pipValuePerLot = entry;
    suggestedLot = stopDistanceAbs > 0 ? riskBudget / stopDistanceAbs : 0;
  }

  const lotStep = spec.lotStep;
  const lotMin = spec.lotMin;
  let recommendedLot = Math.floor(suggestedLot / lotStep) * lotStep;
  if (recommendedLot < lotMin) recommendedLot = lotMin;
  recommendedLot = roundNumber(recommendedLot, 4);

  const actualRisk = pipValueModel
    ? recommendedLot * stopDistancePips * pipValuePerLot
    : recommendedLot * stopDistanceAbs;
  const actualRiskPct = safeCapital > 0 ? (actualRisk / safeCapital) * 100 : 0;
  const exceedsRisk = actualRiskPct > safeRiskPct * 1.05;

  const safeSpreadPips = clampNumber(toFiniteNumber(spreadPips, spec.defaultSpreadPips), 0, 50);
  const spreadCost = pipValueModel
    ? recommendedLot * safeSpreadPips * pipValuePerLot
    : recommendedLot * (safeSpreadPips * (pipSize ?? entry * 0.0001));

  const tps = [tp1, tp2, tp3].map((tpPrice, index) => {
    if (!Number.isFinite(tpPrice)) return null;
    const distAbs = Math.abs(tpPrice - entry);
    const distPips = pipSize ? distAbs / pipSize : null;
    const profit = pipValueModel
      ? recommendedLot * (distPips ?? 0) * pipValuePerLot
      : recommendedLot * distAbs;
    const gainPct = safeCapital > 0 ? (profit / safeCapital) * 100 : 0;
    const rr = stopDistanceAbs > 0 ? distAbs / stopDistanceAbs : 0;
    return {
      label: `TP${index + 1}`,
      price: tpPrice,
      profit,
      gainPct,
      distPips,
      distAbs,
      riskReward: rr,
      direction: isLong ? "long" : "short",
    };
  });

  const scenarios = POSITION_CALC_PROFILES.map((profile) => {
    const profileRisk = safeCapital * (profile.default / 100);
    let lot = pipValueModel
      ? profileRisk / Math.max(stopDistancePips * pipValuePerLot, 1e-9)
      : profileRisk / Math.max(stopDistanceAbs, 1e-9);
    lot = Math.floor(lot / lotStep) * lotStep;
    if (lot < lotMin) lot = lotMin;
    lot = roundNumber(lot, 4);
    const realRisk = pipValueModel
      ? lot * stopDistancePips * pipValuePerLot
      : lot * stopDistanceAbs;
    const realRiskPct = safeCapital > 0 ? (realRisk / safeCapital) * 100 : 0;
    const tp1Profit = Number.isFinite(tp1)
      ? pipValueModel
        ? lot * (Math.abs(tp1 - entry) / pipSize) * pipValuePerLot
        : lot * Math.abs(tp1 - entry)
      : 0;
    return {
      id: profile.id,
      label: profile.label,
      lot,
      risk: realRisk,
      riskPct: realRiskPct,
      tp1Profit,
    };
  });

  return {
    ready: true,
    capital: safeCapital,
    riskPct: safeRiskPct,
    riskBudget,
    entry,
    stop,
    isLong,
    stopDistanceAbs,
    stopDistancePips,
    recommendedLot,
    actualRisk,
    actualRiskPct,
    exceedsRisk,
    spreadPips: safeSpreadPips,
    spreadCost,
    pipValuePerLot,
    pipValueModel,
    tps,
    scenarios,
    spec,
  };
}

export function formatPositionLot(value, spec) {
  if (!Number.isFinite(value)) return "—";
  const decimals = Number.isInteger(spec?.lotDecimals) ? spec.lotDecimals : spec.kind === "forex" ? 2 : 4;
  return `${value.toFixed(decimals)} ${spec.unitLabel}`;
}
