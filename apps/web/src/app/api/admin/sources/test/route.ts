import { NextResponse } from "next/server";
import { testSourceSchema } from "@cim/validation";
import { checkSourcePolicy, db } from "@cim/db";
import { testSourceUrl } from "@/lib/source-test";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeAdmin } from "../../auth";

/** Dry run: fetch + parse a candidate source without saving anything. */
export async function POST(request: Request) {
  const auth = await authorizeAdmin();
  if (auth.response) return auth.response;

  const limit = await checkRateLimit(`admin-source-test:${auth.user.id}`, {
    limit: 60,
    windowSeconds: 60 * 10,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many tests. Try again shortly." }, { status: 429 });
  }

  const parsed = testSourceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid https:// address." }, { status: 400 });
  }
  const policyFailure = await checkSourcePolicy(db, parsed.data.url);
  if (policyFailure === "blocked") {
    return NextResponse.json({ ok: false, message: "This publisher asked not to be crawled and is blocked." });
  }
  if (policyFailure === "license_required") {
    return NextResponse.json({
      ok: false,
      message: "News agency content needs a written licence — it is not fetched without one.",
    });
  }
  const result = await testSourceUrl(parsed.data.url, parsed.data.connector);
  return NextResponse.json(result);
}
