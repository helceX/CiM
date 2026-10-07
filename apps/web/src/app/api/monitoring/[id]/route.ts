import { NextResponse } from "next/server";
import { updateMonitoringQuerySchema } from "@cim/validation";
import { assembleQueryAst, astToBooleanQuery, expandSourceCategoriesToTypes } from "@cim/core";
import { backfillMentionsForQuery, db, getMonitoringQuery, recordAuditLog, updateMonitoringQuery } from "@cim/db";
import { requirePermission } from "@/lib/tenant";

/**
 * Edit a monitoring: rename it, add or remove keywords, change where it looks. Stories it already
 * matched stay (removing a keyword never deletes history); stories already stored that the new
 * keywords match are picked up straight away, and the next crawl uses the new rules.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let context;
  try {
    context = await requirePermission("monitoring:write");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "You don't have permission to edit monitoring queries" }, { status: 403 });
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = updateMonitoringQuerySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  // Tenant check first: the id must belong to this organization.
  const existing = await getMonitoringQuery(db, context.organizationId, id);
  if (!existing) return NextResponse.json({ error: "Monitoring query not found" }, { status: 404 });

  const ast = assembleQueryAst(input);
  if (ast.include.length === 0 && ast.exactPhrases.length === 0 && ast.exclude.length === 0) {
    return NextResponse.json({ error: "Add at least one include, exclude, or exact-phrase term" }, { status: 400 });
  }

  const query = await updateMonitoringQuery(db, context.organizationId, id, {
    name: input.name,
    queryAst: ast,
    booleanQuery: astToBooleanQuery(ast),
    sourceTypes: expandSourceCategoriesToTypes(input.sourceTypes),
    regionScopes: input.regionScopes,
    trackingTarget: input.trackingTarget,
  });
  if (!query) return NextResponse.json({ error: "Monitoring query not found" }, { status: 404 });

  const backfill = await backfillMentionsForQuery(db, context.organizationId, {
    id: query.id,
    projectId: query.projectId,
    queryAst: ast,
    sourceTypes: query.sourceTypes,
    regionScopes: query.regionScopes,
  }).catch((error) => {
    console.error("[monitoring] backfill after edit failed:", error);
    return { scanned: 0, created: 0 };
  });

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "monitoring_query.updated",
    targetType: "monitoring_query",
    targetId: query.id,
  });

  return NextResponse.json({ ok: true, queryId: query.id, backfilled: backfill.created });
}
