import { timingSafeEqual } from "node:crypto";

import type { FastifyRequest } from "fastify";

import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

const INTERNAL_TOKEN_HEADER = "x-internal-token";

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
}