import type { Queue } from "bullmq";
import type { SendEmailJobData } from "@cim/core";
import { db, getActiveAlertRulesForQuery } from "@cim/db";
import type { NewMentionRecord } from "@cim/ingestion";
import { fireAlert } from "./notify";

/**
 * Runs right after ingestSource() (docs/architecture/ARCHITECTURE.md —
 * "the alert engine evaluates rules against new mentions"). Grouped by
 * query so a burst of matches from one crawl produces one alert per
 * rule, not one per mention (brief §19–20).
 */
export async function evaluateNewMentionAlerts(
  emailQueue: Queue<SendEmailJobData>,
  newMentions: NewMentionRecord[],
): Promise<void> {
  const byQuery = new Map<string, NewMentionRecord[]>();
  for (const mention of newMentions) {
    const list = byQuery.get(mention.queryId) ?? [];
    list.push(mention);
    byQuery.set(mention.queryId, list);
  }

  for (const [queryId, records] of byQuery) {
    const rules = await getActiveAlertRulesForQuery(db, queryId);
    for (const rule of rules) {
      // Same per-unit isolation as generate-insight.ts's cross-tenant
      // fan-out: one rule's fireAlert failure must not skip every other
      // rule still left in this batch.
      try {
        if (rule.type === "keyword") {
          await fireAlert(emailQueue, rule, {
            triggerSummary: `${records.length} new mention${records.length === 1 ? "" : "s"} matched "${rule.name}"`,
            mentionIds: records.map((r) => r.mentionId),
          });
        } else if (rule.type === "high_relevance") {
          const highPriority = records.filter((r) => r.priority === "high");
          if (highPriority.length === 0) continue;
          await fireAlert(emailQueue, rule, {
            triggerSummary: `${highPriority.length} high-relevance mention${highPriority.length === 1 ? "" : "s"} matched "${rule.name}"`,
            mentionIds: highPriority.map((r) => r.mentionId),
          });
        }
      } catch (error) {
        console.error(`[worker] fireAlert failed for rule ${rule.id} ("${rule.name}"):`, error);
      }
    }
  }
}
