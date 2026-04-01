import { closePostgresPool } from "./postgres-pool.js";
import { runPostgresMigrations } from "./postgres-migrator.js";

void (async () => {
  try {
    const result = await runPostgresMigrations();

    console.log(
      JSON.stringify(
        {
          applied: result.applied,
          skipped: result.skipped,
        },
        null,
        2,
      ),
    );
  } finally {
    await closePostgresPool();
  }
})().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
