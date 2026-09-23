import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { completeOnboardingSchema } from "@cim/validation";
import { astToBooleanQuery, emptyQueryAst, expandSourceCategoriesToTypes } from "@cim/core";
import { createProject, createMonitoringQueryWithPlanLimit, recordAuditLog, db, schema } from "@cim/db";
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
  // Onboarding collects user-facing categories (brief §6); the pipeline
  // matches against Source.type, so they're expanded here — see
  // packages/core/source-categories.ts.
  const sourceTypes = expandSourceCategoriesToTypes(input.sourceTypes);

  // Routes through the same plan-limit-checked wrapper as
  // api/monitoring/route.ts (packages/db/src/repositories/billing.ts) —
  // this is always a brand-new org's first query today, but a second
  // enforcement choke point here means the cap holds even if onboarding
  // ever creates more than one, or races a concurrent create.
  const result = await createMonitoringQueryWithPlanLimit(db, context.organizationId, {
    projectId: project.id,
    name: `${input.projectName} monitoring`,
    queryAst: ast,
    booleanQuery: astToBooleanQuery(ast),
    sourceTypes,
    trackingTarget: input.trackingTarget,
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: `Your plan allows up to ${result.limit} monitoring quer${result.limit === 1 ? "y" : "ies"}. Upgrade to add more.`,
      },
      { status: 409 },
    );
  }

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "onboarding.completed",
    targetType: "project",
    targetId: project.id,
    metadata: { trackingTarget: input.trackingTarget, notificationPreference: input.notificationPreference },
  });

  return NextResponse.json({ ok: true, projectId: project.id });
}
