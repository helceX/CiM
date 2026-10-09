import { desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../client";
import { catalogImportAttempts, catalogImportState } from "../schema/catalog-import";

/** Platform-wide state of the background catalog import (see schema/catalog-import.ts). */
export async function getCatalogImportState(db: Db) {
  await db.insert(catalogImportState).values({ id: 1 }).onConflictDoNothing();
  const [row] = await db.select().from(catalogImportState).where(eq(catalogImportState.id, 1));
  if (!row) throw new Error("catalog import state missing");
  return row;
}

/**
 * Pausing keeps the last note; resuming clears it, so a "finished" / "backing off" note from before the pause
 * does not hold the next run back — an operator who presses "Resume" wants the import to look again now.
 */
export async function setCatalogImportEnabled(db: Db, enabled: boolean): Promise<void> {
  await getCatalogImportState(db);
  await db
    .update(catalogImportState)
    .set(enabled ? { enabled, lastNote: null, updatedAt: new Date() } : { enabled, updatedAt: new Date() })
    .where(eq(catalogImportState.id, 1));
}

/** Remember when the import last ran and, when it added nothing, why. */
export async function recordCatalogImportRun(db: Db, note: string | null): Promise<void> {
  await getCatalogImportState(db);
  await db
    .update(catalogImportState)
    .set({ lastRunAt: new Date(), lastNote: note, updatedAt: new Date() })
    .where(eq(catalogImportState.id, 1));
}

export async function recordCatalogImportAttempt(
  db: Db,
  input: { url: string; catalogKey: string; status: "added" | "failed" | "skipped"; error?: string | null },
): Promise<void> {
  await db
    .insert(catalogImportAttempts)
    .values({ url: input.url, catalogKey: input.catalogKey, status: input.status, error: input.error ?? null })
    .onConflictDoUpdate({
      target: catalogImportAttempts.url,
      set: {
        status: input.status,
        error: input.error ?? null,
        attempts: sql`${catalogImportAttempts.attempts} + 1`,
        attemptedAt: new Date(),
      },
    });
}

export type CatalogImportAttemptInfo = { status: string; attempts: number; attemptedAt: Date; error: string | null };

export async function listCatalogImportAttempts(db: Db, urls: string[]): Promise<Map<string, CatalogImportAttemptInfo>> {
  if (urls.length === 0) return new Map();
  const rows = await db
    .select({
      url: catalogImportAttempts.url,
      status: catalogImportAttempts.status,
      attempts: catalogImportAttempts.attempts,
      attemptedAt: catalogImportAttempts.attemptedAt,
      error: catalogImportAttempts.error,
    })
    .from(catalogImportAttempts)
    .where(inArray(catalogImportAttempts.url, urls));
  return new Map(
    rows.map((row) => [row.url, { status: row.status, attempts: row.attempts, attemptedAt: row.attemptedAt, error: row.error }]),
  );
}

export async function countCatalogImportAttempts(db: Db): Promise<{ added: number; failed: number; skipped: number }> {
  const rows = await db
    .select({ status: catalogImportAttempts.status, n: sql<number>`count(*)::int` })
    .from(catalogImportAttempts)
    .groupBy(catalogImportAttempts.status);
  const count = (status: string) => Number(rows.find((row) => row.status === status)?.n ?? 0);
  return { added: count("added"), failed: count("failed"), skipped: count("skipped") };
}

/** The messages of the feeds the import could not add (newest first), for the admin page's failure breakdown. */
export async function listCatalogImportFailures(db: Db, limit = 5000): Promise<{ url: string; error: string | null; attempts: number }[]> {
  return db
    .select({ url: catalogImportAttempts.url, error: catalogImportAttempts.error, attempts: catalogImportAttempts.attempts })
    .from(catalogImportAttempts)
    .where(eq(catalogImportAttempts.status, "failed"))
    .orderBy(desc(catalogImportAttempts.attemptedAt))
    .limit(limit);
}
