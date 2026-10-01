import { NextResponse } from "next/server";
import { takedownRequestSchema } from "@cim/validation";
import { createTakedownRequest, db, listPlatformAdminEmails } from "@cim/db";
import { getEnv } from "@cim/config";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { rejectIfNotHuman } from "@/lib/turnstile";

/**
 * Public: a publisher asks to be removed. No account needed. Rate limited per
 * IP, behind the human check when Turnstile is on, and answered with the same
 * "received" response regardless of what they typed. Platform admins get an
 * e-mail; the request itself waits in /admin/takedowns.
 */
export async function POST(request: Request) {
  const ip = clientIpFrom(request);
  const limit = await checkRateLimit(`takedown:${ip}`, { limit: 5, windowSeconds: 60 * 60 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const notHuman = await rejectIfNotHuman(json, ip);
  if (notHuman) return notHuman;

  const parsed = takedownRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const { confirmAuthority: _confirmed, ...input } = parsed.data;
  void _confirmed;
  await createTakedownRequest(db, input);

  // Best effort: the request is already stored, so a mail failure must not fail it.
  try {
    const link = `${getEnv().APP_URL}/admin/takedowns`;
    const body = [
      "A publisher asked to be removed from Mediaory.",
      "",
      `From: ${input.requesterName} <${input.requesterEmail}>`,
      `Publisher: ${input.publisher}`,
      `Pages / site: ${input.targets}`,
      "",
      `Review it here: ${link}`,
    ].join("\n");
    for (const to of await listPlatformAdminEmails(db)) {
      await sendEmail({ toEmail: to, subject: "Takedown request received", bodyText: body, kind: "takedown_notice" });
    }
  } catch (error) {
    console.error("[takedown] could not notify admins:", error);
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
