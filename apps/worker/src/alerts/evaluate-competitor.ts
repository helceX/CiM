import type { Queue } from "bullmq";
import type { SendEmailJobData } from "@cim/core";
import { db, getActiveCompetitorAlertRules, getCompetitorAlertStats } from "@cim/db";
import { fireAlert } from "./notify";

const MIN_ABSOLUTE_COUNT = 3; // never alert off 1-2 mentions, same floor as spike/sentiment-shift/emerging-topic

/**
 * docs/product/USER_FLOWS.md §4 "competitor" alert — unlike spike (a
 * query against its own history), this compares a competitor-tagged
 * query's volume against your own "company"-tagged queries in the same
 * project (getCompetitorAlertStats). Runs on the scheduler tick
 * (apps/worker/src/index.ts), same cadence as its sibling alert types.
 */
export async function evaluateCompetitorAlerts(
  emailQueue: Queue<SendEmailJobData>,
): Promise<void> {
  const rules = await getActiveCompetitorAlertRules(db);

  for (const rule of rules) {
    const stats = await getCompetitorAlertStats(db, rule.projectId, rule.queryId);
    if (!stats) continue;
    if (stats.competitorCount < MIN_ABSOLUTE_COUNT) continue;
    if (stats.competitorCount <= stats.companyCount) continue;

    // Same per-rule isolation as generate-insight.ts's cross-tenant
    // fan-out — this loop spans every organization's active rules in
    // one tick, so one rule's failure must not skip every other
    // organization's rule still left in this tick.
    try {
      await fireAlert(emailQueue, rule, {
        triggerSummary:
          `Competitor "${stats.competitorQueryName}" had ${stats.competitorCount} mention${stats.competitorCount === 1 ? "" : "s"} ` +
          `in the last 24 hours, vs. ${stats.companyCount} for your tracked company ${stats.companyCount === 1 ? "query" : "queries"} in this project.`,
        mentionIds: [],
      });
    } catch (error) {
      console.error(
        `[worker] fireAlert failed for competitor rule ${rule.id} ("${rule.name}"):`,
        error,
      );
    }
  }
}
