import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { monitoringQueries, type QueryAst } from "../schema/monitoring";
import { organizations } from "../schema/organizations";
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

export async function getMonitoringQuery(
  db: Db,
  organizationId: OrganizationId,
  queryId: string,
) {
  const [query] = await db
    .select()
    .from(monitoringQueries)
    .where(
      and(
        eq(monitoringQueries.organizationId, organizationId),
        eq(monitoringQueries.id, queryId),
        isNull(monitoringQueries.deletedAt),
      ),
    )
    .limit(1);
  return query;
}

/**
 * The one deliberate cross-tenant read in this codebase: the ingestion
 * pipeline (a system process, not a user-facing code path) needs every
 * organization's active queries for a given source type to run query
 * matching. Never call this from a request handler — see ADR-001; the
 * ingestion pipeline is documented there as the sole exception.
 */
export async function listActiveMonitoringQueriesForSourceType(db: Db, sourceType: string) {
  return db
    .select({
      id: monitoringQueries.id,
      organizationId: monitoringQueries.organizationId,
      projectId: monitoringQueries.projectId,
      name: monitoringQueries.name,
      queryAst: monitoringQueries.queryAst,
      booleanQuery: monitoringQueries.booleanQuery,
      sourceTypes: monitoringQueries.sourceTypes,
      status: monitoringQueries.status,
      createdAt: monitoringQueries.createdAt,
      updatedAt: monitoringQueries.updatedAt,
      deletedAt: monitoringQueries.deletedAt,
    })
    .from(monitoringQueries)
    // A soft-deleted organization (docs/architecture/SECURITY.md
    // organization deletion) must stop being crawled — deleting the org
    // doesn't cascade-mark its queries individually, so this is the one
    // place that has to check both.
    .innerJoin(organizations, eq(organizations.id, monitoringQueries.organizationId))
    .where(
      and(
        eq(monitoringQueries.status, "active"),
        isNull(monitoringQueries.deletedAt),
        isNull(organizations.deletedAt),
        sql`${sourceType} = any(${monitoringQueries.sourceTypes})`,
      ),
    );
}
