import { NextResponse } from "next/server";
import { db, getMentionDetail } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let context;
  try {
    context = await requireOrgContext();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const detail = await getMentionDetail(db, context.organizationId, id);
  if (!detail) {
    return NextResponse.json({ error: "Mention not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}
