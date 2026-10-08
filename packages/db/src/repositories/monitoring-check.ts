import { and, count, desc, eq, gte, inArray, isNull, max, ne, or, sql, type SQL } from "drizzle-orm";
import {
  matchableText,
  matchesFingerprint,
  matchesText,
  sourceInRegionScopes,
  termsToTsQuery,
  type MonitoringCheckFacts,
} from "@cim/core";
import type { Db } from "../client";
import { alertEvents, alertRules } from "../schema/alerts";
import { articles, mentions, sources } from "../schema/content";
import { getMonitoringQuery } from "./monitoring-queries";
import type { OrganizationId } from "./tenant-scope";

/** At most this many of a monitoring's keywords are counted (each is one indexed query). */
const MAX_KEYWORDS = 12;
/** Candidate stories judged when looking for stories a monitoring should hold but does not. */
const MISSED_CANDIDATE_LIMIT = 2000;
/** Only recent stories are judged: older ones may predate the keywords the monitoring has now. */
const MISSED_WINDOW_HOURS = 48;
/** The whole check is bounded; a heavy database answers "too slow" instead of hanging the page. */
const STATEMENT_TIMEOUT_MS = 15_000;

export type MonitoringCheck = MonitoringCheckFacts & {
  query: {
    id: string;
    name: string;
    sourceTypes: string[];
    regionScopes: string[];
    createdAt: Date;
    updatedAt: Date;
    latestMentionAt: Date | null;
  };
  /** When any alert rule on this monitoring last fired. */
  lastAlertAt: Date | null;
  /** Up to five stories that match the rules but are not held (see `missed`). */
  missedSamples: { title: string; sourceName: string; fetchedAt: Date }[];
};

/**
 * Measures, from the live data, why a monitoring is quiet: how many sources it can read, whether
 * the crawler is scanning, how many stories it collected from those sources, how often the
 * monitoring's words appear in them (through the full-text index, so a week of stories is cheap
 * to count), what the monitoring holds — and whether any story that its own rules accept, collected
 * after it was last saved, is missing from it (it should never be).
 *
 * Read-only and scoped to one organization's monitoring; the story counts are of the shared
 * collection, which is what the monitoring reads.
 */
