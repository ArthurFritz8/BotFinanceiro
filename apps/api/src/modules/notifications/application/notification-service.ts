import type {
  BroadcastResult,
  NotificationPayload,
  PushSubscription,
} from "../domain/notification-types.js";
import type { InMemoryPushSubscriptionStore } from "../infrastructure/in-memory-push-subscription-store.js";
import type { SendResult, WebPushSender } from "../infrastructure/web-push-sender.js";

export interface NotificationServiceOptions {
  readonly enabled: boolean;
  readonly vapidPublicKey: string;
  readonly store: InMemoryPushSubscriptionStore;
  readonly sender: WebPushSender | null;
}

/**
 * Orquestra subscribe / unsubscribe / broadcast de Web Push.
 *
 * Se `enabled=false` (ou VAPID nao configurado), todas as operacoes de envio
 * viram no-op. Subscribe ainda aceita registros (failure-open: o frontend pode
 * pre-registrar antes do operador habilitar push no backend).
 */
export class NotificationService {
  public constructor(private readonly options: NotificationServiceOptions) {}

  public isEnabled(): boolean {
    return this.options.enabled && this.options.sender !== null;
  }

  public getVapidPublicKey(): string {
    return this.options.vapidPublicKey;
  }

  public subscribe(subscription: PushSubscription): { readonly created: boolean } {
    const previousSize = this.options.store.size();
    this.options.store.upsert(subscription);
    const created = this.options.store.size() > previousSize;
    return { created };
  }

  public unsubscribe(endpoint: string): { readonly removed: boolean } {
    const removed = this.options.store.remove(endpoint);
    return { removed };
  }

  public listSubscriptions(): readonly PushSubscription[] {
    return this.options.store.list();
  }

  public async broadcast(payload: NotificationPayload): Promise<BroadcastResult> {
    if (!this.isEnabled()) {
      return { attempted: 0, delivered: 0, removed: 0, failed: 0 };
    }

    const sender = this.options.sender;

    if (sender === null) {
      return { attempted: 0, delivered: 0, removed: 0, failed: 0 };
    }

    const subscriptions = this.options.store.list();
    const results = await Promise.all(
      subscriptions.map((subscription) => sender.send(subscription, payload)),
    );

    return this.summarize(results);
  }

  private summarize(results: readonly SendResult[]): BroadcastResult {
    let delivered = 0;
    let removed = 0;
    let failed = 0;

    for (const result of results) {
      if (result.status === "delivered") {
        delivered += 1;
        continue;
      }

      if (result.status === "gone") {
        this.options.store.remove(result.endpoint);
        removed += 1;
        continue;
      }

      failed += 1;
    }

    return { attempted: results.length, delivered, removed, failed };
  }
}
