import { env } from "../shared/config/env.js";
import { logger } from "../shared/logger/logger.js";
import {
  operationalHealthHistoryStore,
} from "../shared/observability/operational-health-history-store.js";
import { SystemStatusService } from "../modules/system/application/system-status-service.js";

export class OperationalHealthSnapshotJobRunner {
  private intervalHandle: NodeJS.Timeout | null = null;

  private readonly systemStatusService = new SystemStatusService();

  private started = false;

  public async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;

    if (!env.OPS_HEALTH_SNAPSHOT_ENABLED) {
      logger.info("Operational health snapshot job disabled by environment");
      return;
    }

    await operationalHealthHistoryStore.initialize();
    await this.captureSnapshot();

    const intervalMs = env.OPS_HEALTH_SNAPSHOT_INTERVAL_SECONDS * 1000;

    this.intervalHandle = setInterval(() => {
      void this.captureSnapshot();
    }, intervalMs);
    this.intervalHandle.unref();

    logger.info(
      {
        filePath: env.OPS_HEALTH_SNAPSHOT_FILE_PATH,
        intervalSeconds: env.OPS_HEALTH_SNAPSHOT_INTERVAL_SECONDS,
        maxItems: env.OPS_HEALTH_SNAPSHOT_MAX_ITEMS,
      },
      "Operational health snapshot job started",
    );
  }

  public stop(): void {
    if (!this.started) {
      return;
    }

    this.started = false;

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    logger.info("Operational health snapshot job stopped");
  }

  private async captureSnapshot(): Promise<void> {
    try {
      const snapshot = this.systemStatusService.getOperationalHealth();

      await operationalHealthHistoryStore.append(snapshot);
    } catch (error) {
      logger.warn(
        {
          err: error,
        },
        "Failed to persist operational health snapshot",
      );
    }
  }
}

export const operationalHealthSnapshotJobRunner = new OperationalHealthSnapshotJobRunner();