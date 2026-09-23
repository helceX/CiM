import {
  captureFeatureUsageSnapshot,
  db,
  listActiveOrganizationsForUsageCapture,
} from "@cim/db";

/**
 * docs/architecture/DATA_MODEL.md "Subscription / FeatureUsage ...
 * populated from day one even though billing enforcement is a later
 * phase, so usage history isn't lost waiting for billing to ship" +
 * FEATURE_MATRIX.md "Billing: Usage counters only" (MVP). Scheduled once
 * daily (apps/worker/src/index.ts), the same cross-tenant fan-out shape
 * as the digest/scheduled-reports/retention jobs — one pass across every
 * organization, capturing a fresh snapshot rather than trusting any
 * incrementally-maintained counter.
 */
export async function processCaptureFeatureUsageJob(): Promise<void> {
  const orgs = await listActiveOrganizationsForUsageCapture(db);
  for (const { organizationId } of orgs) {
    // Isolated per org (the established fan-out pattern, generate-insight.ts)
    // — this job runs once daily with attempts:1, so one org's failure
    // must not silently skip every org ordered after it until tomorrow.
    try {
      await captureFeatureUsageSnapshot(db, organizationId);
    } catch (error) {
      console.error(`[worker] capture_feature_usage failed for org ${organizationId}:`, error);
    }
  }
}
