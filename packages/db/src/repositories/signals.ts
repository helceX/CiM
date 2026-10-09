import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { applyCoverage, scoreSignal, type Signal, type SignalLevel } from "@cim/core";
import type { Db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { monitoringQueries, type QueryAst } from "../schema/monitoring";
import type { OrganizationId } from "./tenant-scope";

/** The parts of a monitoring that decide how much a story matters to it. */
export type SignalQuery = { queryAst: QueryAst; trackingTarget?: string | null };
/** The parts of a stored story that are scored. */
export type SignalStory = { title: string; lead: string | null; language: string | null; sourceType: string };

/** How much a story matters to a monitoring, and why (see @cim/core signal.ts). */
export function signalFor(query: SignalQuery, story: SignalStory, outlets = 1): Signal {
  return scoreSignal({
    ast: query.queryAst,
    target: query.trackingTarget,
    intent: query.queryAst.intent,
    title: story.title,
    lead: story.lead,
    language: story.language,
    sourceType: story.sourceType,
    outlets,
  });
}

/** How many different outlets carry each story (cluster). A cluster nobody else joined is absent. */
export async function countOutletsByCluster(db: Db, clusterIds: readonly string[]): Promise<Map<string, number>> {
  const ids = [...new Set(clusterIds)];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ clusterId: articles.storyClusterId, outlets: sql<number>`count(distinct ${articles.sourceId})::int` })
    .from(articles)
    .where(inArray(articles.storyClusterId, ids))
    .groupBy(articles.storyClusterId);
  return new Map(rows.flatMap((row) => (row.clusterId ? [[row.clusterId, Number(row.outlets)] as const] : [])));
}

export async function countClusterOutlets(db: Db, clusterId: string): Promise<number> {
  return (await countOutletsByCluster(db, [clusterId])).get(clusterId) ?? 1;
}

function coveredBy(reasons: Signal["reasons"] | null): number {
  const covered = reasons?.find((reason) => reason.code === "covered");
  return covered?.code === "covered" ? covered.n : 1;
}

/**
 * A story gained a new outlet: every mention of it that has been scored picks the wider reach up. Cheap
 * (a cluster is a handful of stories) and safe to repeat — the signal is recomputed from the reach, never
 * added to — so it runs whenever a story joins a cluster that already has three or more outlets.
 */
export async function applyCoverageToCluster(db: Db, clusterId: string): Promise<number> {
  const outlets = await countClusterOutlets(db, clusterId);
  if (outlets < 3) return 0;
  const rows = await db
    .select({ id: mentions.id, priority: mentions.priority, score: mentions.signalScore, reasons: mentions.signalReasons })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .where(and(eq(articles.storyClusterId, clusterId), isNotNull(mentions.signalReasons)));
  let changed = 0;
  for (const row of rows) {
    if (coveredBy(row.reasons) === outlets) continue;
    const next = applyCoverage(
      { score: row.score ?? 0, level: row.priority as SignalLevel, reasons: row.reasons ?? [] },
      outlets,
    );
    await db
      .update(mentions)
      .set({ priority: next.level, signalScore: next.score, signalReasons: next.reasons })
      .where(eq(mentions.id, row.id));
    changed += 1;
  }
  return changed;
}

/** Forget what was scored for a monitoring (its keywords or intent changed); the scoring job redoes it. */
export async function clearSignalsForQuery(db: Db, organizationId: OrganizationId, queryId: string): Promise<void> {
  await db
    .update(mentions)
    .set({ signalScore: null, signalReasons: null })
    .where(and(eq(mentions.organizationId, organizationId), eq(mentions.queryId, queryId)));
}

const SCORE_CHUNK = 25;

/**
 * Scores mentions that have no signal yet, newest first: the ones saved before signals existed and the
 * ones of a monitoring that was just edited. Bounded by `limit` so a maintenance run stays short; call it
 * again for more. Returns how many it scored (0 = nothing left).
 *
 * Cross-tenant on purpose when `queryId` is not given — it is a system job, like the ingestion pipeline
 * (ADR-001) — and it only ever writes the derived signal fields of a mention.
 */
export async function scoreUnscoredMentions(db: Db, options: { queryId?: string; limit?: number } = {}): Promise<number> {
  const limit = options.limit ?? 500;
  const rows = await db
    .select({
      id: mentions.id,
      title: articles.title,
      lead: articles.storedExcerpt,
      language: articles.language,
      sourceType: sources.type,
      clusterId: articles.storyClusterId,
      queryAst: monitoringQueries.queryAst,
      trackingTarget: monitoringQueries.trackingTarget,
    })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .innerJoin(monitoringQueries, eq(monitoringQueries.id, mentions.queryId))
    .where(and(isNull(mentions.signalReasons), options.queryId ? eq(mentions.queryId, options.queryId) : undefined))
    .orderBy(desc(mentions.createdAt))
    .limit(limit);
  if (rows.length === 0) return 0;

  const outlets = await countOutletsByCluster(db, rows.flatMap((row) => (row.clusterId ? [row.clusterId] : [])));
  for (let i = 0; i < rows.length; i += SCORE_CHUNK) {
    await Promise.all(
      rows.slice(i, i + SCORE_CHUNK).map((row) => {
        const signal = signalFor(row, row, row.clusterId ? (outlets.get(row.clusterId) ?? 1) : 1);
        return db
          .update(mentions)
          .set({ priority: signal.level, signalScore: signal.score, signalReasons: signal.reasons })
          .where(eq(mentions.id, row.id));
      }),
    );
  }
  return rows.length;
}
