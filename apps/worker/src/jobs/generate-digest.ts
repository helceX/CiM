import type { Queue } from "bullmq";
import { getEnv } from "@cim/config";
import { QUEUE_NAMES, type SendEmailJobData } from "@cim/core";
import {
  db,
  enqueueEmail,
  getDigestSummaryForOrganization,
  listActiveMemberEmails,
  listActiveOrganizationIdsForDigest,
  type DigestOrgSummary,
} from "@cim/db";

const DIGEST_SINCE_HOURS = 24;
const DIGEST_TOP_LIMIT = 5;

/**
 * docs/product/FEATURE_MATRIX.md "Email daily digest". Scheduled once
 * daily (apps/worker/src/index.ts), the same cross-tenant fan-out shape
 * as the spike-alert check and insight generation — one pass across
 * every still-existing organization (ADR-001's documented exception).
 * An organization with zero new mentions in the window is skipped
 * entirely: a digest that says "nothing happened" isn't worth an email.
 */
export async function processGenerateDigestJob(emailQueue: Queue<SendEmailJobData>): Promise<void> {
  const organizationIds = await listActiveOrganizationIdsForDigest(db);

  for (const organizationId of organizationIds) {
    const summary = await getDigestSummaryForOrganization(
      db,
      organizationId,
      DIGEST_SINCE_HOURS,
      DIGEST_TOP_LIMIT,
    );
    if (summary.totalNewMentions === 0) continue;

    const recipients = await listActiveMemberEmails(db, organizationId);
    if (recipients.length === 0) continue;

    const bodyText = renderDigestEmailBody(summary);
    const subject = `Daily digest: ${summary.totalNewMentions} new mention${summary.totalNewMentions === 1 ? "" : "s"}`;

    for (const toEmail of recipients) {
      const outboxEntry = await enqueueEmail(db, { toEmail, subject, bodyText, kind: "digest" });
      await emailQueue.add(
        QUEUE_NAMES.sendEmail,
        { emailOutboxId: outboxEntry.id },
        { attempts: 5, backoff: { type: "exponential", delay: 2000 } },
      );
    }
  }
}

function renderDigestEmailBody(summary: DigestOrgSummary): string {
  const { positive, neutral, negative, unclassified } = summary.sentimentCounts;
  const lines = [
    `${summary.totalNewMentions} new mention(s) in the last 24 hours.`,
    "",
    `Sentiment: ${positive} positive, ${neutral} neutral, ${negative} negative, ${unclassified} unclassified.`,
    "",
    "Top stories:",
    ...summary.topMentions.map(
      (mention) => `- ${mention.title} (${mention.sourceName}${mention.sentiment ? `, ${mention.sentiment}` : ""})`,
    ),
    "",
    `Open dashboard: ${getEnv().APP_URL}/dashboard`,
  ];
  return lines.join("\n");
}
