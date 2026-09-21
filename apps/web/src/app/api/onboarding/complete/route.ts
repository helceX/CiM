import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { completeOnboardingSchema } from "@cim/validation";
import { astToBooleanQuery, emptyQueryAst } from "@cim/core";
import { createProject, createMonitoringQuery, recordAuditLog, db, schema } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";

export async function POST(request: Request) {
  let context;
  try {
    context = await requireOrgContext();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = completeOnboardingSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const [workspace] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.organizationId, context.organizationId))
    .limit(1);
  if (!workspace) {
    return NextResponse.json({ error: "No workspace found for organization" }, { status: 500 });
  }

  const project = await createProject(db, context.organizationId, {
    workspaceId: workspace.id,
    name: input.projectName,
  });

  const ast = { ...emptyQueryAst(), include: input.keywords };
  const sourceTypes = input.sourceTypes.includes("all")
    ? ["news", "web", "social", "video", "podcast", "forums", "comments"]
    : input.sourceTypes;

  await createMonitoringQuery(db, context.organizationId, {
    projectId: project.id,
    name: `${input.projectName} monitoring`,
    queryAst: ast,
    booleanQuery: astToBooleanQuery(ast),
    sourceTypes,
  });

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "onboarding.completed",
    targetType: "project",
    targetId: project.id,
    metadata: { trackingTarget: input.trackingTarget, notificationPreference: input.notificationPreference },
  });

  return NextResponse.json({ ok: true, projectId: project.id });
}
