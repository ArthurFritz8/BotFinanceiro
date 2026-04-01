interface CacheEntry<TValue> {
  expiresAt: number;
  staleUntil: number;
  value: TValue;
}

interface FreshCacheHit<TValue> {
  expiresAt: number;
  staleUntil: number;
  state: "fresh";
  value: TValue;
}

interface StaleCacheHit<TValue> {
  expiresAt: number;
  staleUntil: number;
  state: "stale";
  value: TValue;
}

interface CacheMiss {
  state: "miss";
}

export type MemoryCacheResult<TValue> = FreshCacheHit<TValue> | StaleCacheHit<TValue> | CacheMiss;

export class MemoryCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  public get<TValue>(key: string): MemoryCacheResult<TValue> {
    const existingEntry = this.entries.get(key);

    if (!existingEntry) {
      return {
        state: "miss",
      };
    }

    const now = Date.now();

    if (now <= existingEntry.expiresAt) {
      return {
        expiresAt: existingEntry.expiresAt,
        staleUntil: existingEntry.staleUntil,
        state: "fresh",
        value: existingEntry.value as TValue,
      };
    }

    if (now <= existingEntry.staleUntil) {
      return {
        expiresAt: existingEntry.expiresAt,
        staleUntil: existingEntry.staleUntil,
        state: "stale",
        value: existingEntry.value as TValue,
      };
    }

    this.entries.delete(key);
    return {
      state: "miss",
    };
  }

  public set<TValue>(key: string, value: TValue, ttlSeconds: number, staleSeconds: number): void {
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;
    const staleUntil = expiresAt + staleSeconds * 1000;

    this.entries.set(key, {
      expiresAt,
      staleUntil,
      value,
    });
  }
}

export const memoryCache = new MemoryCache();