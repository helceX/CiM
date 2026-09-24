import type { Queue } from "bullmq";
import { getEnv } from "@cim/config";
import type { SendEmailJobData } from "@cim/core";
import {
  db,
  getLatestInsightForOrganization,
  listActiveMemberEmails,
  listActiveOrganizationIdsForDigest,
  type InsightWithEvidenceAndProject,
} from "@cim/db";
import { queueOutboxEmail } from "../email";

const BRIEF_FRESHNESS_HOURS = 24;

/**
 * docs/product/FEATURE_MATRIX.md P2 "AI: executive brief automation" —
 * the "since yesterday" Insight (kind: whats_changed,
 * apps/worker/src/ai/generate-insight.ts) is generated every 2 minutes
 * but was only ever surfaced passively on the dashboard; this delivers
 * it proactively, once daily, the same cross-tenant fan-out shape as
 * processGenerateDigestJob. An org whose latest brief wasn't generated
 * within the last 24h (no mentions to synthesize from in that window)
 * is skipped entirely — repeating yesterday's brief isn't worth an
 * email, the same "nothing to say -> no email" discipline the plain
 * digest already applies. AI_ARCHITECTURE.md Trust Layer — an Insight
 * with zero evidence rows is never rendered, here or on the dashboard.
 */
export async function processSendExecutiveBriefJob(
  emailQueue: Queue<SendEmailJobData>,
): Promise<void> {
  const organizationIds = await listActiveOrganizationIdsForDigest(db);
  const freshSince = new Date(Date.now() - BRIEF_FRESHNESS_HOURS * 60 * 60 * 1000);

  for (const organizationId of organizationIds) {
    // Isolated per org (the established fan-out pattern, generate-insight.ts)
    // — this job runs once daily with attempts:1, so one org's failure
    // must not silently skip every org ordered after it until tomorrow.
    try {
      const brief = await getLatestInsightForOrganization(db, organizationId, "whats_changed");
      if (!brief || brief.createdAt < freshSince || brief.evidence.length === 0) continue;

      const recipients = await listActiveMemberEmails(db, organizationId);
      if (recipients.length === 0) continue;

      const bodyText = renderExecutiveBriefEmailBody(brief);
      const subject = `Executive brief: ${brief.projectName}`;

      for (const toEmail of recipients) {
        // Isolated per recipient too (queueOutboxEmail's own doc comment)
        // — a failure enqueueing one recipient's email must not throw out
        // of this loop, which would both skip every recipient ordered
        // after them in this org and get caught by the outer per-org
        // catch below, losing that org's isolation guarantee along with it.
        await queueOutboxEmail(
          emailQueue,
          { toEmail, subject, bodyText, kind: "executive_brief" },
          `executive brief for org ${organizationId}`,
        );
      }
    } catch (error) {
      console.error(`[worker] send_executive_brief failed for org ${organizationId}:`, error);
    }
  }
}

function renderExecutiveBriefEmailBody(brief: InsightWithEvidenceAndProject): string {
  const lines = [
    `${brief.projectName} — since yesterday:`,
    "",
    brief.summary,
    "",
    "Evidence:",
    ...brief.evidence.map((item) => `- ${item.title} (${item.sourceName})`),
    "",
    `Open dashboard: ${getEnv().APP_URL}/dashboard`,
  ];
  return lines.join("\n");
}
