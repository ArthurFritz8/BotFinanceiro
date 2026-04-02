import {
  OpenRouterChatAdapter,
  type OpenRouterChatCompletion,
  type OpenRouterToolDefinition,
} from "../../../integrations/ai/openrouter-chat-adapter.js";
import {
  CoinCapMarketDataAdapter,
  type CoinCapMarketAsset,
  type CoinCapMarketOverview,
} from "../../../integrations/market_data/coincap-market-data-adapter.js";
import {
  YahooMarketDataAdapter,
  type YahooMarketQuote,
} from "../../../integrations/market_data/yahoo-market-data-adapter.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { logger } from "../../../shared/logger/logger.js";
import {
  copilotChatAuditStore,
  type CopilotChatSessionHistory,
} from "../../../shared/observability/copilot-chat-audit-store.js";
import {
  CryptoChartService,
  type CryptoChartRange,
  type CryptoTrend,
} from "../../crypto/application/crypto-chart-service.js";
import {
  CryptoSpotPriceService,
  type SpotPriceResponse,
} from "../../crypto/application/crypto-spot-price-service.js";
import {
  CryptoSyncPolicyService,
} from "../../crypto/application/crypto-sync-policy-service.js";
import { SystemStatusService } from "../../system/application/system-status-service.js";
import { z } from "zod";

export interface CopilotChatInput {
  maxTokens?: number;
  message: string;
  sessionId?: string;
  systemPrompt?: string;
  temperature?: number;
}

const openRouterChatAdapter = new OpenRouterChatAdapter();
const coinCapMarketDataAdapter = new CoinCapMarketDataAdapter();
const yahooMarketDataAdapter = new YahooMarketDataAdapter();
const cryptoChartService = new CryptoChartService();
const cryptoSpotPriceService = new CryptoSpotPriceService();
const cryptoSyncPolicyService = new CryptoSyncPolicyService();
const systemStatusService = new SystemStatusService();

const copilotDefaultSystemPrompt = [
  "Voce e um copiloto financeiro focado em dados objetivos de mercado e operacao.",
  "Quando a pergunta envolver resumo, panorama ou contexto do mercado cripto, priorize a tool get_crypto_market_overview.",
  "Quando a pergunta envolver preco ou comparacao entre ativos, use get_crypto_spot_price ou get_crypto_multi_spot_price.",
  "Quando a pergunta envolver grafico, tendencia, suporte/resistencia ou analise tecnica de cripto, use get_crypto_chart_insights.",
  "Quando a pergunta envolver indices, acoes, cambio, juros ou commodities, use get_financial_market_snapshot.",
  "Quando a pergunta envolver risco de curto prazo, entregue analise por fatores (volatilidade, liquidez, macro e operacao), sem recomendacao de investimento.",
  "Nao recuse genericamente se houver dados disponiveis nas tools; entregue resposta concisa com numeros e contexto.",
  "Se algum dado estiver indisponivel, explicite a limitacao e continue com os dados que conseguiu coletar.",
  "Nao forneca recomendacao de investimento; mantenha tom analitico e neutro.",
].join(" ");

const copilotSpotPriceToolInputSchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  currency: z.string().trim().min(2).max(10).default("usd"),
});

const copilotMultiSpotPriceToolInputSchema = z.object({
  assetIds: z
    .array(z.string().trim().min(1).max(50).transform((value) => value.toLowerCase()))
    .min(2)
    .max(8)
    .default(["bitcoin", "ethereum"]),
  currency: z.string().trim().min(2).max(10).default("usd"),
});

const copilotMarketOverviewToolInputSchema = z.object({
  limit: z.number().int().min(3).max(15).default(8),
});

const copilotCryptoChartToolInputSchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  currency: z.string().trim().min(2).max(10).default("usd"),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("7d"),
});

const copilotSyncPolicyToolInputSchema = z.object({
  scope: z.enum(["hot", "warm", "cold"]).optional(),
});

const copilotOperationalHealthToolInputSchema = z.object({});

const copilotFinancialMarketSnapshotToolInputSchema = z.object({
  preset: z.enum(["global", "us", "brazil", "risk"]).default("global"),
  symbols: z
    .array(z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()))
    .min(1)
    .max(12)
    .optional(),
});

type FinancialMarketPreset = z.infer<typeof copilotFinancialMarketSnapshotToolInputSchema>["preset"];

interface MultiSpotPriceSuccessResult {
  assetId: string;
  cacheState: SpotPriceResponse["cache"]["state"];
  fetchedAt: string;
  price: number;
  stale: boolean;
}

interface MultiSpotPriceFailureResult {
  assetId: string;
  error: {
    code: string;
    message: string;
  };
}

interface MarketSnapshotSuccessResult {
  assetId: string;
  cacheState: SpotPriceResponse["cache"]["state"];
  price: number;
  stale: boolean;
}

interface MarketSnapshotFailureResult {
  assetId: string;
  code: string;
}

