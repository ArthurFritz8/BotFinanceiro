import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import {
  CryptoSyncPolicyService,
} from "../application/crypto-sync-policy-service.js";

const querySchema = z.object({
  scope: z.enum(["hot", "warm", "cold"]).optional(),
});

const cryptoSyncPolicyService = new CryptoSyncPolicyService();

export function getSyncPolicy(request: FastifyRequest, reply: FastifyReply): void {
  const parsedQuery = querySchema.parse(request.query);
  const policy = cryptoSyncPolicyService.getPolicy(parsedQuery.scope);

  void reply.send(buildSuccessResponse(request.id, policy));
}