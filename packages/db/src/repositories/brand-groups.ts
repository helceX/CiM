import { and, asc, count, eq, gte, isNull, sql } from "drizzle-orm";
import { nextGroupColor, shareOfVoice, type BrandGroupKindValue } from "@cim/core";
import type { Db } from "../client";
import { brandGroups, monitoringQueries } from "../schema/monitoring";
import { mentions } from "../schema/content";
import type { OrganizationId } from "./tenant-scope";

export type BrandGroupSummary = {
  id: string;
  projectId: string;
  name: string;
  kind: BrandGroupKindValue;
  color: string;
  queryCount: number;
  createdAt: Date;
};

export async function listBrandGroups(
  db: Db,
  organizationId: OrganizationId,
  projectId?: string,
): Promise<BrandGroupSummary[]> {
  const rows = await db
    .select({
      id: brandGroups.id,
      projectId: brandGroups.projectId,
      name: brandGroups.name,
      kind: brandGroups.kind,
      color: brandGroups.color,
      createdAt: brandGroups.createdAt,
      queryCount: count(monitoringQueries.id),
    })
    .from(brandGroups)
    .leftJoin(
      monitoringQueries,
      and(eq(monitoringQueries.brandGroupId, brandGroups.id), isNull(monitoringQueries.deletedAt)),
    )
    .where(
      and(
        eq(brandGroups.organizationId, organizationId),
        isNull(brandGroups.deletedAt),
        projectId ? eq(brandGroups.projectId, projectId) : undefined,
      ),
    )
    .groupBy(brandGroups.id)
    .orderBy(asc(brandGroups.createdAt), asc(brandGroups.id));
  return rows.map((row) => ({ ...row, queryCount: Number(row.queryCount) }));
}

export async function getBrandGroup(db: Db, organizationId: OrganizationId, groupId: string) {
  const [group] = await db
    .select()
    .from(brandGroups)
    .where(
      and(
        eq(brandGroups.organizationId, organizationId),
        eq(brandGroups.id, groupId),
        isNull(brandGroups.deletedAt),
      ),
    )
    .limit(1);
  return group;
}

export type CreateBrandGroupResult =
  | { ok: true; group: typeof brandGroups.$inferSelect }
  | { ok: false; reason: "name_taken" };

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  // drizzle wraps the driver error in `cause`.
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (typeof current === "object" && (current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export async function createBrandGroup(
  db: Db,
  organizationId: OrganizationId,
  input: { projectId: string; name: string; kind: BrandGroupKindValue; color?: string },
): Promise<CreateBrandGroupResult> {
  try {
    const color =
      input.color ??
      nextGroupColor(
        (await listBrandGroups(db, organizationId, input.projectId)).map((group) => group.color),
      );
    const [group] = await db
      .insert(brandGroups)
      .values({
        organizationId,
        projectId: input.projectId,
        name: input.name,
        kind: input.kind,
        color,
      })
      .returning();
    if (!group) throw new Error("Failed to create brand group");
    return { ok: true, group };
  } catch (error) {
    // The unique index (project, lower(name)) among live groups is the
    // source of truth — a pre-check would race with a concurrent create.
    if (isUniqueViolation(error)) return { ok: false, reason: "name_taken" };
    throw error;
  }
}

export type UpdateBrandGroupResult =
  | { ok: true; group: typeof brandGroups.$inferSelect }
  | { ok: false; reason: "not_found" | "name_taken" };

export async function updateBrandGroup(
  db: Db,
  organizationId: OrganizationId,
  groupId: string,
  patch: { name?: string; kind?: BrandGroupKindValue; color?: string },
): Promise<UpdateBrandGroupResult> {
  try {
    const [group] = await db
      .update(brandGroups)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(brandGroups.organizationId, organizationId),
          eq(brandGroups.id, groupId),
          isNull(brandGroups.deletedAt),
        ),
      )
      .returning();
    return group ? { ok: true, group } : { ok: false, reason: "not_found" };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "name_taken" };
    throw error;
  }
}

/**
 * Soft-deletes the group and detaches its queries in one transaction, so
 * a query can never point at a deleted group. The queries themselves are
 * untouched — they simply become ungrouped.
 */
export async function deleteBrandGroup(
  db: Db,
  organizationId: OrganizationId,
  groupId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [group] = await tx
      .update(brandGroups)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(brandGroups.organizationId, organizationId),
          eq(brandGroups.id, groupId),
          isNull(brandGroups.deletedAt),
        ),
      )
      .returning({ id: brandGroups.id });
    if (!group) return false;
    await tx
      .update(monitoringQueries)
      .set({ brandGroupId: null, updatedAt: new Date() })
      .where(
        and(
          eq(monitoringQueries.organizationId, organizationId),
          eq(monitoringQueries.brandGroupId, groupId),
        ),
      );
    return true;
  });
}

