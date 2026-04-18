import webpush from "web-push";

import type {
  NotificationPayload,
  PushSubscription,
} from "../domain/notification-types.js";

/**
 * Resultado granular do envio para uma subscription. `gone` indica HTTP 404/410
 * do push service (subscription expirou ou foi revogada pelo usuario) e o store
 * deve remover essa entrada para nao tentar de novo.
 */
export type SendResult =
  | { readonly status: "delivered"; readonly endpoint: string }
  | { readonly status: "gone"; readonly endpoint: string }
  | { readonly status: "failed"; readonly endpoint: string; readonly statusCode: number };

export interface WebPushSenderOptions {
  readonly vapidSubject: string;
  readonly vapidPublicKey: string;
  readonly vapidPrivateKey: string;
}

/**
 * Wrapper fino sobre `web-push` que injeta VAPID details uma vez e classifica
 * a resposta para que o caller (NotificationService) possa decidir atomicamente
 * o que fazer com cada endpoint.
 */
export class WebPushSender {
  public constructor(private readonly options: WebPushSenderOptions) {
    webpush.setVapidDetails(
      options.vapidSubject,
      options.vapidPublicKey,
      options.vapidPrivateKey,
    );
  }

  public async send(
    subscription: PushSubscription,
    payload: NotificationPayload,
  ): Promise<SendResult> {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload), {
        TTL: 60 * 60,
        urgency: "high",
      });
      return { status: "delivered", endpoint: subscription.endpoint };
    } catch (error) {
      const statusCode = extractStatusCode(error);

      if (statusCode === 404 || statusCode === 410) {
        return { status: "gone", endpoint: subscription.endpoint };
      }

      return { status: "failed", endpoint: subscription.endpoint, statusCode };
    }
  }
}

function extractStatusCode(error: unknown): number {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const value = (error as { statusCode: unknown }).statusCode;
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}
