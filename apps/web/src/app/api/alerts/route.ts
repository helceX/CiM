import { NextResponse } from "next/server";
import { createAlertRuleSchema } from "@cim/validation";
import { createAlertRule, getMonitoringQuery, getProject, recordAuditLog, db } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";

export async function POST(request: Request) {
  let context;
  try {
    context = await requireOrgContext();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = createAlertRuleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Never trust client-supplied ids without verifying they belong to this
  // organization first (ADR-001).
  const [project, query] = await Promise.all([
    getProject(db, context.organizationId, input.projectId),
    getMonitoringQuery(db, context.organizationId, input.queryId),
  ]);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!query) {
    return NextResponse.json({ error: "Monitoring query not found" }, { status: 404 });
  }

  const rule = await createAlertRule(db, context.organizationId, {
    projectId: project.id,
    queryId: query.id,
    createdByUserId: context.userId,
    name: input.name,
    type: input.type,
    channels: input.channels,
    cooldownMinutes: input.cooldownMinutes,
  });

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "alert_rule.created",
    targetType: "alert_rule",
    targetId: rule.id,
  });

  return NextResponse.json({ ok: true, alertRuleId: rule.id });
}
