import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { countryCodesInScope, normalizeRegionScopes } from "@cim/core";
import type { Db } from "../client";
import { sources } from "../schema/content";
import { monitoringQueries } from "../schema/monitoring";
import type { OrganizationId } from "./tenant-scope";

export type SourceCoverage = {
  total: number;
  active: number;
  healthy: number;
  attention: number;
  paused: number;
  countries: number;
  languages: number;
  lastHealthyCheck: string | null;
};

/** Global source metadata matched to this tenant's active monitoring scopes; no stories or credentials. */
export async function getMonitoringSourceCoverage(
  db: Db,
  organizationId: OrganizationId,
): Promise<SourceCoverage | null> {
  const queries = await db
    .select({
      types: monitoringQueries.sourceTypes,
      regions: monitoringQueries.regionScopes,
    })
    .from(monitoringQueries)
    .where(
      and(
        eq(monitoringQueries.organizationId, organizationId),
        eq(monitoringQueries.status, "active"),
        isNull(monitoringQueries.deletedAt),
      ),
    );
  if (queries.length === 0) return null;
  const matches = queries.map((query) => {
    const countries = normalizeRegionScopes(query.regions).flatMap(
      (region) => countryCodesInScope(region) ?? [],
    );
    return and(
      query.types.length ? inArray(sources.type, query.types) : sql`true`,
      countries.length ? inArray(sources.country, countries) : sql`true`,
    );
  });
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${sources.status} <> 'unavailable')::int`,
      healthy: sql<number>`count(*) filter (where ${sources.status} = 'healthy')::int`,
      attention: sql<number>`count(*) filter (where ${sources.status} in ('error', 'delayed', 'blocked'))::int`,
      paused: sql<number>`count(*) filter (where ${sources.status} = 'unavailable')::int`,
      countries: sql<number>`count(distinct nullif(${sources.country}, ''))::int`,
      languages: sql<number>`count(distinct nullif(${sources.language}, ''))::int`,
      lastHealthyCheck: sql<
        string | null
      >`max(${sources.lastCheckedAt}) filter (where ${sources.status} = 'healthy')::text`,
    })
    .from(sources)
    .where(or(...matches));
  return row ?? null;
}
