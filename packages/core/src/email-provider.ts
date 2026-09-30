import type { Env } from "@cim/config";

/**
 * ADR-003-style abstraction applied to email delivery (brief §121):
 * both apps/web (enqueues) and apps/worker (delivers) depend on this
 * pure function so there is exactly one place that knows how to talk to
 * a real provider — callers never touch a vendor SDK directly.
 */
export async function deliverEmailViaProvider(
  env: Pick<Env, "EMAIL_PROVIDER" | "EMAIL_FROM" | "EMAIL_API_KEY">,
  message: { toEmail: string; subject: string; bodyText: string },
): Promise<void> {
  if (env.EMAIL_PROVIDER === "console") {
    console.log(
      `[email] from=${env.EMAIL_FROM} to=${message.toEmail} subject="${message.subject}"`,
    );
    console.log(message.bodyText);
    return;
  }
  if (env.EMAIL_PROVIDER === "resend") {
    await deliverViaResend(env, message);
    return;
  }
  // ses is reserved, not yet implemented — same "not configured" failure
  // shape AI_PROVIDER=openai uses (packages/config) until it is.
  throw new Error(`Email provider "${env.EMAIL_PROVIDER}" is not yet implemented`);
}

async function deliverViaResend(
  env: Pick<Env, "EMAIL_FROM" | "EMAIL_API_KEY">,
  message: { toEmail: string; subject: string; bodyText: string },
): Promise<void> {
  if (!env.EMAIL_API_KEY) {
    throw new Error('EMAIL_API_KEY is required when EMAIL_PROVIDER="resend"');
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.EMAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [message.toEmail],
      subject: message.subject,
      text: message.bodyText,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend API request failed (${response.status}): ${body}`);
  }
}
