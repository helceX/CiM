import { NextResponse } from "next/server";
import { assignQueryToGroupSchema } from "@cim/validation";
import { db, recordAuditLog, setQueryBrandGroup } from "@cim/db";
import { authorize } from "../auth";

export async function POST(request: Request) {
  const auth = await authorize("monitoring:write");
  if (auth.response) return auth.response;
  const { context } = auth;

  const parsed = assignQueryToGroupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const result = await setQueryBrandGroup(db, context.organizationId, parsed.data.queryId, parsed.data.brandGroupId);
  if (result === "query_not_found") return NextResponse.json({ error: "Monitoring query not found" }, { status: 404 });
  if (result === "group_not_found") return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (result === "project_mismatch") {
    return NextResponse.json({ error: "The query and the group belong to different projects" }, { status: 409 });
  }

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "monitoring_query.brand_group_set",
    targetType: "monitoring_query",
    targetId: parsed.data.queryId,
    metadata: { brandGroupId: parsed.data.brandGroupId },
  });
  return NextResponse.json({ ok: true });
}
