import { NextResponse } from "next/server";
import { db, markAllNotificationsRead } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";

export async function POST() {
  let context;
  try {
    context = await requireOrgContext();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await markAllNotificationsRead(db, context.organizationId, context.userId);
  return NextResponse.json({ ok: true });
}
