/**
 * ASSET CATALOG — single source of truth para a lista de criptoativos suportados
 * e seus simbolos por broker (Binance, Bybit, Coinbase, Kraken, OKX).
 *
 * Cada entrada lista o assetId canonico (compativel com CoinGecko id), o nome
 * de exibicao, o ticker curto e os pares por broker. Brokers sem suporte ao
 * ativo recebem `null` — a UI usa essa info para sinalizar disponibilidade.
 *
 * Referencias:
 * - Binance: https://api.binance.com/api/v3/exchangeInfo
 * - Bybit: https://api.bybit.com/v5/market/instruments-info?category=spot
 * - Coinbase: https://api.exchange.coinbase.com/products
 * - Kraken: https://api.kraken.com/0/public/AssetPairs (XBT alias para BTC)
 * - OKX: https://www.okx.com/api/v5/public/instruments?instType=SPOT
 *
 * IMPORTANTE: ao adicionar um ativo, validar manualmente se o par existe em
 * cada broker. Se nao existir em algum, marcar como `null` em vez de inventar.
 */

export type AssetCatalogBroker = "binance" | "bybit" | "coinbase" | "kraken" | "okx";

export interface AssetCatalogEntry {
  /** Identificador canonico (compativel com `coins/markets` da CoinGecko). */
  id: string;
  /** Nome de exibicao curto (ex.: "Bitcoin"). */
  name: string;
  /** Ticker curto em maiusculo (ex.: "BTC"). */
  symbol: string;
  /** Mapeamento de pares por broker. `null` quando o broker nao lista o ativo. */
  brokerPairs: Record<AssetCatalogBroker, string | null>;
  /** Ranking aproximado por capitalizacao (1 = top). Auxilia ordenacao na UI. */
  rank: number;
}

/**
 * Lista curada das principais criptos do mercado spot global. Cobre os
 * top-60 por market cap (excluindo stablecoins e wrapped tokens, que nao
 * fazem sentido para analise tecnica). Ordenada por `rank` para a UI.
 */
