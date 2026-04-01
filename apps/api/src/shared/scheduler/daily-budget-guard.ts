export class DailyBudgetGuard {
  private consumed = 0;
  private dayReference = this.getUtcDateKey();

  public constructor(private readonly dailyBudget: number) {}

  public canConsume(cost = 1): boolean {
    this.refreshDayBoundary();
    return this.consumed + cost <= this.dailyBudget;
  }

  public consume(cost = 1): void {
    this.refreshDayBoundary();
    this.consumed += cost;
  }

  public getConsumed(): number {
    this.refreshDayBoundary();
    return this.consumed;
  }

  public getRemaining(): number {
    this.refreshDayBoundary();
    return Math.max(0, this.dailyBudget - this.consumed);
  }

  private refreshDayBoundary(): void {
    const currentDay = this.getUtcDateKey();

    if (currentDay === this.dayReference) {
      return;
    }

    this.dayReference = currentDay;
    this.consumed = 0;
  }

  private getUtcDateKey(): string {
    return new Date().toISOString().slice(0, 10);
  }
}