export type AssignQueryResult = "ok" | "query_not_found" | "group_not_found" | "project_mismatch";

/** Puts a query in a group (or, with `null`, takes it out). Both must belong to the caller's org and project. */
export async function setQueryBrandGroup(
  db: Db,
  organizationId: OrganizationId,
  queryId: string,
  groupId: string | null,
): Promise<AssignQueryResult> {
  return db.transaction(async (tx) => {
    const [query] = await tx
      .select({ id: monitoringQueries.id, projectId: monitoringQueries.projectId })
      .from(monitoringQueries)
      .where(
        and(
          eq(monitoringQueries.organizationId, organizationId),
          eq(monitoringQueries.id, queryId),
          isNull(monitoringQueries.deletedAt),
        ),
      )
      .limit(1);
    if (!query) return "query_not_found";

    if (groupId !== null) {
      // FOR SHARE so a concurrent deleteBrandGroup can't slip between this
      // check and the update and leave the query pointing at a deleted group.
      const [group] = await tx
        .select({ id: brandGroups.id, projectId: brandGroups.projectId })
        .from(brandGroups)
        .where(
          and(
            eq(brandGroups.organizationId, organizationId),
            eq(brandGroups.id, groupId),
            isNull(brandGroups.deletedAt),
          ),
        )
        .limit(1)
        .for("share");
      if (!group) return "group_not_found";
      if (group.projectId !== query.projectId) return "project_mismatch";
    }

    await tx
      .update(monitoringQueries)
      .set({ brandGroupId: groupId, updatedAt: new Date() })
      .where(
        and(eq(monitoringQueries.organizationId, organizationId), eq(monitoringQueries.id, queryId)),
      );
    return "ok";
  });
}

export type BrandGroupComparisonRow = {
  groupId: string;
  name: string;
  kind: BrandGroupKindValue;
  color: string;
  queryCount: number;
  totalMentions: number;
  positive: number;
  neutral: number;
  negative: number;
  shareOfVoice: number | null;
};

/**
 * Per-group mention volume and sentiment over the last `sinceDays`, with
 * share of voice across the compared groups (each group's mentions ÷ the
 * sum over all compared groups; `null` when nobody was mentioned). Only
 * live groups, and only their live, active queries, are counted. A group
 * with no queries still appears (0 mentions) so an empty side of a
 * comparison is visible rather than silently dropped.
 */
export async function getBrandGroupComparison(
  db: Db,
  organizationId: OrganizationId,
  options: { sinceDays?: number; projectId?: string } = {},
): Promise<BrandGroupComparisonRow[]> {
  const sinceDays = options.sinceDays ?? 7;
  const rows = await db
    .select({
      groupId: brandGroups.id,
      name: brandGroups.name,
      kind: brandGroups.kind,
      color: brandGroups.color,
      queryCount: sql<number>`count(distinct ${monitoringQueries.id})`,
      totalMentions: count(mentions.id),
      positive: sql<number>`count(*) filter (where ${mentions.sentiment} = 'positive')`,
      neutral: sql<number>`count(*) filter (where ${mentions.sentiment} = 'neutral')`,
      negative: sql<number>`count(*) filter (where ${mentions.sentiment} = 'negative')`,
    })
    .from(brandGroups)
    .leftJoin(
      monitoringQueries,
      and(
        eq(monitoringQueries.brandGroupId, brandGroups.id),
        eq(monitoringQueries.status, "active"),
        isNull(monitoringQueries.deletedAt),
      ),
    )
    .leftJoin(
      mentions,
      and(
        eq(mentions.queryId, monitoringQueries.id),
        gte(mentions.createdAt, sql`now() - (${sinceDays}::text || ' days')::interval`),
      ),
    )
    .where(
      and(
        eq(brandGroups.organizationId, organizationId),
        isNull(brandGroups.deletedAt),
        options.projectId ? eq(brandGroups.projectId, options.projectId) : undefined,
      ),
    )
    .groupBy(brandGroups.id)
    .orderBy(asc(brandGroups.createdAt), asc(brandGroups.id));

  return shareOfVoice(
    rows.map((row) => ({
      ...row,
      queryCount: Number(row.queryCount),
      totalMentions: Number(row.totalMentions),
      positive: Number(row.positive),
      neutral: Number(row.neutral),
      negative: Number(row.negative),
    })),
  );
}
