import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "../config/env.js";
import { logger } from "../logger/logger.js";
import { getPostgresPool } from "./postgres-pool.js";

const migrationsDirectoryPath = resolve(fileURLToPath(new URL("../../../migrations", import.meta.url)));

interface MigrationFile {
  checksum: string;
  content: string;
  name: string;
}

interface AppliedMigration {
  checksum: string;
  name: string;
}

export interface PostgresMigrationResult {
  applied: string[];
  skipped: string[];
}

function computeChecksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function readMigrationFiles(): Promise<MigrationFile[]> {
  const entries = await readdir(migrationsDirectoryPath, { withFileTypes: true });

  const sqlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const files: MigrationFile[] = [];

  for (const fileName of sqlFiles) {
    const filePath = resolve(migrationsDirectoryPath, fileName);
    const content = await readFile(filePath, "utf8");

    files.push({
      checksum: computeChecksum(content),
      content,
      name: fileName,
    });
  }

  return files;
}

export async function runPostgresMigrations(): Promise<PostgresMigrationResult> {
  if (env.DATABASE_URL.length === 0) {
    return {
      applied: [],
      skipped: [],
    };
  }

  const pool = getPostgresPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationFiles = await readMigrationFiles();
  const appliedResult = await pool.query<AppliedMigration>(
    "SELECT name, checksum FROM schema_migrations",
  );
  const appliedMap = new Map(appliedResult.rows.map((row) => [row.name, row]));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrationFiles) {
    const alreadyApplied = appliedMap.get(migration.name);

    if (alreadyApplied) {
      if (alreadyApplied.checksum !== migration.checksum) {
        throw new Error(
          `Migration checksum mismatch for ${migration.name}. Expected ${alreadyApplied.checksum}, got ${migration.checksum}.`,
        );
      }

      skipped.push(migration.name);
      continue;
    }

    await pool.query("BEGIN");

    try {
      await pool.query(migration.content);
      await pool.query(
        "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
      await pool.query("COMMIT");
      applied.push(migration.name);
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }

  if (applied.length > 0 || skipped.length > 0) {
    logger.info(
      {
        applied,
        skipped,
      },
      "Postgres migrations checked",
    );
  }

  return {
    applied,
    skipped,
  };
}