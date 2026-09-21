import { and, count, eq, ne } from "drizzle-orm";
import type { OrgRole } from "@cim/core";
import type { Db } from "../client";
import { invitationTokens } from "../schema/auth";
import { organizationMemberships, organizations } from "../schema/organizations";
import { users } from "../schema/users";
import { asOrganizationId, type OrganizationId } from "./tenant-scope";

/**
 * docs/ux/SCREEN_INVENTORY.md Screen 18 "Organization Users" — the
 * `organizationMemberships.status`/`invitedByUserId` columns have
 * carried "invited"/"revoked" since Phase 1's schema; this is the first
 * repository to actually drive them. An invite creates the User row up
 * front (sentinel password — the same "cannot possibly hash-match a real
 * password" pattern account deletion uses, packages/db/src/repositories/
 * privacy.ts) because organizationMemberships.userId is NOT NULL; the
 * person only gets real credentials when they accept.
 */
export async function inviteMember(
  db: Db,
  organizationId: OrganizationId,
  input: {
    email: string;
    role: OrgRole;
    invitedByUserId: string;
    tokenHash: string;
    tokenExpiresAt: Date;
  },
): Promise<{ membershipId: string; userId: string }> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: input.email,
        passwordHash: "invitation-pending-no-login",
        firstName: "Pending",
        lastName: "Invitation",
      })
      .returning();
    if (!user) throw new Error("Failed to create invited user");

    const [membership] = await tx
      .insert(organizationMemberships)
      .values({
        organizationId,
        userId: user.id,
        role: input.role,
        status: "invited",
        invitedByUserId: input.invitedByUserId,
      })
      .returning();
    if (!membership) throw new Error("Failed to create invitation");

    await tx.insert(invitationTokens).values({
      membershipId: membership.id,
      tokenHash: input.tokenHash,
      expiresAt: input.tokenExpiresAt,
    });

    return { membershipId: membership.id, userId: user.id };
  });
}

export type MemberRow = {
  membershipId: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  createdAt: Date;
};

/** Active and invited members — revoked ones are history, not "the team" (kept in the audit log, not this list). */
export async function listMembersForOrganization(
  db: Db,
  organizationId: OrganizationId,
): Promise<MemberRow[]> {
  const rows = await db
    .select({
      membershipId: organizationMemberships.id,
      userId: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: organizationMemberships.role,
      status: organizationMemberships.status,
      createdAt: organizationMemberships.createdAt,
    })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        ne(organizationMemberships.status, "revoked"),
      ),
    )
    .orderBy(organizationMemberships.createdAt);
  return rows;
}

async function countActiveOwners(
  db: Db,
  organizationId: OrganizationId,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.role, "organization_owner"),
        eq(organizationMemberships.status, "active"),
      ),
    );
  return Number(row?.total ?? 0);
}

export type MemberMutationError = "not_found" | "sole_owner";

/**
 * Demoting or revoking an organization's only active owner would leave it
 * with no one able to manage it — the same "no recovery path" reasoning
 * packages/db/src/repositories/privacy.ts's sole-owner check uses for
 * account deletion, applied here to role changes/revocation instead.
 */
async function assertNotDemotingSoleOwner(
  db: Db,
  organizationId: OrganizationId,
  membershipId: string,
): Promise<MemberMutationError | null> {
  const [membership] = await db
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.id, membershipId),
        eq(organizationMemberships.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!membership) return "not_found";
  if (membership.role === "organization_owner" && membership.status === "active") {
    const activeOwners = await countActiveOwners(db, organizationId);
    if (activeOwners <= 1) return "sole_owner";
  }
  return null;
}

export async function updateMemberRole(
  db: Db,
  organizationId: OrganizationId,
  membershipId: string,
  role: OrgRole,
): Promise<{ ok: true } | { ok: false; error: MemberMutationError }> {
  const blocked = await assertNotDemotingSoleOwner(db, organizationId, membershipId);
  if (blocked) return { ok: false, error: blocked };

  await db
    .update(organizationMemberships)
    .set({ role, updatedAt: new Date() })
    .where(
      and(
        eq(organizationMemberships.id, membershipId),
        eq(organizationMemberships.organizationId, organizationId),
      ),
    );
  return { ok: true };
}

export async function revokeMembership(
  db: Db,
  organizationId: OrganizationId,
  membershipId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: MemberMutationError }> {
  const blocked = await assertNotDemotingSoleOwner(db, organizationId, membershipId);
  if (blocked) return { ok: false, error: blocked };

  const [revoked] = await db
    .update(organizationMemberships)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(
      and(
        eq(organizationMemberships.id, membershipId),
        eq(organizationMemberships.organizationId, organizationId),
      ),
    )
    .returning({ userId: organizationMemberships.userId });
  if (!revoked) return { ok: false, error: "not_found" };
  return { ok: true, userId: revoked.userId };
}

export type PendingInvitation = {
  membershipId: string;
  organizationId: OrganizationId;
  organizationName: string;
  role: string;
  email: string;
};

/** Fails closed on anything but a live, unconsumed, still-pending invite. */
export async function findPendingInvitationByTokenHash(
  db: Db,
  tokenHash: string,
): Promise<PendingInvitation | undefined> {
  const [row] = await db
    .select({
      membershipId: organizationMemberships.id,
      organizationId: organizations.id,
      organizationName: organizations.name,
      role: organizationMemberships.role,
      status: organizationMemberships.status,
      email: users.email,
      expiresAt: invitationTokens.expiresAt,
      consumedAt: invitationTokens.consumedAt,
    })
    .from(invitationTokens)
    .innerJoin(
      organizationMemberships,
      eq(organizationMemberships.id, invitationTokens.membershipId),
    )
    .innerJoin(
      organizations,
      eq(organizations.id, organizationMemberships.organizationId),
    )
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(eq(invitationTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) return undefined;
  if (row.consumedAt) return undefined;
  if (row.expiresAt.getTime() < Date.now()) return undefined;
  if (row.status !== "invited") return undefined;

  return {
    membershipId: row.membershipId,
    organizationId: asOrganizationId(row.organizationId),
    organizationName: row.organizationName,
    role: row.role,
    email: row.email,
  };
}

/**
 * Accepting the emailed link is the proof of email ownership (the same
 * trust boundary as clicking a verification link) — sets real
 * credentials, activates the membership, and marks the account verified
 * in one transaction.
 */
export async function acceptInvitation(
  db: Db,
  tokenHash: string,
  input: { firstName: string; lastName: string; passwordHash: string },
): Promise<{ userId: string; organizationId: OrganizationId } | undefined> {
  const pending = await findPendingInvitationByTokenHash(db, tokenHash);
  if (!pending) return undefined;

  return db.transaction(async (tx) => {
    const [membership] = await tx
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.id, pending.membershipId))
      .limit(1);
    if (!membership) return undefined;

    await tx
      .update(users)
      .set({
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash: input.passwordHash,
        emailVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, membership.userId));

    await tx
      .update(organizationMemberships)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(organizationMemberships.id, membership.id));

    await tx
      .update(invitationTokens)
      .set({ consumedAt: new Date() })
      .where(eq(invitationTokens.tokenHash, tokenHash));

    return {
      userId: membership.userId,
      organizationId: asOrganizationId(membership.organizationId),
    };
  });
}
