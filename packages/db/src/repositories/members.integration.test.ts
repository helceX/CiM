import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { generateRawToken, hashToken } from "@cim/core";
import { db } from "../client";
import { organizationMemberships, organizations, users } from "../schema/index";
import { softDeleteOrganization } from "./privacy";
import { asOrganizationId } from "./tenant-scope";
import { createCustomRole } from "./custom-roles";
import {
  acceptInvitation,
  findPendingInvitationByTokenHash,
  inviteMember,
  listMembersForOrganization,
  revokeMembership,
  updateMemberRole,
} from "./members";

describe("members repository (integration)", () => {
  let orgId: ReturnType<typeof asOrganizationId>;
  let ownerUserId: string;
  let coOwnerMembershipId: string;
  let analystMembershipId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Members Test Co", slug: `members-test-${Date.now()}` })
      .returning();
    if (!org) throw new Error("failed to create test organization");
    orgId = asOrganizationId(org.id);

    const [owner] = await db
      .insert(users)
      .values({
        email: `members-owner-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "Owner",
        lastName: "User",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!owner) throw new Error("failed to create test user");
    ownerUserId = owner.id;
    await db.insert(organizationMemberships).values({
      organizationId: orgId,
      userId: ownerUserId,
      role: "organization_owner",
      status: "active",
    });

    // A second, active owner — needed so the sole-owner protection has
    // something to actually distinguish (demoting/revoking THIS one is
    // allowed; the org still has the first owner).
    const [coOwner] = await db
      .insert(users)
      .values({
        email: `members-coowner-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "CoOwner",
        lastName: "User",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!coOwner) throw new Error("failed to create test user");
    const [coOwnerMembership] = await db
      .insert(organizationMemberships)
      .values({
        organizationId: orgId,
        userId: coOwner.id,
        role: "organization_owner",
        status: "active",
      })
      .returning();
    if (!coOwnerMembership) throw new Error("failed to create test membership");
    coOwnerMembershipId = coOwnerMembership.id;

    const [analystUser] = await db
      .insert(users)
      .values({
        email: `members-analyst-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "Analyst",
        lastName: "User",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!analystUser) throw new Error("failed to create test user");
    const [analystMembership] = await db
      .insert(organizationMemberships)
      .values({
        organizationId: orgId,
        userId: analystUser.id,
        role: "analyst",
        status: "active",
      })
      .returning();
    if (!analystMembership) throw new Error("failed to create test membership");
    analystMembershipId = analystMembership.id;
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it("invites a member: creates an unverified user with a sentinel password and an invited membership", async () => {
    const email = `invitee-${Date.now()}@example.com`;
    const rawToken = generateRawToken();
    const result = await inviteMember(db, orgId, {
      email,
      role: "viewer",
      invitedByUserId: ownerUserId,
      tokenHash: hashToken(rawToken),
      tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const [user] = await db.select().from(users).where(eq(users.id, result.userId));
    expect(user?.emailVerifiedAt).toBeNull();
    expect(user?.email).toBe(email);

    const [membership] = await db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.id, result.membershipId));
    expect(membership?.status).toBe("invited");
    expect(membership?.role).toBe("viewer");
    expect(membership?.invitedByUserId).toBe(ownerUserId);
  });

  it("lists active and invited members, excluding revoked ones", async () => {
    const members = await listMembersForOrganization(db, orgId);
    const roles = members.map((m) => m.role).sort();
    expect(roles).toContain("organization_owner");
    expect(roles).toContain("analyst");
    expect(members.every((m) => m.status !== "revoked")).toBe(true);
  });

  it("resolves a custom role's name for a member assigned to it, and null for a fixed role", async () => {
    const customRole = await createCustomRole(db, orgId, {
      name: "Spokesperson",
      permissions: ["mentions:read"],
    });
    if (!customRole.ok) throw new Error("unreachable");
    await updateMemberRole(db, orgId, analystMembershipId, customRole.role.id);

    const members = await listMembersForOrganization(db, orgId);
    const customRoleMember = members.find((m) => m.membershipId === analystMembershipId);
    expect(customRoleMember?.role).toBe(customRole.role.id);
    expect(customRoleMember?.customRoleName).toBe("Spokesperson");

    const ownerMember = members.find((m) => m.role === "organization_owner");
    expect(ownerMember?.customRoleName).toBeNull();

    // Restore for any later test relying on analystMembershipId's fixed role.
    await updateMemberRole(db, orgId, analystMembershipId, "analyst");
  });

  it("blocks demoting the organization's sole active owner", async () => {
    // With two active owners right now, demoting one is fine...
    const allowed = await updateMemberRole(
      db,
      orgId,
      coOwnerMembershipId,
      "communications_manager",
    );
    expect(allowed).toEqual({ ok: true });

    // ...which leaves exactly one — demoting *that* one must be blocked.
    const [ownerMembership] = await db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.userId, ownerUserId));
    if (!ownerMembership) throw new Error("owner membership not found");

    const blocked = await updateMemberRole(db, orgId, ownerMembership.id, "analyst");
    expect(blocked).toEqual({ ok: false, error: "sole_owner" });

    const [stillOwner] = await db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.id, ownerMembership.id));
    expect(stillOwner?.role).toBe("organization_owner");
  });

  it("allows revoking a non-owner member and blocks revoking the sole owner", async () => {
    const revoked = await revokeMembership(db, orgId, analystMembershipId);
    expect(revoked.ok).toBe(true);

    const [membership] = await db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.id, analystMembershipId));
    expect(membership?.status).toBe("revoked");

    const [ownerMembership] = await db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.userId, ownerUserId));
    if (!ownerMembership) throw new Error("owner membership not found");

    const blocked = await revokeMembership(db, orgId, ownerMembership.id);
    expect(blocked).toEqual({ ok: false, error: "sole_owner" });
  });

  it("accepts a valid invitation: activates credentials, membership, and consumes the token", async () => {
    const email = `accept-me-${Date.now()}@example.com`;
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const invited = await inviteMember(db, orgId, {
      email,
      role: "viewer",
      invitedByUserId: ownerUserId,
      tokenHash,
      tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const pending = await findPendingInvitationByTokenHash(db, tokenHash);
    expect(pending?.membershipId).toBe(invited.membershipId);
    expect(pending?.email).toBe(email);
    expect(pending?.organizationId).toBe(orgId);

    const accepted = await acceptInvitation(db, tokenHash, {
      firstName: "Real",
      lastName: "Name",
      passwordHash: "real-hash-from-scrypt",
    });
    expect(accepted).toEqual({ userId: invited.userId, organizationId: orgId });

    const [user] = await db.select().from(users).where(eq(users.id, invited.userId));
    expect(user?.firstName).toBe("Real");
    expect(user?.passwordHash).toBe("real-hash-from-scrypt");
    expect(user?.emailVerifiedAt).toBeInstanceOf(Date);

    const [membership] = await db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.id, invited.membershipId));
    expect(membership?.status).toBe("active");

    // The token is single-use — a second accept with the same token fails.
    const secondAttempt = await findPendingInvitationByTokenHash(db, tokenHash);
    expect(secondAttempt).toBeUndefined();
  });

  it("rejects an expired invitation token", async () => {
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    await inviteMember(db, orgId, {
      email: `expired-${Date.now()}@example.com`,
      role: "viewer",
      invitedByUserId: ownerUserId,
      tokenHash,
      tokenExpiresAt: new Date(Date.now() - 1000), // already expired
    });

    expect(await findPendingInvitationByTokenHash(db, tokenHash)).toBeUndefined();
  });

  it("rejects a nonexistent token", async () => {
    expect(
      await findPendingInvitationByTokenHash(db, hashToken("nonexistent-token")),
    ).toBeUndefined();
  });

  it("rejects an invitation to an organization that's since been soft-deleted", async () => {
    // Regression: accepting into a deleted org previously succeeded, then
    // left the invitee "logged in but nothing works" since every
    // org-scoped query filters isNull(organizations.deletedAt) — this
    // must fail clearly at the invitation step instead.
    const [orgToDelete] = await db
      .insert(organizations)
      .values({ name: "Soon Deleted Org", slug: `soon-deleted-${Date.now()}` })
      .returning();
    if (!orgToDelete) throw new Error("failed to create org-to-delete");
    const orgToDeleteId = asOrganizationId(orgToDelete.id);

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    await inviteMember(db, orgToDeleteId, {
      email: `invited-to-deleted-org-${Date.now()}@example.com`,
      role: "viewer",
      invitedByUserId: ownerUserId,
      tokenHash,
      tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await softDeleteOrganization(db, orgToDeleteId);

    expect(await findPendingInvitationByTokenHash(db, tokenHash)).toBeUndefined();

    await db.delete(organizations).where(eq(organizations.id, orgToDeleteId));
  });
});
