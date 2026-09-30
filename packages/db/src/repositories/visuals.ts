import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { fillTimeBuckets, type VisualDimension, type VisualMeasure, type VisualRow } from "@cim/core";
import { visualSpecSchema, type VisualSpec } from "@cim/validation";
import type { Db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { brandGroups, monitoringQueries } from "../schema/monitoring";
import { savedVisuals } from "../schema/visuals";
import type { OrganizationId } from "./tenant-scope";

/** A single query may not run longer than this; the visual is reported as failed instead. */
export const VISUAL_STATEMENT_TIMEOUT_MS = 5000;

/*
 * The compiler. A VisualSpec is a closed vocabulary, so every SQL fragment
 * below comes from one of these lookup tables — user input only ever reaches
 * the query as a bound parameter (periodDays, ids, filter values). The
 * tenant is passed in by the caller, never read from the spec, and is
 * applied unconditionally.
 */

const DIMENSION_LABEL: Record<VisualDimension, SQL> = {
  day: sql`to_char(date_trunc('day', ${mentions.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
  week: sql`to_char(date_trunc('week', ${mentions.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
  source: sql`${sources.name}`,
  source_type: sql`${sources.type}`,
  sentiment: sql`coalesce(${mentions.sentiment}, 'unclassified')`,
  brand_group: sql`coalesce(${brandGroups.name}, 'No group')`,
  query: sql`${monitoringQueries.name}`,
};

const MEASURE_VALUE: Record<VisualMeasure, SQL> = {
  mentions: sql`count(${mentions.id})::float8`,
  unique_sources: sql`count(distinct ${articles.sourceId})::float8`,
  high_priority: sql`(count(${mentions.id}) filter (where ${mentions.priority} in ('high', 'critical')))::float8`,
  // Share of *classified* mentions that are negative; null when none are classified.
  negative_share: sql`round(
    100.0 * (count(${mentions.id}) filter (where ${mentions.sentiment} = 'negative'))
    / nullif(count(${mentions.id}) filter (where ${mentions.sentiment} is not null), 0),
    1
  )::float8`,
};

export function compileVisualQuery(organizationId: OrganizationId, spec: VisualSpec): SQL {
  const { filters } = spec;
  const conditions: (SQL | undefined)[] = [
    eq(mentions.organizationId, organizationId),
    sql`${mentions.createdAt} >= now() - make_interval(days => ${spec.periodDays})`,
    filters.projectId ? eq(mentions.projectId, filters.projectId) : undefined,
    filters.sentiments?.length ? inArray(mentions.sentiment, filters.sentiments) : undefined,
    filters.sourceTypes?.length ? inArray(sources.type, filters.sourceTypes) : undefined,
    filters.brandGroupIds?.length ? inArray(monitoringQueries.brandGroupId, filters.brandGroupIds) : undefined,
    filters.queryIds?.length ? inArray(mentions.queryId, filters.queryIds) : undefined,
  ];

  const label = DIMENSION_LABEL[spec.dimension];
  const value = MEASURE_VALUE[spec.measure];
  // Time series read left to right; everything else follows the requested sort.
  const order =
    spec.dimension === "day" || spec.dimension === "week" || spec.sort === "label_asc"
      ? sql`label asc`
      : spec.sort === "value_asc"
        ? sql`value asc nulls last, label asc`
        : sql`value desc nulls last, label asc`;

  return sql`
    select ${label} as label, ${value} as value
    from ${mentions}
    join ${articles} on ${articles.id} = ${mentions.articleId}
    join ${sources} on ${sources.id} = ${articles.sourceId}
    join ${monitoringQueries} on ${monitoringQueries.id} = ${mentions.queryId}
    left join ${brandGroups} on ${brandGroups.id} = ${monitoringQueries.brandGroupId}
    where ${and(...conditions)}
    group by 1
    order by ${order}
    limit ${spec.limit}
  `;
}

export type VisualResult = { rows: VisualRow[]; truncated: boolean };

/**
 * Runs a spec for one organization. The spec is re-validated here (a stored
 * spec is data, not trusted code), the statement runs under a timeout, and
 * time series are zero-filled so a quiet day is a 0, not a hole.
 */
export async function runVisual(db: Db, organizationId: OrganizationId, rawSpec: unknown): Promise<VisualResult> {
  const spec = visualSpecSchema.parse(rawSpec);
  const query = compileVisualQuery(organizationId, spec);
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = ${sql.raw(String(VISUAL_STATEMENT_TIMEOUT_MS))}`);
    return tx.execute<{ label: string; value: number | null }>(query);
  });
  const rows: VisualRow[] = result.rows.map((row) => ({
    label: String(row.label),
    value: row.value === null ? null : Number(row.value),
  }));
  return { rows: fillTimeBuckets(rows, spec), truncated: rows.length >= spec.limit };
}

export async function createSavedVisual(
  db: Db,
  organizationId: OrganizationId,
  input: { name: string; kind: "chart" | "table"; spec: VisualSpec; createdBy: string | null },
) {
  const [visual] = await db
    .insert(savedVisuals)
    .values({
      organizationId,
      projectId: input.spec.filters.projectId ?? null,
      createdBy: input.createdBy,
      name: input.name,
      kind: input.kind,
      spec: input.spec,
    })
    .returning();
  if (!visual) throw new Error("Failed to save visual");
  return visual;
}

export async function listSavedVisuals(db: Db, organizationId: OrganizationId) {
  return db
    .select()
    .from(savedVisuals)
    .where(and(eq(savedVisuals.organizationId, organizationId), isNull(savedVisuals.deletedAt)))
    .orderBy(desc(savedVisuals.createdAt));
}

export async function getSavedVisual(db: Db, organizationId: OrganizationId, id: string) {
  const [visual] = await db
    .select()
    .from(savedVisuals)
    .where(
      and(eq(savedVisuals.organizationId, organizationId), eq(savedVisuals.id, id), isNull(savedVisuals.deletedAt)),
    )
    .limit(1);
  return visual;
}

export async function updateSavedVisual(
  db: Db,
  organizationId: OrganizationId,
  id: string,
  patch: { name?: string; kind?: "chart" | "table"; spec?: VisualSpec },
) {
  const [visual] = await db
    .update(savedVisuals)
    .set({
      ...patch,
      ...(patch.spec ? { projectId: patch.spec.filters.projectId ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(savedVisuals.organizationId, organizationId), eq(savedVisuals.id, id), isNull(savedVisuals.deletedAt)),
    )
    .returning();
  return visual;
}

export async function deleteSavedVisual(db: Db, organizationId: OrganizationId, id: string) {
  const [visual] = await db
    .update(savedVisuals)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(savedVisuals.organizationId, organizationId), eq(savedVisuals.id, id), isNull(savedVisuals.deletedAt)),
    )
    .returning({ id: savedVisuals.id });
  return visual !== undefined;
}
