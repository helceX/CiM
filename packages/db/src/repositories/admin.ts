import { and, desc, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { emailOutbox } from "../schema/auth";
import { sources } from "../schema/content";
import { users } from "../schema/users";

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
  url: string | null;
  country: string | null;
  language: string | null;
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
      url: sources.url,
      country: sources.country,
      language: sources.language,
      status: sources.status,
      lastCheckedAt: sources.lastCheckedAt,
    })
    .from(sources)
    .orderBy(desc(sources.lastCheckedAt));
}

/** How many sources are in each health state — one small query instead of loading every source. */
export async function countSourcesByStatus(db: Db): Promise<Record<string, number>> {
  const result = await db.execute<{ status: string; n: number }>(sql`select status, count(*)::int as n from sources group by status`);
  return Object.fromEntries(result.rows.map((row) => [row.status, row.n]));
}

/**
 * A bounded look at source health for the Overview: the sources that need attention first
 * (error, blocked, delayed), then the rest by most recent check. The full list is on /admin/sources.
 */
export async function listSourceHealthSample(db: Db, limit = 200): Promise<AdminSourceRow[]> {
  const result = await db.execute<Omit<AdminSourceRow, "lastCheckedAt"> & { lastCheckedAt: string | null }>(sql`
    select id, name, domain, type, connector, url, country, language, status, last_checked_at as "lastCheckedAt"
    from sources
    order by case status when 'error' then 0 when 'blocked' then 1 when 'delayed' then 2 when 'healthy' then 3 else 4 end,
             last_checked_at desc nulls last
    limit ${limit}
  `);
  return result.rows.map((row) => ({ ...row, lastCheckedAt: row.lastCheckedAt ? new Date(row.lastCheckedAt) : null }));
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


export type AdminUnverifiedUser = { id: string; email: string; name: string; createdAt: Date };

/** Accounts that registered but never confirmed their email (newest first). */
export async function listUnverifiedUsersForAdmin(db: Db, limit = 50): Promise<AdminUnverifiedUser[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(isNull(users.emailVerifiedAt), isNull(users.deletedAt)))
    .orderBy(desc(users.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: `${row.firstName} ${row.lastName}`.trim(),
    createdAt: row.createdAt,
  }));
}

export type AdminEmailRow = {
  id: string;
  toEmail: string;
  subject: string;
  kind: string;
  createdAt: Date;
  sentAt: Date | null;
  deliveredVia: string | null;
  lastError: string | null;
};

/**
 * Recent outgoing emails for delivery diagnostics. The body is deliberately
 * NOT selected: it contains verification / reset links that are credentials.
 */
export async function listRecentEmailsForAdmin(db: Db, limit = 20): Promise<AdminEmailRow[]> {
  return db
    .select({
      id: emailOutbox.id,
      toEmail: emailOutbox.toEmail,
      subject: emailOutbox.subject,
      kind: emailOutbox.kind,
      createdAt: emailOutbox.createdAt,
      sentAt: emailOutbox.sentAt,
      deliveredVia: emailOutbox.deliveredVia,
      lastError: emailOutbox.lastError,
    })
    .from(emailOutbox)
    .orderBy(desc(emailOutbox.createdAt))
    .limit(limit);
}
