import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { hostMatchesDomain, normalizeHost } from "@cim/core";
import type { Db } from "../client";
import { articles, sources } from "../schema/content";
import { blockedDomains, takedownRequests } from "../schema/compliance";
import { users } from "../schema/users";

/** Publisher-facing compliance. Global data, no tenant scoping (like sources). */

export type NewTakedownRequest = {
  requesterName: string;
  requesterEmail: string;
  publisher: string;
  targets: string;
  message: string;
};

export async function createTakedownRequest(db: Db, input: NewTakedownRequest) {
  // Only pause on an unambiguous, exact feed URL. A domain or page request
  // stays in admin review so a narrow request cannot accidentally stop every
  // feed belonging to that publisher.
  let exactFeedUrl: string | null = null;
  try {
    const parsed = new URL(input.targets.trim());
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.username && !parsed.password) {
      parsed.hash = "";
      exactFeedUrl = parsed.toString();
    }
  } catch {
    // Non-URL or multi-target requests require admin triage.
  }

  const normalizedInput = {
    ...input,
    requesterEmail: input.requesterEmail.toLowerCase(),
    targets: input.targets.trim(),
  };
  const fingerprint = createHash("sha256")
    .update(`${normalizedInput.requesterEmail}\0${normalizedInput.targets}`)
    .digest("hex");

  return db.transaction(async (tx) => {
    // Serialize the rare duplicate public submission without storing the
    // contact/target digest or adding any workload to crawl transactions.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`publisher-request:${fingerprint}`}, 0))`);
    const [existing] = await tx
      .select({ id: takedownRequests.id })
      .from(takedownRequests)
      .where(and(
        eq(takedownRequests.status, "open"),
        eq(takedownRequests.requesterEmail, normalizedInput.requesterEmail),
        eq(takedownRequests.targets, normalizedInput.targets),
      ))
      .limit(1);
    if (existing) return existing.id;

    const [row] = await tx.insert(takedownRequests).values(normalizedInput).returning({ id: takedownRequests.id });
    if (!row) throw new Error("failed to create takedown request");
    if (exactFeedUrl) {
      const [source] = await tx.select({ id: sources.id }).from(sources).where(eq(sources.url, exactFeedUrl)).limit(1);
      if (source) {
        await tx.update(sources).set({ status: "unavailable", updatedAt: new Date() }).where(eq(sources.id, source.id));
      }
    }
    return row.id;
  });
}

/** A request UUID is an unguessable public reference; return status only, never requester data. */
export async function getPublicTakedownStatus(db: Db, id: string) {
  const [row] = await db
    .select({ id: takedownRequests.id, status: takedownRequests.status, createdAt: takedownRequests.createdAt, resolvedAt: takedownRequests.resolvedAt })
    .from(takedownRequests)
    .where(eq(takedownRequests.id, id))
    .limit(1);
  return row ?? null;
}

export async function listTakedownRequests(db: Db, status?: "open" | "resolved" | "rejected") {
  return db
    .select()
    .from(takedownRequests)
    .where(status ? eq(takedownRequests.status, status) : undefined)
    .orderBy(desc(takedownRequests.createdAt))
    .limit(200);
}

export async function countOpenTakedownRequests(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(takedownRequests)
    .where(eq(takedownRequests.status, "open"));
  return row?.n ?? 0;
}

/** Closes an OPEN request; returns false when it was not open (already handled) or missing. */
export async function closeTakedownRequest(
  db: Db,
  id: string,
  input: { status: "resolved" | "rejected"; note: string; userId: string },
): Promise<boolean> {
  const rows = await db
    .update(takedownRequests)
    .set({
      status: input.status,
      resolutionNote: input.note || null,
      resolvedByUserId: input.userId,
      resolvedAt: new Date(),
    })
    .where(and(eq(takedownRequests.id, id), eq(takedownRequests.status, "open")))
    .returning({ id: takedownRequests.id });
  return rows.length > 0;
}

export async function listBlockedDomains(db: Db) {
  return db.select().from(blockedDomains).orderBy(desc(blockedDomains.createdAt));
}

/** True when `host` is a blocked domain or a subdomain of one. */
export async function isHostBlocked(db: Db, host: string): Promise<boolean> {
  const rows = await db.select({ domain: blockedDomains.domain }).from(blockedDomains);
  return rows.some((row) => hostMatchesDomain(host, row.domain));
}

export type BlockResult = { domain: string; sourcesPaused: number; articlesDeleted: number };

/**
 * Blocks a publisher: records the domain (so it can never be re-added or
 * resumed), pauses every source on it, and — when `purge` — deletes the
 * articles already stored from those sources, which cascades to every
 * customer's mentions of them. Idempotent: blocking twice is harmless.
 */
export async function blockDomain(
  db: Db,
  input: { domain: string; reason: string; userId: string; purge: boolean },
): Promise<BlockResult> {
  const domain = normalizeHost(input.domain);
  return db.transaction(async (tx) => {
    await tx
      .insert(blockedDomains)
      .values({ domain, reason: input.reason, createdByUserId: input.userId })
      .onConflictDoNothing();

    const all = await tx.select({ id: sources.id, domain: sources.domain }).from(sources);
    const ids = all.filter((s) => hostMatchesDomain(s.domain, domain)).map((s) => s.id);

    let articlesDeleted = 0;
    if (ids.length > 0) {
      await tx
        .update(sources)
        .set({ status: "unavailable", updatedAt: new Date() })
        .where(inArray(sources.id, ids));
      if (input.purge) {
        const deleted = await tx
          .delete(articles)
          .where(inArray(articles.sourceId, ids))
          .returning({ id: articles.id });
        articlesDeleted = deleted.length;
      }
    }
    return { domain, sourcesPaused: ids.length, articlesDeleted };
  });
}

export async function unblockDomain(db: Db, id: string): Promise<boolean> {
  const rows = await db.delete(blockedDomains).where(eq(blockedDomains.id, id)).returning({ id: blockedDomains.id });
  return rows.length > 0;
}

/** Live platform admins, for "a takedown request arrived" notices. */
export async function listPlatformAdminEmails(db: Db): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.isPlatformSuperAdmin, true), sql`${users.deletedAt} is null`));
  return rows.map((r) => r.email);
}
