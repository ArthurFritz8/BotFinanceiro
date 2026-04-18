import assert from "node:assert/strict";
import { it } from "node:test";

import Fastify from "fastify";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";

const { NotificationService } = await import("../application/notification-service.js");
const { InMemoryPushSubscriptionStore } = await import(
  "../infrastructure/in-memory-push-subscription-store.js"
);
const { NotificationsController } = await import("./notifications-controller.js");
const { registerNotificationsInternalRoutes, registerNotificationsPublicRoutes } = await import(
  "./notifications-routes.js"
);
const { httpErrorHandler } = await import("../../../shared/errors/http-error-handler.js");

interface BuildOptions {
  readonly enabled?: boolean;
  readonly vapidPublicKey?: string;
}

function buildTestApp(options: BuildOptions = {}) {
  const app = Fastify({ logger: false });
  app.setErrorHandler(httpErrorHandler);
  const store = new InMemoryPushSubscriptionStore();
  const service = new NotificationService({
    enabled: options.enabled ?? false,
    sender: null,
    store,
    vapidPublicKey: options.vapidPublicKey ?? "test-public-key-AbCdEfGh",
  });
  const controller = new NotificationsController(service);

  registerNotificationsInternalRoutes(app, controller);
  void app.register(
    (instance, _, done) => {
      registerNotificationsPublicRoutes(instance, controller);
      done();
    },
    { prefix: "/v1" },
  );

  return { app, store, service };
}

const validSubscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  expirationTime: null,
  keys: {
    auth: "auth-key-base64url",
    p256dh: "p256dh-key-base64url",
  },
};

void it("notifications: GET /v1/notifications/vapid-public-key retorna chave configurada", async () => {
  const { app } = buildTestApp({ vapidPublicKey: "BPUBLIC_KEY_FAKE" });
  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/notifications/vapid-public-key",
    });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload) as {
      data: { publicKey: string; enabled: boolean };
    };
    assert.equal(body.data.publicKey, "BPUBLIC_KEY_FAKE");
    assert.equal(body.data.enabled, false);
  } finally {
    await app.close();
  }
});

void it("notifications: GET /v1/notifications/vapid-public-key retorna 503 quando nao configurada", async () => {
  const { app } = buildTestApp({ vapidPublicKey: "" });
  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/notifications/vapid-public-key",
    });
    assert.equal(response.statusCode, 503);
  } finally {
    await app.close();
  }
});

void it("notifications: POST /v1/notifications/subscribe registra subscription valida", async () => {
  const { app, store } = buildTestApp();
  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/notifications/subscribe",
      payload: validSubscription,
    });
    assert.equal(response.statusCode, 201);
    assert.equal(store.size(), 1);
    const body = JSON.parse(response.payload) as {
      data: { created: boolean; endpoint: string };
    };
    assert.equal(body.data.created, true);
    assert.equal(body.data.endpoint, validSubscription.endpoint);
  } finally {
    await app.close();
  }
});

void it("notifications: subscribe duplicado nao incrementa store (upsert idempotente)", async () => {
  const { app, store } = buildTestApp();
  try {
    await app.inject({
      method: "POST",
      url: "/v1/notifications/subscribe",
      payload: validSubscription,
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/notifications/subscribe",
      payload: validSubscription,
    });
    assert.equal(response.statusCode, 201);
    assert.equal(store.size(), 1);
    const body = JSON.parse(response.payload) as {
      data: { created: boolean };
    };
    assert.equal(body.data.created, false);
  } finally {
    await app.close();
  }
});

void it("notifications: POST /v1/notifications/subscribe rejeita payload invalido (400)", async () => {
  const { app } = buildTestApp();
  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/notifications/subscribe",
      payload: { endpoint: "not-a-url" },
    });
    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

void it("notifications: POST /v1/notifications/unsubscribe remove endpoint existente", async () => {
  const { app, store } = buildTestApp();
  try {
    await app.inject({
      method: "POST",
      url: "/v1/notifications/subscribe",
      payload: validSubscription,
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/notifications/unsubscribe",
      payload: { endpoint: validSubscription.endpoint },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(store.size(), 0);
    const body = JSON.parse(response.payload) as { data: { removed: boolean } };
    assert.equal(body.data.removed, true);
  } finally {
    await app.close();
  }
});

void it("notifications: POST /internal/notifications/broadcast exige token (ADR-007/008)", async () => {
  const { app } = buildTestApp();
  try {
    const response = await app.inject({
      method: "POST",
      url: "/internal/notifications/broadcast",
      payload: { title: "Sinal", body: "Confluencia 5/5" },
    });
    assert.ok(response.statusCode === 401 || response.statusCode === 403);
  } finally {
    await app.close();
  }
});

void it("notifications: broadcast com sender null reporta zero attempts (failure-open)", async () => {
  const { app } = buildTestApp({ enabled: false });
  try {
    await app.inject({
      method: "POST",
      url: "/v1/notifications/subscribe",
      payload: validSubscription,
    });
    const response = await app.inject({
      method: "POST",
      url: "/internal/notifications/broadcast",
      headers: { "x-internal-token": "test_internal_token_12345" },
      payload: { title: "Sinal", body: "Confluencia 5/5" },
    });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload) as {
      data: { attempted: number; delivered: number };
    };
    assert.equal(body.data.attempted, 0);
    assert.equal(body.data.delivered, 0);
  } finally {
    await app.close();
  }
});
