import { eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../client";
import { catalogImportAttempts, catalogImportState } from "../schema/catalog-import";

/** Platform-wide state of the background catalog import (see schema/catalog-import.ts). */
export async function getCatalogImportState(db: Db) {
  await db.insert(catalogImportState).values({ id: 1 }).onConflictDoNothing();
  const [row] = await db.select().from(catalogImportState).where(eq(catalogImportState.id, 1));
  if (!row) throw new Error("catalog import state missing");
  return row;
}

export async function setCatalogImportEnabled(db: Db, enabled: boolean): Promise<void> {
  await getCatalogImportState(db);
  await db.update(catalogImportState).set({ enabled, updatedAt: new Date() }).where(eq(catalogImportState.id, 1));
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

export type CatalogImportAttemptInfo = { status: string; attempts: number; attemptedAt: Date };

export async function listCatalogImportAttempts(db: Db, urls: string[]): Promise<Map<string, CatalogImportAttemptInfo>> {
  if (urls.length === 0) return new Map();
  const rows = await db
    .select({
      url: catalogImportAttempts.url,
      status: catalogImportAttempts.status,
      attempts: catalogImportAttempts.attempts,
      attemptedAt: catalogImportAttempts.attemptedAt,
    })
    .from(catalogImportAttempts)
    .where(inArray(catalogImportAttempts.url, urls));
  return new Map(rows.map((row) => [row.url, { status: row.status, attempts: row.attempts, attemptedAt: row.attemptedAt }]));
}

export async function countCatalogImportAttempts(db: Db): Promise<{ added: number; failed: number; skipped: number }> {
  const rows = await db
    .select({ status: catalogImportAttempts.status, n: sql<number>`count(*)::int` })
    .from(catalogImportAttempts)
    .groupBy(catalogImportAttempts.status);
  const count = (status: string) => Number(rows.find((row) => row.status === status)?.n ?? 0);
  return { added: count("added"), failed: count("failed"), skipped: count("skipped") };
}
