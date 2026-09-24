import { desc, sql } from "drizzle-orm";
import type { Db } from "../client";
import { sources } from "../schema/content";

/**
 * docs/architecture/SECURITY.md (brief §86) — Platform Super Admin reads.
 * Every function here is intentionally unscoped by organization: this is
 * the one legitimate place in the codebase that reads *across* every
 * tenant's aggregate counts, distinct from the ADR-001 ingestion/alert
 * cross-tenant exceptions (which read tenant *content* for a system
 * process). These must never be called from a tenant-scoped route —
 * only from `/admin`, behind `requireSuperAdmin()`
 * (apps/web/src/lib/admin.ts) — and they return aggregates/health
 * signals only, never a tenant's actual mentions/queries/content
 * ("no implicit access to tenant application views").
 */

export type AdminOrganizationRow = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  memberCount: number;
  projectCount: number;
  mentionCount: number;
};

export async function listOrganizationsForAdmin(db: Db): Promise<AdminOrganizationRow[]> {
  const result = await db.execute<Omit<AdminOrganizationRow, "createdAt"> & { createdAt: string }>(sql`
    select
      o.id,
      o.name,
      o.slug,
      o.created_at as "createdAt",
      (select count(*)::int from organization_memberships m where m.organization_id = o.id and m.status = 'active') as "memberCount",
      (select count(*)::int from projects p where p.organization_id = o.id and p.deleted_at is null) as "projectCount",
      (select count(*)::int from mentions me where me.organization_id = o.id) as "mentionCount"
    from organizations o
    where o.deleted_at is null
    order by o.created_at desc
  `);
  // The raw driver returns timestamptz as a string here, not a Date —
  // unlike the query builder's own select(), which maps it automatically.
  return result.rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt) }));
}

export type AdminSourceRow = {
  id: string;
  name: string;
  domain: string;
  type: string;
  connector: string;
  status: string;
  lastCheckedAt: Date | null;
};

/** Sources are already global/reference data (ADR-001) — no cross-tenant bypass needed here. */
export async function listSourcesForAdmin(db: Db): Promise<AdminSourceRow[]> {
  return db
    .select({
      id: sources.id,
      name: sources.name,
      domain: sources.domain,
      type: sources.type,
      connector: sources.connector,
      status: sources.status,
      lastCheckedAt: sources.lastCheckedAt,
    })
    .from(sources)
    .orderBy(desc(sources.lastCheckedAt));
}

export type PlatformTotals = {
  totalOrganizations: number;
  totalUsers: number;
  totalSources: number;
  totalMentions: number;
  mentionsLast24h: number;
};

export async function getPlatformTotals(db: Db): Promise<PlatformTotals> {
  // Same soft-delete convention every tenant-scoped repository already
  // applies (isNull(organizations.deletedAt) in billing.ts, etc.) — a
  // deleted org/user must not inflate the Platform Super Admin's KPI
  // totals, same as listOrganizationsForAdmin below must not list it.
  const result = await db.execute<PlatformTotals>(sql`
    select
      (select count(*)::int from organizations where deleted_at is null) as "totalOrganizations",
      (select count(*)::int from users where deleted_at is null) as "totalUsers",
      (select count(*)::int from sources) as "totalSources",
      (select count(*)::int from mentions) as "totalMentions",
      (select count(*)::int from mentions where created_at >= now() - interval '24 hours') as "mentionsLast24h"
  `);
  const row = result.rows[0];
  if (!row) throw new Error("failed to compute platform totals");
  return row;
}

/** A trivial round-trip query — proves the pool can actually reach Postgres, not just that the process is up. */
export async function checkDatabaseHealth(db: Db): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
