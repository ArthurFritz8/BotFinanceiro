import { env } from "../shared/config/env.js";
import { logger } from "../shared/logger/logger.js";
import { buildApp } from "./app.js";

const app = buildApp();

async function startServer(): Promise<void> {
  try {
    await app.listen({
      host: "0.0.0.0",
      port: env.APP_PORT,
    });

    logger.info({ port: env.APP_PORT }, "API started");
  } catch (error) {
    logger.fatal({ err: error }, "Failed to start API");
    process.exitCode = 1;
  }
}

async function closeServer(signal: string): Promise<void> {
  logger.warn({ signal }, "Shutdown signal received");

  try {
    await app.close();
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