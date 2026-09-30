import { sql } from "drizzle-orm";
import { mentions } from "../schema/content";
import { insights } from "../schema/ai";

/**
 * `mentions.priority` (schema/content.ts: "low | normal | high | critical")
 * is a plain text column — `desc(mentions.priority)` sorts alphabetically
 * ("normal" before "critical"), not by severity. Originally discovered and
 * fixed in digest.ts's "top stories" query; centralized here once a second
 * caller (listMentionsForInsightPeriod) needed the identical fix, so the
 * rank mapping is defined once, not copy-pasted per query.
 */
export function mentionPriorityRank() {
  return sql<number>`case ${mentions.priority}
    when 'critical' then 4 when 'high' then 3 when 'normal' then 2 when 'low' then 1 else 0 end`;
}

/**
 * `insights.priority` (schema/ai.ts: recommendation "low|medium|high",
 * risk "low|medium|high|critical" — the same column reused for both kinds)
 * has the identical plain-text-sort problem as mentions.priority above,
 * affecting the dashboard's recommendation ordering.
 */
export function insightPriorityRank() {
  return sql<number>`case ${insights.priority}
    when 'critical' then 4 when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end`;
}
