import { NextResponse } from "next/server";
import { db, markSocialEventsRead } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";

/** Mark every mention and comment collected from the organization's connected accounts as read. */
export async function POST() {
  let context;
  try {
    context = await requireOrgContext();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  await markSocialEventsRead(db, context.organizationId);
  return NextResponse.json({ ok: true });
}
