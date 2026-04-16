import { cryptoSyncJobRunner } from "../jobs/crypto-sync-job-runner.js";
import { memeRadarSyncJobRunner } from "../jobs/meme-radar-sync-job-runner.js";
import { operationalHealthSnapshotJobRunner } from "../jobs/operational-health-snapshot-job-runner.js";
import { env } from "../shared/config/env.js";
import { logger } from "../shared/logger/logger.js";
import { binaryOptionsGhostAuditStore } from "../shared/observability/binary-options-ghost-audit-store.js";
import { copilotChatAuditStore } from "../shared/observability/copilot-chat-audit-store.js";
import { closePostgresPool } from "../shared/persistence/postgres-pool.js";
import { runPostgresMigrations } from "../shared/persistence/postgres-migrator.js";
import { resolvePersistenceMode } from "../shared/persistence/persistence-mode.js";
import { buildApp } from "./app.js";

const app = buildApp();

async function startServer(): Promise<void> {
  try {
    const persistenceMode = resolvePersistenceMode();

    if (persistenceMode === "postgres" && env.DATABASE_AUTO_MIGRATE) {
      await runPostgresMigrations();
    }

    await binaryOptionsGhostAuditStore.initialize();
    await copilotChatAuditStore.initialize();

    await app.listen({
      host: "0.0.0.0",
      port: env.APP_PORT,
    });

    cryptoSyncJobRunner.start();
    await memeRadarSyncJobRunner.start();
    await operationalHealthSnapshotJobRunner.start();

    logger.info({ port: env.APP_PORT }, "API started");
  } catch (error) {
    logger.fatal({ err: error }, "Failed to start API");
    process.exitCode = 1;
  }
}

async function closeServer(signal: string): Promise<void> {
  logger.warn({ signal }, "Shutdown signal received");

  try {
    operationalHealthSnapshotJobRunner.stop();
    memeRadarSyncJobRunner.stop();
    cryptoSyncJobRunner.stop();
    await app.close();
    await closePostgresPool();
    logger.info("Server closed gracefully");
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, "Failed to close server cleanly");
    process.exit(1);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void closeServer(signal);
  });
}

void startServer();