const ASSET_CATALOG_RAW: AssetCatalogEntry[] = [
  {
    brokerPairs: { binance: "BTCUSDT", bybit: "BTCUSDT", coinbase: "BTC-USD", kraken: "XBTUSD", okx: "BTC-USDT" },
    id: "bitcoin",
    name: "Bitcoin",
    rank: 1,
    symbol: "BTC",
  },
  {
    brokerPairs: { binance: "ETHUSDT", bybit: "ETHUSDT", coinbase: "ETH-USD", kraken: "ETHUSD", okx: "ETH-USDT" },
    id: "ethereum",
    name: "Ethereum",
    rank: 2,
    symbol: "ETH",
  },
  {
    brokerPairs: { binance: "BNBUSDT", bybit: "BNBUSDT", coinbase: null, kraken: null, okx: "BNB-USDT" },
    id: "binancecoin",
    name: "BNB",
    rank: 3,
    symbol: "BNB",
  },
  {
    brokerPairs: { binance: "SOLUSDT", bybit: "SOLUSDT", coinbase: "SOL-USD", kraken: "SOLUSD", okx: "SOL-USDT" },
    id: "solana",
    name: "Solana",
    rank: 4,
    symbol: "SOL",
  },
  {
    brokerPairs: { binance: "XRPUSDT", bybit: "XRPUSDT", coinbase: "XRP-USD", kraken: "XRPUSD", okx: "XRP-USDT" },
    id: "xrp",
    name: "XRP",
    rank: 5,
    symbol: "XRP",
  },
  {
    brokerPairs: { binance: "DOGEUSDT", bybit: "DOGEUSDT", coinbase: "DOGE-USD", kraken: "DOGEUSD", okx: "DOGE-USDT" },
    id: "dogecoin",
    name: "Dogecoin",
    rank: 6,
    symbol: "DOGE",
  },
  {
    brokerPairs: { binance: "ADAUSDT", bybit: "ADAUSDT", coinbase: "ADA-USD", kraken: "ADAUSD", okx: "ADA-USDT" },
    id: "cardano",
    name: "Cardano",
    rank: 7,
    symbol: "ADA",
  },
  {
    brokerPairs: { binance: "TRXUSDT", bybit: "TRXUSDT", coinbase: "TRX-USD", kraken: "TRXUSD", okx: "TRX-USDT" },
    id: "tron",
    name: "TRON",
    rank: 8,
    symbol: "TRX",
  },
  {
    brokerPairs: { binance: "AVAXUSDT", bybit: "AVAXUSDT", coinbase: "AVAX-USD", kraken: "AVAXUSD", okx: "AVAX-USDT" },
    id: "avalanche-2",
    name: "Avalanche",
    rank: 9,
    symbol: "AVAX",
  },
  {
    brokerPairs: { binance: "LINKUSDT", bybit: "LINKUSDT", coinbase: "LINK-USD", kraken: "LINKUSD", okx: "LINK-USDT" },
    id: "chainlink",
    name: "Chainlink",
    rank: 10,
    symbol: "LINK",
  },
  {
    brokerPairs: { binance: "DOTUSDT", bybit: "DOTUSDT", coinbase: "DOT-USD", kraken: "DOTUSD", okx: "DOT-USDT" },
    id: "polkadot",
    name: "Polkadot",
    rank: 11,
    symbol: "DOT",
  },
  {
    brokerPairs: { binance: "MATICUSDT", bybit: "MATICUSDT", coinbase: "MATIC-USD", kraken: "MATICUSD", okx: "MATIC-USDT" },
    id: "polygon-pos",
    name: "Polygon",
    rank: 12,
    symbol: "MATIC",
  },
  {
    brokerPairs: { binance: "LTCUSDT", bybit: "LTCUSDT", coinbase: "LTC-USD", kraken: "LTCUSD", okx: "LTC-USDT" },
    id: "litecoin",
    name: "Litecoin",
    rank: 13,
    symbol: "LTC",
  },
  {
    brokerPairs: { binance: "BCHUSDT", bybit: "BCHUSDT", coinbase: "BCH-USD", kraken: "BCHUSD", okx: "BCH-USDT" },
    id: "bitcoin-cash",
    name: "Bitcoin Cash",
    rank: 14,
    symbol: "BCH",
  },
  {
    brokerPairs: { binance: "UNIUSDT", bybit: "UNIUSDT", coinbase: "UNI-USD", kraken: "UNIUSD", okx: "UNI-USDT" },
    id: "uniswap",
    name: "Uniswap",
    rank: 15,
    symbol: "UNI",
  },
  {
    brokerPairs: { binance: "ATOMUSDT", bybit: "ATOMUSDT", coinbase: "ATOM-USD", kraken: "ATOMUSD", okx: "ATOM-USDT" },
    id: "cosmos",
    name: "Cosmos",
    rank: 16,
    symbol: "ATOM",
  },
  {
    brokerPairs: { binance: "XLMUSDT", bybit: "XLMUSDT", coinbase: "XLM-USD", kraken: "XLMUSD", okx: "XLM-USDT" },
    id: "stellar",
    name: "Stellar",
    rank: 17,
    symbol: "XLM",
  },
  {
    brokerPairs: { binance: "ETCUSDT", bybit: "ETCUSDT", coinbase: "ETC-USD", kraken: "ETCUSD", okx: "ETC-USDT" },
    id: "ethereum-classic",
    name: "Ethereum Classic",
    rank: 18,
    symbol: "ETC",
  },
  {
    brokerPairs: { binance: "FILUSDT", bybit: "FILUSDT", coinbase: "FIL-USD", kraken: "FILUSD", okx: "FIL-USDT" },
    id: "filecoin",
    name: "Filecoin",
    rank: 19,
    symbol: "FIL",
  },
  {
    brokerPairs: { binance: "AAVEUSDT", bybit: "AAVEUSDT", coinbase: "AAVE-USD", kraken: "AAVEUSD", okx: "AAVE-USDT" },
    id: "aave",
    name: "Aave",
    rank: 20,
    symbol: "AAVE",
  },
  {
    brokerPairs: { binance: "ALGOUSDT", bybit: "ALGOUSDT", coinbase: "ALGO-USD", kraken: "ALGOUSD", okx: "ALGO-USDT" },
    id: "algorand",
    name: "Algorand",
    rank: 21,
    symbol: "ALGO",
  },
  {
    brokerPairs: { binance: "NEARUSDT", bybit: "NEARUSDT", coinbase: "NEAR-USD", kraken: "NEARUSD", okx: "NEAR-USDT" },
    id: "near",
    name: "NEAR Protocol",
    rank: 22,
    symbol: "NEAR",
  },
  {
    brokerPairs: { binance: "APTUSDT", bybit: "APTUSDT", coinbase: "APT-USD", kraken: "APTUSD", okx: "APT-USDT" },
    id: "aptos",
    name: "Aptos",
    rank: 23,
    symbol: "APT",
  },
  {
    brokerPairs: { binance: "ARBUSDT", bybit: "ARBUSDT", coinbase: "ARB-USD", kraken: "ARBUSD", okx: "ARB-USDT" },
    id: "arbitrum",
    name: "Arbitrum",
    rank: 24,
    symbol: "ARB",
  },
  {
    brokerPairs: { binance: "OPUSDT", bybit: "OPUSDT", coinbase: "OP-USD", kraken: "OPUSD", okx: "OP-USDT" },
    id: "optimism",
    name: "Optimism",
    rank: 25,
    symbol: "OP",
  },
  {
    brokerPairs: { binance: "MKRUSDT", bybit: "MKRUSDT", coinbase: "MKR-USD", kraken: "MKRUSD", okx: "MKR-USDT" },
    id: "maker",
    name: "Maker",
    rank: 26,
    symbol: "MKR",
  },
  {
    brokerPairs: { binance: "SANDUSDT", bybit: "SANDUSDT", coinbase: "SAND-USD", kraken: "SANDUSD", okx: "SAND-USDT" },
    id: "the-sandbox",
    name: "The Sandbox",
    rank: 27,
    symbol: "SAND",
  },
  {
    brokerPairs: { binance: "MANAUSDT", bybit: "MANAUSDT", coinbase: "MANA-USD", kraken: "MANAUSD", okx: "MANA-USDT" },
    id: "decentraland",
    name: "Decentraland",
    rank: 28,
    symbol: "MANA",
  },
  {
    brokerPairs: { binance: "INJUSDT", bybit: "INJUSDT", coinbase: "INJ-USD", kraken: "INJUSD", okx: "INJ-USDT" },
    id: "injective-protocol",
    name: "Injective",
    rank: 29,
    symbol: "INJ",
  },
  {
    brokerPairs: { binance: "SUIUSDT", bybit: "SUIUSDT", coinbase: "SUI-USD", kraken: "SUIUSD", okx: "SUI-USDT" },
    id: "sui",
    name: "Sui",
    rank: 30,
    symbol: "SUI",
  },
  {
    brokerPairs: { binance: "SHIBUSDT", bybit: "SHIBUSDT", coinbase: "SHIB-USD", kraken: "SHIBUSD", okx: "SHIB-USDT" },
    id: "shiba-inu",
    name: "Shiba Inu",
    rank: 31,
    symbol: "SHIB",
  },
  {
    brokerPairs: { binance: "ICPUSDT", bybit: "ICPUSDT", coinbase: "ICP-USD", kraken: "ICPUSD", okx: "ICP-USDT" },
    id: "internet-computer",
    name: "Internet Computer",
    rank: 32,
    symbol: "ICP",
  },
  {
    brokerPairs: { binance: "PEPEUSDT", bybit: "PEPEUSDT", coinbase: "PEPE-USD", kraken: "PEPEUSD", okx: "PEPE-USDT" },
    id: "pepe",
    name: "Pepe",
    rank: 33,
    symbol: "PEPE",
  },
  {
    brokerPairs: { binance: "HBARUSDT", bybit: "HBARUSDT", coinbase: "HBAR-USD", kraken: "HBARUSD", okx: "HBAR-USDT" },
    id: "hedera-hashgraph",
    name: "Hedera",
    rank: 34,
    symbol: "HBAR",
  },
  {
    brokerPairs: { binance: null, bybit: "TAOUSDT", coinbase: "TAO-USD", kraken: "TAOUSD", okx: "TAO-USDT" },
    id: "bittensor",
    name: "Bittensor",
    rank: 35,
    symbol: "TAO",
  },
  {
    brokerPairs: { binance: "RNDRUSDT", bybit: "RNDRUSDT", coinbase: "RNDR-USD", kraken: "RNDRUSD", okx: "RNDR-USDT" },
    id: "render-token",
    name: "Render",
    rank: 36,
    symbol: "RNDR",
  },
  {
    brokerPairs: { binance: "IMXUSDT", bybit: "IMXUSDT", coinbase: "IMX-USD", kraken: "IMXUSD", okx: "IMX-USDT" },
    id: "immutable-x",
    name: "Immutable",
    rank: 37,
    symbol: "IMX",
  },
  {
    brokerPairs: { binance: "FETUSDT", bybit: "FETUSDT", coinbase: "FET-USD", kraken: "FETUSD", okx: "FET-USDT" },
    id: "fetch-ai",
    name: "Fetch.ai",
    rank: 38,
    symbol: "FET",
  },
  {
    brokerPairs: { binance: "GRTUSDT", bybit: "GRTUSDT", coinbase: "GRT-USD", kraken: "GRTUSD", okx: "GRT-USDT" },
    id: "the-graph",
    name: "The Graph",
    rank: 39,
    symbol: "GRT",
  },
  {
    brokerPairs: { binance: "VETUSDT", bybit: "VETUSDT", coinbase: "VET-USD", kraken: null, okx: "VET-USDT" },
    id: "vechain",
    name: "VeChain",
    rank: 40,
    symbol: "VET",
  },
  {
    brokerPairs: { binance: "TIAUSDT", bybit: "TIAUSDT", coinbase: "TIA-USD", kraken: "TIAUSD", okx: "TIA-USDT" },
    id: "celestia",
    name: "Celestia",
    rank: 41,
    symbol: "TIA",
  },
  {
    brokerPairs: { binance: "SEIUSDT", bybit: "SEIUSDT", coinbase: "SEI-USD", kraken: "SEIUSD", okx: "SEI-USDT" },
    id: "sei-network",
    name: "Sei",
    rank: 42,
    symbol: "SEI",
  },
  {
    brokerPairs: { binance: "ONDOUSDT", bybit: "ONDOUSDT", coinbase: "ONDO-USD", kraken: "ONDOUSD", okx: "ONDO-USDT" },
    id: "ondo-finance",
    name: "Ondo",
    rank: 43,
    symbol: "ONDO",
  },
  {
    brokerPairs: { binance: "PYTHUSDT", bybit: "PYTHUSDT", coinbase: "PYTH-USD", kraken: "PYTHUSD", okx: "PYTH-USDT" },
    id: "pyth-network",
    name: "Pyth Network",
    rank: 44,
    symbol: "PYTH",
  },
  {
    brokerPairs: { binance: "JUPUSDT", bybit: "JUPUSDT", coinbase: "JUP-USD", kraken: "JUPUSD", okx: "JUP-USDT" },
    id: "jupiter-exchange-solana",
    name: "Jupiter",
    rank: 45,
    symbol: "JUP",
  },
  {
    brokerPairs: { binance: "WLDUSDT", bybit: "WLDUSDT", coinbase: "WLD-USD", kraken: "WLDUSD", okx: "WLD-USDT" },
    id: "worldcoin-wld",
    name: "Worldcoin",
    rank: 46,
    symbol: "WLD",
  },
  {
    brokerPairs: { binance: "DYDXUSDT", bybit: "DYDXUSDT", coinbase: "DYDX-USD", kraken: "DYDXUSD", okx: "DYDX-USDT" },
    id: "dydx-chain",
    name: "dYdX",
    rank: 47,
    symbol: "DYDX",
  },
  {
    brokerPairs: { binance: "GALAUSDT", bybit: "GALAUSDT", coinbase: "GALA-USD", kraken: "GALAUSD", okx: "GALA-USDT" },
    id: "gala",
    name: "Gala",
    rank: 48,
    symbol: "GALA",
  },
  {
    brokerPairs: { binance: "APEUSDT", bybit: "APEUSDT", coinbase: "APE-USD", kraken: "APEUSD", okx: "APE-USDT" },
    id: "apecoin",
    name: "ApeCoin",
    rank: 49,
    symbol: "APE",
  },
  {
    brokerPairs: { binance: "CHZUSDT", bybit: "CHZUSDT", coinbase: "CHZ-USD", kraken: "CHZUSD", okx: "CHZ-USDT" },
    id: "chiliz",
    name: "Chiliz",
    rank: 50,
    symbol: "CHZ",
  },
  {
    brokerPairs: { binance: "XTZUSDT", bybit: "XTZUSDT", coinbase: "XTZ-USD", kraken: "XTZUSD", okx: "XTZ-USDT" },
    id: "tezos",
    name: "Tezos",
    rank: 51,
    symbol: "XTZ",
  },
  {
    brokerPairs: { binance: "EOSUSDT", bybit: "EOSUSDT", coinbase: "EOS-USD", kraken: "EOSUSD", okx: "EOS-USDT" },
    id: "eos",
    name: "EOS",
    rank: 52,
    symbol: "EOS",
  },
  {
    brokerPairs: { binance: "MINAUSDT", bybit: "MINAUSDT", coinbase: "MINA-USD", kraken: "MINAUSD", okx: "MINA-USDT" },
    id: "mina-protocol",
    name: "Mina",
    rank: 53,
    symbol: "MINA",
  },
  {
    brokerPairs: { binance: "FLOWUSDT", bybit: "FLOWUSDT", coinbase: "FLOW-USD", kraken: "FLOWUSD", okx: "FLOW-USDT" },
    id: "flow",
    name: "Flow",
    rank: 54,
    symbol: "FLOW",
  },
  {
    brokerPairs: { binance: "KAVAUSDT", bybit: "KAVAUSDT", coinbase: "KAVA-USD", kraken: "KAVAUSD", okx: "KAVA-USDT" },
    id: "kava",
    name: "Kava",
    rank: 55,
    symbol: "KAVA",
  },
  {
    brokerPairs: { binance: "COMPUSDT", bybit: "COMPUSDT", coinbase: "COMP-USD", kraken: "COMPUSD", okx: "COMP-USDT" },
    id: "compound-governance-token",
    name: "Compound",
    rank: 56,
    symbol: "COMP",
  },
  {
    brokerPairs: { binance: "CRVUSDT", bybit: "CRVUSDT", coinbase: "CRV-USD", kraken: "CRVUSD", okx: "CRV-USDT" },
    id: "curve-dao-token",
    name: "Curve DAO",
    rank: 57,
    symbol: "CRV",
  },
  {
    brokerPairs: { binance: "LDOUSDT", bybit: "LDOUSDT", coinbase: "LDO-USD", kraken: "LDOUSD", okx: "LDO-USDT" },
    id: "lido-dao",
    name: "Lido DAO",
    rank: 58,
    symbol: "LDO",
  },
  {
    brokerPairs: { binance: "FTMUSDT", bybit: "FTMUSDT", coinbase: "FTM-USD", kraken: "FTMUSD", okx: "FTM-USDT" },
    id: "fantom",
    name: "Fantom",
    rank: 59,
    symbol: "FTM",
  },
  {
    brokerPairs: { binance: "ZECUSDT", bybit: "ZECUSDT", coinbase: "ZEC-USD", kraken: "ZECUSD", okx: "ZEC-USDT" },
    id: "zcash",
    name: "Zcash",
    rank: 60,
    symbol: "ZEC",
  },
];

