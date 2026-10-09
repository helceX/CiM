import { and, asc, eq, isNotNull, lt, sql } from "drizzle-orm";
import type { Db } from "../client";
import { archiveRuns } from "../schema/archive";
import { erasureLog } from "../schema/compliance";
import { organizations } from "../schema/organizations";

/**
 * KVKK erasure (docs/product/KVKK.md): what "deleted" really means.
 *
 * Deleting an organization only marks it (`deleted_at`) so access ends at once and a mistake can be
 * undone for a while. This is the second half: after the grace period the organization and everything
 * linked to it is erased for good, and the erasure is recorded. Account deletion already anonymizes
 * in place (see privacy.ts), so it needs nothing here.
 */

/** Organizations deleted before `cutoff` that are due to be erased for good, oldest first. */
export async function listOrganizationsDueForErasure(db: Db, cutoff: Date, limit: number): Promise<string[]> {
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(isNotNull(organizations.deletedAt), lt(organizations.deletedAt, cutoff)))
    .orderBy(asc(organizations.deletedAt))
    .limit(limit);
  return rows.map((row) => row.id);
}

/** The object-storage keys of an organization's weekly archive files, so they can be removed with it. */
export async function listArchiveObjectKeys(db: Db, organizationId: string): Promise<string[]> {
  const rows = await db.select({ files: archiveRuns.files }).from(archiveRuns).where(eq(archiveRuns.organizationId, organizationId));
  return [...new Set(rows.flatMap((row) => row.files.map((file) => file.key)))];
}

/**
 * Erases an organization that was deleted earlier: its mentions first, in batches (they are by far the
 * biggest part, and one huge transaction would hold the database up), then the organization itself —
 * every table that belongs to it goes with it — and a line in `erasure_log` saying so.
 *
 * Refuses an organization that was never deleted. Returns null when it is already gone.
 */
export async function eraseOrganization(
  db: Db,
  organizationId: string,
  options: { batchSize?: number; archiveFiles?: number } = {},
): Promise<{ mentions: number } | null> {
  const [organization] = await db
    .select({ id: organizations.id, deletedAt: organizations.deletedAt })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!organization) return null;
  if (!organization.deletedAt) throw new Error("Refusing to erase an organization that has not been deleted.");

  const batchSize = options.batchSize ?? 5000;
  let mentions = 0;
  for (;;) {
    const result = await db.execute(sql`
      delete from mentions
      where id in (select id from mentions where organization_id = ${organizationId} limit ${batchSize})
    `);
    const deleted = result.rowCount ?? 0;
    mentions += deleted;
    if (deleted < batchSize) break;
  }

  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(organizations)
      .where(and(eq(organizations.id, organizationId), isNotNull(organizations.deletedAt)))
      .returning({ id: organizations.id });
    if (removed.length === 0) throw new Error("The organization changed while it was being erased.");
    await tx.insert(erasureLog).values({
      kind: "organization_erased",
      subjectId: organizationId,
      detail: { mentions, archiveFiles: options.archiveFiles ?? 0 },
    });
  });
  return { mentions };
}

const AUTH_BATCH = 5000;

/**
 * Sign-in sessions (which carry an IP address and browser) and one-time tokens (verification, password
 * reset, invitations) are useless once expired, revoked or used. Removes those older than `cutoff` — the
 * notice promises 30 days after they expire or are used.
 */
export async function deleteExpiredAuthRecords(db: Db, cutoff: Date): Promise<{ sessions: number; tokens: number }> {
  const batched = async (table: "sessions" | "email_verification_tokens" | "password_reset_tokens" | "invitation_tokens") => {
    // The table name is one of the four literals above, never user input.
    const closed =
      table === "sessions"
        ? sql`expires_at < ${cutoff} or (revoked_at is not null and revoked_at < ${cutoff})`
        : sql`expires_at < ${cutoff} or (consumed_at is not null and consumed_at < ${cutoff})`;
    let total = 0;
    for (;;) {
      const result = await db.execute(sql`
        delete from ${sql.identifier(table)}
        where id in (select id from ${sql.identifier(table)} where ${closed} limit ${AUTH_BATCH})
      `);
      const deleted = result.rowCount ?? 0;
      total += deleted;
      if (deleted < AUTH_BATCH) break;
    }
    return total;
  };

  const sessions = await batched("sessions");
  let tokens = 0;
  for (const table of ["email_verification_tokens", "password_reset_tokens", "invitation_tokens"] as const) {
    tokens += await batched(table);
  }
  return { sessions, tokens };
}
