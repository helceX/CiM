import { NextResponse } from "next/server";
import { createMonitoringQuerySchema } from "@cim/validation";
import { astToBooleanQuery, expandSourceCategoriesToTypes } from "@cim/core";
import {
  createMonitoringQueryWithPlanLimit,
  getProject,
  recordAuditLog,
  db,
} from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";

export async function POST(request: Request) {
  let context;
  try {
    context = await requireOrgContext();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = createMonitoringQuerySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const project = await getProject(db, context.organizationId, input.projectId);
  if (!project) {
    // Never trust a client-supplied projectId without verifying it belongs
    // to this organization first (ADR-001).
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const ast = { include: input.include, exclude: input.exclude, exactPhrases: input.exactPhrases };
  if (ast.include.length === 0 && ast.exactPhrases.length === 0 && ast.exclude.length === 0) {
    return NextResponse.json({ error: "Add at least one include, exclude, or exact-phrase term" }, { status: 400 });
  }

  const result = await createMonitoringQueryWithPlanLimit(db, context.organizationId, {
    projectId: project.id,
    name: input.name,
    queryAst: ast,
    booleanQuery: astToBooleanQuery(ast),
    sourceTypes: expandSourceCategoriesToTypes(input.sourceTypes),
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
  const query = result.query;

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "monitoring_query.created",
    targetType: "monitoring_query",
    targetId: query.id,
  });

  return NextResponse.json({ ok: true, queryId: query.id });
}
