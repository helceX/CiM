import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  classifyMatchType,
  computeMatchPriority,
  findMatchedTerm,
  matchableText,
  matchesText,
} from "@cim/core";
import {
  asOrganizationId,
  createMentionIfNotExists,
  findExistingArticle,
  findOrCreateSocialProfile,
  findSimilarRecentArticle,
  insertArticle,
  listActiveMonitoringQueriesForSourceType,
  setArticleStoryCluster,
  touchSocialProfile,
  type Db,
  type OrganizationId,
} from "@cim/db";
import type { Source } from "@cim/db/schema";
import type { RawFetchResult, SourceConnector } from "./connector";
import { normalizeToArticleInput } from "./normalize";

export type NewMentionRecord = {
  mentionId: string;
  organizationId: OrganizationId;
  projectId: string;
  queryId: string;
  priority: "high" | "normal";
};

export type IngestSourceResult = {
  sourceId: string;
  itemsFetched: number;
  articlesCreated: number;
  mentionsCreated: number;
  newMentions: NewMentionRecord[];
};

/**
 * docs/architecture/INGESTION.md pipeline: Fetch → Normalize →
 * Canonicalize → Deduplicate → Query Match. (Language Detect / Entity
 * Extract / Classify / Embed are AI-enrichment stages, Phase 6 — this
 * MVP pipeline leaves those fields unset rather than guessing, per the
 * platform-wide "Not available" rule, brief §95.)
 *
 * Idempotent: re-running over the same fetched item upserts the same
 * Article (canonical URL / content hash dedupe) and never creates a
 * duplicate Mention (DB-enforced unique index on query+article).
 */
export async function ingestSource(
  db: Db,
  source: Source,
  connector: SourceConnector,
): Promise<IngestSourceResult> {
  const rawItems = await connector.fetch(source);
  const activeQueries = await listActiveMonitoringQueriesForSourceType(db, source.type);

  let articlesCreated = 0;
  const newMentions: NewMentionRecord[] = [];

  for (const raw of rawItems) {
    const normalized = normalizeToArticleInput(source, raw);
    const existing = await findExistingArticle(db, {
      canonicalUrl: normalized.canonicalUrl,
      contentHash: normalized.contentHash,
    });
    const article =
      existing ??
      (await insertArticle(db, {
        ...normalized,
        authorProfileId: await resolveAuthorProfileId(db, raw),
      }));
    if (!existing) {
      articlesCreated += 1;
      await maybeAssignStoryCluster(db, article);
    }

    // Headline plus the feed's own summary (see matchableText): a story that
    // names the brand in its first lines is a mention even when the headline
    // does not. The priority signal stays headline-only.
    const text = matchableText({ title: article.title, lead: raw.bodyText });
    for (const query of activeQueries) {
      if (!matchesText(query.queryAst, text)) continue;
      const priority = computeMatchPriority(query.queryAst, article.title);
      const organizationId = asOrganizationId(query.organizationId);
      const matchedTerm = findMatchedTerm(query.queryAst, text);
      const { matchType, matchedRule } = matchedTerm
        ? classifyMatchType(query.queryAst, matchedTerm, source.type)
        : { matchType: null, matchedRule: null };
      const mentionId = await createMentionIfNotExists(db, organizationId, {
        projectId: query.projectId,
        queryId: query.id,
        articleId: article.id,
        // The one term that actually matched (findMatchedTerm above) —
        // not the query's whole include list. Downstream code treats
        // matchedTerms as "what actually matched," not "everything this
        // query was configured to look for": getTrendingHashtags
        // (social-listening.ts) unnests matchedTerms for every
        // match_type='hashtag' mention and would otherwise count and
        // display non-hashtag terms as trending hashtags. Falls back to
        // the full include list only in the edge case matchedTerm is
        // null (a query with no include/exactPhrase terms at all).
        matchedTerms: matchedTerm ? [matchedTerm] : query.queryAst.include,
        priority,
        matchType,
        matchedRule,
      });
      if (mentionId) {
        newMentions.push({
          mentionId,
          organizationId,
          projectId: query.projectId,
          queryId: query.id,
          priority,
        });
      }
    }
  }

  return {
    sourceId: source.id,
    itemsFetched: rawItems.length,
    articlesCreated,
    mentionsCreated: newMentions.length,
    newMentions,
  };
}

