import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../client";
import { monitoringQueries, type QueryAst } from "../schema/monitoring";
import type { OrganizationId } from "./tenant-scope";

export async function listMonitoringQueries(
  db: Db,
  organizationId: OrganizationId,
  projectId?: string,
) {
  return db
    .select()
    .from(monitoringQueries)
    .where(
      and(
        eq(monitoringQueries.organizationId, organizationId),
        isNull(monitoringQueries.deletedAt),
        projectId ? eq(monitoringQueries.projectId, projectId) : undefined,
      ),
    )
    .orderBy(desc(monitoringQueries.createdAt));
}

export async function createMonitoringQuery(
  db: Db,
  organizationId: OrganizationId,
  input: {
    projectId: string;
    name: string;
    queryAst: QueryAst;
    booleanQuery: string;
    sourceTypes: string[];
  },
) {
  const [query] = await db
    .insert(monitoringQueries)
    .values({
      organizationId,
      projectId: input.projectId,
      name: input.name,
      queryAst: input.queryAst,
      booleanQuery: input.booleanQuery,
      sourceTypes: input.sourceTypes,
    })
    .returning();
  if (!query) throw new Error("Failed to create monitoring query");
  return query;
}
