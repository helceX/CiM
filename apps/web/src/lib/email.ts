import "server-only";
import { Queue } from "bullmq";
import { QUEUE_NAMES, type SendEmailJobData } from "@cim/core";
import { db, enqueueEmail } from "@cim/db";
import { getRedis } from "./redis";

export type EmailKind = "verify_email" | "password_reset" | "invitation";

let sendEmailQueue: Queue<SendEmailJobData> | undefined;

function getSendEmailQueue(): Queue<SendEmailJobData> {
  if (!sendEmailQueue) {
    sendEmailQueue = new Queue<SendEmailJobData>(QUEUE_NAMES.sendEmail, {
      connection: getRedis(),
    });
  }
  return sendEmailQueue;
}

/**
 * brief §34/§128: delivery is queued work, not inline in a request. The
 * outbox row is written synchronously (so a verification/reset link
 * exists immediately — see apps/worker for why that matters for tests),
 * then a job is enqueued for apps/worker to actually dispatch it via the
 * configured provider (packages/core/email-provider.ts).
 */
export async function sendEmail(input: {
  toEmail: string;
  subject: string;
  bodyText: string;
  kind: EmailKind;
}): Promise<void> {
  const outboxEntry = await enqueueEmail(db, input);
  await getSendEmailQueue().add(
    QUEUE_NAMES.sendEmail,
    { emailOutboxId: outboxEntry.id },
    { attempts: 5, backoff: { type: "exponential", delay: 2000 } },
  );
}

export function verificationEmailBody(link: string): string {
  return [
    "Welcome to CiM.",
    "",
    "Confirm your email address to activate your account:",
    link,
    "",
    "This link expires in 24 hours. If you didn't create this account, you can ignore this email.",
  ].join("\n");
}

export function passwordResetEmailBody(link: string): string {
  return [
    "A password reset was requested for your CiM account.",
    "",
    "Reset your password:",
    link,
    "",
    "This link expires in 1 hour. If you didn't request this, you can ignore this email.",
  ].join("\n");
}

export function invitationEmailBody(
  organizationName: string,
  inviterName: string,
  link: string,
): string {
  return [
    `${inviterName} invited you to join ${organizationName} on CiM.`,
    "",
    "Accept the invitation and set up your account:",
    link,
    "",
    "This link expires in 7 days. If you weren't expecting this, you can ignore this email.",
  ].join("\n");
}
