import type { Job } from "bullmq";
import { getEnv } from "@cim/config";
import { deliverEmailViaProvider, type SendEmailJobData } from "@cim/core";
import { db, getEmailById, markEmailSent } from "@cim/db";

/**
 * docs/architecture/INGESTION.md job system — status/attempts/error are
 * BullMQ's own job bookkeeping (visible via job.attemptsMade etc.);
 * exhausted retries land in BullMQ's failed-job set, which is the
 * dead-letter surface Admin reads from in a later phase.
 */
export async function processSendEmailJob(job: Job<SendEmailJobData>): Promise<void> {
  const email = await getEmailById(db, job.data.emailOutboxId);
  if (!email) {
    throw new Error(`email_outbox row not found: ${job.data.emailOutboxId}`);
  }
  if (email.sentAt) return; // already delivered (safe to re-run)

  await deliverEmailViaProvider(getEnv(), {
    toEmail: email.toEmail,
    subject: email.subject,
    bodyText: email.bodyText,
  });
  await markEmailSent(db, email.id);
}
