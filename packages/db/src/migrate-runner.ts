import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { getEnv } from "@cim/config";

// Arbitrary constant; only needs to be stable and unique to this purpose.
const MIGRATION_LOCK_KEY = 727_001;

/**
 * Applies pending migrations, holding a session-level advisory lock so
 * that two processes booting at once (a rolling deploy, or several worker
 * replicas) never run the migrator concurrently. The lock and the
 * migration share one dedicated connection.
 */
export async function applyMigrations(): Promise<void> {
  const pool = new Pool({ connectionString: getEnv().DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    try {
      await migrate(drizzle(client), {
        migrationsFolder: new URL("../migrations", import.meta.url).pathname,
      });
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
    }
  } finally {
    client.release();
    await pool.end();
  }
}
