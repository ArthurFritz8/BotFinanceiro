import { Pool, type PoolConfig } from "pg";

import { env } from "../config/env.js";

let sharedPostgresPool: Pool | null = null;

function buildPoolConfig(): PoolConfig {
  const config: PoolConfig = {
    connectionString: env.DATABASE_URL,
  };

  if (env.DATABASE_SSL) {
    config.ssl = {
      rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    };
  }

  return config;
}

export function getPostgresPool(): Pool {
  if (env.DATABASE_URL.length === 0) {
    throw new Error("DATABASE_URL is empty");
  }

  if (!sharedPostgresPool) {
    sharedPostgresPool = new Pool(buildPoolConfig());
  }

  return sharedPostgresPool;
}

export async function closePostgresPool(): Promise<void> {
  if (!sharedPostgresPool) {
    return;
  }

  await sharedPostgresPool.end();
  sharedPostgresPool = null;
}
