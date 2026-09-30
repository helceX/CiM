import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@cim/config";
import * as schema from "./schema/index";

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getEnv().DATABASE_URL });
  }
  return pool;
}

export function createDb() {
  return drizzle(getPool(), { schema });
}

export type Db = ReturnType<typeof createDb>;

/** Module-level singleton for app/worker runtime use. */
export const db = createDb();
