import { NextResponse } from "next/server";
import { z } from "zod";
import { db, unblockDomain } from "@cim/db";
import { authorizeAdmin } from "../../auth";

/**
 * Lifts a block. Paused sources stay paused — resuming one is a separate,
 * deliberate step in /admin/sources.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAdmin();
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await unblockDomain(db, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
