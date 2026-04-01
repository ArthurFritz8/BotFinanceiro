import {
  OpenRouterChatAdapter,
  type OpenRouterChatCompletion,
  type OpenRouterToolDefinition,
} from "../../../integrations/ai/openrouter-chat-adapter.js";
import { AppError } from "../../../shared/errors/app-error.js";
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
  systemPrompt?: string;
  temperature?: number;
}

const openRouterChatAdapter = new OpenRouterChatAdapter();
const cryptoSpotPriceService = new CryptoSpotPriceService();
const cryptoSyncPolicyService = new CryptoSyncPolicyService();
const systemStatusService = new SystemStatusService();

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
    return openRouterChatAdapter.createCompletionWithTools(input, copilotTools);
  }
}