export class TokenBucketRateLimiter {
  private lastRefillTimestamp = Date.now();
  private tokens: number;

  public constructor(
    private readonly capacity: number,
    private readonly refillRatePerSecond: number,
  ) {
    this.tokens = capacity;
  }

  public tryConsume(tokensToConsume = 1): boolean {
    this.refill();

    if (this.tokens < tokensToConsume) {
      return false;
    }

    this.tokens -= tokensToConsume;
    return true;
  }

  public getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillTimestamp) / 1000;

    if (elapsedSeconds <= 0) {
      return;
    }

    const refillAmount = elapsedSeconds * this.refillRatePerSecond;
    this.tokens = Math.min(this.capacity, this.tokens + refillAmount);
    this.lastRefillTimestamp = now;
  }
}