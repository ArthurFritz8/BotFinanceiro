import { z } from "zod";

export const pushSubscriptionKeysSchema = z.object({
  auth: z.string().min(1).max(512),
  p256dh: z.string().min(1).max(512),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  expirationTime: z.number().int().nullable().optional(),
  keys: pushSubscriptionKeysSchema,
});

export type PushSubscriptionKeys = z.infer<typeof pushSubscriptionKeysSchema>;
export type PushSubscription = z.infer<typeof pushSubscriptionSchema>;

export interface NotificationPayload {
  readonly title: string;
  readonly body: string;
  readonly icon?: string;
  readonly tag?: string;
  readonly url?: string;
  readonly data?: Record<string, unknown>;
}

export interface BroadcastResult {
  readonly attempted: number;
  readonly delivered: number;
  readonly removed: number;
  readonly failed: number;
}
