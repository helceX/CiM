import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { completeOnboardingSchema } from "@cim/validation";
import { astToBooleanQuery, emptyQueryAst, expandSourceCategoriesToTypes } from "@cim/core";
import type { Db } from "@cim/db";
import { createProject, createMonitoringQueryWithPlanLimit, recordAuditLog, db, schema } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";

/** Thrown inside the transaction below to roll back createProject when the plan-limit check rejects the query — never surfaced past this file. */
class PlanLimitRejected extends Error {
  constructor(public readonly limit: number) {
    super("plan limit rejected");
  }
}

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

  const ast = { ...emptyQueryAst(), include: input.keywords };
  // Onboarding collects user-facing categories (brief §6); the pipeline
  // matches against Source.type, so they're expanded here — see
  // packages/core/source-categories.ts.
  const sourceTypes = expandSourceCategoriesToTypes(input.sourceTypes);

  // createProject and the plan-limit-checked query creation share one
  // transaction (nested inside createMonitoringQueryWithPlanLimit's own
  // via a Postgres SAVEPOINT — drizzle-orm/node-postgres supports this
  // natively) so a plan-limit rejection rolls back the project too,
  // instead of leaving an orphaned, query-less project behind on retry
  // (e.g. a dropped response after a first successful submit).
  let projectId: string;
  try {
    projectId = await db.transaction(async (tx) => {
      const project = await createProject(tx as unknown as Db, context.organizationId, {
        workspaceId: workspace.id,
        name: input.projectName,
      });

      const result = await createMonitoringQueryWithPlanLimit(tx as unknown as Db, context.organizationId, {
        projectId: project.id,
        name: `${input.projectName} monitoring`,
        queryAst: ast,
        booleanQuery: astToBooleanQuery(ast),
        sourceTypes,
        trackingTarget: input.trackingTarget,
      });
      if (!result.ok) {
        throw new PlanLimitRejected(result.limit);
      }

      return project.id;
    });
  } catch (err) {
    if (err instanceof PlanLimitRejected) {
      return NextResponse.json(
        {
          error: `Your plan allows up to ${err.limit} monitoring quer${err.limit === 1 ? "y" : "ies"}. Upgrade to add more.`,
        },
        { status: 409 },
      );
    }
    throw err;
  }

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "onboarding.completed",
    targetType: "project",
    targetId: projectId,
    metadata: { trackingTarget: input.trackingTarget, notificationPreference: input.notificationPreference },
  });

  return NextResponse.json({ ok: true, projectId });
}