/**
 * docs/architecture/ADR-004-INGESTION.md's "title/semantic similarity...
 * producing StoryCluster rows" promise — a newly-inserted article that
 * closely matches another recent article from a *different* source
 * (findSimilarRecentArticle's own cross-source-only search) joins that
 * article's existing cluster, or starts a new one if neither article
 * had one yet. A single-source story is never clustered with itself —
 * clustering exists to answer "who else is covering this."
 */
async function maybeAssignStoryCluster(
  db: Db,
  article: {
    id: string;
    sourceId: string;
    title: string;
    storyClusterId: string | null;
  },
): Promise<void> {
  if (article.storyClusterId) return;
  // Race: crawlSourceWorker runs at concurrency 5 (apps/worker/src/
  // index.ts), and crawl-scheduler.ts fans out every active source's job
  // in the same tick — so two different sources can both insert a new
  // article for the same breaking story around the same time, exactly
  // the case this clustering exists for. findSimilarRecentArticle
  // doesn't filter out an already-clustered row, and setArticleStoryCluster
  // is a plain unconditional UPDATE, so without serializing, both jobs'
  // lookups can see the *other* article's storyClusterId as still null
  // and each generate its own new cluster id, cross-writing each other's
  // row — the two articles can end up on two different final cluster
  // ids instead of sharing one. A single fixed-key advisory lock
  // serializes every concurrent clustering attempt process-wide; cheap,
  // since this only ever runs once per newly-inserted article that has a
  // cross-source similarity match, the same pattern billing.ts's
  // createMonitoringQueryWithPlanLimit already uses for its own race.
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('story-cluster-assign'))`);
    const txDb = tx as unknown as Db;
    const similar = await findSimilarRecentArticle(txDb, {
      title: article.title,
      excludeSourceId: article.sourceId,
    });
    if (!similar) return;
    const storyClusterId = similar.storyClusterId ?? randomUUID();
    await setArticleStoryCluster(txDb, article.id, storyClusterId);
    if (!similar.storyClusterId) {
      await setArticleStoryCluster(txDb, similar.id, storyClusterId);
    }
  });
}

/**
 * docs/architecture/ADR-006-SOCIAL-LISTENING.md — resolves (or creates)
 * the socialProfiles row for a raw fetch result's author, when the
 * connector reported one. Null for every non-social connector (raw's
 * social* fields are absent) and never fabricated when they're missing.
 *
 * Also refreshes the profile via touchSocialProfile on every sighting —
 * findOrCreateSocialProfile alone only writes the row once, on first
 * sighting; without this, an existing author's follower count/verified
 * status/display name would go stale forever after that first post,
 * contradicting touchSocialProfile's own documented purpose. Only
 * fields this fetch actually reported are included in the update — a
 * field the connector left unset here must not clobber a previously
 * known value with a fabricated "now unknown."
 */
async function resolveAuthorProfileId(
  db: Db,
  raw: RawFetchResult,
): Promise<string | null> {
  if (!raw.socialPlatform || !raw.socialAuthorExternalId || !raw.socialAuthorHandle)
    return null;
  const profile = await findOrCreateSocialProfile(db, {
    platform: raw.socialPlatform,
    externalId: raw.socialAuthorExternalId,
    handle: raw.socialAuthorHandle,
    displayName: raw.socialAuthorDisplayName ?? null,
    profileUrl: raw.socialAuthorProfileUrl ?? null,
    followers: raw.socialAuthorFollowers ?? null,
    following: null,
    verified: raw.socialAuthorVerified ?? null,
    accountType: null,
    language: null,
    country: null,
    avatarUrl: null,
  });

  const update: Parameters<typeof touchSocialProfile>[2] = {};
  if (raw.socialAuthorFollowers !== undefined)
    update.followers = raw.socialAuthorFollowers;
  if (raw.socialAuthorVerified !== undefined)
    update.verified = raw.socialAuthorVerified;
  if (raw.socialAuthorDisplayName !== undefined)
    update.displayName = raw.socialAuthorDisplayName;
  await touchSocialProfile(db, profile.id, update);

  return profile.id;
}
