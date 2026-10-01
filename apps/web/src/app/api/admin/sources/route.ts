import { NextResponse } from "next/server";
import { createSourceSchema } from "@cim/validation";
import { checkSourcePolicy, createSource, db } from "@cim/db";
import { testSourceUrl } from "@/lib/source-test";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeAdmin } from "../auth";

const POLICY_MESSAGES = {
  blocked: "This publisher asked not to be crawled and is blocked.",
  license_required:
    "This is a news agency that licenses its content commercially. Add it only if Mediaory holds a written licence from them.",
} as const;

/**
 * Adds a crawl source. The feed is fetched and parsed first and nothing is
 * stored unless it yields items, so the sources list only ever contains
 * feeds that were readable when they were added.
 */
export async function POST(request: Request) {
  const auth = await authorizeAdmin();
  if (auth.response) return auth.response;

  const limit = await checkRateLimit(`admin-source-create:${auth.user.id}`, {
    limit: 60,
    windowSeconds: 60 * 10,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const parsed = createSourceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid source." },
      { status: 400 },
    );
  }

  // Never contact a publisher we must not crawl (blocked, or an unlicensed agency).
  const policyFailure = await checkSourcePolicy(db, parsed.data.url, parsed.data.licenseConfirmed);
  if (policyFailure && policyFailure !== "invalid_url") {
    return NextResponse.json(
      { error: POLICY_MESSAGES[policyFailure], code: policyFailure },
      { status: policyFailure === "blocked" ? 409 : 422 },
    );
  }

  const test = await testSourceUrl(parsed.data.url, parsed.data.connector);
  if (!test.ok) {
    return NextResponse.json({ error: test.message }, { status: 422 });
  }

  const result = await createSource(db, parsed.data);
  if (!result.ok) {
    const failures = {
      duplicate: { status: 409, error: "This address is already a source." },
      invalid_url: { status: 400, error: "Invalid address." },
      blocked: { status: 409, error: POLICY_MESSAGES.blocked },
      license_required: { status: 422, error: POLICY_MESSAGES.license_required },
    } as const;
    const failure = failures[result.reason];
    return NextResponse.json({ error: failure.error, code: result.reason }, { status: failure.status });
  }
  return NextResponse.json({ ok: true, id: result.id, itemCount: test.itemCount }, { status: 201 });
}
