import type { Queue } from "bullmq";
import type { SendEmailJobData } from "@cim/core";
import { db, getActiveSpikeAlertRules, getQuerySpikeStats } from "@cim/db";
import { fireAlert } from "./notify";

const MIN_ABSOLUTE_COUNT = 3; // never alert on 1-2 mentions regardless of baseline
const STDDEV_MULTIPLIER = 3; // ~3-sigma, transparent and explainable

/**
 * docs/architecture/ANOMALY_DETECTION principle (brief §72) — a
 * transparent statistical baseline, not an opaque model. Runs on the
 * scheduler tick (apps/worker/src/index.ts), the spike counterpart to
 * evaluateNewMentionAlerts (which runs inline after each crawl).
 */
export async function evaluateSpikeAlerts(emailQueue: Queue<SendEmailJobData>): Promise<void> {
  const rules = await getActiveSpikeAlertRules(db);

  for (const rule of rules) {
    const stats = await getQuerySpikeStats(db, rule.queryId);
    if (stats.currentHourCount < MIN_ABSOLUTE_COUNT) continue;

    const threshold = Math.max(
      stats.baselineAvg + STDDEV_MULTIPLIER * stats.baselineStdDev,
      stats.baselineAvg * 3,
    );
    if (stats.currentHourCount <= threshold) continue;

    const multiplier = stats.baselineAvg > 0 ? stats.currentHourCount / stats.baselineAvg : null;
    const comparison =
      multiplier !== null
        ? `${multiplier.toFixed(1)}x the trailing 24-hour baseline (~${stats.baselineAvg.toFixed(1)}/hr)`
        : `a baseline of ~0/hr over the trailing 24 hours`;

    await fireAlert(emailQueue, rule, {
      triggerSummary: `Mention volume for "${rule.name}" spiked to ${stats.currentHourCount} in the last hour — ${comparison}.`,
      mentionIds: [],
    });
  }
}
