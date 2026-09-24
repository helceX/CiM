import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "../client";
import { mentions } from "../schema/content";
import { organizations } from "../schema/organizations";
import { dataRetentionPolicies } from "../schema/retention";
import { asOrganizationId, type OrganizationId } from "./tenant-scope";

export type RetentionPolicy = {
  mentionRetentionDays: number | null;
};

const KEEP_FOREVER: RetentionPolicy = { mentionRetentionDays: null };

/** No row yet means "keep forever" — the MVP default, never a missing-data error. */
export async function getRetentionPolicy(
  db: Db,
  organizationId: OrganizationId,
): Promise<RetentionPolicy> {
  const [row] = await db
    .select({ mentionRetentionDays: dataRetentionPolicies.mentionRetentionDays })
    .from(dataRetentionPolicies)
    .where(eq(dataRetentionPolicies.organizationId, organizationId))
    .limit(1);
  return row ?? KEEP_FOREVER;
}

export async function upsertRetentionPolicy(
  db: Db,
  organizationId: OrganizationId,
  policy: RetentionPolicy,
): Promise<void> {
  await db
    .insert(dataRetentionPolicies)
    .values({ organizationId, mentionRetentionDays: policy.mentionRetentionDays })
    .onConflictDoUpdate({
      target: dataRetentionPolicies.organizationId,
      set: { mentionRetentionDays: policy.mentionRetentionDays, updatedAt: new Date() },
    });
}

export type OrganizationRetentionPolicy = {
  organizationId: OrganizationId;
  mentionRetentionDays: number;
};

/**
 * docs/architecture/SECURITY.md "DataRetentionPolicy ... drives a cleanup
 * job — not a manual process." The scheduler-tick fan-out target (ADR-001's
 * documented cross-tenant exception, same shape as
 * listActiveOrganizationIdsForDigest): every still-existing organization
 * that has actually configured a policy — a null `mentionRetentionDays`
 * (no row, or a row explicitly reset to null) means keep forever and is
 * excluded here, never treated as "0 days".
 */
export async function getOrganizationsWithRetentionPolicy(
  db: Db,
): Promise<OrganizationRetentionPolicy[]> {
  const rows = await db
    .select({
      organizationId: organizations.id,
      mentionRetentionDays: dataRetentionPolicies.mentionRetentionDays,
    })
    .from(dataRetentionPolicies)
    .innerJoin(
      organizations,
      eq(organizations.id, dataRetentionPolicies.organizationId),
    )
    .where(
      and(
        isNull(organizations.deletedAt),
        isNotNull(dataRetentionPolicies.mentionRetentionDays),
      ),
    );
  return rows.map((row) => ({
    organizationId: asOrganizationId(row.organizationId),
    // isNotNull above guarantees this, but the column type is still nullable.
    mentionRetentionDays: row.mentionRetentionDays as number,
  }));
}

/**
 * Deletes every Mention older than the policy's retention window for one
 * organization, returning how many were removed. The Mention row is the
 * tenant-scoped boundary (DATA_MODEL.md) — its cascading FKs
 * (mention_entities, mention_topics, insight_evidence) clean up alongside
 * it, while the underlying Article/Source stay untouched (global/reference
 * data shared across tenants, ADR-001) since another organization's
 * Mention may still reference the same Article.
 */
export async function deleteExpiredMentions(
  db: Db,
  organizationId: OrganizationId,
  retentionDays: number,
): Promise<number> {
  const cutoff = sql`now() - (${retentionDays}::text || ' days')::interval`;
  const deleted = await db
    .delete(mentions)
    .where(
      and(eq(mentions.organizationId, organizationId), lt(mentions.createdAt, cutoff)),
    )
    .returning({ id: mentions.id });
  return deleted.length;
}
