import type { Queue } from "bullmq";
import type { SendEmailJobData } from "@cim/core";
import { db, getActiveEmergingTopicAlertRules, getEmergingTopicStats } from "@cim/db";
import { fireAlert } from "./notify";

const MIN_ABSOLUTE_COUNT = 3; // never alert off 1-2 mentions, same floor as spike/sentiment-shift
const BASELINE_MULTIPLIER = 3; // "3x baseline" floor, same explainable formula as evaluateSpikeAlerts

/**
 * docs/product/FEATURE_MATRIX.md P2 "Emerging topic" alert — the same
 * transparent-baseline principle as evaluateSpikeAlerts/
 * evaluateSentimentShiftAlerts (brief §72), applied per AI-derived topic
 * rather than per query. Runs on the scheduler tick (apps/worker/src/
 * index.ts), since topics only exist once AI enrichment has classified a
 * mention. getEmergingTopicStats returns every topic seen on the rule's
 * query in the last 24 hours, already sorted by current count — a rule
 * fires at most once per tick, on its single most significant emerging
 * topic (per-rule cooldown, not per-topic, is the same fatigue control
 * every other scheduler-tick alert type uses).
 */
export async function evaluateEmergingTopicAlerts(
  emailQueue: Queue<SendEmailJobData>,
): Promise<void> {
  const rules = await getActiveEmergingTopicAlertRules(db);

  for (const rule of rules) {
    const stats = await getEmergingTopicStats(db, rule.queryId);

    const emerging = stats.find(
      (stat) =>
        stat.currentCount >= MIN_ABSOLUTE_COUNT &&
        stat.currentCount > stat.baselineAvgPerDay * BASELINE_MULTIPLIER,
    );
    if (!emerging) continue;

    const comparison =
      emerging.baselineAvgPerDay > 0
        ? `~${emerging.baselineAvgPerDay.toFixed(1)}/day over the trailing week`
        : `no mentions of it over the trailing week`;

    // Same per-rule isolation as generate-insight.ts's cross-tenant
    // fan-out — this loop spans every organization's active rules in
    // one tick, so one rule's failure must not skip every other
    // organization's rule still left in this tick.
    try {
      await fireAlert(emailQueue, rule, {
        triggerSummary:
          `Emerging topic for "${rule.name}": "${emerging.topicName}" is up to ` +
          `${emerging.currentCount} mention${emerging.currentCount === 1 ? "" : "s"} ` +
          `in the last 24 hours, vs ${comparison}.`,
        mentionIds: [],
      });
    } catch (error) {
      console.error(
        `[worker] fireAlert failed for emerging-topic rule ${rule.id} ("${rule.name}"):`,
        error,
      );
    }
  }
}
