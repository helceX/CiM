import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, min, or, sql } from "drizzle-orm";
import {
  STORY_CANDIDATE_LIMIT,
  STORY_WINDOW_HOURS,
  clusterQueryWords,
  toTsQueryAny,
  turkishFold,
  type ArticlePrint,
} from "@cim/core";
import type { Db } from "../client";
import { articles, sources } from "../schema/content";

/** Articles are global/reference data (ADR-001) — no tenant scoping here. */

export async function findExistingArticle(
  db: Db,
  input: { canonicalUrl: string; contentHash: string },
) {
  const [existing] = await db
    .select()
    .from(articles)
    .where(
      or(
        eq(articles.canonicalUrl, input.canonicalUrl),
        eq(articles.contentHash, input.contentHash),
      ),
    )
    .limit(1);
  return existing;
}

export async function insertArticle(
  db: Db,
  input: {
    sourceId: string;
    canonicalUrl: string;
    contentHash: string;
    title: string;
    storedExcerpt: string | null;
    language: string | null;
    publishedAt: Date | null;
    authorName: string | null;
    // docs/architecture/ADR-006-SOCIAL-LISTENING.md — set by the
    // pipeline when the raw fetch result carried a social author;
    // absent/null for every non-social article.
    authorProfileId?: string | null;
    // Printed-edition reference (edition date, page, viewer link) — null/absent for digital stories.
    print?: ArticlePrint | null;
    // Hashed words of the headline and the feed's whole summary (@cim/core buildWordFingerprint).
    wordFingerprint?: Uint8Array | null;
  },
) {
  // docs/architecture/ADR-002-SEARCH.md MVP tier — folded here (JS, not a
  // Postgres GENERATED column: turkishFold must run before to_tsvector
  // ever sees the text) so every new article is searchable immediately,
  // not just after a later backfill.
  const folded = turkishFold(`${input.title} ${input.storedExcerpt ?? ""}`);
  const [article] = await db
    .insert(articles)
    .values({ ...input, searchVector: sql`to_tsvector('simple', ${folded})` })
    .onConflictDoNothing()
    .returning();
  if (article) return article;

  // Race: findExistingArticle (the caller, pipeline.ts's ingestSource)
  // found nothing, but another concurrent crawl of the same source
  // (crawlSource runs at concurrency:5; a stalled-job requeue can also
  // dispatch the same source's job twice) inserted this exact
  // canonicalUrl/contentHash first — articles_content_hash_uidx/
  // articles_canonical_url_uidx caught it. Return that row rather than
  // throwing, so this stays the upsert pipeline.ts's own docstring
  // promises ("re-running over the same fetched item upserts the same
  // Article ... never creates a duplicate Mention").
  const existing = await findExistingArticle(db, {
    canonicalUrl: input.canonicalUrl,
    contentHash: input.contentHash,
  });
  if (!existing) throw new Error("Failed to insert article");
  return existing;
}

export type PreviewStory = {
  id: string;
  title: string;
  storedExcerpt: string | null;
  wordFingerprint: Uint8Array | null;
  language: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
  sourceName: string;
  sourceType: string;
  sourceCountry: string | null;
};

const PREVIEW_COLUMNS = {
  id: articles.id,
  title: articles.title,
  storedExcerpt: articles.storedExcerpt,
  wordFingerprint: articles.wordFingerprint,
  language: articles.language,
  publishedAt: articles.publishedAt,
  fetchedAt: articles.fetchedAt,
  sourceName: sources.name,
  sourceType: sources.type,
  sourceCountry: sources.country,
} as const;

/**
 * The stories a preview judges. Two sets, so a rare keyword is not lost among the thousands of stories the
 * crawler collects every day: the newest `scanLimit` stories (exactly what saving the monitoring would scan,
 * including a keyword that sits beyond the stored excerpt, found through the word fingerprint) and every
 * stored story whose headline or excerpt contains the words of `tsQuery` (found through the full-text
 * index, whatever its age). The caller applies the monitoring's own matching rules to the union.
 *
 * Also says how far back the stored stories go (`windowDays`) and how far back the newest-stories scan
 * reached (`scannedSince`), so the preview can state what it actually looked at.
 */
