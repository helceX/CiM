import { and, count, eq, isNull } from "drizzle-orm";
import type { Db } from "../client";
import { organizationMemberships, organizations } from "../schema/organizations";
import { users } from "../schema/users";
import { asOrganizationId, type OrganizationId } from "./tenant-scope";

/**
 * docs/architecture/SECURITY.md — "Supported from MVP: data export,
 * account deletion, organization deletion, audit trail of these
 * actions." Both deletions are soft (see the `deletedAt` column
 * comments on `organizations`/`users`) so the audit trail of the
 * deletion itself is never destroyed by the deletion.
 */

/** Owner-only, enforced by the caller (route handler) before this runs. */
export async function softDeleteOrganization(db: Db, organizationId: OrganizationId): Promise<void> {
  await db
    .update(organizations)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(organizations.id, organizationId));
}

export type SoleOwnershipRow = { organizationId: string; organizationName: string };

/**
 * Account deletion is blocked while the user is the *only* active owner
 * of a still-existing organization — deleting their account would
 * otherwise leave that organization ownerless with no recovery path
 * (ownership transfer isn't built yet). Returns the orgs that block
 * deletion so the UI can name them, not just say "no."
 */
export async function listSoleOwnedOrganizations(db: Db, userId: string): Promise<SoleOwnershipRow[]> {
  const ownedMemberships = await db
    .select({ organizationId: organizationMemberships.organizationId, organizationName: organizations.name })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.role, "organization_owner"),
        eq(organizationMemberships.status, "active"),
        isNull(organizations.deletedAt),
      ),
    );

  const soleOwned: SoleOwnershipRow[] = [];
  for (const owned of ownedMemberships) {
    const [row] = await db
      .select({ total: count() })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, owned.organizationId),
          eq(organizationMemberships.role, "organization_owner"),
          eq(organizationMemberships.status, "active"),
        ),
      );
    if (Number(row?.total ?? 0) <= 1) soleOwned.push(owned);
  }
  return soleOwned;
}

/**
 * Every organization the user was an active member of, *including* an
 * already soft-deleted one — unlike `listMembershipsForUser`, which
 * excludes those for normal UI use. Account deletion needs the full list
 * so its own audit trail is never silently dropped just because the
 * user's only organization happened to be deleted first (e.g. the owner
 * deletes their org, then deletes their account in the same session).
 */
export async function listMembershipOrganizationIdsForAudit(
  db: Db,
  userId: string,
): Promise<OrganizationId[]> {
  const rows = await db
    .select({ organizationId: organizationMemberships.organizationId })
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.userId, userId), eq(organizationMemberships.status, "active")));
  return rows.map((row) => asOrganizationId(row.organizationId));
}

/**
 * Anonymization, not a hard DELETE — see the `deletedAt` comment on the
 * `users` schema for why (FKs from reports/audit logs/etc. that should
 * outlive the actor). PII is overwritten in place; the row and its id
 * persist so that history stays attributable to "a deleted user."
 */
export async function anonymizeUser(db: Db, userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      email: `deleted-${userId}@deleted.invalid`,
      firstName: "Deleted",
      lastName: "User",
      passwordHash: "deleted-account-no-login",
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export type AccountExport = {
  account: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    timezone: string;
    locale: string;
    createdAt: Date;
  };
  memberships: { organizationName: string; role: string; joinedAt: Date }[];
};

/**
 * docs/architecture/SECURITY.md privacy-by-design — account data only.
 * Never touches Mentions/Articles/monitored media content, which is
 * shared tenant infrastructure, not personal data about this user.
 */
export async function exportAccountData(db: Db, userId: string): Promise<AccountExport | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return undefined;

  const memberships = await db
    .select({
      organizationName: organizations.name,
      role: organizationMemberships.role,
      joinedAt: organizationMemberships.createdAt,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(and(eq(organizationMemberships.userId, userId), eq(organizationMemberships.status, "active")));

  return {
    account: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      timezone: user.timezone,
      locale: user.locale,
      createdAt: user.createdAt,
    },
    memberships,
  };
}
