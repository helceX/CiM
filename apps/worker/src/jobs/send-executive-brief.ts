import type { Queue } from "bullmq";
import { getEnv } from "@cim/config";
import { QUEUE_NAMES, type SendEmailJobData } from "@cim/core";
import {
  db,
  enqueueEmail,
  getLatestInsightForOrganization,
  listActiveMemberEmails,
  listActiveOrganizationIdsForDigest,
  type InsightWithEvidenceAndProject,
} from "@cim/db";

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
    const brief = await getLatestInsightForOrganization(db, organizationId, "whats_changed");
    if (!brief || brief.createdAt < freshSince || brief.evidence.length === 0) continue;

    const recipients = await listActiveMemberEmails(db, organizationId);
    if (recipients.length === 0) continue;

    const bodyText = renderExecutiveBriefEmailBody(brief);
    const subject = `Executive brief: ${brief.projectName}`;

    for (const toEmail of recipients) {
      const outboxEntry = await enqueueEmail(db, {
        toEmail,
        subject,
        bodyText,
        kind: "executive_brief",
      });
      await emailQueue.add(
        QUEUE_NAMES.sendEmail,
        { emailOutboxId: outboxEntry.id },
        { attempts: 5, backoff: { type: "exponential", delay: 2000 } },
      );
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
