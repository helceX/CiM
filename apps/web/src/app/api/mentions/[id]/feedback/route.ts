import { NextResponse } from "next/server";
import { z } from "zod";
import { db, recordAuditLog, setMentionFeedback } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";

const feedbackSchema = z.object({
  feedback: z.enum(["relevant", "irrelevant", "duplicate"]),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let context;
  try {
    context = await requireOrgContext();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const json = await request.json().catch(() => null);
  const parsed = feedbackSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const updated = await setMentionFeedback(db, context.organizationId, id, parsed.data.feedback);
  if (!updated) {
    return NextResponse.json({ error: "Mention not found" }, { status: 404 });
  }

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "mention.feedback",
    targetType: "mention",
    targetId: id,
    metadata: { feedback: parsed.data.feedback },
  });

  return NextResponse.json({ ok: true });
}
