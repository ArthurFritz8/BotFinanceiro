export type CircuitBreakerState = "closed" | "half_open" | "open";

export interface CircuitBreakerSnapshot {
  cooldownMs: number;
  failureCount: number;
  failureThreshold: number;
  lastOpenedAt: string | null;
  nextAttemptAt: string | null;
  state: CircuitBreakerState;
}

export class CircuitBreaker {
  private failureCount = 0;
  private lastOpenedAt: number | null = null;
  private state: CircuitBreakerState = "closed";

  public constructor(
    private readonly failureThreshold: number,
    private readonly cooldownMs: number,
  ) {}

  public canRequest(nowMs = Date.now()): boolean {
    if (this.state === "closed") {
      return true;
    }

    if (this.state === "open") {
      if (!this.lastOpenedAt) {
        return false;
      }

      if (nowMs - this.lastOpenedAt < this.cooldownMs) {
        return false;
      }

      this.state = "half_open";
      return true;
    }

    return true;
  }

  public onFailure(nowMs = Date.now()): void {
    if (this.state === "half_open") {
      this.open(nowMs);
      return;
    }

    this.failureCount += 1;

    if (this.failureCount >= this.failureThreshold) {
      this.open(nowMs);
    }
  }

  public onSuccess(): void {
    this.failureCount = 0;
    this.lastOpenedAt = null;
    this.state = "closed";
  }

  public getSnapshot(): CircuitBreakerSnapshot {
    const nextAttemptAt =
      this.state === "open" && this.lastOpenedAt
        ? new Date(this.lastOpenedAt + this.cooldownMs).toISOString()
        : null;

    return {
      cooldownMs: this.cooldownMs,
      failureCount: this.failureCount,
      failureThreshold: this.failureThreshold,
      lastOpenedAt: this.lastOpenedAt ? new Date(this.lastOpenedAt).toISOString() : null,
      nextAttemptAt,
      state: this.state,
    };
  }

  private open(nowMs: number): void {
    this.state = "open";
    this.lastOpenedAt = nowMs;
  }
}