import { classifyMatchType, computeMatchPriority, findMatchedTerm, matchesText } from "@cim/core";
import {
  asOrganizationId,
  createMentionIfNotExists,
  findExistingArticle,
  findOrCreateSocialProfile,
  insertArticle,
  listActiveMonitoringQueriesForSourceType,
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
    if (!existing) articlesCreated += 1;

    for (const query of activeQueries) {
      if (!matchesText(query.queryAst, article.title)) continue;
      const priority = computeMatchPriority(query.queryAst, article.title);
      const organizationId = asOrganizationId(query.organizationId);
      const matchedTerm = findMatchedTerm(query.queryAst, article.title);
      const { matchType, matchedRule } = matchedTerm
        ? classifyMatchType(query.queryAst, matchedTerm, source.type)
        : { matchType: null, matchedRule: null };
      const mentionId = await createMentionIfNotExists(db, organizationId, {
        projectId: query.projectId,
        queryId: query.id,
        articleId: article.id,
        matchedTerms: query.queryAst.include,
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
 * docs/architecture/ADR-006-SOCIAL-LISTENING.md — resolves (or creates)
 * the socialProfiles row for a raw fetch result's author, when the
 * connector reported one. Null for every non-social connector (raw's
 * social* fields are absent) and never fabricated when they're missing.
 */
async function resolveAuthorProfileId(db: Db, raw: RawFetchResult): Promise<string | null> {
  if (!raw.socialPlatform || !raw.socialAuthorExternalId || !raw.socialAuthorHandle) return null;
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
  return profile.id;
}

