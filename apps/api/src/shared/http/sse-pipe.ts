import type { FastifyReply, FastifyRequest } from "fastify";

export interface SsePipeOptions {
  /**
   * Allowed origins resolved by the caller (via env). An empty set disables the origin gate.
   */
  allowedOrigins: Set<string>;
  /**
   * Interval between pushes (ms) once the pipe is connected.
   */
  intervalMs: number;
  /**
   * Invoked on each tick. Returning `null`/`undefined` skips the snapshot silently.
   * Throwing is captured and reported via a `stream-error` event.
   */
  pushSnapshot: () => Promise<unknown>;
  /**
   * Label used when formatting the error payload on `stream-error`.
   */
  streamName: string;
}

export interface SsePipeResult {
  accepted: boolean;
}

function normalizeOrigin(value: string): string {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return "";
  }

  try {
    return new URL(trimmedValue).origin;
  } catch {
    return trimmedValue.replace(/\/$/, "");
  }
}

export function writeSseEvent(reply: FastifyReply, eventName: string, payload: unknown): void {
  reply.raw.write(`event: ${eventName}\n`);
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Opens an SSE pipe with canonical headers, keep-alive interval and cleanup on disconnect.
 * Returns `{ accepted: false }` when the origin is rejected; otherwise the pipe is started and
 * the reply has been hijacked.
 */
export function openSsePipe(
  request: FastifyRequest,
  reply: FastifyReply,
  options: SsePipeOptions,
): SsePipeResult {
  const { allowedOrigins, intervalMs, pushSnapshot, streamName } = options;

  const requestOrigin =
    typeof request.headers.origin === "string" ? normalizeOrigin(request.headers.origin) : "";
  const originIsAllowed =
    requestOrigin.length > 0 &&
    (allowedOrigins.size === 0 || allowedOrigins.has(requestOrigin));

  if (requestOrigin.length > 0 && !originIsAllowed) {
    void reply.code(403).send({ error: "Origin not allowed" });
    return { accepted: false };
  }

  reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("X-Accel-Buffering", "no");

  if (originIsAllowed) {
    reply.raw.setHeader("Access-Control-Allow-Origin", requestOrigin);
    reply.raw.setHeader("Vary", "Origin");
  }

  void reply.hijack();

  if (typeof reply.raw.flushHeaders === "function") {
    reply.raw.flushHeaders();
  }

  let isClosed = false;
  let isInFlight = false;
  let streamTimer: NodeJS.Timeout | null = null;

  const cleanup = (): void => {
    if (isClosed) {
      return;
    }

    isClosed = true;

    if (streamTimer) {
      clearInterval(streamTimer);
      streamTimer = null;
    }

    if (!reply.raw.writableEnded) {
      reply.raw.end();
    }
  };

  request.raw.on("close", cleanup);
  request.raw.on("aborted", cleanup);

  const tick = async (): Promise<void> => {
    if (isClosed || isInFlight) {
      return;
    }

    isInFlight = true;

    try {
      const snapshot = await pushSnapshot();

      if (isClosed || snapshot == null) {
        return;
      }

      writeSseEvent(reply, "snapshot", {
        chart: snapshot,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (isClosed) {
        return;
      }

      writeSseEvent(reply, "stream-error", {
        generatedAt: new Date().toISOString(),
        message:
          error instanceof Error
            ? error.message
            : `Falha no stream ${streamName} ao vivo`,
      });
    } finally {
      isInFlight = false;
    }
  };

  writeSseEvent(reply, "meta", {
    generatedAt: new Date().toISOString(),
    mode: "live",
    requestId: request.id,
  });

  void tick();

  streamTimer = setInterval(() => {
    void tick();
  }, intervalMs);

  return { accepted: true };
}
