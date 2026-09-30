import { Badge } from "@cim/ui";

/**
 * Shared current-vs-previous-period indicator — first used by Analytics'
 * topic breakdown, reused by the Social Listening dashboard's trending
 * hashtags (both follow the same transparent baseline convention as
 * packages/db/src/repositories/analytics.ts's getTopicBreakdown).
 */
export function ChangeBadge({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  if (previous === 0) {
    return current > 0 ? <Badge tone="info">New</Badge> : null;
  }
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return <Badge tone="neutral">No change</Badge>;
  return (
    <Badge tone={change > 0 ? "success" : "danger"}>
      {change > 0 ? "+" : ""}
      {change}%
    </Badge>
  );
}
