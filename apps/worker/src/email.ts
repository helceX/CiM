import type { Queue } from "bullmq";
import { QUEUE_NAMES, type SendEmailJobData } from "@cim/core";
import { db, enqueueEmail } from "@cim/db";

/**
 * The enqueue-then-queue-the-job pair every per-recipient fan-out
 * (fireAlert, generate-digest, send-executive-brief) needs, with the
 * same "log and move on, never throw" isolation each of those call
 * sites already required individually — a failure enqueueing one
 * recipient's email must never propagate out of the loop it's called
 * from, which would both skip every recipient ordered after it and, in
 * the digest/brief jobs, get caught by the outer per-org catch, losing
 * that org's own isolation guarantee too. Centralized so a future
 * retry/backoff change lands once, not in three places — the exact
 * duplication that let this job's own fan-out isolation lag behind
 * generate-digest.ts's until this sweep caught it.
 */
export async function queueOutboxEmail(
  emailQueue: Queue<SendEmailJobData>,
  input: { toEmail: string; subject: string; bodyText: string; kind: string },
  logContext: string,
): Promise<void> {
  try {
    const outboxEntry = await enqueueEmail(db, input);
    await emailQueue.add(
      QUEUE_NAMES.sendEmail,
      { emailOutboxId: outboxEntry.id },
      { attempts: 5, backoff: { type: "exponential", delay: 2000 } },
    );
  } catch (error) {
    console.error(`[worker] failed to queue ${logContext} email to ${input.toEmail}:`, error);
  }
}
