import { z } from "zod";

import type { FastifyReply, FastifyRequest } from "fastify";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import {
  confluenceSignalSchema,
  type AutoPaperTradingBridge,
} from "../application/auto-paper-trading-bridge.js";
import { operatorDispatchActionSchema } from "../domain/operator-dispatch-types.js";
import type { InMemoryOperatorDispatchJournal } from "../infrastructure/in-memory-operator-dispatch-journal.js";

const optionalIntegerFromQuery = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    const parsed =
      typeof value === "number" ? value : Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  });

const isoDateToMs = z
  .string()
  .trim()
  .min(1)
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "must be a valid ISO 8601 date",
      });
      return z.NEVER;
    }
    return ms;
  });

const journalQuerySchema = z
  .object({
    limit: optionalIntegerFromQuery.pipe(z.number().int().min(1).max(500).optional()),
    from: isoDateToMs,
    to: isoDateToMs,
    action: operatorDispatchActionSchema.optional(),
    asset: z.string().trim().min(1).max(40).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.from !== undefined &&
      value.to !== undefined &&
      value.from > value.to
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["from"],
        message: "from must be less than or equal to to",
      });
    }
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
    const snapshot = this.operatorJournal.snapshot({
      limit: query.limit,
      fromMs: query.from,
      toMs: query.to,
      action: query.action,
      asset: query.asset,
    });
    void reply
      .code(200)
      .send(buildSuccessResponse(request.id, { ...snapshot, enabled: true }));
  };
}
