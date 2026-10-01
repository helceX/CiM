import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeAdmin } from "../../auth";

/**
 * Queues a test email to the signed-in admin's own address through the real
 * path (outbox -> queue -> worker -> provider), so /admin/email then shows
 * whether the worker actually delivered it. Never takes a recipient from the
 * request: it can only ever mail the admin themself.
 */
export async function POST() {
  const auth = await authorizeAdmin();
  if (auth.response) return auth.response;
  const { user } = auth;

  const limit = await checkRateLimit(`admin-test-email:${user.id}`, { limit: 10, windowSeconds: 60 * 60 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many test emails. Try again later." }, { status: 429 });
  }

  await sendEmail({
    toEmail: user.email,
    subject: "Mediaory test email",
    bodyText: "If you can read this, Mediaory can deliver email. You can ignore this message.",
    kind: "admin_test",
  });
  return NextResponse.json({ ok: true, to: user.email });
}
