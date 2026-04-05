import { memeRadarService } from "../modules/meme_radar/application/meme-radar-service.js";
import { env } from "../shared/config/env.js";
import { logger } from "../shared/logger/logger.js";

export class MemeRadarSyncJobRunner {
  private intervalHandle: NodeJS.Timeout | null = null;

  private started = false;

  public async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;

    if (!env.SCHEDULER_ENABLED) {
      logger.info("Meme radar scheduler disabled by global scheduler flag");
      return;
    }

    await this.refresh("startup");

    const intervalMs = env.MEME_RADAR_REFRESH_INTERVAL_SECONDS * 1000;

    this.intervalHandle = setInterval(() => {
      void this.refresh("scheduled");
    }, intervalMs);
    this.intervalHandle.unref();

    logger.info(
      {
        intervalSeconds: env.MEME_RADAR_REFRESH_INTERVAL_SECONDS,
      },
      "Meme radar scheduler started",
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

    logger.info("Meme radar scheduler stopped");
  }

  private async refresh(reason: "scheduled" | "startup"): Promise<void> {
    try {
      await memeRadarService.refreshNow(reason);
    } catch (error) {
      logger.warn(
        {
          err: error,
          reason,
        },
        "Meme radar refresh failed",
      );
    }
  }
}

export const memeRadarSyncJobRunner = new MemeRadarSyncJobRunner();
