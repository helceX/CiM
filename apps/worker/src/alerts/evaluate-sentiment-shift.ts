import type { Queue } from "bullmq";
import type { SendEmailJobData } from "@cim/core";
import {
  db,
  getActiveSentimentShiftAlertRules,
  getQuerySentimentShiftStats,
} from "@cim/db";
import { fireAlert } from "./notify";

const MIN_CLASSIFIED_COUNT = 3; // never alert off 1-2 AI-classified mentions
const SHIFT_THRESHOLD = 0.3; // 30 percentage points of negative share, over baseline

/**
 * docs/product/FEATURE_MATRIX.md P2 "Sentiment shift" alert — the same
 * transparent-baseline principle as evaluateSpikeAlerts, applied to the
 * share of classified mentions that are negative (brief §72). Runs on
 * the scheduler tick (apps/worker/src/index.ts), not inline after a
 * crawl, since sentiment only settles once AI enrichment has run.
 */
export async function evaluateSentimentShiftAlerts(
  emailQueue: Queue<SendEmailJobData>,
): Promise<void> {
  const rules = await getActiveSentimentShiftAlertRules(db);

  for (const rule of rules) {
    const stats = await getQuerySentimentShiftStats(db, rule.queryId);
    if (stats.currentClassifiedCount < MIN_CLASSIFIED_COUNT) continue;

    const shift = stats.currentNegativeShare - stats.baselineNegativeShare;
    if (shift < SHIFT_THRESHOLD) continue;

    const baselineComparison =
      stats.baselineClassifiedCount > 0
        ? `vs. ~${Math.round(stats.baselineNegativeShare * 100)}% over the trailing week`
        : `with no classified baseline over the trailing week`;

    // Same per-rule isolation as generate-insight.ts's cross-tenant
    // fan-out — this loop spans every organization's active rules in
    // one tick, so one rule's failure must not skip every other
    // organization's rule still left in this tick.
    try {
      await fireAlert(emailQueue, rule, {
        triggerSummary:
          `Negative sentiment for "${rule.name}" is up to ${Math.round(stats.currentNegativeShare * 100)}% ` +
          `of the last 24 hours' classified mentions, ${baselineComparison}.`,
        mentionIds: [],
      });
    } catch (error) {
      console.error(
        `[worker] fireAlert failed for sentiment-shift rule ${rule.id} ("${rule.name}"):`,
        error,
      );
    }
  }
}
