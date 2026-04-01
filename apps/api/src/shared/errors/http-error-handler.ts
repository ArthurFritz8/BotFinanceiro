import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import { logger } from "../logger/logger.js";
import { AppError } from "./app-error.js";

function extractStatusCode(error: FastifyError | Error): number {
  if ("statusCode" in error && typeof error.statusCode === "number") {
    return error.statusCode;
  }

  return 500;
}

export function httpErrorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    logger.warn(
      {
        code: error.code,
        details: error.details,
        method: request.method,
        route: request.url,
      },
      error.message,
    );

    void reply.status(error.statusCode).send({
      error: {
        code: error.code,
        details: error.details,
        message: error.message,
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    logger.warn(
      {
        issues: error.issues,
        method: request.method,
        route: request.url,
      },
      "Validation error",
    );

    void reply.status(400).send({
      error: {
        code: "VALIDATION_ERROR",
        details: error.issues,
        message: "Invalid payload",
      },
    });
    return;
  }

  const statusCode = extractStatusCode(error);
  const publicMessage = statusCode >= 500 ? "Internal server error" : error.message;

  logger.error(
    {
      err: error,
      method: request.method,
      route: request.url,
    },
    "Unhandled request error",
  );

  void reply.status(statusCode).send({
    error: {
      code: "INTERNAL_ERROR",
      message: publicMessage,
    },
  });
}