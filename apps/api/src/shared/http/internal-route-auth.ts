import { timingSafeEqual } from "node:crypto";

import type { FastifyRequest } from "fastify";

import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

const INTERNAL_TOKEN_HEADER = "x-internal-token";
const FORWARDED_FOR_HEADER = "x-forwarded-for";

function extractHeaderToken(request: FastifyRequest): string | null {
  const headerValue = request.headers[INTERNAL_TOKEN_HEADER];

  if (typeof headerValue === "string") {
    return headerValue;
  }

  if (Array.isArray(headerValue) && headerValue.length > 0) {
    const firstValue = headerValue[0];
    return typeof firstValue === "string" ? firstValue : null;
  }

  return null;
}

function constantTimeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function extractClientIps(request: FastifyRequest): string[] {
  const candidates = new Set<string>();

  if (typeof request.ip === "string" && request.ip.trim().length > 0) {
    candidates.add(request.ip.trim());
  }

  const forwardedForHeader = request.headers[FORWARDED_FOR_HEADER];

  if (typeof forwardedForHeader === "string") {
    for (const ip of forwardedForHeader.split(",").map((value) => value.trim())) {
      if (ip.length > 0) {
        candidates.add(ip);
      }
    }
  }

  if (Array.isArray(forwardedForHeader)) {
    for (const value of forwardedForHeader) {
      if (typeof value !== "string") {
        continue;
      }

      for (const ip of value.split(",").map((item) => item.trim())) {
        if (ip.length > 0) {
          candidates.add(ip);
        }
      }
    }
  }

  return [...candidates];
}

export function assertInternalRouteAuth(request: FastifyRequest): void {
  if (env.INTERNAL_API_TOKEN.length < 16) {
    throw new AppError({
      code: "INTERNAL_AUTH_NOT_CONFIGURED",
      message: "Internal route authentication token is not configured",
      statusCode: 503,
    });
  }

  const receivedToken = extractHeaderToken(request);

  if (!receivedToken) {
    throw new AppError({
      code: "INTERNAL_AUTH_MISSING_TOKEN",
      message: "Missing internal route token",
      statusCode: 401,
    });
  }

  if (!constantTimeCompare(receivedToken, env.INTERNAL_API_TOKEN)) {
    throw new AppError({
      code: "INTERNAL_AUTH_INVALID_TOKEN",
      message: "Invalid internal route token",
      statusCode: 401,
    });
  }

  if (env.INTERNAL_ALLOWED_IPS.length === 0) {
    return;
  }

  const clientIps = extractClientIps(request);
  const isAllowed = clientIps.some((ip) => env.INTERNAL_ALLOWED_IPS.includes(ip));

  if (isAllowed) {
    return;
  }

  throw new AppError({
    code: "INTERNAL_AUTH_IP_NOT_ALLOWED",
    details: {
      clientIps,
    },
    message: "Client IP is not allowed for internal routes",
    statusCode: 403,
  });
}