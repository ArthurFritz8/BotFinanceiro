export type BrokerStreamName = "binance" | "bybit" | "coinbase" | "kraken" | "okx" | "iqoption";

interface BrokerStreamCounters {
  activeConnections: number;
  closedConnections: number;
  keepAliveEvents: number;
  openedConnections: number;
  snapshotErrors: number;
  snapshotsPublished: number;
}

export interface BrokerLiveQuoteStreamMetricsSnapshot {
  brokers: Record<BrokerStreamName, BrokerStreamCounters & {
    lastErrorAt: string | null;
    lastErrorMessage: string | null;
    lastKeepAliveAt: string | null;
    lastSnapshotAt: string | null;
  }>;
  generatedAt: string;
  global: {
    activeConnections: number;
    closedConnections: number;
    openedConnections: number;
    snapshotErrors: number;
    snapshotsPublished: number;
  };
}

const brokerNames: BrokerStreamName[] = ["binance", "bybit", "coinbase", "kraken", "okx", "iqoption"];

function clampToNonNegative(value: number): number {
  return Math.max(0, value);
}

function createBrokerCounters(): BrokerStreamCounters {
  return {
    activeConnections: 0,
    closedConnections: 0,
    keepAliveEvents: 0,
    openedConnections: 0,
    snapshotErrors: 0,
    snapshotsPublished: 0,
  };
}

export class BrokerLiveQuoteStreamMetricsStore {
  private activeStreamIds = new Set<string>();

  private brokerCounters = new Map<BrokerStreamName, BrokerStreamCounters>(
    brokerNames.map((brokerName) => [brokerName, createBrokerCounters()]),
  );

  private globalCounters = {
    activeConnections: 0,
    closedConnections: 0,
    openedConnections: 0,
    snapshotErrors: 0,
    snapshotsPublished: 0,
  };

  private lastErrorAtByBroker = new Map<BrokerStreamName, string | null>(
    brokerNames.map((brokerName) => [brokerName, null]),
  );

  private lastErrorMessageByBroker = new Map<BrokerStreamName, string | null>(
    brokerNames.map((brokerName) => [brokerName, null]),
  );

  private lastKeepAliveAtByBroker = new Map<BrokerStreamName, string | null>(
    brokerNames.map((brokerName) => [brokerName, null]),
  );

  private lastSnapshotAtByBroker = new Map<BrokerStreamName, string | null>(
    brokerNames.map((brokerName) => [brokerName, null]),
  );

  public onConnectionOpened(input: {
    broker: BrokerStreamName;
    streamId: string;
  }): void {
    if (this.activeStreamIds.has(input.streamId)) {
      return;
    }

    this.activeStreamIds.add(input.streamId);

    const counters = this.getBrokerCounters(input.broker);
    counters.activeConnections += 1;
    counters.openedConnections += 1;

    this.globalCounters.activeConnections += 1;
    this.globalCounters.openedConnections += 1;
  }

  public onConnectionClosed(input: {
    broker: BrokerStreamName;
    streamId: string;
  }): void {
    if (!this.activeStreamIds.has(input.streamId)) {
      return;
    }

    this.activeStreamIds.delete(input.streamId);

    const counters = this.getBrokerCounters(input.broker);
    counters.activeConnections = clampToNonNegative(counters.activeConnections - 1);
    counters.closedConnections += 1;

    this.globalCounters.activeConnections = clampToNonNegative(this.globalCounters.activeConnections - 1);
    this.globalCounters.closedConnections += 1;
  }

  public onSnapshotPublished(input: {
    broker: BrokerStreamName;
  }): void {
    const counters = this.getBrokerCounters(input.broker);
    counters.snapshotsPublished += 1;
    this.globalCounters.snapshotsPublished += 1;
    this.lastSnapshotAtByBroker.set(input.broker, new Date().toISOString());
  }

  public onSnapshotError(input: {
    broker: BrokerStreamName;
    message: string;
  }): void {
    const counters = this.getBrokerCounters(input.broker);
    counters.snapshotErrors += 1;
    this.globalCounters.snapshotErrors += 1;
    this.lastErrorAtByBroker.set(input.broker, new Date().toISOString());
    this.lastErrorMessageByBroker.set(input.broker, input.message);
  }

  public onKeepAlive(input: {
    broker: BrokerStreamName;
  }): void {
    const counters = this.getBrokerCounters(input.broker);
    counters.keepAliveEvents += 1;
    this.lastKeepAliveAtByBroker.set(input.broker, new Date().toISOString());
  }

  public getSnapshot(): BrokerLiveQuoteStreamMetricsSnapshot {
    const brokers = Object.fromEntries(
      brokerNames.map((brokerName) => {
        const counters = this.getBrokerCounters(brokerName);

        return [
          brokerName,
          {
            activeConnections: counters.activeConnections,
            closedConnections: counters.closedConnections,
            keepAliveEvents: counters.keepAliveEvents,
            lastErrorAt: this.lastErrorAtByBroker.get(brokerName) ?? null,
            lastErrorMessage: this.lastErrorMessageByBroker.get(brokerName) ?? null,
            lastKeepAliveAt: this.lastKeepAliveAtByBroker.get(brokerName) ?? null,
            lastSnapshotAt: this.lastSnapshotAtByBroker.get(brokerName) ?? null,
            openedConnections: counters.openedConnections,
            snapshotErrors: counters.snapshotErrors,
            snapshotsPublished: counters.snapshotsPublished,
          },
        ];
      }),
    ) as BrokerLiveQuoteStreamMetricsSnapshot["brokers"];

    return {
      brokers,
      generatedAt: new Date().toISOString(),
      global: {
        activeConnections: this.globalCounters.activeConnections,
        closedConnections: this.globalCounters.closedConnections,
        openedConnections: this.globalCounters.openedConnections,
        snapshotErrors: this.globalCounters.snapshotErrors,
        snapshotsPublished: this.globalCounters.snapshotsPublished,
      },
    };
  }

  public reset(): void {
    this.activeStreamIds = new Set<string>();
    this.globalCounters = {
      activeConnections: 0,
      closedConnections: 0,
      openedConnections: 0,
      snapshotErrors: 0,
      snapshotsPublished: 0,
    };

    this.brokerCounters = new Map(
      brokerNames.map((brokerName) => [brokerName, createBrokerCounters()]),
    );

    this.lastErrorAtByBroker = new Map(
      brokerNames.map((brokerName) => [brokerName, null]),
    );

    this.lastErrorMessageByBroker = new Map(
      brokerNames.map((brokerName) => [brokerName, null]),
    );

    this.lastKeepAliveAtByBroker = new Map(
      brokerNames.map((brokerName) => [brokerName, null]),
    );

    this.lastSnapshotAtByBroker = new Map(
      brokerNames.map((brokerName) => [brokerName, null]),
    );
  }

  private getBrokerCounters(broker: BrokerStreamName): BrokerStreamCounters {
    const counters = this.brokerCounters.get(broker);

    if (counters) {
      return counters;
    }

    const created = createBrokerCounters();
    this.brokerCounters.set(broker, created);
    return created;
  }
}

export const brokerLiveQuoteStreamMetricsStore = new BrokerLiveQuoteStreamMetricsStore();
