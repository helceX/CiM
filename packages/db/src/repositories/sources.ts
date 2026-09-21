import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { sources } from "../schema/content";

/** Sources are global/reference data (ADR-001) — no tenant scoping here. */

export async function listActiveSources(db: Db) {
  return db.select().from(sources).where(eq(sources.status, "healthy"));
}

export async function markSourceChecked(
  db: Db,
  sourceId: string,
  status: "healthy" | "delayed" | "error" | "blocked" | "unavailable",
) {
  await db
    .update(sources)
    .set({ status, lastCheckedAt: new Date(), updatedAt: new Date() })
    .where(eq(sources.id, sourceId));
}
