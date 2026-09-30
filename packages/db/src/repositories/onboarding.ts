import type { Db } from "../client";
import type { QueryAst } from "../schema/monitoring";
import { createProject } from "./projects";
import { createMonitoringQueryWithPlanLimit } from "./billing";
import type { OrganizationId } from "./tenant-scope";

export type CompleteOnboardingResult = { ok: true; projectId: string } | { ok: false; limit: number };

/** Thrown inside the transaction below to roll back createProject when the plan-limit check rejects the query — never surfaced past this function. */
class PlanLimitRejected extends Error {
  constructor(public readonly limit: number) {
    super("plan limit rejected");
  }
}

/**
 * Onboarding's project + first monitoring query, created in one
 * transaction (nested inside createMonitoringQueryWithPlanLimit's own
 * via a Postgres SAVEPOINT — drizzle-orm/node-postgres supports this
 * natively) so a plan-limit rejection rolls back the project too,
 * instead of leaving an orphaned, query-less project behind on retry
 * (e.g. a dropped response after a first successful submit, a second
 * tab, or the advisory-lock race createMonitoringQueryWithPlanLimit's
 * own docs describe).
 */
export async function createProjectWithMonitoringQuery(
  db: Db,
  organizationId: OrganizationId,
  input: {
    workspaceId: string;
    projectName: string;
    queryAst: QueryAst;
    booleanQuery: string;
    sourceTypes: string[];
    trackingTarget?: string;
  },
): Promise<CompleteOnboardingResult> {
  try {
    return await db.transaction(async (tx) => {
      const project = await createProject(tx as unknown as Db, organizationId, {
        workspaceId: input.workspaceId,
        name: input.projectName,
      });

      const result = await createMonitoringQueryWithPlanLimit(tx as unknown as Db, organizationId, {
        projectId: project.id,
        name: `${input.projectName} monitoring`,
        queryAst: input.queryAst,
        booleanQuery: input.booleanQuery,
        sourceTypes: input.sourceTypes,
        trackingTarget: input.trackingTarget,
      });
      if (!result.ok) {
        throw new PlanLimitRejected(result.limit);
      }

      return { ok: true as const, projectId: project.id };
    });
  } catch (err) {
    if (err instanceof PlanLimitRejected) {
      return { ok: false, limit: err.limit };
    }
    throw err;
  }
}
