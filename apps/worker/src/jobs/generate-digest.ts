import type { Queue } from "bullmq";
import { getEnv } from "@cim/config";
import type { SendEmailJobData } from "@cim/core";
import {
  db,
  getDigestSummaryForOrganization,
  listActiveMemberEmails,
  listActiveOrganizationIdsForDigest,
  type DigestOrgSummary,
} from "@cim/db";
import { queueOutboxEmail } from "../email";

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
    // Isolated per org (the established fan-out pattern, generate-insight.ts)
    // — this job runs once daily with attempts:1, so one org's failure
    // must not silently skip every org ordered after it until tomorrow.
    try {
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
        // Isolated per recipient too (queueOutboxEmail's own doc comment)
        // — a failure enqueueing one recipient's email must not throw out
        // of this loop, which would both skip every recipient ordered
        // after them in this org and be caught by the outer per-org catch
        // below, losing that org's isolation guarantee along with it.
        await queueOutboxEmail(
          emailQueue,
          { toEmail, subject, bodyText, kind: "digest" },
          `digest for org ${organizationId}`,
        );
      }
    } catch (error) {
      console.error(`[worker] generate_digest failed for org ${organizationId}:`, error);
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
