import { z } from "zod";

import type {
  NotificationPayload,
} from "../../notifications/domain/notification-types.js";
import type { NotificationService } from "../../notifications/application/notification-service.js";
import type { PaperTradingService } from "./paper-trading-service.js";
import type { Trade, TradeSide } from "../domain/paper-trading-types.js";

/**
 * Provedor de preco corrente para um ativo. Abstracao deliberadamente fina:
 * o bridge nao deve conhecer detalhes de exchange/broker — facilita teste e
 * permite trocar a fonte (multi-exchange, CoinGecko, WS Binance) sem ripple.
 */
export type PriceProvider = (assetId: string) => Promise<number>;

export const confluenceSignalSchema = z.object({
  asset: z.string().trim().min(1).max(40),
  side: z.enum(["long", "short"]),
  entryPrice: z.number().positive(),
  stopPrice: z.number().positive(),
  targetPrice: z.number().positive(),
  /** score normalizado 0-100 (backend). Tier "high" tipicamente >= 70. */
  confluenceScore: z.number().min(0).max(100),
  tier: z.enum(["high", "medium", "low"]),
});

export type ConfluenceSignal = z.infer<typeof confluenceSignalSchema>;

export interface AutoPaperTradingBridgeOptions {
  readonly paperTradingService: PaperTradingService;
  readonly priceProvider: PriceProvider;
  readonly notificationService?: NotificationService | null;
  /**
   * Tier minimo aceito para abertura automatica. Padrao "high" — apenas
   * sinais com score >= 70 (regiao "alta confluencia"). Configurable via env.
   */
  readonly minTier?: "high" | "medium";
  readonly logger?: { warn: (msg: string, ctx?: Record<string, unknown>) => void };
}

export interface OpenAttemptResult {
  readonly action: "opened" | "skipped";
  readonly reason?: "duplicate_open_trade" | "below_min_tier" | "wait_action";
  readonly trade?: Trade;
}

export interface EvaluateRunResult {
  readonly evaluated: number;
  readonly closed: number;
  readonly errors: number;
}

const TIER_RANK: Record<"low" | "medium" | "high", number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/**
 * Ponte (Application Service) entre o Intelligence Desk (sinais de
 * confluencia SMC) e o Paper Trading (execucao virtual + PnL).
 *
 * Responsabilidades:
 *  - `tryOpenFromConfluence(signal)`: abre trade simulado se sinal passa o
 *    gate de tier minimo e nao ha trade aberto duplicado para o ativo.
 *  - `evaluateOpenTrades()`: itera trades abertos, busca preco atual via
 *    PriceProvider, chama PaperTradingService.evaluatePrice e — se algum
 *    fechou — dispara broadcast Web Push com o resultado.
 *
 * Idempotencia: trades sao agrupados por ativo. Se ja existe um trade
 * aberto para `signal.asset`, o sinal eh ignorado (skip duplicate). Isso
 * evita "rajadas" de abertura quando o Intelligence Desk reemite o mesmo
 * sinal a cada poll do scheduler.
 */
export class AutoPaperTradingBridge {
  private readonly minTier: "high" | "medium";

  public constructor(private readonly options: AutoPaperTradingBridgeOptions) {
    this.minTier = options.minTier ?? "high";
  }

  public tryOpenFromConfluence(rawSignal: unknown): OpenAttemptResult {
    const signal = confluenceSignalSchema.parse(rawSignal);

    if (TIER_RANK[signal.tier] < TIER_RANK[this.minTier]) {
      return { action: "skipped", reason: "below_min_tier" };
    }

    const existingOpen = this.options.paperTradingService
      .listTrades()
      .filter(
        (trade) =>
          trade.status === "open" &&
          trade.asset.toLowerCase() === signal.asset.toLowerCase(),
      );

    if (existingOpen.length > 0) {
      return { action: "skipped", reason: "duplicate_open_trade" };
    }

    const trade = this.options.paperTradingService.openTrade({
      asset: signal.asset,
      side: signal.side,
      entryPrice: signal.entryPrice,
      stopPrice: signal.stopPrice,
      targetPrice: signal.targetPrice,
      confluenceScore: this.normalizeScore(signal.confluenceScore),
      notes: `auto-bridge tier=${signal.tier} score=${signal.confluenceScore.toFixed(0)}`,
    });

    void this.dispatchBroadcast({
      title: `Trade aberto · ${trade.asset.toUpperCase()}`,
      body: `${trade.side === "long" ? "↑ LONG" : "↓ SHORT"} entry ${trade.entryPrice} | alvo ${trade.targetPrice} | stop ${trade.stopPrice} (tier ${signal.tier})`,
      tag: `paper-trade-open-${trade.id}`,
      data: { url: "/paper" },
    });

    return { action: "opened", trade };
  }

  public async evaluateOpenTrades(): Promise<EvaluateRunResult> {
    const openTrades = this.options.paperTradingService
      .listTrades()
      .filter((trade) => trade.status === "open");

    const assets = [...new Set(openTrades.map((trade) => trade.asset))];

    let evaluated = 0;
    let closed = 0;
    let errors = 0;

    for (const asset of assets) {
      try {
        const price = await this.options.priceProvider(asset);
        const results = this.options.paperTradingService.evaluatePrice({
          asset,
          price,
        });
        evaluated += results.length;
        for (const result of results) {
          if (result.closed) {
            closed += 1;
            void this.dispatchClosedNotification(result.trade);
          }
        }
      } catch (error) {
        errors += 1;
        this.options.logger?.warn("auto-paper-trading evaluate failed", {
          asset,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { evaluated, closed, errors };
  }

  private async dispatchClosedNotification(trade: Trade): Promise<void> {
    const outcome = trade.status === "win" ? "WIN ✅" : "LOSS ❌";
    const pnl = typeof trade.pnlPercent === "number" ? trade.pnlPercent.toFixed(2) : "—";
    await this.dispatchBroadcast({
      title: `${outcome} · ${trade.asset.toUpperCase()}`,
      body: `${this.formatSide(trade.side)} entry ${trade.entryPrice} → exit ${trade.exitPrice ?? "—"} | PnL ${pnl}%`,
      tag: `paper-trade-close-${trade.id}`,
      data: { url: "/paper" },
    });
  }

  private async dispatchBroadcast(payload: NotificationPayload): Promise<void> {
    const service = this.options.notificationService;
    if (!service || !service.isEnabled()) {
      return;
    }
    try {
      await service.broadcast(payload);
    } catch (error) {
      this.options.logger?.warn("auto-paper-trading broadcast failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private formatSide(side: TradeSide): string {
    return side === "long" ? "↑ LONG" : "↓ SHORT";
  }

  /**
   * Mapeia score backend (0-100) para escala curta (0-5) do dominio do
   * Trade. Mantem proporcionalidade e clamp.
   */
  private normalizeScore(score: number): number {
    const clamped = Math.max(0, Math.min(100, score));
    return Math.round((clamped / 100) * 5);
  }
}