/** Versao imutavel exposta para callers. */
export const ASSET_CATALOG: ReadonlyArray<AssetCatalogEntry> = Object.freeze(
  [...ASSET_CATALOG_RAW].sort((left, right) => left.rank - right.rank).map((entry) => Object.freeze({
    ...entry,
    brokerPairs: Object.freeze({ ...entry.brokerPairs }),
  })),
);

/** Indice por assetId para lookup O(1). */
const ASSET_CATALOG_INDEX = new Map<string, AssetCatalogEntry>(
  ASSET_CATALOG.map((entry) => [entry.id, entry]),
);

/**
 * Aliases legados para compatibilidade com codigo antigo (ex.: "polygon",
 * "matic-network", "bnb"). Sempre apontam para o id canonico atual.
 */
const ASSET_ALIASES = new Map<string, string>([
  ["bnb", "binancecoin"],
  ["matic-network", "polygon-pos"],
  ["polygon", "polygon-pos"],
]);

/**
 * Retorna a entrada canonica do catalogo dado um assetId (ou alias).
 * Retorna `null` se o assetId nao for conhecido — caller decide se faz
 * fallback ou rejeita.
 */
export function findAssetCatalogEntry(assetId: string): AssetCatalogEntry | null {
  const normalizedId = assetId.trim().toLowerCase();
  const canonicalId = ASSET_ALIASES.get(normalizedId) ?? normalizedId;
  return ASSET_CATALOG_INDEX.get(canonicalId) ?? null;
}

/**
 * Retorna o par para um broker especifico, ou `null` se o broker nao listar
 * o ativo. Usar este em vez de acessar `entry.brokerPairs[broker]` direto
 * para passar pelo resolver de aliases.
 */
export function findBrokerPair(assetId: string, broker: AssetCatalogBroker): string | null {
  const entry = findAssetCatalogEntry(assetId);
  return entry ? entry.brokerPairs[broker] : null;
}
