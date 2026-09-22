/**
 * docs/product/FEATURE_MATRIX.md P3 "Billing: Plan enforcement" —
 * packages/db/src/schema/billing.ts's own comment: "plan is a label
 * only — nothing in this codebase reads it to gate a feature yet."
 * This is the first (and, for now, only) limit actually enforced: the
 * Free tier's monitoring-query cap, because it's the one plan limit
 * with a real, already-published number — apps/web's pricing page
 * states "1 monitoring query" for Free. Every other plan's feature
 * list is qualitative ("Multiple projects", "Advanced alerts", "Custom
 * limits") with no fixed number to enforce without inventing one.
 */
export const PLAN_MONITORING_QUERY_LIMITS: Record<string, number | null> = {
  free: 1,
  starter: null,
  pro: null,
  enterprise: null,
};

/**
 * `null` means unlimited. Only "free" is ever actually capped, so an
 * unrecognized plan string falls into the same unlimited bucket every
 * other known plan already does — never mistaken for the one plan this
 * enforces a cap for.
 */
export function getMonitoringQueryLimit(plan: string): number | null {
  return PLAN_MONITORING_QUERY_LIMITS[plan] ?? null;
}
