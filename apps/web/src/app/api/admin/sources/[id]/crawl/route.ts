import { NextResponse } from "next/server";
import { z } from "zod";
import { db, setSourceCrawlEnabled } from "@cim/db";
import { authorizeAdmin } from "../../../auth";

const bodySchema = z.object({ enabled: z.boolean() });

/** Pause or resume crawling one source (never deletes it or its mentions). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAdmin();
  if (auth.response) return auth.response;

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const updated = await setSourceCrawlEnabled(db, id, parsed.data.enabled);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
