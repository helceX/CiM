import { NextResponse } from "next/server";
import { createMonitoringQuerySchema } from "@cim/validation";
import { assembleQueryAst, astToBooleanQuery, expandSourceCategoriesToTypes } from "@cim/core";
import {
  backfillMentionsForQuery,
  createMonitoringQueryWithPlanLimit,
  getProject,
  recordAuditLog,
  db,
} from "@cim/db";
import { requirePermission } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/session";

export async function POST(request: Request) {
  let context;
  try {
    // A viewer or report_recipient role only has monitoring:read
    // (packages/core/src/authz.ts) — both are explicitly meant to be
    // read-only, the same reasoning POST /api/reports requires
    // reports:write for.
    context = await requirePermission("monitoring:write");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "You don't have permission to create monitoring queries" },
        { status: 403 },
      );
    }
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

  const ast = assembleQueryAst(input);
  if (ast.include.length === 0 && ast.exactPhrases.length === 0 && ast.exclude.length === 0) {
    return NextResponse.json({ error: "Add at least one include, exclude, or exact-phrase term" }, { status: 400 });
  }

  const user = await getCurrentUser();
  const result = await createMonitoringQueryWithPlanLimit(
    db,
    context.organizationId,
    {
      projectId: project.id,
      name: input.name,
      queryAst: ast,
      booleanQuery: astToBooleanQuery(ast),
      sourceTypes: expandSourceCategoriesToTypes(input.sourceTypes),
      regionScopes: input.regionScopes,
      trackingTarget: input.trackingTarget,
    },
    { unlimited: user?.isPlatformSuperAdmin === true },
  );
  if (!result.ok) {
    return NextResponse.json(
      {
        error: `Your plan allows up to ${result.limit} monitoring quer${result.limit === 1 ? "y" : "ies"}. Upgrade to add more.`,
        code: "plan_limit",
        upgradeUrl: "/settings?tab=billing",
      },
      { status: 409 },
    );
  }
  const query = result.query;

  // Pick up the stories already stored (same 30-day window the preview showed)
  // so the new monitoring is not empty until the next crawl. Best effort: a
  // failure here must not undo a saved monitoring.
  const backfill = await backfillMentionsForQuery(db, context.organizationId, {
    id: query.id,
    projectId: project.id,
    queryAst: ast,
    sourceTypes: query.sourceTypes,
    regionScopes: query.regionScopes,
  }).catch((error) => {
    console.error("[monitoring] backfill failed:", error);
    return { scanned: 0, created: 0 };
  });

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "monitoring_query.created",
    targetType: "monitoring_query",
    targetId: query.id,
  });

  return NextResponse.json({ ok: true, queryId: query.id, backfilled: backfill.created });
}
