import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";

import type { FastifyReply, FastifyRequest } from "fastify";

import { openSsePipe } from "./sse-pipe.js";

interface MockReplyRaw {
  ended: boolean;
  flushHeaders: () => void;
  headers: Map<string, string>;
  setHeader: (name: string, value: string) => void;
  writableEnded: boolean;
  write: (chunk: string) => void;
  writes: string[];
  end: () => void;
}

interface MockReply {
  raw: MockReplyRaw;
  hijacked: boolean;
  statusCode: number | null;
  sent: unknown;
  code: (statusCode: number) => MockReply;
  hijack: () => MockReply;
  send: (payload: unknown) => MockReply;
}

interface MockRequest {
  id: string;
  headers: { origin?: string };
  raw: EventEmitter;
}

function createMockReply(): MockReply {
  const rawEmitter = new EventEmitter() as EventEmitter & MockReplyRaw;
  const reply: MockReply = {
    hijacked: false,
    raw: Object.assign(rawEmitter, {
      ended: false,
      writableEnded: false,
      headers: new Map<string, string>(),
      writes: [] as string[],
      setHeader: function setHeader(name: string, value: string): void {
        this.headers.set(name, value);
      },
      flushHeaders: function flushHeaders(): void {
        /* no-op */
      },
      write: function write(chunk: string): void {
        this.writes.push(chunk);
      },
      end: function end(): void {
        this.ended = true;
        this.writableEnded = true;
      },
    }),
    statusCode: null,
    sent: null,
    code(statusCode: number): MockReply {
      this.statusCode = statusCode;
      return this;
    },
    hijack(): MockReply {
      this.hijacked = true;
      return this;
    },
    send(payload: unknown): MockReply {
      this.sent = payload;
      return this;
    },
  };

  return reply;
}

function createMockRequest(origin?: string): MockRequest {
  return {
    id: "req-test",
    headers: origin ? { origin } : {},
    raw: new EventEmitter(),
  };
}

function lastSnapshotPayload(reply: MockReply): Record<string, unknown> | null {
  const snapshotWrites = reply.raw.writes.filter((chunk) => chunk.startsWith("event: snapshot"));
  const dataWrite = reply.raw.writes[reply.raw.writes.indexOf(snapshotWrites[snapshotWrites.length - 1] ?? "") + 1];

  if (!dataWrite) {
    return null;
  }

  const jsonStart = dataWrite.indexOf("data: ") + "data: ".length;
  const jsonEnd = dataWrite.lastIndexOf("\n\n");

  try {
    return JSON.parse(dataWrite.slice(jsonStart, jsonEnd)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

void describe("openSsePipe", () => {
  void it("rejeita origem nao permitida sem abrir pipe", () => {
    const request = createMockRequest("https://evil.example.com");
    const reply = createMockReply();

    const result = openSsePipe(request as unknown as FastifyRequest, reply as unknown as FastifyReply, {
      allowedOrigins: new Set(["https://app.botfinanceiro.local"]),
      intervalMs: 1000,
      pushSnapshot: () => Promise.resolve({ ok: true }),
      streamName: "test",
    });

    assert.equal(result.accepted, false);
    assert.equal(reply.statusCode, 403);
    assert.equal(reply.hijacked, false);
    assert.deepEqual(reply.sent, { error: "Origin not allowed" });
  });

  void it("aceita origem conhecida, escreve meta e snapshot inicial", async () => {
    const request = createMockRequest("https://app.botfinanceiro.local");
    const reply = createMockReply();
    let tickCount = 0;

    const result = openSsePipe(request as unknown as FastifyRequest, reply as unknown as FastifyReply, {
      allowedOrigins: new Set(["https://app.botfinanceiro.local"]),
      intervalMs: 10_000,
      pushSnapshot: () => {
        tickCount += 1;
        return Promise.resolve({ price: 1 });
      },
      streamName: "test",
    });

    assert.equal(result.accepted, true);
    assert.equal(reply.hijacked, true);
    assert.equal(reply.raw.headers.get("Content-Type"), "text/event-stream; charset=utf-8");
    assert.equal(reply.raw.headers.get("Cache-Control"), "no-cache, no-transform");

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(tickCount, 1);
    const snapshot = lastSnapshotPayload(reply);
    assert.ok(snapshot);
    assert.deepEqual(snapshot.chart, { price: 1 });

    request.raw.emit("close");
  });

  void it("encaminha falhas do pushSnapshot como stream-error e continua aberto", async () => {
    const request = createMockRequest("https://app.botfinanceiro.local");
    const reply = createMockReply();
    const error = new Error("boom");

    const result = openSsePipe(request as unknown as FastifyRequest, reply as unknown as FastifyReply, {
      allowedOrigins: new Set(["https://app.botfinanceiro.local"]),
      intervalMs: 60_000,
      pushSnapshot: () => Promise.reject(error),
      streamName: "test",
    });

    assert.equal(result.accepted, true);

    await new Promise((resolve) => setImmediate(resolve));

    const errorChunk = reply.raw.writes.find((chunk) => chunk.startsWith("event: stream-error"));
    assert.ok(errorChunk, "esperado evento stream-error");
    assert.equal(reply.raw.writableEnded, false);

    request.raw.emit("close");
  });

  void it("encerra pipe ao receber close no request", () => {
    const request = createMockRequest("https://app.botfinanceiro.local");
    const reply = createMockReply();

    const result = openSsePipe(request as unknown as FastifyRequest, reply as unknown as FastifyReply, {
      allowedOrigins: new Set(["https://app.botfinanceiro.local"]),
      intervalMs: 60_000,
      pushSnapshot: () => Promise.resolve({ ok: true }),
      streamName: "test",
    });

    assert.equal(result.accepted, true);

    request.raw.emit("close");

    assert.equal(reply.raw.writableEnded, true);
  });
});