export async function getMonitoringCheck(
  db: Db,
  organizationId: OrganizationId,
  queryId: string,
  now: Date = new Date(),
): Promise<MonitoringCheck | null> {
  const query = await getMonitoringQuery(db, organizationId, queryId);
  if (!query) return null;

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('statement_timeout', ${String(STATEMENT_TIMEOUT_MS)}, true)`);
    const txDb = tx as unknown as Db;

    // Which sources can this monitoring read? Types are matched in SQL, regions in code (they are a set of
    // continents and countries), so group by country and keep the countries the region accepts.
    const groups = await txDb
      .select({ type: sources.type, country: sources.country, n: count() })
      .from(sources)
      .where(ne(sources.status, "unavailable"))
      .groupBy(sources.type, sources.country);
    const active = groups.reduce((sum, row) => sum + Number(row.n), 0);
    const readable = groups.filter(
      (row) => query.sourceTypes.includes(row.type) && sourceInRegionScopes(row.country, query.regionScopes),
    );
    const inScope = readable.reduce((sum, row) => sum + Number(row.n), 0);
    const countries = [...new Set(readable.map((row) => row.country).filter((country): country is string => country !== null))];
    const includesNoCountry = readable.some((row) => row.country === null);
    const countryFilter: SQL =
      countries.length > 0 && includesNoCountry
        ? or(inArray(sources.country, countries), isNull(sources.country))!
        : countries.length > 0
          ? inArray(sources.country, countries)
          : includesNoCountry
            ? isNull(sources.country)
            : sql`false`;
    const inScopeSources: SQL = and(
      ne(sources.status, "unavailable"),
      inArray(sources.type, query.sourceTypes.length > 0 ? query.sourceTypes : ["-"]),
      countryFilter,
    )!;

    const [{ lastScan } = { lastScan: null }] = await txDb
      .select({ lastScan: max(sources.lastCheckedAt) })
      .from(sources)
      .where(ne(sources.status, "unavailable"));
    const minutesSinceLastScan = lastScan ? Math.max(0, Math.round((now.getTime() - lastScan.getTime()) / 60_000)) : null;

    const [mentionRow] = await txDb
      .select({
        last24h: sql<number>`count(*) filter (where ${mentions.createdAt} >= ${new Date(now.getTime() - 24 * 3_600_000)})::int`,
        last7d: sql<number>`count(*) filter (where ${mentions.createdAt} >= ${new Date(now.getTime() - 7 * 24 * 3_600_000)})::int`,
        total: sql<number>`count(*)::int`,
        latest: max(mentions.createdAt),
      })
      .from(mentions)
      .where(and(eq(mentions.organizationId, organizationId), eq(mentions.queryId, query.id)));

    const [alertRow] = await txDb
      .select({
        active: sql<number>`count(*) filter (where ${alertRules.status} = 'active')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(alertRules)
      .where(and(eq(alertRules.organizationId, organizationId), eq(alertRules.queryId, query.id)));
    const [lastAlert] = await txDb
      .select({ at: max(alertEvents.createdAt) })
      .from(alertEvents)
      .innerJoin(alertRules, eq(alertRules.id, alertEvents.alertRuleId))
      .where(and(eq(alertRules.organizationId, organizationId), eq(alertRules.queryId, query.id)));

    let storiesLast24h = 0;
    const keywords: MonitoringCheck["keywords"] = [];
    let candidates: {
      title: string;
      storedExcerpt: string | null;
      wordFingerprint: Uint8Array | null;
      language: string | null;
      fetchedAt: Date;
      sourceName: string;
      saved: boolean;
    }[] = [];

    const ast = query.queryAst;
    const terms = [...ast.exactPhrases, ...ast.include];
    if (inScope > 0) {
      const dayAgo = new Date(now.getTime() - 24 * 3_600_000);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 3_600_000);

      const [storyRow] = await txDb
        .select({ n: count() })
        .from(articles)
        .innerJoin(sources, eq(sources.id, articles.sourceId))
        .where(and(gte(articles.fetchedAt, dayAgo), inScopeSources));
      storiesLast24h = Number(storyRow?.n ?? 0);

      for (const term of terms.slice(0, MAX_KEYWORDS)) {
        const tsQuery = termsToTsQuery([term]);
        if (!tsQuery) {
          keywords.push({ term, last24h: 0, last7d: 0 });
          continue;
        }
        const [row] = await txDb
          .select({
            last24h: sql<number>`count(*) filter (where ${articles.fetchedAt} >= ${dayAgo})::int`,
            last7d: sql<number>`count(*)::int`,
          })
          .from(articles)
          .innerJoin(sources, eq(sources.id, articles.sourceId))
          .where(and(gte(articles.fetchedAt, weekAgo), inScopeSources, sql`${articles.searchVector} @@ to_tsquery('simple', ${tsQuery})`));
        keywords.push({ term, last24h: Number(row?.last24h ?? 0), last7d: Number(row?.last7d ?? 0) });
      }

      // Stories collected since the monitoring was last saved (and within 48 hours) that contain its words:
      // the ones its rules accept must already be mentions.
      const allTerms = termsToTsQuery(terms);
      if (allTerms) {
        const since = new Date(
          Math.max(query.createdAt.getTime(), query.updatedAt.getTime(), now.getTime() - MISSED_WINDOW_HOURS * 3_600_000),
        );
        candidates = await txDb
          .select({
            title: articles.title,
            storedExcerpt: articles.storedExcerpt,
            wordFingerprint: articles.wordFingerprint,
            language: articles.language,
            fetchedAt: articles.fetchedAt,
            sourceName: sources.name,
            saved: sql<boolean>`exists (select 1 from ${mentions} where ${mentions.queryId} = ${query.id} and ${mentions.articleId} = ${articles.id})`,
          })
          .from(articles)
          .innerJoin(sources, eq(sources.id, articles.sourceId))
          .where(and(gte(articles.fetchedAt, since), inScopeSources, sql`${articles.searchVector} @@ to_tsquery('simple', ${allTerms})`))
          .orderBy(desc(articles.fetchedAt))
          .limit(MISSED_CANDIDATE_LIMIT);
      }
    }

    const accepted = candidates.filter(
      (story) =>
        matchesText(ast, matchableText({ title: story.title, lead: story.storedExcerpt }), { language: story.language }) ||
        matchesFingerprint(ast, story.wordFingerprint, { language: story.language }),
    );
    const missed = accepted.filter((story) => !story.saved);

    return {
      query: {
        id: query.id,
        name: query.name,
        sourceTypes: query.sourceTypes,
        regionScopes: query.regionScopes,
        createdAt: query.createdAt,
        updatedAt: query.updatedAt,
        latestMentionAt: mentionRow?.latest ?? null,
      },
      sources: { inScope, active },
      crawl: { minutesSinceLastScan },
      stories: { last24h: storiesLast24h },
      keywords,
      mentions: { last24h: Number(mentionRow?.last24h ?? 0), last7d: Number(mentionRow?.last7d ?? 0), total: Number(mentionRow?.total ?? 0) },
      alerts: { active: Number(alertRow?.active ?? 0), total: Number(alertRow?.total ?? 0) },
      lastAlertAt: lastAlert?.at ?? null,
      missed: { count: missed.length, checked: candidates.length },
      missedSamples: missed.slice(0, 5).map((story) => ({ title: story.title, sourceName: story.sourceName, fetchedAt: story.fetchedAt })),
    };
  });
}
