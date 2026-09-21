import type { Env } from "@cim/config";

/**
 * ADR-003-style abstraction applied to email delivery (brief §121):
 * both apps/web (enqueues) and apps/worker (delivers) depend on this
 * pure function so there is exactly one place that knows how to talk to
 * a real provider — callers never touch a vendor SDK directly.
 */
export async function deliverEmailViaProvider(
  env: Pick<Env, "EMAIL_PROVIDER" | "EMAIL_FROM">,
  message: { toEmail: string; subject: string; bodyText: string },
): Promise<void> {
  if (env.EMAIL_PROVIDER === "console") {
    console.log(`[email] from=${env.EMAIL_FROM} to=${message.toEmail} subject="${message.subject}"`);
    console.log(message.bodyText);
    return;
  }
  // Real providers (resend/ses) plug in here in a later phase.
  throw new Error(`Email provider "${env.EMAIL_PROVIDER}" is not yet implemented`);
}
