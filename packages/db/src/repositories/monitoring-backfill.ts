import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  sourceInRegionScopes,
  classifyMatchType,
  computeMatchPriority,
  findFingerprintMatch,
  findMatchedTerm,
  matchesText,
  matchableText,
} from "@cim/core";
import type { Db } from "../client";
import { articles, sources } from "../schema/content";
import type { QueryAst } from "../schema/monitoring";
import { createMentionIfNotExists } from "./mentions";
import type { OrganizationId } from "./tenant-scope";

export const BACKFILL_WINDOW_DAYS = 30;
const BACKFILL_SCAN_LIMIT = 60_000;
const BATCH = 5_000;

/**
 * A monitoring only ever matched stories fetched AFTER it was saved, so a new
 * one stayed empty until the sources were next crawled — even when the preview
 * had just shown matches. This walks the stories already stored (same 30-day
 * window as the preview, newest first, bounded) and creates the mentions the
 * ingest pipeline would have created (stories stored with a word fingerprint also match on
 * words beyond the stored excerpt), dated to the story rather than to now so
 * the alert checks do not see a burst.
 */
export async function backfillMentionsForQuery(
  db: Db,
  organizationId: OrganizationId,
  query: { id: string; projectId: string; queryAst: QueryAst; sourceTypes: string[]; regionScopes?: string[] },
  options: { days?: number; scanLimit?: number } = {},
): Promise<{ scanned: number; created: number }> {
  const days = options.days ?? BACKFILL_WINDOW_DAYS;
  const scanLimit = options.scanLimit ?? BACKFILL_SCAN_LIMIT;
  if (query.sourceTypes.length === 0) return { scanned: 0, created: 0 };

  const recency = sql`coalesce(${articles.publishedAt}, ${articles.createdAt})`;
  let scanned = 0;
  let created = 0;
  while (scanned < scanLimit) {
    const rows = await db
      .select({
        id: articles.id,
        title: articles.title,
        lead: articles.storedExcerpt,
        wordFingerprint: articles.wordFingerprint,
        language: articles.language,
        publishedAt: articles.publishedAt,
        createdAt: articles.createdAt,
        sourceType: sources.type,
        sourceCountry: sources.country,
      })
      .from(articles)
      .innerJoin(sources, eq(sources.id, articles.sourceId))
      .where(
        and(
          inArray(sources.type, query.sourceTypes),
          sql`${recency} >= now() - (${days}::text || ' days')::interval`,
        ),
      )
      .orderBy(desc(recency), desc(articles.id))
      .limit(Math.min(BATCH, scanLimit - scanned))
      .offset(scanned);
    if (rows.length === 0) break;
    scanned += rows.length;

    for (const row of rows) {
      if (!sourceInRegionScopes(row.sourceCountry, query.regionScopes)) continue;
      // The stored headline + 200-character excerpt are matched exactly; beyond that the
      // story is only known by its word fingerprint (hashed words of the whole summary).
      const text = matchableText(row);
      const match = { language: row.language };
      const exact = matchesText(query.queryAst, text, match);
      const fingerprintTerm = exact ? null : findFingerprintMatch(query.queryAst, row.wordFingerprint, match);
      if (!exact && fingerprintTerm === null) continue;
      const matchedTerm = exact ? findMatchedTerm(query.queryAst, text, match) : fingerprintTerm;
      const { matchType, matchedRule } = matchedTerm
        ? classifyMatchType(query.queryAst, matchedTerm, row.sourceType)
        : { matchType: null, matchedRule: null };
      const id = await createMentionIfNotExists(db, organizationId, {
        projectId: query.projectId,
        queryId: query.id,
        articleId: row.id,
        matchedTerms: matchedTerm ? [matchedTerm] : query.queryAst.include,
        priority: computeMatchPriority(query.queryAst, row.title, match),
        matchType,
        matchedRule,
        createdAt: row.publishedAt ?? row.createdAt,
      });
      if (id) created += 1;
    }
    if (rows.length < BATCH) break;
  }
  return { scanned, created };
}
