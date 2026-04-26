import { z } from "zod";

import type { FastifyReply, FastifyRequest } from "fastify";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import {
  confluenceSignalSchema,
  type AutoPaperTradingBridge,
} from "../application/auto-paper-trading-bridge.js";
import type { InMemoryOperatorDispatchJournal } from "../infrastructure/in-memory-operator-dispatch-journal.js";

const journalQuerySchema = z.object({
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      const parsed =
        typeof value === "number" ? value : Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    })
    .pipe(z.number().int().min(1).max(500).optional()),
});

export class AutoPaperTradingController {
  public constructor(
    private readonly bridge: AutoPaperTradingBridge,
    private readonly operatorJournal?: InMemoryOperatorDispatchJournal,
  ) {}

  public submitConfluenceSignal = (
    request: FastifyRequest,
    reply: FastifyReply,
  ): void => {
    const result = this.bridge.tryOpenFromConfluence(request.body);
    if (this.operatorJournal) {
      const parsedSignal = confluenceSignalSchema.safeParse(request.body);
      if (parsedSignal.success) {
        this.operatorJournal.record({
          asset: parsedSignal.data.asset,
          side: parsedSignal.data.side,
          tier: parsedSignal.data.tier,
          confluenceScore: parsedSignal.data.confluenceScore,
          action: result.action,
          reason: result.reason ?? null,
        });
      }
    }
    const code = result.action === "opened" ? 201 : 200;
    void reply.code(code).send(buildSuccessResponse(request.id, result));
  };

  public triggerEvaluation = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const result = await this.bridge.evaluateOpenTrades();
    void reply.send(buildSuccessResponse(request.id, result));
  };

  public listOperatorJournal = (
    request: FastifyRequest,
    reply: FastifyReply,
  ): void => {
    if (!this.operatorJournal) {
      void reply.code(503).send(
        buildSuccessResponse(request.id, {
          total: 0,
          opened: 0,
          skipped: 0,
          errors: 0,
          entries: [],
          enabled: false,
        }),
      );
      return;
    }
    const query = journalQuerySchema.parse(request.query ?? {});
    const snapshot = this.operatorJournal.snapshot(query.limit);
    void reply
      .code(200)
      .send(buildSuccessResponse(request.id, { ...snapshot, enabled: true }));
  };
}
