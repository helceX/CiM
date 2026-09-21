import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import { organizationMemberships, organizations } from "../schema/organizations";
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
