import { z } from "zod";

import { tradeSideSchema } from "./paper-trading-types.js";

/**
 * Entrada do journal centralizado de disparos do operador
 * (`POST /v1/paper-trading/operator/auto-signal`).
 *
 * Deliberadamente minima e nao sensivel: nao persistimos token, IP nem
 * payload completo — apenas dados que ja viajam no sinal de confluencia +
 * resultado do `AutoPaperTradingBridge`. Permite auditoria cross-device
 * complementar ao journal local do ADR-104, sem expor superficie nova.
 */
export const operatorDispatchActionSchema = z.enum(["opened", "skipped", "error"]);
export type OperatorDispatchAction = z.infer<typeof operatorDispatchActionSchema>;

export const operatorDispatchTierSchema = z.enum(["high", "medium", "low"]);
export type OperatorDispatchTier = z.infer<typeof operatorDispatchTierSchema>;

export const operatorDispatchEntrySchema = z.object({
  id: z.string().min(8).max(64),
  occurredAtMs: z.number().int().positive(),
  asset: z.string().min(1).max(40),
  side: tradeSideSchema,
  tier: operatorDispatchTierSchema,
  confluenceScore: z.number().min(0).max(100),
  action: operatorDispatchActionSchema,
  reason: z.string().min(1).max(80).nullable(),
});

export type OperatorDispatchEntry = z.infer<typeof operatorDispatchEntrySchema>;

export interface OperatorDispatchJournalSnapshot {
  readonly total: number;
  readonly opened: number;
  readonly skipped: number;
  readonly errors: number;
  readonly entries: readonly OperatorDispatchEntry[];
}
