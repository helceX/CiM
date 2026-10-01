import { NextResponse } from "next/server";
import { blockDomainSchema } from "@cim/validation";
import { blockDomain, db } from "@cim/db";
import { authorizeAdmin } from "../auth";

/** Block a publisher proactively (no request needed). */
export async function POST(request: Request) {
  const auth = await authorizeAdmin();
  if (auth.response) return auth.response;

  const parsed = blockDomainSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const result = await blockDomain(db, { ...parsed.data, userId: auth.user.id });
  return NextResponse.json({ ok: true, block: result });
}
