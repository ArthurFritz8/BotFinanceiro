import type { FastifyInstance } from "fastify";

import { env } from "../../../shared/config/env.js";
import { brokerLiveQuoteStreamMetricsStore } from "../../../shared/observability/broker-live-quote-stream-metrics-store.js";
import {
  getBrokerCatalog,
  getBrokerLiveQuote,
  getBrokerLiveQuoteBatch,
  getBrokerLiveQuoteStreamSnapshot,
  parseBrokerLiveQuoteStreamQuery,
} from "./brokers-controller.js";

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

const allowedOrigins = new Set(env.CORS_ALLOWED_ORIGINS.map((origin) => normalizeOrigin(origin)));

export function registerBrokersRoutes(app: FastifyInstance): void {
  app.get("/brokers/catalog", getBrokerCatalog);
  app.get("/brokers/live-quote", getBrokerLiveQuote);
  app.get("/brokers/live-quote/batch", getBrokerLiveQuoteBatch);
  app.get("/brokers/live-quote/stream", (request, reply) => {
    const parsedQuery = parseBrokerLiveQuoteStreamQuery(request.query);
    const requestOrigin =
      typeof request.headers.origin === "string" ? normalizeOrigin(request.headers.origin) : "";
    const originIsAllowed =
      requestOrigin.length > 0 &&
      (allowedOrigins.size === 0 || allowedOrigins.has(requestOrigin));

    if (requestOrigin.length > 0 && !originIsAllowed) {
      void reply.code(403).send({
        error: "Origin not allowed",
      });
      return;
    }

    const streamId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    let sequence = 0;
    let closed = false;

    void reply.hijack();
    const responseHeaders: Record<string, string> = {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    };

    if (originIsAllowed) {
      responseHeaders["Access-Control-Allow-Origin"] = requestOrigin;
      responseHeaders.Vary = "Origin";
    }

    reply.raw.writeHead(200, responseHeaders);

    brokerLiveQuoteStreamMetricsStore.onConnectionOpened({
      broker: parsedQuery.broker,
      streamId,
    });

    const publishSnapshot = async () => {
      try {
        const batch = await getBrokerLiveQuoteStreamSnapshot({
          assetIds: parsedQuery.assetIds,
          broker: parsedQuery.broker,
        });
        sequence += 1;

        reply.raw.write(
          `event: snapshot\ndata: ${JSON.stringify({
            batch,
            generatedAt: new Date().toISOString(),
            sequence,
          })}\n\n`,
        );
        brokerLiveQuoteStreamMetricsStore.onSnapshotPublished({
          broker: parsedQuery.broker,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to build stream snapshot";
        reply.raw.write(`event: stream-error\ndata: ${JSON.stringify({ message })}\n\n`);
        brokerLiveQuoteStreamMetricsStore.onSnapshotError({
          broker: parsedQuery.broker,
          message,
        });
      }
    };

    const keepAliveTimer = setInterval(() => {
      reply.raw.write(`event: keepalive\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
      brokerLiveQuoteStreamMetricsStore.onKeepAlive({
        broker: parsedQuery.broker,
      });
    }, 15000);

    const snapshotTimer = setInterval(() => {
      void publishSnapshot();
    }, parsedQuery.intervalMs);

    void publishSnapshot();

    const closeStream = () => {
      if (closed) {
        return;
      }

      closed = true;
      clearInterval(keepAliveTimer);
      clearInterval(snapshotTimer);
      brokerLiveQuoteStreamMetricsStore.onConnectionClosed({
        broker: parsedQuery.broker,
        streamId,
      });

      if (!reply.raw.writableEnded) {
        reply.raw.end();
      }
    };

    request.raw.once("aborted", closeStream);
    request.raw.once("close", closeStream);
  });
}
