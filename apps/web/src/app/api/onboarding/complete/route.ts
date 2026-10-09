import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { completeOnboardingSchema } from "@cim/validation";
import { astToBooleanQuery, emptyQueryAst, expandSourceCategoriesToTypes } from "@cim/core";
import { backfillMentionsForQuery, createNotifyRuleForQuery, createProjectWithMonitoringQuery, recordAuditLog, db, schema, type NotifyMode } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";

export async function POST(request: Request) {
  const e = await getTranslations("errors");
  let context;
  try {
    context = await requireOrgContext();
  } catch {
    return NextResponse.json({ error: e("notAuthenticated") }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = completeOnboardingSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: e("invalidInput"), issues: parsed.error.issues },
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
    return NextResponse.json({ error: e("noWorkspace") }, { status: 500 });
  }

  const ast = { ...emptyQueryAst(), include: input.keywords };
  // Onboarding collects user-facing categories (brief §6); the pipeline
  // matches against Source.type, so they're expanded here — see
  // packages/core/source-categories.ts.
  const sourceTypes = expandSourceCategoriesToTypes(input.sourceTypes);

  const result = await createProjectWithMonitoringQuery(db, context.organizationId, {
    workspaceId: workspace.id,
    projectName: input.projectName,
    queryAst: ast,
    booleanQuery: astToBooleanQuery(ast),
    sourceTypes,
    trackingTarget: input.trackingTarget,
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: e("planLimit", { limit: result.limit }),
      },
      { status: 409 },
    );
  }
  const { projectId } = result;

  // The first monitoring should show the stories already stored right away,
  // not wait for the next crawl. Best effort — onboarding must not fail on it.
  await backfillMentionsForQuery(db, context.organizationId, {
    id: result.queryId,
    projectId,
    queryAst: ast,
    sourceTypes,
    trackingTarget: input.trackingTarget,
  }).catch((error) => console.error("[onboarding] backfill failed:", error));

  // "How should we notify you?" used to be recorded and ignored. Instant and high-priority-only are alert rules;
  // the daily digest and the weekly archive e-mails reach every member without one.
  const notifyMode: NotifyMode =
    input.notificationPreference === "instant" ? "every" : input.notificationPreference === "high_priority_only" ? "important" : "none";
  await createNotifyRuleForQuery(db, context.organizationId, {
    projectId,
    queryId: result.queryId,
    createdByUserId: context.userId,
    monitoringName: `${input.projectName} monitoring`,
    mode: notifyMode,
  }).catch((error) => console.error("[onboarding] could not create the alert rule:", error));

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "onboarding.completed",
    targetType: "project",
    targetId: projectId,
    metadata: { trackingTarget: input.trackingTarget, notificationPreference: input.notificationPreference },
  });

  return NextResponse.json({ ok: true, projectId });
}
