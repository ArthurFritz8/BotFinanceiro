import { env } from "../config/env.js";

export type PersistenceMode = "file" | "postgres";

export function resolvePersistenceMode(): PersistenceMode {
  if (env.DATABASE_PROVIDER === "file") {
    return "file";
  }

  if (env.DATABASE_PROVIDER === "postgres") {
    return "postgres";
  }

  return env.DATABASE_URL.length > 0 ? "postgres" : "file";
}
