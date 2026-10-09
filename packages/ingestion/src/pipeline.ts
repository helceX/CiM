import {
  classifyMatchType,
  describeSignal,
  findMatchedTerm,
  isWithinStoryWindow,
  matchableText,
  matchesText,
  sourceInRegionScopes,
  type SignalLevel,
} from "@cim/core";
import {
  applyCoverageToCluster,
  asOrganizationId,
  assignStoryCluster,
  countClusterOutlets,
  createMentionIfNotExists,
  findExistingArticle,
  findOrCreateSocialProfile,
  findSimilarRecentArticle,
  insertArticle,
  listActiveMonitoringQueriesForSourceType,
  signalFor,
  type ActiveMonitoringQuery,
  touchSocialProfile,
  type Db,
  type OrganizationId,
} from "@cim/db";
import type { Source } from "@cim/db/schema";
import type { RawFetchResult, SourceConnector } from "./connector";
import { itemKey } from "./crawl-memory";
import { normalizeToArticleInput } from "./normalize";

export type NewMentionRecord = {
  mentionId: string;
  organizationId: OrganizationId;
  projectId: string;
  queryId: string;
  /** How much the story matters to the monitoring (see @cim/core signal.ts). */
  priority: SignalLevel;
  /** What an alert says about the story, so a notification is readable without opening the app. */
  title?: string;
  sourceName?: string;
  /** Why it ranks where it does ("The headline names “X” …"). */
  why?: string | null;
};

export type IngestOptions = {
  /** The active monitorings for the source's type. Defaults to reading them; the worker passes a copy it keeps for a minute. */
  activeQueries?: readonly ActiveMonitoringQuery[];
  /** Items (by `itemKey`) a previous crawl already ingested under the same monitorings: they are not looked at again. */
  skipKeys?: ReadonlySet<string>;
};

export type IngestSourceResult = {
  sourceId: string;
  itemsFetched: number;
  /** Items left alone because `skipKeys` said an earlier crawl had already handled them. */
  itemsSkipped: number;
  /** The key of every item in this fetch — what the caller remembers for the next crawl once this one has succeeded. */
  itemKeys: string[];
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
  options: IngestOptions = {},
): Promise<IngestSourceResult> {
  const rawItems = await connector.fetch(source);
  const activeQueries = options.activeQueries ?? (await listActiveMonitoringQueriesForSourceType(db, source.type));

  let articlesCreated = 0;
  let itemsSkipped = 0;
  const itemKeys: string[] = [];
  const newMentions: NewMentionRecord[] = [];

  for (const raw of rawItems) {
    const key = itemKey(raw.canonicalUrl);
    itemKeys.push(key);
    if (options.skipKeys?.has(key)) {
      itemsSkipped += 1;
      continue;
    }
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
    let clusterId = existing?.storyClusterId ?? null;
    if (!existing) {
      articlesCreated += 1;
      clusterId = await maybeAssignStoryCluster(db, article);
    }
    // How many outlets carry this story: a story many outlets run is more important than one that stands alone.
    const outlets = clusterId ? await countClusterOutlets(db, clusterId) : 1;

    // Headline plus the feed's own summary (see matchableText): a story that
    // names the brand in its first lines is a mention even when the headline
    // does not. The priority signal stays headline-only.
    const text = matchableText({ title: article.title, lead: raw.bodyText });
    // Keywords take the word endings of the story's language (see @cim/core morphology).
    const match = { language: raw.language ?? source.language };
    for (const query of activeQueries) {
      if (!sourceInRegionScopes(source.country, query.regionScopes)) continue;
      if (!matchesText(query.queryAst, text, match)) continue;
      // How much it matters to THIS monitoring and why: where its words are, whether it names the thing
      // itself, the goals the person chose, the reach of the story (@cim/core scoreSignal).
      const signal = signalFor(
        query,
        { title: article.title, lead: raw.bodyText ?? null, language: match.language ?? null, sourceType: source.type },
        outlets,
      );
      const priority = signal.level;
      const organizationId = asOrganizationId(query.organizationId);
      const matchedTerm = findMatchedTerm(query.queryAst, text, match);
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
        signalScore: signal.score,
        signalReasons: signal.reasons,
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
          title: article.title,
          sourceName: source.name,
          why: describeSignal(priority, signal.reasons)?.short ?? null,
        });
      }
    }
    // The story just gained an outlet: the mentions of the same story elsewhere pick up its wider reach.
    if (!existing && clusterId && outlets >= 3) await applyCoverageToCluster(db, clusterId);
  }

  return {
    sourceId: source.id,
    itemsFetched: rawItems.length,
    itemsSkipped,
    itemKeys,
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
 *
 * Only stories published within the clustering window are looked up: a new source's back catalogue (the
 * first crawl of a feed returns its last 20-40 stories, mostly days old) cannot have a look-alike worth
 * linking, and each lookup is a database search. The race between two stories that find each other is
 * handled in assignStoryCluster (articles.ts), with a lock held for milliseconds.
 */
async function maybeAssignStoryCluster(
  db: Db,
  article: {
    id: string;
    sourceId: string;
    title: string;
    publishedAt: Date | null;
    storyClusterId: string | null;
  },
): Promise<string | null> {
  if (article.storyClusterId) return article.storyClusterId;
  if (!isWithinStoryWindow(article.publishedAt)) return null;
  const candidate = await findSimilarRecentArticle(db, {
    title: article.title,
    excludeSourceId: article.sourceId,
  });
  if (!candidate) return null;
  return assignStoryCluster(db, { articleId: article.id, candidate });
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