const marketSummaryAssetIds = ["bitcoin", "ethereum", "solana", "xrp", "bnb"];
const marketSummaryCurrency = "usd";
const financialMarketPresetSymbols: Record<FinancialMarketPreset, string[]> = {
  brazil: ["^BVSP", "BRL=X", "EWZ", "VALE3.SA", "PETR4.SA", "^TNX"],
  global: ["^GSPC", "^IXIC", "^DJI", "^BVSP", "EURUSD=X", "BRL=X", "GC=F", "CL=F", "^TNX", "BTC-USD", "ETH-USD"],
  risk: ["^VIX", "^TNX", "GC=F", "CL=F", "BTC-USD", "ETH-USD"],
  us: ["^GSPC", "^IXIC", "^DJI", "SPY", "QQQ", "IWM", "^TNX"],
};
const riskAssetAliases: Array<{ aliases: string[]; assetId: string }> = [
  {
    aliases: ["bitcoin", "btc"],
    assetId: "bitcoin",
  },
  {
    aliases: ["ethereum", "eth"],
    assetId: "ethereum",
  },
  {
    aliases: ["solana", "sol"],
    assetId: "solana",
  },
  {
    aliases: ["xrp", "ripple"],
    assetId: "xrp",
  },
  {
    aliases: ["bnb", "binance"],
    assetId: "bnb",
  },
  {
    aliases: ["dogecoin", "doge"],
    assetId: "dogecoin",
  },
  {
    aliases: ["cardano", "ada"],
    assetId: "cardano",
  },
  {
    aliases: ["chainlink", "link"],
    assetId: "chainlink",
  },
  {
    aliases: ["pi network", "pi-network", "pi"],
    assetId: "pi-network",
  },
];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasMarketSummaryIntent(message: string): boolean {
  const normalizedMessage = normalizeText(message);
  const asksForSummary =
    normalizedMessage.includes("resum") ||
    normalizedMessage.includes("panorama") ||
    normalizedMessage.includes("visao geral") ||
    normalizedMessage.includes("overview") ||
    normalizedMessage.includes("cenario");
  const mentionsCryptoMarket =
    normalizedMessage.includes("mercado") ||
    normalizedMessage.includes("cripto") ||
    normalizedMessage.includes("crypto") ||
    normalizedMessage.includes("bitcoin") ||
    normalizedMessage.includes("ethereum") ||
    normalizedMessage.includes("altcoin");

  return asksForSummary && mentionsCryptoMarket;
}

function hasMonitoringPlanIntent(message: string): boolean {
  const normalizedMessage = normalizeText(message);
  const asksForPlan =
    normalizedMessage.includes("plano") ||
    normalizedMessage.includes("checkpoint") ||
    normalizedMessage.includes("check point") ||
    normalizedMessage.includes("checkpoints");
  const mentionsMonitoring =
    normalizedMessage.includes("monitoramento") ||
    normalizedMessage.includes("monitorar") ||
    normalizedMessage.includes("checkpoints");

  return asksForPlan && mentionsMonitoring;
}

function hasRiskAnalysisIntent(message: string): boolean {
  const normalizedMessage = normalizeText(message);
  const asksForRisk =
    normalizedMessage.includes("risco") ||
    normalizedMessage.includes("volatil") ||
    normalizedMessage.includes("drawdown") ||
    normalizedMessage.includes("cenario de queda") ||
    normalizedMessage.includes("stress");
  const mentionsMarketContext =
    normalizedMessage.includes("mercado") ||
    normalizedMessage.includes("cripto") ||
    normalizedMessage.includes("crypto") ||
    normalizedMessage.includes("bitcoin") ||
    normalizedMessage.includes("ethereum") ||
    normalizedMessage.includes("btc") ||
    normalizedMessage.includes("eth");
  const mentionsShortHorizon =
    normalizedMessage.includes("curto prazo") ||
    normalizedMessage.includes("24h") ||
    normalizedMessage.includes("hoje") ||
    normalizedMessage.includes("semana") ||
    normalizedMessage.includes("short term");

  return asksForRisk && (mentionsMarketContext || mentionsShortHorizon);
}

function hasChartAnalysisIntent(message: string): boolean {
  const normalizedMessage = normalizeText(message);
  const asksForChart =
    normalizedMessage.includes("grafico") ||
    normalizedMessage.includes("grafic") ||
    normalizedMessage.includes("chart") ||
    normalizedMessage.includes("candles") ||
    normalizedMessage.includes("candle") ||
    normalizedMessage.includes("suporte") ||
    normalizedMessage.includes("resistencia") ||
    normalizedMessage.includes("tendencia") ||
    normalizedMessage.includes("setup") ||
    normalizedMessage.includes("rompimento");
  const asksDirection =
    normalizedMessage.includes("vai subir") ||
    normalizedMessage.includes("vai cair") ||
    normalizedMessage.includes("subir ou cair") ||
    normalizedMessage.includes("alta ou baixa");
  const mentionsAsset = riskAssetAliases.some((assetAlias) =>
    assetAlias.aliases.some((alias) => hasExactAlias(normalizedMessage, alias)),
  );

  return (asksForChart || asksDirection) && mentionsAsset;
}

function hasExactAlias(normalizedMessage: string, alias: string): boolean {
  const normalizedAlias = normalizeText(alias);

  if (normalizedAlias.length <= 4 && /^[a-z0-9]+$/.test(normalizedAlias)) {
    const messageTokens = normalizedMessage.split(/[^a-z0-9]+/).filter((token) => token.length > 0);
    return messageTokens.includes(normalizedAlias);
  }

  return normalizedMessage.includes(normalizedAlias);
}

function resolveRiskAssetIds(message: string): string[] {
  const normalizedMessage = normalizeText(message);
  const selectedAssets = riskAssetAliases
    .filter((assetAlias) => assetAlias.aliases.some((alias) => hasExactAlias(normalizedMessage, alias)))
    .map((assetAlias) => assetAlias.assetId);

  if (selectedAssets.length === 0) {
    return ["bitcoin", "ethereum"];
  }

  return [...new Set(selectedAssets)].slice(0, 4);
}

