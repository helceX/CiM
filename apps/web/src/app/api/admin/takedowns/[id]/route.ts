import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveTakedownSchema } from "@cim/validation";
import { blockDomain, closeTakedownRequest, db } from "@cim/db";
import { authorizeAdmin } from "../../auth";

/**
 * Resolves one OPEN takedown request. "block" / "block_and_purge" also block
 * the named domain (pausing its sources; purge deletes what was stored). The
 * request is closed first-come: a second admin clicking gets a 409, not a
 * second block.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAdmin();
  if (auth.response) return auth.response;

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = resolveTakedownSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const { action, note, domain } = parsed.data;
  const blocking = action === "block" || action === "block_and_purge";
  if (blocking && !domain) {
    return NextResponse.json({ error: "Enter the domain to block." }, { status: 400 });
  }

  const closed = await closeTakedownRequest(db, id, {
    status: action === "reject" ? "rejected" : "resolved",
    note,
    userId: auth.user.id,
  });
  if (!closed) return NextResponse.json({ error: "This request was already handled." }, { status: 409 });

  let block = null;
  if (blocking && domain) {
    block = await blockDomain(db, {
      domain,
      reason: note || "Publisher takedown request",
      userId: auth.user.id,
      purge: action === "block_and_purge",
    });
  }
  return NextResponse.json({ ok: true, block });
}
