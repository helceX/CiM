import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { dataRetentionPolicies } from "../schema/retention";
import type { OrganizationId } from "./tenant-scope";

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