export async function listStoriesForPreview(
  db: Db,
  input: { tsQuery: string | null; days?: number; scanLimit?: number; candidateLimit?: number },
): Promise<{ stories: PreviewStory[]; scanned: number; scannedSince: Date | null; windowDays: number }> {
  const days = input.days ?? 30;
  const scanLimit = input.scanLimit ?? 20_000;
  const candidateLimit = input.candidateLimit ?? 5_000;
  const inWindow = gte(articles.fetchedAt, sql`now() - (${days}::text || ' days')::interval`);

  const recent = await db
    .select(PREVIEW_COLUMNS)
    .from(articles)
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(inWindow)
    .orderBy(desc(articles.fetchedAt))
    .limit(scanLimit);
  const containing = input.tsQuery
    ? await db
        .select(PREVIEW_COLUMNS)
        .from(articles)
        .innerJoin(sources, eq(sources.id, articles.sourceId))
        .where(and(inWindow, sql`${articles.searchVector} @@ to_tsquery('simple', ${input.tsQuery})`))
        .orderBy(desc(articles.fetchedAt))
        .limit(candidateLimit)
    : [];
  const seen = new Set(recent.map((story) => story.id));
  const stories = [...recent, ...containing.filter((story) => !seen.has(story.id))];

  const [oldest] = await db.select({ at: min(articles.fetchedAt) }).from(articles).where(inWindow);
  const stored = oldest?.at ? Math.ceil((Date.now() - oldest.at.getTime()) / 86_400_000) : days;
  return {
    stories,
    scanned: recent.length,
    scannedSince: recent.at(-1)?.fetchedAt ?? null,
    windowDays: Math.min(days, Math.max(1, stored)),
  };
}

/**
 * docs/architecture/ADR-004-INGESTION.md's own promise — "title/semantic
 * similarity... producing StoryCluster rows" — implemented here as the
 * title-similarity slice. Deliberately excludes `excludeSourceId`: the
 * point of clustering is cross-source corroboration ("who else is
 * covering this"), not linking an outlet's own two headlines about the
 * same event. 0.5 is a stricter floor than pg_trgm's own 0.3 default `%`
 * threshold — clustering drives what a user is shown as "related
 * coverage" (master prompt §38: never framed as a certain link), so a
 * false-positive costs more here than in a plain search match.
 *
 * This runs once for EVERY new story, so its cost is the cost of the crawl. It used to compare the headline
 * with every story of the last 48 hours (`similarity()` on 40–200 thousand rows, ~0.6 s of Postgres CPU
 * each, and 99.9% of the database time of a crawl in the benchmark — docs/architecture/CRAWL_COST.md).
 * Now the full-text index first narrows those to the stories that share one of the headline's most
 * distinctive words (single-digit milliseconds), the newest few hundred of them are compared exactly, and
 * the same 0.5 rule decides. A look-alike that shares none of the six longest words is not found; headlines
 * of one story almost always share several. `findSimilarRecentArticleExact` is the original full scan.
 */
export async function findSimilarRecentArticle(
  db: Db,
  input: { title: string; excludeSourceId: string; sinceHours?: number },
): Promise<{ id: string; storyClusterId: string | null } | undefined> {
  const sinceHours = input.sinceHours ?? STORY_WINDOW_HOURS;
  const words = clusterQueryWords(input.title);
  if (words.length === 0) return undefined;
  const rows = await db.execute<{ id: string; story_cluster_id: string | null }>(sql`
    select id, story_cluster_id
    from (
      select id, story_cluster_id, title
      from articles
      where source_id != ${input.excludeSourceId}
        and fetched_at >= now() - (${sinceHours}::text || ' hours')::interval
        and search_vector @@ to_tsquery('simple', ${toTsQueryAny(words)})
      order by fetched_at desc
      limit ${STORY_CANDIDATE_LIMIT}
    ) candidates
    where similarity(title, ${input.title}) > 0.5
    order by similarity(title, ${input.title}) desc
    limit 1
  `);
  const row = rows.rows[0];
  return row ? { id: row.id, storyClusterId: row.story_cluster_id } : undefined;
}

/** The original lookup: every story of the window, compared exactly. Kept as the reference the fast one is tested against. */
export async function findSimilarRecentArticleExact(
  db: Db,
  input: { title: string; excludeSourceId: string; sinceHours?: number },
): Promise<{ id: string; storyClusterId: string | null } | undefined> {
  const sinceHours = input.sinceHours ?? STORY_WINDOW_HOURS;
  const rows = await db.execute<{ id: string; story_cluster_id: string | null }>(sql`
    select id, story_cluster_id
    from articles
    where source_id != ${input.excludeSourceId}
      and fetched_at >= now() - (${sinceHours}::text || ' hours')::interval
      and similarity(title, ${input.title}) > 0.5
    order by similarity(title, ${input.title}) desc
    limit 1
  `);
  const row = rows.rows[0];
  return row ? { id: row.id, storyClusterId: row.story_cluster_id } : undefined;
}

export async function setArticleStoryCluster(
  db: Db,
  articleId: string,
  storyClusterId: string,
): Promise<void> {
  await db.update(articles).set({ storyClusterId }).where(eq(articles.id, articleId));
}

