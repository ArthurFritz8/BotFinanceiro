import type { PushSubscription } from "../domain/notification-types.js";

/**
 * Store in-memory de PushSubscriptions indexado por endpoint (chave unica W3C).
 *
 * Escopo: single-node, ephemero. Subscriptions sao perdidas em restart do
 * processo. Aceitavel para MVP zero-cost: o frontend reassina automaticamente
 * em pageload via `pushManager.subscribe` quando detecta `getSubscription()`
 * retornando null.
 *
 * Evolucao prevista (ADR futuro): persistir em SQLite/Postgres tabela
 * `push_subscriptions(endpoint TEXT PRIMARY KEY, p256dh, auth, created_at,
 * last_seen_at)`.
 */
export class InMemoryPushSubscriptionStore {
  private readonly subscriptions = new Map<string, PushSubscription>();

  public upsert(subscription: PushSubscription): void {
    this.subscriptions.set(subscription.endpoint, subscription);
  }

  public remove(endpoint: string): boolean {
    return this.subscriptions.delete(endpoint);
  }

  public list(): readonly PushSubscription[] {
    return [...this.subscriptions.values()];
  }

  public size(): number {
    return this.subscriptions.size;
  }

  public clear(): void {
    this.subscriptions.clear();
  }
}
