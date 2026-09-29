import type { Queue } from "bullmq";
import type { SendEmailJobData } from "@cim/core";
import { db, getActiveCreatorSpikeAlertRules, getCreatorSpikeStats } from "@cim/db";
import { fireAlert } from "./notify";

const MIN_ABSOLUTE_COUNT = 3; // never alert off 1-2 mentions, same floor as spike/emerging-topic
const BASELINE_MULTIPLIER = 3; // "3x baseline" floor, same explainable formula as evaluateSpikeAlerts

/**
 * docs/product/FEATURE_MATRIX_V2.md "Social-specific alert types (creator
 * spike, ...)" — same transparent-baseline principle as
 * evaluateEmergingTopicAlerts, applied per social author instead of per
 * AI topic: is a single creator suddenly driving a disproportionate
 * share of this query's social conversation? getCreatorSpikeStats
 * returns every author who posted about the rule's query in the last 24
 * hours, sorted by current count — a rule fires at most once per tick,
 * on its single most active creator (per-rule cooldown, the same
 * fatigue control every other scheduler-tick alert type uses).
 */
export async function evaluateCreatorSpikeAlerts(emailQueue: Queue<SendEmailJobData>): Promise<void> {
  const rules = await getActiveCreatorSpikeAlertRules(db);

  for (const rule of rules) {
    // Same per-rule isolation as evaluateEmergingTopicAlerts — this loop
    // spans every organization's active rules in one tick, so one rule's
    // failure must not skip every other organization's rule still left
    // in this tick.
    try {
      const stats = await getCreatorSpikeStats(db, rule.queryId);

      const spiking = stats.find(
        (stat) =>
          stat.currentCount >= MIN_ABSOLUTE_COUNT &&
          stat.currentCount > stat.baselineAvgPerDay * BASELINE_MULTIPLIER,
      );
      if (!spiking) continue;

      const comparison =
        spiking.baselineAvgPerDay > 0
          ? `~${spiking.baselineAvgPerDay.toFixed(1)}/day over the trailing week`
          : `no posts from them over the trailing week`;

      await fireAlert(emailQueue, rule, {
        triggerSummary:
          `Creator spike for "${rule.name}": ${spiking.handle} is up to ` +
          `${spiking.currentCount} post${spiking.currentCount === 1 ? "" : "s"} ` +
          `in the last 24 hours, vs ${comparison}.`,
        mentionIds: [],
      });
    } catch (error) {
      console.error(
        `[worker] evaluateCreatorSpikeAlerts failed for rule ${rule.id} ("${rule.name}"):`,
        error,
      );
    }
  }
}
