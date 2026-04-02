import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { buildSuccessResponse } from "../../../shared/http/api-response.js";
import {
  CryptoChartService,
} from "../application/crypto-chart-service.js";
import {
  CryptoSpotPriceService,
} from "../application/crypto-spot-price-service.js";
import {
  CryptoSyncPolicyService,
} from "../application/crypto-sync-policy-service.js";

const syncPolicyQuerySchema = z.object({
  scope: z.enum(["hot", "warm", "cold"]).optional(),
});

const spotPriceQuerySchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  currency: z.string().trim().min(2).max(10).default("usd"),
});

const chartQuerySchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  currency: z.string().trim().min(2).max(10).default("usd"),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("7d"),
});

const liveChartQuerySchema = z.object({
  assetId: z.string().trim().min(1).default("bitcoin"),
  range: z.enum(["24h", "7d", "30d", "90d", "1y"]).default("24h"),
});

const cryptoSyncPolicyService = new CryptoSyncPolicyService();
const cryptoSpotPriceService = new CryptoSpotPriceService();
const cryptoChartService = new CryptoChartService();

export function getSyncPolicy(request: FastifyRequest, reply: FastifyReply): void {
  const parsedQuery = syncPolicyQuerySchema.parse(request.query);
  const policy = parsedQuery.scope
    ? cryptoSyncPolicyService.getPolicy(parsedQuery.scope)
    : cryptoSyncPolicyService.getPolicy();

  void reply.send(buildSuccessResponse(request.id, policy));
}

export async function getSpotPrice(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = spotPriceQuerySchema.parse(request.query);
  const spotPrice = await cryptoSpotPriceService.getSpotPrice(parsedQuery);

  void reply.send(buildSuccessResponse(request.id, spotPrice));
}

export async function getChart(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = chartQuerySchema.parse(request.query);
  const chart = await cryptoChartService.getChart(parsedQuery);

  void reply.send(buildSuccessResponse(request.id, chart));
}

export async function getLiveChart(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsedQuery = liveChartQuerySchema.parse(request.query);
  const chart = await cryptoChartService.getLiveChart(parsedQuery);

  void reply.send(buildSuccessResponse(request.id, chart));
}