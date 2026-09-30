import { NextResponse } from "next/server";
import { db, markNotificationRead } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let context;
  try {
    context = await requireOrgContext();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const updated = await markNotificationRead(db, context.organizationId, context.userId, id);
  if (!updated) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