function resolvePrimaryAssetIdForChart(message: string): string {
  const resolvedAssetIds = resolveRiskAssetIds(message);
  return resolvedAssetIds[0] ?? "bitcoin";
}

function resolveChartRangeFromMessage(message: string): CryptoChartRange {
  const normalizedMessage = normalizeText(message);

  if (
    normalizedMessage.includes("24h") ||
    normalizedMessage.includes("dia") ||
    normalizedMessage.includes("diario") ||
    normalizedMessage.includes("intraday")
  ) {
    return "24h";
  }

  if (
    normalizedMessage.includes("semana") ||
    normalizedMessage.includes("7d") ||
    normalizedMessage.includes("7 dias")
  ) {
    return "7d";
  }

  if (
    normalizedMessage.includes("90d") ||
    normalizedMessage.includes("90 dias") ||
    normalizedMessage.includes("trimestre")
  ) {
    return "90d";
  }

  if (
    normalizedMessage.includes("mes") ||
    normalizedMessage.includes("30d") ||
    normalizedMessage.includes("30 dias")
  ) {
    return "30d";
  }

  if (
    normalizedMessage.includes("ano") ||
    normalizedMessage.includes("1y") ||
    normalizedMessage.includes("365 dias")
  ) {
    return "1y";
  }

  return "7d";
}

function hasGenericLimitationAnswer(answer: string): boolean {
  const normalizedAnswer = normalizeText(answer);

  return (
    normalizedAnswer.includes("nao tenho a capacidade") ||
    normalizedAnswer.includes("nao tenho capacidade") ||
    normalizedAnswer.includes("nao tenho informacoes") ||
    normalizedAnswer.includes("nao consigo fornecer") ||
    normalizedAnswer.includes("nao posso fornecer") ||
    normalizedAnswer.includes("nao posso fornecer analise de risco") ||
    normalizedAnswer.includes("sou um copiloto financeiro focado em dados e operacao") ||
    normalizedAnswer.includes("sinto muito") ||
    normalizedAnswer.includes("falha ao obter") ||
    normalizedAnswer.includes("panorama do mercado") ||
    normalizedAnswer.includes("dados do coincap") ||
    normalizedAnswer.includes("tente novamente mais tarde")
  );
}

function formatSpotPrice(price: number, currency: string): string {
  const maximumFractionDigits = price >= 1000 ? 2 : price >= 1 ? 4 : 6;

  return `${price.toLocaleString("pt-BR", {
    maximumFractionDigits,
  })} ${currency.toUpperCase()}`;
}

function formatCompactUsd(value: number | null): string {
  if (value === null) {
    return "n/d";
  }

  return `${value.toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
    notation: "compact",
  })} USD`;
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "n/d";
  }

  const signal = value > 0 ? "+" : "";
  return `${signal}${value.toFixed(2)}%`;
}

function formatQuotePrice(price: number, currency: string | null): string {
  const maximumFractionDigits = price >= 1000 ? 2 : price >= 1 ? 4 : 6;
  const formattedPrice = price.toLocaleString("pt-BR", {
    maximumFractionDigits,
  });

  if (!currency) {
    return formattedPrice;
  }

  return `${formattedPrice} ${currency.toUpperCase()}`;
}

function classifyVolatility(changePercent: number | null): string {
  if (changePercent === null) {
    return "indefinida";
  }

  const absoluteChange = Math.abs(changePercent);

  if (absoluteChange >= 8) {
    return "muito alta";
  }

  if (absoluteChange >= 5) {
    return "alta";
  }

  if (absoluteChange >= 2) {
    return "moderada";
  }

  return "baixa";
}

function classifyLiquidity(volumeUsd24h: number | null): string {
  if (volumeUsd24h === null) {
    return "indefinida";
  }

  if (volumeUsd24h >= 10_000_000_000) {
    return "alta";
  }

  if (volumeUsd24h >= 2_000_000_000) {
    return "media";
  }

  return "baixa";
}

function formatTrendLabel(trend: CryptoTrend): string {
  if (trend === "bullish") {
    return "viés de alta";
  }

  if (trend === "bearish") {
    return "viés de baixa";
  }

  return "viés lateral";
}

function formatRangeLabel(range: CryptoChartRange): string {
  if (range === "24h") {
    return "24h";
  }

  if (range === "7d") {
    return "7 dias";
  }

  if (range === "30d") {
    return "30 dias";
  }

  if (range === "90d") {
    return "90 dias";
  }

  return "1 ano";
}

function formatIntervalMinutes(intervalSeconds: number): number {
  return Math.max(1, Math.round(intervalSeconds / 60));
}

function capitalizeAssetId(assetId: string): string {
  if (assetId.length === 0) {
    return assetId;
  }

  return `${assetId.charAt(0).toUpperCase()}${assetId.slice(1)}`;
}

function buildPriceComparisonTable(
  currency: string,
  successes: MultiSpotPriceSuccessResult[],
  failures: MultiSpotPriceFailureResult[],
): string {
  const lines = ["| Ativo | Preco | Cache |", "| --- | ---: | --- |"];

  for (const item of successes) {
    lines.push(`| ${item.assetId} | ${item.price} ${currency.toUpperCase()} | ${item.cacheState}${item.stale ? " (stale)" : ""} |`);
  }

  for (const item of failures) {
    lines.push(`| ${item.assetId} | n/a | erro: ${item.error.code} |`);
  }

  return lines.join("\n");
}

