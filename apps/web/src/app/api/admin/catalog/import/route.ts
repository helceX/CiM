import { NextResponse } from "next/server";
import { z } from "zod";
import { db, setCatalogImportEnabled } from "@cim/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeAdmin } from "../../auth";

/** Pause or resume the worker's background catalog import. */
export async function POST(request: Request) {
  const auth = await authorizeAdmin();
  if (auth.response) return auth.response;

  const limited = await checkRateLimit(`admin-catalog-import:${auth.user.id}`, { limit: 30, windowSeconds: 60 });
  if (!limited.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const parsed = z.object({ enabled: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  await setCatalogImportEnabled(db, parsed.data.enabled);
  return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
}
