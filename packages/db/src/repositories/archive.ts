import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { ArticlePrint } from "@cim/core";
import type { Db } from "../client";
import { archiveRuns, type ArchiveFile, type ArchiveRun } from "../schema/archive";
import { articles, mentions, mentionTags, sources, tags } from "../schema/content";
import { monitoringQueries } from "../schema/monitoring";
import { organizationMemberships, organizations } from "../schema/organizations";
import { users } from "../schema/users";
import type { OrganizationId } from "./tenant-scope";

const DAY_TZ = "Europe/Istanbul";
/** The most mentions one archive holds (a week above this is archived up to here and flagged). */
export const ARCHIVE_MAX_MENTIONS = 50_000;

/** Türkiye calendar day (YYYY-MM-DD) of a story — publication date, else the time we found it. */
const storyDay = sql<string>`to_char((coalesce(${articles.publishedAt}, ${mentions.createdAt}) at time zone ${sql.raw(`'${DAY_TZ}'`)})::date, 'YYYY-MM-DD')`;
const storyDate = sql`(coalesce(${articles.publishedAt}, ${mentions.createdAt}) at time zone ${sql.raw(`'${DAY_TZ}'`)})::date`;

export type ArchiveMention = {
  mentionId: string;
  day: string;
  occurredAt: Date;
  queryId: string;
  queryName: string;
  title: string;
  url: string;
  sourceName: string;
  sourceType: string;
  sourceCountry: string | null;
  excerpt: string | null;
  sentiment: string | null;
  priority: string;
  matchedTerms: string[];
  tags: string[];
  print: ArticlePrint | null;
};

/** Every mention of the organization whose story date falls in [periodStart, periodEnd] (Türkiye days), newest day first. */
export async function listMentionsForArchive(
  db: Db,
  organizationId: OrganizationId,
  periodStart: string,
  periodEnd: string,
  limit = ARCHIVE_MAX_MENTIONS,
): Promise<{ items: ArchiveMention[]; truncated: boolean }> {
  const rows = await db
    .select({
      mentionId: mentions.id,
      day: storyDay,
      occurredAt: sql<Date>`coalesce(${articles.publishedAt}, ${mentions.createdAt})`,
      queryId: mentions.queryId,
      queryName: monitoringQueries.name,
      queryCreatedAt: monitoringQueries.createdAt,
      title: articles.title,
      url: articles.canonicalUrl,
      sourceName: sources.name,
      sourceType: sources.type,
      sourceCountry: sources.country,
      excerpt: articles.storedExcerpt,
      canDisplayExcerpt: sources.canDisplayExcerpt,
      sentiment: mentions.sentiment,
      priority: mentions.priority,
      matchedTerms: mentions.matchedTerms,
      print: articles.print,
    })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .innerJoin(monitoringQueries, eq(monitoringQueries.id, mentions.queryId))
    .where(
      and(
        eq(mentions.organizationId, organizationId),
        sql`${storyDate} >= ${periodStart}::date`,
        sql`${storyDate} <= ${periodEnd}::date`,
      ),
    )
    .orderBy(desc(storyDay), monitoringQueries.createdAt, desc(sql`coalesce(${articles.publishedAt}, ${mentions.createdAt})`), mentions.id)
    .limit(limit + 1);

  const truncated = rows.length > limit;
  const kept = rows.slice(0, limit);

  const tagsByMention = new Map<string, string[]>();
  for (let i = 0; i < kept.length; i += 2000) {
    const ids = kept.slice(i, i + 2000).map((row) => row.mentionId);
    const tagRows = await db
      .select({ mentionId: mentionTags.mentionId, name: tags.name })
      .from(mentionTags)
      .innerJoin(tags, eq(tags.id, mentionTags.tagId))
      .where(inArray(mentionTags.mentionId, ids));
    for (const row of tagRows) {
      const list = tagsByMention.get(row.mentionId) ?? [];
      list.push(row.name);
      tagsByMention.set(row.mentionId, list);
    }
  }

  return {
    truncated,
    items: kept.map((row) => ({
      mentionId: row.mentionId,
      day: row.day,
      occurredAt: new Date(row.occurredAt),
      queryId: row.queryId,
      queryName: row.queryName,
      title: row.title,
      url: row.url,
      sourceName: row.sourceName,
      sourceType: row.sourceType,
      sourceCountry: row.sourceCountry,
      excerpt: row.canDisplayExcerpt ? row.excerpt : null,
      sentiment: row.sentiment,
      priority: row.priority,
      matchedTerms: row.matchedTerms ?? [],
      tags: tagsByMention.get(row.mentionId) ?? [],
      print: row.print ?? null,
    })),
  };
}

