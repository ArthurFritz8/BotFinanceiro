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
import { AppError } from "../../../shared/errors/app-error.js";
import { logger } from "../../../shared/logger/logger.js";
import {
  copilotChatAuditStore,
  type CopilotChatSessionHistory,
} from "../../../shared/observability/copilot-chat-audit-store.js";
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
const cryptoSpotPriceService = new CryptoSpotPriceService();
const cryptoSyncPolicyService = new CryptoSyncPolicyService();
const systemStatusService = new SystemStatusService();

const copilotDefaultSystemPrompt = [
  "Voce e um copiloto financeiro focado em dados objetivos de mercado e operacao.",
  "Quando a pergunta envolver resumo, panorama ou contexto do mercado cripto, priorize a tool get_crypto_market_overview.",
  "Quando a pergunta envolver preco ou comparacao entre ativos, use get_crypto_spot_price ou get_crypto_multi_spot_price.",
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

const copilotSyncPolicyToolInputSchema = z.object({
  scope: z.enum(["hot", "warm", "cold"]).optional(),
});

const copilotOperationalHealthToolInputSchema = z.object({});

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

function hasGenericLimitationAnswer(answer: string): boolean {
  const normalizedAnswer = normalizeText(answer);

  return (
    normalizedAnswer.includes("nao tenho a capacidade") ||
    normalizedAnswer.includes("nao tenho capacidade") ||
    normalizedAnswer.includes("nao tenho informacoes") ||
    normalizedAnswer.includes("nao consigo fornecer") ||
    normalizedAnswer.includes("nao posso fornecer") ||
    normalizedAnswer.includes("sinto muito")
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
    const completionWithFallback = await this.applyMarketSummaryFallback(preparedInput, completion);

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

  private async applyMarketSummaryFallback(
    input: CopilotChatInput,
    completion: OpenRouterChatCompletion,
  ): Promise<OpenRouterChatCompletion> {
    if (completion.toolCallsUsed.length > 0) {
      return completion;
    }

    if (!hasMarketSummaryIntent(input.message)) {
      return completion;
    }

    if (!hasGenericLimitationAnswer(completion.answer)) {
      return completion;
    }

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
}