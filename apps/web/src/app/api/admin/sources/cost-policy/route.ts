import { NextResponse } from "next/server";
import { applyTurkeyStartupCrawlPolicy, db } from "@cim/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeAdmin } from "../../auth";

export async function POST() {
  const auth = await authorizeAdmin();
  if (auth.response) return auth.response;
  const limited = await checkRateLimit(`admin-source-cost:${auth.user.id}`, {
    limit: 3,
    windowSeconds: 60,
  });
  if (!limited.allowed)
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  return NextResponse.json({ ok: true, ...(await applyTurkeyStartupCrawlPolicy(db)) });
}
