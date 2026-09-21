import { NextResponse } from "next/server";
import { db, listNotifications } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";

export async function GET() {
  let context;
  try {
    context = await requireOrgContext();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const items = await listNotifications(db, context.organizationId, context.userId, { limit: 20 });
  return NextResponse.json({ items });
}
