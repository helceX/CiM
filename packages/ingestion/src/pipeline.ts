import { matchesText } from "@cim/core";
import {
  asOrganizationId,
  createMentionIfNotExists,
  findExistingArticle,
  insertArticle,
  listActiveMonitoringQueriesForSourceType,
  type Db,
} from "@cim/db";
import type { Source } from "@cim/db/schema";
import type { SourceConnector } from "./connector";
import { normalizeToArticleInput } from "./normalize";

export type IngestSourceResult = {
  sourceId: string;
  itemsFetched: number;
  articlesCreated: number;
  mentionsCreated: number;
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
  let mentionsCreated = 0;

  for (const raw of rawItems) {
    const normalized = normalizeToArticleInput(source, raw);
    const existing = await findExistingArticle(db, {
      canonicalUrl: normalized.canonicalUrl,
      contentHash: normalized.contentHash,
    });
    const article = existing ?? (await insertArticle(db, normalized));
    if (!existing) articlesCreated += 1;

    for (const query of activeQueries) {
      if (!matchesText(query.queryAst, article.title)) continue;
      const created = await createMentionIfNotExists(db, asOrganizationId(query.organizationId), {
        projectId: query.projectId,
        queryId: query.id,
        articleId: article.id,
        matchedTerms: query.queryAst.include,
      });
      if (created) mentionsCreated += 1;
    }
  }

  return {
    sourceId: source.id,
    itemsFetched: rawItems.length,
    articlesCreated,
    mentionsCreated,
  };
}

