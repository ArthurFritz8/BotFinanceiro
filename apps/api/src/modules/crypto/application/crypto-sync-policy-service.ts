import { env } from "../../../shared/config/env.js";

export type SyncScope = "cold" | "hot" | "warm";

export interface SyncPolicyItem {
  intervalSeconds: number;
  staleSeconds: number;
}

export interface CryptoSyncPolicy {
  cacheDefaultTtlSeconds: number;
  cacheStaleSeconds: number;
  mode: "economy" | "normal";
  policy: Record<SyncScope, SyncPolicyItem>;
}

export class CryptoSyncPolicyService {
  public getPolicy(scope?: SyncScope): CryptoSyncPolicy | SyncPolicyItem {
    const mode = env.SCHEDULER_ECONOMY_MODE ? "economy" : "normal";

    const hotInterval = env.SCHEDULER_ECONOMY_MODE ? 300 : 180;
    const warmInterval = env.SCHEDULER_ECONOMY_MODE ? 900 : 300;
    const coldInterval = env.SCHEDULER_ECONOMY_MODE ? 43_200 : 21_600;

    const fullPolicy: CryptoSyncPolicy = {
      cacheDefaultTtlSeconds: env.CACHE_DEFAULT_TTL_SECONDS,
      cacheStaleSeconds: env.CACHE_STALE_SECONDS,
      mode,
      policy: {
        cold: {
          intervalSeconds: coldInterval,
          staleSeconds: 86_400,
        },
        hot: {
          intervalSeconds: hotInterval,
          staleSeconds: 600,
        },
        warm: {
          intervalSeconds: warmInterval,
          staleSeconds: 1_800,
        },
      },
    };

    if (scope) {
      return fullPolicy.policy[scope];
    }

    return fullPolicy;
  }
}