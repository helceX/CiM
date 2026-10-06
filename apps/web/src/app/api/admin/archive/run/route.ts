import { NextResponse } from "next/server";
import { enqueueWeeklyArchive } from "@/lib/archive";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeAdmin } from "../../auth";

/** Build the last completed week's archive now instead of waiting for the 04:00 UTC schedule. */
export async function POST() {
  const auth = await authorizeAdmin();
  if (auth.response) return auth.response;

  const limited = await checkRateLimit(`admin-archive-run:${auth.user.id}`, { limit: 5, windowSeconds: 60 });
  if (!limited.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  await enqueueWeeklyArchive();
  return NextResponse.json({ ok: true });
}
