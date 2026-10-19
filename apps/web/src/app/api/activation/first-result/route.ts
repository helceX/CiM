import { NextResponse } from "next/server";
import { z } from "zod";
import { db, recordFirstResultView } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  let context;
  try {
    context = await requireOrgContext();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const limit = await checkRateLimit(`activation:${context.userId}`, {
    limit: 60,
    windowSeconds: 60,
  });
  if (!limit.allowed)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = z
    .object({ mentionId: z.string().uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid mention" }, { status: 400 });
  await recordFirstResultView(
    db,
    context.organizationId,
    context.userId,
    parsed.data.mentionId,
  );
  return NextResponse.json({ ok: true });
}