/**
 * Puts a new story in the cluster of the look-alike it was found to resemble, and returns the cluster id.
 *
 * Joining a cluster that already exists is a single idempotent UPDATE (whoever writes it writes the same id),
 * so it takes no lock. Only starting a NEW cluster needs one: two stories that find each other (or two that
 * find the same third) at the same moment must end up with one id, not each generating their own. The locks
 * cover just the stories involved, are held for two primary-key reads and two writes (milliseconds — the
 * expensive look-alike search has already happened, outside it), and re-reads the rows under the lock so a
 * cluster created a moment earlier is joined instead of replaced. It used to be one global lock around a
 * second full search, so every cluster started anywhere waited for it.
 */
export async function assignStoryCluster(
  db: Db,
  input: { articleId: string; candidate: { id: string; storyClusterId: string | null } },
): Promise<string> {
  if (input.candidate.storyClusterId) {
    await setArticleStoryCluster(db, input.articleId, input.candidate.storyClusterId);
    return input.candidate.storyClusterId;
  }
  return db.transaction(async (tx) => {
    // One lock per story, taken in a fixed order (so two transactions can never wait on each other): stories
    // that find each other share both locks, stories that find the same third share its lock, and stories
    // with nothing in common share none and never wait.
    for (const id of [input.articleId, input.candidate.id].sort()) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`story-cluster:${id}`}, 0))`);
    }
    const rows = await tx.execute<{ id: string; story_cluster_id: string | null }>(
      sql`select id, story_cluster_id from articles where id in (${input.articleId}, ${input.candidate.id})`,
    );
    const clusterOf = (id: string) => rows.rows.find((row) => row.id === id)?.story_cluster_id ?? null;
    const own = clusterOf(input.articleId);
    const other = clusterOf(input.candidate.id);
    const clusterId = other ?? own ?? randomUUID();
    const txDb = tx as unknown as Db;
    if (own !== clusterId) await setArticleStoryCluster(txDb, input.articleId, clusterId);
    if (other !== clusterId) await setArticleStoryCluster(txDb, input.candidate.id, clusterId);
    return clusterId;
  });
}

/**
 * docs/architecture/DATA_MODEL.md — "Related coverage" for the Mention
 * Detail Drawer: every other article sharing this article's
 * storyClusterId, most recent first. Empty when the article isn't
 * clustered with anything yet (a single-source story stays uncertain
 * until a second source corroborates it — findSimilarRecentArticle only
 * assigns a cluster once that happens).
 */
export type RelatedArticle = {
  id: string;
  title: string;
  canonicalUrl: string;
  publishedAt: Date | null;
  fetchedAt: Date;
  sourceName: string;
  sourceType: string;
};

export async function listRelatedArticles(
  db: Db,
  storyClusterId: string,
  excludeArticleId: string,
): Promise<RelatedArticle[]> {
  return db
    .select({
      id: articles.id,
      title: articles.title,
      canonicalUrl: articles.canonicalUrl,
      publishedAt: articles.publishedAt,
      fetchedAt: articles.fetchedAt,
      sourceName: sources.name,
      sourceType: sources.type,
    })
    .from(articles)
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(
      sql`${articles.storyClusterId} = ${storyClusterId} and ${articles.id} != ${excludeArticleId}`,
    )
    .orderBy(sql`coalesce(${articles.publishedAt}, ${articles.fetchedAt}) desc`)
    .limit(10);
}

/**
 * docs/architecture/SEARCH.md "Preview results" — a read-only sample of
 * recent articles, evaluated in-process against a candidate QueryAst
 * before it's saved. Capped and time-bounded on purpose: this is a
 * quick-feedback preview, not the eventual search index (Meilisearch,
 * ADR-002) that a saved query will actually run against at scale.
 */
export async function listRecentArticlesForPreview(db: Db, days = 30, limit = 500) {
  // WebConnector always sets publishedAt: null (no reliable publish date
  // on a scraped page), and ApiConnector does too whenever the upstream
  // item omits one — a plain `gte(publishedAt, ...)` treats those as
  // unknown/false and excludes them from every preview permanently,
  // regardless of the days window, even though the real ingestion
  // pipeline (pipeline.ts) doesn't filter on publishedAt at all and
  // would happily turn the same article into a real Mention. Falling
  // back to createdAt (ingestion time, never null) keeps "recent" from
  // silently meaning "recent AND from a source that reports dates."
  const recency = sql`coalesce(${articles.publishedAt}, ${articles.createdAt})`;
  return db
    .select({
      id: articles.id,
      title: articles.title,
      storedExcerpt: articles.storedExcerpt,
      wordFingerprint: articles.wordFingerprint,
      language: articles.language,
      publishedAt: articles.publishedAt,
      sourceName: sources.name,
      sourceType: sources.type,
      sourceCountry: sources.country,
    })
    .from(articles)
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(sql`${recency} >= now() - (${days}::text || ' days')::interval`)
    .orderBy(sql`${recency} desc`)
    .limit(limit);
}
