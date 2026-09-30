import {
  db,
  deleteExpiredMentions,
  getOrganizationsWithRetentionPolicy,
} from "@cim/db";

/**
 * docs/architecture/SECURITY.md "DataRetentionPolicy ... drives a cleanup
 * job — not a manual process" + docs/product/FEATURE_MATRIX.md P2
 * "Enforcement worker" (the policy field itself has been configurable
 * since Phase 14). Scheduled once daily (apps/worker/src/index.ts), the
 * same cross-tenant fan-out shape as the digest and scheduled-reports
 * jobs — one pass across every organization that has actually configured
 * a retention window (getOrganizationsWithRetentionPolicy already
 * excludes keep-forever orgs and soft-deleted ones).
 */
export async function processEnforceRetentionJob(): Promise<void> {
  const policies = await getOrganizationsWithRetentionPolicy(db);

  for (const { organizationId, mentionRetentionDays } of policies) {
    // Isolated per org (the established fan-out pattern, generate-insight.ts)
    // — this job runs once daily with attempts:1, so one org's failure
    // must not silently skip every org ordered after it until tomorrow.
    try {
      const deletedCount = await deleteExpiredMentions(
        db,
        organizationId,
        mentionRetentionDays,
      );
      if (deletedCount > 0) {
        console.log(
          `[enforce-retention] org ${organizationId}: deleted ${deletedCount} mention(s) past its ${mentionRetentionDays}-day retention window`,
        );
      }
    } catch (error) {
      console.error(`[worker] enforce_retention failed for org ${organizationId}:`, error);
    }
  }
}
