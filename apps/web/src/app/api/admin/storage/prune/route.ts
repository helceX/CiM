import { NextResponse } from "next/server";
import { z } from "zod";
import { db, pruneArticles, previewPrune } from "@cim/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeAdmin } from "../../auth";

const days = z.coerce.number().int().min(0).max(3650);

/** What deleting stories older than N days would remove — nothing is deleted here. */
export async function GET(request: Request) {
  const auth = await authorizeAdmin();
  if (auth.response) return auth.response;
  const parsed = days.safeParse(new URL(request.url).searchParams.get("days"));
  if (!parsed.success) return NextResponse.json({ error: "Invalid number of days." }, { status: 400 });
  return NextResponse.json(await previewPrune(db, parsed.data));
}

const bodySchema = z.object({
  days,
  /** also delete stories customers' monitorings matched (their mentions go with them) */
  includeMatched: z.boolean(),
  /** must be exactly "DELETE" when includeMatched is true */
  confirm: z.string().optional(),
});

/** The operator's "free space now". Irreversible, so the destructive form needs a typed confirmation. */
export async function POST(request: Request) {
  const auth = await authorizeAdmin();
  if (auth.response) return auth.response;

  const limited = await checkRateLimit(`admin-storage-prune:${auth.user.id}`, { limit: 6, windowSeconds: 60 });
  if (!limited.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (parsed.data.includeMatched && parsed.data.confirm !== "DELETE") {
    return NextResponse.json({ error: 'Type DELETE to confirm deleting customers\' matched stories.' }, { status: 400 });
  }

  const deleted = await pruneArticles(db, { olderThanDays: parsed.data.days, includeMatched: parsed.data.includeMatched });
  console.warn(
    `[storage] ${auth.user.email} deleted ${deleted} stories older than ${parsed.data.days} days (includeMatched=${parsed.data.includeMatched})`,
  );
  return NextResponse.json({ ok: true, deleted });
}
