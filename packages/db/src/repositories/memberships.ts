import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import { organizationMemberships, organizations } from "../schema/organizations";
import { users } from "../schema/users";
import type { OrganizationId } from "./tenant-scope";

export async function getMembership(
  db: Db,
  organizationId: OrganizationId,
  userId: string,
) {
  const [membership] = await db
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.status, "active"),
      ),
    )
    .limit(1);
  return membership;
}

/** All active memberships for a user, across organizations — used to
 * resolve which organization a freshly authenticated user lands in. */
export async function listMembershipsForUser(db: Db, userId: string) {
  return db
    .select({
      membership: organizationMemberships,
      organization: organizations,
    })
    .from(organizationMemberships)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationMemberships.organizationId),
    )
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.status, "active"),
      ),
    );
}

/** For the alert engine's email channel — who to notify in this org. */
export async function listActiveMemberEmails(
  db: Db,
  organizationId: OrganizationId,
): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.status, "active"),
      ),
    );
  return rows.map((row) => row.email);
}
