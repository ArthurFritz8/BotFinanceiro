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
 * top-30 por market cap (excluindo stablecoins e wrapped tokens, que nao
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
