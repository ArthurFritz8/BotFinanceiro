import {
  cryptoSyncJobRunner,
  type CryptoSchedulerMetricsSnapshot,
} from "../../../jobs/crypto-sync-job-runner.js";
import { env } from "../../../shared/config/env.js";

export interface HealthStatus {
  service: string;
  status: "ok";
}

export interface ReadinessStatus {
  schedulerEconomyMode: boolean;
  schedulerEnabled: boolean;
  status: "ready";
}

export class SystemStatusService {
  public getHealthStatus(): HealthStatus {
    return {
      service: "botfinanceiro-api",
      status: "ok",
    };
  }

  public getReadinessStatus(): ReadinessStatus {
    return {
      schedulerEconomyMode: env.SCHEDULER_ECONOMY_MODE,
      schedulerEnabled: env.SCHEDULER_ENABLED,
      status: "ready",
    };
  }

  public getSchedulerMetrics(): CryptoSchedulerMetricsSnapshot {
    return cryptoSyncJobRunner.getMetricsSnapshot();
  }
}