/** Organizations that have at least one mention in the period and no finished archive for it yet (cross-tenant, like the digest job). */
export async function listOrganizationsNeedingArchive(db: Db, periodStart: string, periodEnd: string): Promise<string[]> {
  const result = await db.execute<{ organization_id: string }>(sql`
    select distinct m.organization_id
    from mentions m
    join articles a on a.id = m.article_id
    join organizations o on o.id = m.organization_id and o.deleted_at is null
    where (coalesce(a.published_at, m.created_at) at time zone ${DAY_TZ})::date between ${periodStart}::date and ${periodEnd}::date
      and not exists (
        select 1 from archive_runs r
        where r.organization_id = m.organization_id and r.kind = 'weekly' and r.period_start = ${periodStart}::date and r.status = 'ready'
      )
  `);
  return result.rows.map((row) => row.organization_id);
}

/**
 * Starts (or restarts, after a failure) the archive for one organization and week.
 * Returns null when it is already built or being built — the caller does nothing.
 */
export async function claimArchiveRun(
  db: Db,
  organizationId: OrganizationId,
  periodStart: string,
  periodEnd: string,
): Promise<ArchiveRun | null> {
  const [row] = await db
    .insert(archiveRuns)
    .values({ organizationId, kind: "weekly", periodStart, periodEnd, status: "building" })
    .onConflictDoUpdate({
      target: [archiveRuns.organizationId, archiveRuns.kind, archiveRuns.periodStart],
      set: { status: "building", error: null },
      setWhere: eq(archiveRuns.status, "failed"),
    })
    .returning();
  return row ?? null;
}

export async function markArchiveReady(
  db: Db,
  id: string,
  input: { files: ArchiveFile[]; mentionCount: number; truncated: boolean },
): Promise<void> {
  await db
    .update(archiveRuns)
    .set({ status: "ready", files: input.files, mentionCount: input.mentionCount, truncated: input.truncated, readyAt: new Date(), error: null })
    .where(eq(archiveRuns.id, id));
}

export async function markArchiveFailed(db: Db, id: string, error: string): Promise<void> {
  await db.update(archiveRuns).set({ status: "failed", error: error.slice(0, 500) }).where(eq(archiveRuns.id, id));
}

export async function markArchiveEmailed(db: Db, id: string): Promise<void> {
  await db.update(archiveRuns).set({ emailedAt: new Date() }).where(eq(archiveRuns.id, id));
}

/** A run that was interrupted (worker restarted mid-build) never finishes by itself — fail it so it is retried. */
export async function failStaleArchiveRuns(db: Db, olderThanMinutes = 60): Promise<number> {
  const rows = await db
    .update(archiveRuns)
    .set({ status: "failed", error: "Interrupted — retrying." })
    .where(and(eq(archiveRuns.status, "building"), lt(archiveRuns.createdAt, new Date(Date.now() - olderThanMinutes * 60_000))))
    .returning({ id: archiveRuns.id });
  return rows.length;
}

export async function listArchiveRuns(db: Db, organizationId: OrganizationId, limit = 120): Promise<ArchiveRun[]> {
  return db
    .select()
    .from(archiveRuns)
    .where(eq(archiveRuns.organizationId, organizationId))
    .orderBy(desc(archiveRuns.periodStart))
    .limit(limit);
}

export async function getArchiveRun(db: Db, organizationId: OrganizationId, id: string): Promise<ArchiveRun | undefined> {
  const [row] = await db
    .select()
    .from(archiveRuns)
    .where(and(eq(archiveRuns.id, id), eq(archiveRuns.organizationId, organizationId)))
    .limit(1);
  return row;
}

/** Finished archives whose week ended before `beforeDate` and whose mentions are still in the database. */
export async function listArchiveRunsDueForDeletion(db: Db, beforeDate: string): Promise<ArchiveRun[]> {
  return db
    .select()
    .from(archiveRuns)
    .where(and(eq(archiveRuns.status, "ready"), isNull(archiveRuns.deletedAt), sql`${archiveRuns.periodEnd} < ${beforeDate}::date`))
    .orderBy(archiveRuns.periodStart)
    .limit(200);
}

/**
 * Removes one archived week's mentions of one organization. Only called after the archive's
 * files were verified in object storage. Returns how many mentions were deleted.
 */
export async function deleteArchivedMentions(db: Db, run: ArchiveRun): Promise<number> {
  const result = await db.execute(sql`
    delete from mentions m
    using articles a
    where m.article_id = a.id
      and m.organization_id = ${run.organizationId}
      and (coalesce(a.published_at, m.created_at) at time zone ${DAY_TZ})::date between ${run.periodStart}::date and ${run.periodEnd}::date
  `);
  await db.update(archiveRuns).set({ deletedAt: new Date() }).where(eq(archiveRuns.id, run.id));
  return result.rowCount ?? 0;
}

/** Who gets the archive email: the organization's active owners and admins. */
export async function listArchiveRecipientEmails(db: Db, organizationId: OrganizationId): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.status, "active"),
        inArray(organizationMemberships.role, ["organization_owner", "organization_admin"]),
      ),
    );
  return [...new Set(rows.map((row) => row.email))];
}

export async function getOrganizationName(db: Db, organizationId: string): Promise<string | undefined> {
  const [row] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return row?.name;
}
