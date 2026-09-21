import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { organizations } from "../schema/organizations";
import { asOrganizationId, type OrganizationId } from "./tenant-scope";

/**
 * docs/product/FEATURE_MATRIX.md "Email daily digest" — the scheduled
 * `generate_digest` job needs every still-existing organization, the
 * same documented cross-tenant read exception (ADR-001) the alert engine
 * and insight generation already rely on. Excludes soft-deleted
 * organizations (docs/architecture/SECURITY.md organization deletion) —
 * a deleted org must stop receiving digest emails just like it stops
 * being crawled/alerted/AI-processed.
 */
export async function listActiveOrganizationIdsForDigest(db: Db): Promise<OrganizationId[]> {
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(isNull(organizations.deletedAt));
  return rows.map((row) => asOrganizationId(row.id));
}

export type DigestMentionItem = {
  title: string;
  sourceName: string;
  canonicalUrl: string;
  sentiment: string | null;
  priority: string;
};

export type DigestOrgSummary = {
  totalNewMentions: number;
  sentimentCounts: { positive: number; neutral: number; negative: number; unclassified: number };
  topMentions: DigestMentionItem[];
};

/**
 * "Since yesterday" summary for one organization, across every project —
 * the digest is a single daily email, not one per project. Zero-result
 * callers (no new mentions in the window) get back `totalNewMentions: 0`
 * rather than an error; the caller decides whether that's worth sending.
 */
export async function getDigestSummaryForOrganization(
  db: Db,
  organizationId: OrganizationId,
  sinceHours = 24,
  topLimit = 5,
): Promise<DigestOrgSummary> {
  const since = sql`now() - (${sinceHours}::text || ' hours')::interval`;
  const scope = and(eq(mentions.organizationId, organizationId), gte(mentions.createdAt, since));

  const [totalRow] = await db.select({ total: count() }).from(mentions).where(scope);

  const sentimentRows = await db
    .select({ sentiment: mentions.sentiment, total: count() })
    .from(mentions)
    .where(scope)
    .groupBy(mentions.sentiment);

  const sentimentCounts = { positive: 0, neutral: 0, negative: 0, unclassified: 0 };
  for (const row of sentimentRows) {
    const key = row.sentiment as keyof typeof sentimentCounts | null;
    if (key && key in sentimentCounts) sentimentCounts[key] = Number(row.total);
    else sentimentCounts.unclassified += Number(row.total);
  }

  // Plain `desc(mentions.priority)` would sort alphabetically ("normal"
  // before "critical") — rank explicitly so "top stories" actually means
  // highest severity first, not highest in the alphabet.
  const priorityRank = sql<number>`case ${mentions.priority}
    when 'critical' then 4 when 'high' then 3 when 'normal' then 2 when 'low' then 1 else 0 end`;

  const topMentions = await db
    .select({
      title: articles.title,
      sourceName: sources.name,
      canonicalUrl: articles.canonicalUrl,
      sentiment: mentions.sentiment,
      priority: mentions.priority,
    })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(scope)
    .orderBy(desc(priorityRank), desc(mentions.createdAt))
    .limit(topLimit);

  return { totalNewMentions: Number(totalRow?.total ?? 0), sentimentCounts, topMentions };
}