function buildMarketOverviewTable(assets: CoinCapMarketAsset[]): string {
  const lines = [
    "| Ativo | Preco USD | 24h | Market Cap | Volume 24h |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];

  for (const asset of assets) {
    lines.push(
      `| ${asset.symbol.toUpperCase()} (${asset.assetId}) | ${formatSpotPrice(asset.priceUsd, "usd")} | ${formatPercent(asset.changePercent24h)} | ${formatCompactUsd(asset.marketCapUsd)} | ${formatCompactUsd(asset.volumeUsd24h)} |`,
    );
  }

  return lines.join("\n");
}

function buildFinancialQuotesTable(quotes: YahooMarketQuote[]): string {
  const lines = [
    "| Simbolo | Nome | Preco | Variacao | Estado |",
    "| --- | --- | ---: | ---: | --- |",
  ];

  for (const quote of quotes) {
    lines.push(
      `| ${quote.symbol} | ${quote.name} | ${formatQuotePrice(quote.price, quote.currency)} | ${formatPercent(quote.changePercent)} | ${quote.marketState ?? "n/d"} |`,
    );
  }

  return lines.join("\n");
}

function summarizeMacroRiskSignals(quotes: YahooMarketQuote[]): string {
  const quotesBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const macroSignals: string[] = [];
  const vix = quotesBySymbol.get("^VIX");
  const us10y = quotesBySymbol.get("^TNX");
  const gold = quotesBySymbol.get("GC=F");
  const oil = quotesBySymbol.get("CL=F");

  if (vix) {
    macroSignals.push(`VIX ${formatQuotePrice(vix.price, vix.currency)} (${formatPercent(vix.changePercent)})`);
  }

  if (us10y) {
    macroSignals.push(`US10Y ${formatQuotePrice(us10y.price, us10y.currency)} (${formatPercent(us10y.changePercent)})`);
  }

  if (gold) {
    macroSignals.push(`Gold ${formatQuotePrice(gold.price, gold.currency)} (${formatPercent(gold.changePercent)})`);
  }

  if (oil) {
    macroSignals.push(`Oil ${formatQuotePrice(oil.price, oil.currency)} (${formatPercent(oil.changePercent)})`);
  }

  if (macroSignals.length === 0) {
    return "dados macro indisponiveis no momento";
  }

  return macroSignals.join(" | ");
}

const copilotTools: OpenRouterToolDefinition[] = [
  {
    description:
      "Consulta preco spot atual de um ativo cripto em uma moeda fiat. Use para perguntas de preco, cotacao, quanto vale ou valor atual.",
    inputSchema: copilotSpotPriceToolInputSchema,
    name: "get_crypto_spot_price",
    parameters: {
      additionalProperties: false,
      properties: {
        assetId: {
          default: "bitcoin",
          description: "Identificador do ativo no CoinGecko, exemplo: bitcoin, ethereum, solana",
          type: "string",
        },
        currency: {
          default: "usd",
          description: "Moeda da cotacao, exemplo: usd, brl, eur",
          type: "string",
        },
      },
      type: "object",
    },
    run: (input: z.infer<typeof copilotSpotPriceToolInputSchema>) => {
      return cryptoSpotPriceService.getSpotPrice(input);
    },
  },
  {
    description:
      "Compara preco spot de varios ativos cripto na mesma moeda e retorna tabela. Use para perguntas de comparacao entre multiplos ativos.",
    inputSchema: copilotMultiSpotPriceToolInputSchema,
    name: "get_crypto_multi_spot_price",
    parameters: {
      additionalProperties: false,
      properties: {
        assetIds: {
          description: "Lista de ativos no padrao CoinGecko para comparar, exemplo: [bitcoin, ethereum, solana]",
          items: {
            type: "string",
          },
          maxItems: 8,
          minItems: 2,
          type: "array",
        },
        currency: {
          default: "usd",
          description: "Moeda da comparacao, exemplo: usd, brl, eur",
          type: "string",
        },
      },
      required: ["assetIds"],
      type: "object",
    },
    run: async (input: z.infer<typeof copilotMultiSpotPriceToolInputSchema>) => {
      const deduplicatedAssetIds = [...new Set(input.assetIds.map((assetId) => assetId.toLowerCase()))];
      const comparisonResults = await Promise.all(
        deduplicatedAssetIds.map(async (assetId) => {
          try {
            const spotPrice = await cryptoSpotPriceService.getSpotPrice({
              assetId,
              currency: input.currency,
            });

            const successResult: MultiSpotPriceSuccessResult = {
              assetId: spotPrice.assetId,
              cacheState: spotPrice.cache.state,
              fetchedAt: spotPrice.fetchedAt,
              price: spotPrice.price,
              stale: spotPrice.cache.stale,
            };

            return {
              ok: true as const,
              value: successResult,
            };
          } catch (error) {
            const failureResult: MultiSpotPriceFailureResult = {
              assetId,
              error: {
                code: error instanceof AppError ? error.code : "SPOT_PRICE_COMPARISON_ERROR",
                message: error instanceof Error ? error.message : "Unexpected spot price comparison error",
              },
            };

            return {
              ok: false as const,
              value: failureResult,
            };
          }
        }),
      );

      const successes = comparisonResults
        .filter((item) => item.ok)
        .map((item) => item.value)
        .sort((left, right) => right.price - left.price);
      const failures = comparisonResults.filter((item) => !item.ok).map((item) => item.value);

      return {
        comparedAssets: deduplicatedAssetIds.length,
        currency: input.currency.toLowerCase(),
        failures,
        ranking: successes.map((item, index) => ({
          assetId: item.assetId,
          position: index + 1,
          price: item.price,
        })),
        rows: successes,
        successCount: successes.length,
        tableMarkdown: buildPriceComparisonTable(input.currency, successes, failures),
      };
    },
  },
  {
    description:
      "Retorna panorama do mercado cripto com top ativos por market cap, variacao 24h e volume. Use para pedidos de resumo de mercado e contexto diario.",
    inputSchema: copilotMarketOverviewToolInputSchema,
    name: "get_crypto_market_overview",
    parameters: {
      additionalProperties: false,
      properties: {
        limit: {
          default: 8,
          description: "Quantidade de ativos para panorama (entre 3 e 15)",
          maximum: 15,
          minimum: 3,
          type: "number",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotMarketOverviewToolInputSchema>) => {
      const marketOverview = await coinCapMarketDataAdapter.getMarketOverview({
        limit: input.limit,
      });
      const assetsWithChange = marketOverview.assets.filter((asset) => asset.changePercent24h !== null);
      const strongest24h = [...assetsWithChange].sort(
        (left, right) => (right.changePercent24h ?? -Infinity) - (left.changePercent24h ?? -Infinity),
      )[0] ?? null;
      const weakest24h = [...assetsWithChange].sort(
        (left, right) => (left.changePercent24h ?? Infinity) - (right.changePercent24h ?? Infinity),
      )[0] ?? null;

      return {
        assets: marketOverview.assets,
        fetchedAt: marketOverview.fetchedAt,
        provider: marketOverview.provider,
        strongest24h,
        tableMarkdown: buildMarketOverviewTable(marketOverview.assets),
        weakest24h,
      };
    },
  },
  {
    description:
      "Retorna dados de grafico de cripto (historico + insights tecnicos) para analise de tendencia, momentum, suporte e resistencia sem recomendacao de investimento.",
    inputSchema: copilotCryptoChartToolInputSchema,
    name: "get_crypto_chart_insights",
    parameters: {
      additionalProperties: false,
      properties: {
        assetId: {
          default: "bitcoin",
          description: "Ativo no padrao CoinGecko, exemplo: bitcoin, ethereum, solana, dogecoin",
          type: "string",
        },
        currency: {
          default: "usd",
          description: "Moeda de referencia do grafico, exemplo: usd, brl",
          type: "string",
        },
        range: {
          default: "7d",
          description: "Janela temporal do grafico: 24h, 7d, 30d, 90d ou 1y",
          enum: ["24h", "7d", "30d", "90d", "1y"],
          type: "string",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotCryptoChartToolInputSchema>) => {
      const chart = await cryptoChartService.getChart(input);

      return {
        assetId: chart.assetId,
        cache: chart.cache,
        currency: chart.currency,
        fetchedAt: chart.fetchedAt,
        insights: chart.insights,
        points: chart.points.slice(-160),
        provider: chart.provider,
        range: chart.range,
        textualSummary: `Faixa ${formatRangeLabel(chart.range)} | ${formatTrendLabel(chart.insights.trend)} | variacao ${chart.insights.changePercent}% | volatilidade ${chart.insights.volatilityPercent}%`,
      };
    },
  },
  {
    description:
      "Retorna snapshot de mercado global (indices, cambio, juros, commodities e cripto) via Yahoo Finance. Use para contexto macro e comparativo entre classes de ativos.",
    inputSchema: copilotFinancialMarketSnapshotToolInputSchema,
    name: "get_financial_market_snapshot",
    parameters: {
      additionalProperties: false,
      properties: {
        preset: {
          default: "global",
          description: "Conjunto pre-definido de simbolos: global, us, brazil ou risk",
          enum: ["global", "us", "brazil", "risk"],
          type: "string",
        },
        symbols: {
          description: "Lista opcional de simbolos do Yahoo Finance para sobrescrever o preset",
          items: {
            type: "string",
          },
          maxItems: 12,
          minItems: 1,
          type: "array",
        },
      },
      type: "object",
    },
    run: async (input: z.infer<typeof copilotFinancialMarketSnapshotToolInputSchema>) => {
      const presetSymbols = financialMarketPresetSymbols[input.preset];
      const requestedSymbols =
        input.symbols && input.symbols.length > 0
          ? [...new Set(input.symbols.map((symbol) => symbol.toUpperCase()))]
          : presetSymbols;
      const marketSnapshot = await yahooMarketDataAdapter.getMarketSnapshot({
        symbols: requestedSymbols,
      });
      const quotesWithChange = marketSnapshot.quotes.filter((quote) => quote.changePercent !== null);
      const strongestMove = [...quotesWithChange].sort(
        (left, right) => (right.changePercent ?? -Infinity) - (left.changePercent ?? -Infinity),
      )[0] ?? null;
      const weakestMove = [...quotesWithChange].sort(
        (left, right) => (left.changePercent ?? Infinity) - (right.changePercent ?? Infinity),
      )[0] ?? null;
      const upMoves = quotesWithChange.filter((quote) => (quote.changePercent ?? 0) > 0).length;
      const downMoves = quotesWithChange.filter((quote) => (quote.changePercent ?? 0) < 0).length;

      return {
        breadth: {
          down: downMoves,
          flat: Math.max(0, quotesWithChange.length - upMoves - downMoves),
          up: upMoves,
        },
        fetchedAt: marketSnapshot.fetchedAt,
        missingSymbols: marketSnapshot.missingSymbols,
        preset: input.preset,
        provider: marketSnapshot.provider,
        quotes: marketSnapshot.quotes,
        requestedSymbols: marketSnapshot.requestedSymbols,
        strongestMove,
        tableMarkdown: buildFinancialQuotesTable(marketSnapshot.quotes),
        weakestMove,
      };
    },
  },
  {
    description:
      "Retorna o estado operacional do scheduler e diagnosticos de saude do sistema. Use para perguntas de saude operacional, alertas, circuito e budget.",
    inputSchema: copilotOperationalHealthToolInputSchema,
    name: "get_operational_health",
    parameters: {
      additionalProperties: false,
      properties: {},
      type: "object",
    },
    run: () => {
      return Promise.resolve(systemStatusService.getOperationalHealth());
    },
  },
  {
    description:
      "Retorna a politica de sincronizacao de cripto e intervalos por escopo. Use para perguntas de cadencia de sync e TTL de cache.",
    inputSchema: copilotSyncPolicyToolInputSchema,
    name: "get_crypto_sync_policy",
    parameters: {
      additionalProperties: false,
      properties: {
        scope: {
          description: "Escopo opcional da politica: hot, warm ou cold",
          enum: ["hot", "warm", "cold"],
          type: "string",
        },
      },
      type: "object",
    },
    run: (input: z.infer<typeof copilotSyncPolicyToolInputSchema>) => {
      if (input.scope) {
        return Promise.resolve(cryptoSyncPolicyService.getPolicy(input.scope));
      }

      return Promise.resolve(cryptoSyncPolicyService.getPolicy());
    },
  },
];

export class CopilotChatService {
  public async chat(input: CopilotChatInput): Promise<OpenRouterChatCompletion> {
    const preparedInput = this.withDefaultSystemPrompt(input);
    const completion = await openRouterChatAdapter.createCompletionWithTools(preparedInput, copilotTools);
    const completionWithFallback = await this.applyIntentFallback(preparedInput, completion);

    try {
      await copilotChatAuditStore.append({
        completion: completionWithFallback,
        input: preparedInput,
        sessionId: input.sessionId,
      });
    } catch (error) {
      logger.warn(
        {
          err: error,
        },
        "Failed to append copilot chat audit record",
      );
    }

    return completionWithFallback;
  }

  public async getSessionHistory(input: {
    limit?: number;
    sessionId: string;
  }): Promise<CopilotChatSessionHistory> {
    return copilotChatAuditStore.getSessionHistory(input);
  }

  private withDefaultSystemPrompt(input: CopilotChatInput): CopilotChatInput {
    const trimmedCustomPrompt = input.systemPrompt?.trim();

    if (!trimmedCustomPrompt || trimmedCustomPrompt.length === 0) {
      return {
        ...input,
        systemPrompt: copilotDefaultSystemPrompt,
      };
    }

    return {
      ...input,
      systemPrompt: `${copilotDefaultSystemPrompt}\n\nContexto adicional do usuario:\n${trimmedCustomPrompt}`,
    };
  }

  private async applyIntentFallback(
    input: CopilotChatInput,
    completion: OpenRouterChatCompletion,
  ): Promise<OpenRouterChatCompletion> {
    if (!hasGenericLimitationAnswer(completion.answer)) {
      return completion;
    }

    if (hasMarketSummaryIntent(input.message)) {
      try {
        const fallbackAnswer = await this.buildMarketSummaryFallback();

        return {
          ...completion,
          answer: fallbackAnswer,
        };
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "Failed to build market summary fallback",
        );

        return completion;
      }
    }

    if (hasMonitoringPlanIntent(input.message)) {
      try {
        const fallbackAnswer = await this.buildMonitoringPlanFallback();

        return {
          ...completion,
          answer: fallbackAnswer,
        };
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "Failed to build monitoring plan fallback",
        );
      }
    }

    if (hasChartAnalysisIntent(input.message)) {
      try {
        const fallbackAnswer = await this.buildChartAnalysisFallback(input.message);

        return {
          ...completion,
          answer: fallbackAnswer,
        };
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "Failed to build chart analysis fallback",
        );
      }
    }

    if (hasRiskAnalysisIntent(input.message)) {
      try {
        const fallbackAnswer = await this.buildShortTermRiskFallback(input.message);

        return {
          ...completion,
          answer: fallbackAnswer,
        };
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "Failed to build short-term risk fallback",
        );
      }
    }

    return completion;
  }

  private async buildMarketSummaryFallback(): Promise<string> {
    try {
      const marketOverview = await coinCapMarketDataAdapter.getMarketOverview({
        limit: 8,
      });

      return this.buildCoinCapSummaryFallback(marketOverview);
    } catch (error) {
      logger.warn(
        {
          err: error,
        },
        "CoinCap market overview failed, falling back to spot snapshot summary",
      );
    }

    return this.buildSpotSnapshotSummaryFallback();
  }

  private buildCoinCapSummaryFallback(marketOverview: CoinCapMarketOverview): string {
    const topAssets = marketOverview.assets.slice(0, 5);
    const assetsWithChange = topAssets.filter((asset) => asset.changePercent24h !== null);
    const strongest24h = [...assetsWithChange].sort(
      (left, right) => (right.changePercent24h ?? -Infinity) - (left.changePercent24h ?? -Infinity),
    )[0];
    const weakest24h = [...assetsWithChange].sort(
      (left, right) => (left.changePercent24h ?? Infinity) - (right.changePercent24h ?? Infinity),
    )[0];
    const avgChange24h =
      assetsWithChange.length > 0
        ? assetsWithChange.reduce((acc, asset) => acc + (asset.changePercent24h ?? 0), 0) /
          assetsWithChange.length
        : null;
    const riskReading =
      avgChange24h === null
        ? "indefinida"
        : avgChange24h > 2
          ? "apetite a risco"
          : avgChange24h < -2
            ? "aversao a risco"
            : "neutra";
    const highlights = topAssets
      .slice(0, 3)
      .map(
        (asset) =>
          `${asset.symbol.toUpperCase()} ${formatSpotPrice(asset.priceUsd, "usd")} (${formatPercent(asset.changePercent24h)})`,
      )
      .join(" | ");
    const totalMarketCapTop = topAssets.reduce(
      (acc, asset) => acc + (asset.marketCapUsd ?? 0),
      0,
    );
    const totalVolumeTop = topAssets.reduce(
      (acc, asset) => acc + (asset.volumeUsd24h ?? 0),
      0,
    );

    return [
      "Resumo rapido do mercado cripto (CoinCap, janela 24h).",
      `Destaques: ${highlights}.`,
      strongest24h && weakest24h
        ? `Melhor 24h: ${strongest24h.symbol.toUpperCase()} (${formatPercent(strongest24h.changePercent24h)}). Pior 24h: ${weakest24h.symbol.toUpperCase()} (${formatPercent(weakest24h.changePercent24h)}).`
        : "Variacao 24h: dados parciais para os ativos monitorados.",
      `Top ${topAssets.length} por market cap: cap combinado ${formatCompactUsd(totalMarketCapTop)}, volume 24h combinado ${formatCompactUsd(totalVolumeTop)}, leitura de risco ${riskReading}.`,
      "Nota: este resumo e informativo e nao constitui recomendacao de investimento.",
    ].join("\n");
  }

  private async buildSpotSnapshotSummaryFallback(): Promise<string> {
    const comparisonResults = await Promise.all(
      marketSummaryAssetIds.map(async (assetId) => {
        try {
          const spotPrice = await cryptoSpotPriceService.getSpotPrice({
            assetId,
            currency: marketSummaryCurrency,
          });

          const successResult: MarketSnapshotSuccessResult = {
            assetId: spotPrice.assetId,
            cacheState: spotPrice.cache.state,
            price: spotPrice.price,
            stale: spotPrice.cache.stale,
          };

          return {
            ok: true as const,
            value: successResult,
          };
        } catch (error) {
          const failureResult: MarketSnapshotFailureResult = {
            assetId,
            code: error instanceof AppError ? error.code : "MARKET_SNAPSHOT_ERROR",
          };

          return {
            ok: false as const,
            value: failureResult,
          };
        }
      }),
    );

    const successfulQuotes = comparisonResults.filter((item) => item.ok).map((item) => item.value);
    const failedQuotes = comparisonResults.filter((item) => !item.ok).map((item) => item.value);
    const operationalHealth = systemStatusService.getOperationalHealth();

    if (successfulQuotes.length === 0) {
      const affectedAssetsSummary = failedQuotes
        .map((item) => `${item.assetId} (${item.code})`)
        .join(", ");

      return [
        "Resumo rapido do mercado cripto indisponivel neste momento por falha de cotacao spot.",
        `Saude operacional: circuito CoinGecko ${operationalHealth.diagnostics.circuitState} e budget restante ${operationalHealth.diagnostics.budgetRemainingPercent}%.`,
        affectedAssetsSummary.length > 0
          ? `Ativos afetados: ${affectedAssetsSummary}.`
          : "Ativos afetados: indisponivel.",
        "Sugestao: tente novamente em cerca de 1 minuto para nova tentativa de coleta.",
        "Nota: este resumo local usa apenas preco spot e nao inclui noticias ou recomendacao de investimento.",
      ].join("\n");
    }

    const quoteSummary = successfulQuotes
      .map(
        (item) =>
          `${item.assetId} ${formatSpotPrice(item.price, marketSummaryCurrency)}${
            item.stale ? " (stale)" : ""
          }`,
      )
      .join(" | ");

    const failedSummary = failedQuotes
      .map((item) => `${item.assetId} (${item.code})`)
      .join(", ");

    return [
      "Resumo rapido do mercado cripto (snapshot de spot price).",
      `Precos monitorados: ${quoteSummary}.`,
      `Saude operacional: circuito CoinGecko ${operationalHealth.diagnostics.circuitState}, budget restante ${operationalHealth.diagnostics.budgetRemainingPercent}%.`,
      failedSummary.length > 0
        ? `Ativos sem cotacao no momento: ${failedSummary}.`
        : "Todos os ativos monitorados responderam sem erro de cotacao.",
      "Nota: este resumo local usa apenas preco spot, sem noticias e sem recomendacao de investimento.",
    ].join("\n");
  }

  private async buildMonitoringPlanFallback(): Promise<string> {
    const operationalHealth = systemStatusService.getOperationalHealth();
    const syncPolicy = cryptoSyncPolicyService.getPolicy();

    const monitoredAssets = ["bitcoin", "ethereum", "solana"] as const;
    const monitoredQuotes = await Promise.all(
      monitoredAssets.map(async (assetId) => {
        try {
          const spotPrice = await cryptoSpotPriceService.getSpotPrice({
            assetId,
            currency: "usd",
          });

          return `${capitalizeAssetId(assetId)} ${formatSpotPrice(spotPrice.price, "usd")}`;
        } catch {
          return `${capitalizeAssetId(assetId)} n/d`;
        }
      }),
    );

    return [
      "Plano de monitoramento para hoje (3 checkpoints).",
      `Checkpoint 1 (abertura): validar saude operacional (status ${operationalHealth.status}, circuito ${operationalHealth.diagnostics.circuitState}, budget ${operationalHealth.diagnostics.budgetRemainingPercent}%).`,
      `Checkpoint 2 (meio do dia): revisar os ativos chave (${monitoredQuotes.join(" | ")}) e abrir alerta se houver variacao brusca ou aumento de falhas por escopo.`,
      `Checkpoint 3 (fechamento): conferir politicas de sync (hot a cada ${formatIntervalMinutes(syncPolicy.policy.hot.intervalSeconds)} min, warm a cada ${formatIntervalMinutes(syncPolicy.policy.warm.intervalSeconds)} min, cold a cada ${formatIntervalMinutes(syncPolicy.policy.cold.intervalSeconds)} min) e registrar ajustes para o proximo ciclo.`,
      "Observacao: este plano e operacional e informativo, sem recomendacao de investimento.",
    ].join("\n");
  }

  private async buildChartAnalysisFallback(message: string): Promise<string> {
    const assetId = resolvePrimaryAssetIdForChart(message);
    const range = resolveChartRangeFromMessage(message);
    const chart = await cryptoChartService.getChart({
      assetId,
      currency: "usd",
      range,
    });
    const trendLabel = formatTrendLabel(chart.insights.trend);

    return [
      `Analise tecnica objetiva de ${capitalizeAssetId(chart.assetId)} (${formatRangeLabel(chart.range)}).`,
      `Preco atual: ${formatSpotPrice(chart.insights.currentPrice, chart.currency)} | variacao no periodo: ${chart.insights.changePercent}% | ${trendLabel}.`,
      `Momentum curto: ${chart.insights.momentumPercent}% | volatilidade estimada: ${chart.insights.volatilityPercent}%.`,
      `Faixa tecnica: suporte aproximado em ${formatSpotPrice(chart.insights.supportLevel, chart.currency)} e resistencia em ${formatSpotPrice(chart.insights.resistanceLevel, chart.currency)}.`,
      `Media curta (aprox.): ${formatSpotPrice(chart.insights.shortMovingAverage, chart.currency)} | cache ${chart.cache.state}${chart.cache.stale ? " (stale)" : ""}.`,
      "Leitura profissional: use estes sinais como apoio de contexto e combine com gestao de risco e confirmacao de volume antes de qualquer decisao.",
    ].join("\n");
  }

  private async buildShortTermRiskFallback(message: string): Promise<string> {
    const selectedAssets = resolveRiskAssetIds(message);
    const [marketOverviewResult, macroSnapshotResult] = await Promise.allSettled([
      coinCapMarketDataAdapter.getMarketOverview({
        limit: 15,
      }),
      yahooMarketDataAdapter.getMarketSnapshot({
        symbols: financialMarketPresetSymbols.risk,
      }),
    ]);
    const overviewAssetsById =
      marketOverviewResult.status === "fulfilled"
        ? new Map(marketOverviewResult.value.assets.map((asset) => [asset.assetId, asset]))
        : new Map<string, CoinCapMarketAsset>();
    const spotSnapshots = await Promise.all(
      selectedAssets.map(async (assetId) => {
        try {
          const spotPrice = await cryptoSpotPriceService.getSpotPrice({
            assetId,
            currency: "usd",
          });

          return {
            assetId,
            price: spotPrice.price,
            stale: spotPrice.cache.stale,
          };
        } catch {
          return {
            assetId,
            price: null,
            stale: false,
          };
        }
      }),
    );
    const assetSignals = spotSnapshots.map((spotSnapshot) => {
      const marketOverviewAsset = overviewAssetsById.get(spotSnapshot.assetId) ?? null;
      const priceLabel =
        spotSnapshot.price === null ? "n/d" : `${formatSpotPrice(spotSnapshot.price, "usd")}${spotSnapshot.stale ? " (stale)" : ""}`;
      const changePercent24h = marketOverviewAsset?.changePercent24h ?? null;
      const volumeUsd24h = marketOverviewAsset?.volumeUsd24h ?? null;

      return `${capitalizeAssetId(spotSnapshot.assetId)} ${priceLabel}, 24h ${formatPercent(changePercent24h)}, volatilidade ${classifyVolatility(changePercent24h)}, liquidez ${classifyLiquidity(volumeUsd24h)}`;
    });
    const macroSummary =
      macroSnapshotResult.status === "fulfilled"
        ? summarizeMacroRiskSignals(macroSnapshotResult.value.quotes)
        : "dados macro indisponiveis no momento";
    const operationalHealth = systemStatusService.getOperationalHealth();

    return [
      "Analise objetiva de risco de curto prazo (janela 24h, sem recomendacao de investimento).",
      `Ativos analisados: ${selectedAssets.map((assetId) => capitalizeAssetId(assetId)).join(", ")}.`,
      `Sinais por ativo: ${assetSignals.join(" | ")}.`,
      `Sinais macro: ${macroSummary}.`,
      `Saude operacional de dados: status ${operationalHealth.status}, circuito ${operationalHealth.diagnostics.circuitState}, budget restante ${operationalHealth.diagnostics.budgetRemainingPercent}%.`,
      "Checklist rapido: acompanhar mudanca de volatilidade, deterioracao de volume e aumento de correlacao com choques macro.",
    ].join("\n");
  }
}