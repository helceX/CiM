import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../client";
import { auditLogs } from "../schema/audit";
import { organizationMemberships, organizations, users } from "../schema/index";
import { asOrganizationId } from "./tenant-scope";
import {
  anonymizeUser,
  deleteUserAccount,
  exportAccountData,
  listMembershipOrganizationIdsForAudit,
  listSoleOwnedOrganizations,
  softDeleteOrganization,
  softDeleteOrganizationWithAuditLog,
} from "./privacy";

describe("privacy repository (integration)", () => {
  let soleOwnedOrgId: ReturnType<typeof asOrganizationId>;
  let sharedOrgId: ReturnType<typeof asOrganizationId>;
  let toDeleteOrgId: ReturnType<typeof asOrganizationId>;
  let soleOwnerUserId: string;
  let coOwnerUserId: string;
  let anonymizeTargetUserId: string;

  beforeAll(async () => {
    const [soleOwnedOrg] = await db
      .insert(organizations)
      .values({ name: "Sole Owned Org", slug: `sole-owned-${Date.now()}` })
      .returning();
    const [sharedOrg] = await db
      .insert(organizations)
      .values({ name: "Shared Org", slug: `shared-${Date.now()}` })
      .returning();
    const [toDeleteOrg] = await db
      .insert(organizations)
      .values({ name: "To Delete Org", slug: `to-delete-${Date.now()}` })
      .returning();
    if (!soleOwnedOrg || !sharedOrg || !toDeleteOrg) {
      throw new Error("failed to create test organizations");
    }
    soleOwnedOrgId = asOrganizationId(soleOwnedOrg.id);
    sharedOrgId = asOrganizationId(sharedOrg.id);
    toDeleteOrgId = asOrganizationId(toDeleteOrg.id);

    const [soleOwner] = await db
      .insert(users)
      .values({
        email: `sole-owner-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "Sole",
        lastName: "Owner",
        jobTitle: "Founder",
        emailVerifiedAt: new Date(),
      })
      .returning();
    const [coOwner] = await db
      .insert(users)
      .values({
        email: `co-owner-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "Co",
        lastName: "Owner",
        emailVerifiedAt: new Date(),
      })
      .returning();
    const [anonymizeTarget] = await db
      .insert(users)
      .values({
        email: `to-anonymize-${Date.now()}@example.com`,
        passwordHash: "real-hash-before-anonymization",
        firstName: "Real",
        lastName: "Name",
        jobTitle: "VP of Marketing",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!soleOwner || !coOwner || !anonymizeTarget)
      throw new Error("failed to create test users");
    soleOwnerUserId = soleOwner.id;
    coOwnerUserId = coOwner.id;
    anonymizeTargetUserId = anonymizeTarget.id;

    // soleOwner is the *only* active owner of soleOwnedOrg.
    await db.insert(organizationMemberships).values({
      organizationId: soleOwnedOrgId,
      userId: soleOwnerUserId,
      role: "organization_owner",
      status: "active",
    });

    // soleOwner and coOwner both own sharedOrg — neither is a sole owner there.
    await db.insert(organizationMemberships).values({
      organizationId: sharedOrgId,
      userId: soleOwnerUserId,
      role: "organization_owner",
      status: "active",
    });
    await db.insert(organizationMemberships).values({
      organizationId: sharedOrgId,
      userId: coOwnerUserId,
      role: "organization_owner",
      status: "active",
    });

    // anonymizeTarget is a plain member (not owner) of toDeleteOrg, and its
    // export test data.
    await db.insert(organizationMemberships).values({
      organizationId: toDeleteOrgId,
      userId: anonymizeTargetUserId,
      role: "member",
      status: "active",
    });
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, soleOwnedOrgId));
    await db.delete(organizations).where(eq(organizations.id, sharedOrgId));
    await db.delete(organizations).where(eq(organizations.id, toDeleteOrgId));
  });

  it("flags a user as a sole owner only of the org they exclusively own", async () => {
    const soleOwnerBlocking = await listSoleOwnedOrganizations(db, soleOwnerUserId);
    expect(soleOwnerBlocking.map((row) => row.organizationId)).toEqual([
      soleOwnedOrgId,
    ]);

    const coOwnerBlocking = await listSoleOwnedOrganizations(db, coOwnerUserId);
    expect(coOwnerBlocking).toEqual([]);
  });

  it("soft-deletes an organization by setting deletedAt, without removing the row", async () => {
    await softDeleteOrganization(db, toDeleteOrgId);
    const [row] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, toDeleteOrgId));
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });

  it("softDeleteOrganizationWithAuditLog soft-deletes and records the audit entry together", async () => {
    // Regression: the route used to call softDeleteOrganization and
    // recordAuditLog as two separate statements — a failure between them
    // could leave an organization fully deleted with no audit entry
    // recording it. This combined function wraps both in one transaction,
    // the same pattern deleteUserAccount already uses for its own
    // multi-step invariant.
    const [org] = await db
      .insert(organizations)
      .values({ name: "Atomic Delete Org", slug: `atomic-delete-org-${Date.now()}` })
      .returning();
    if (!org) throw new Error("failed to create test organization");
    const orgId = asOrganizationId(org.id);

    try {
      await softDeleteOrganizationWithAuditLog(db, orgId, soleOwnerUserId);

      const [row] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId));
      expect(row?.deletedAt).toBeInstanceOf(Date);

      const logs = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.organizationId, orgId),
            eq(auditLogs.action, "organization.deleted"),
          ),
        );
      expect(logs).toHaveLength(1);
      expect(logs[0]?.actorUserId).toBe(soleOwnerUserId);
    } finally {
      await db.delete(organizations).where(eq(organizations.id, orgId));
    }
  });

  it("anonymizes a user's PII in place and sets deletedAt, preserving the row id", async () => {
    await anonymizeUser(db, anonymizeTargetUserId);
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, anonymizeTargetUserId));
    expect(row?.id).toBe(anonymizeTargetUserId);
    expect(row?.email).toBe(`deleted-${anonymizeTargetUserId}@deleted.invalid`);
    expect(row?.firstName).toBe("Deleted");
    expect(row?.lastName).toBe("User");
    expect(row?.jobTitle).toBeNull();
    expect(row?.passwordHash).not.toBe("real-hash-before-anonymization");
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });

  it("exports only identity + membership data, never tenant content", async () => {
    const exported = await exportAccountData(db, soleOwnerUserId);
    expect(exported?.account.id).toBe(soleOwnerUserId);
    expect(exported?.account.jobTitle).toBe("Founder");
    const orgNames = exported?.memberships.map((m) => m.organizationName).sort();
    expect(orgNames).toEqual(["Shared Org", "Sole Owned Org"]);
  });

  it("returns undefined exporting a nonexistent user", async () => {
    expect(
      await exportAccountData(db, "00000000-0000-0000-0000-000000000000"),
    ).toBeUndefined();
  });

  it("still lists a membership's org id for audit even after that org is soft-deleted", async () => {
    // Regression: account deletion's own audit trail must not go silently
    // missing just because the user's only organization was deleted first
    // (e.g. owner deletes their org, then deletes their account).
    const before = await listMembershipOrganizationIdsForAudit(db, soleOwnerUserId);
    expect(before).toContain(soleOwnedOrgId);

    await softDeleteOrganization(db, soleOwnedOrgId);

    const after = await listMembershipOrganizationIdsForAudit(db, soleOwnerUserId);
    expect(after).toContain(soleOwnedOrgId);
  });

  it("revokes every membership row for the deleted user, so they stop counting as an active member", async () => {
    // Regression: deleteUserAccount used to anonymize the user and revoke
    // sessions without touching organizationMemberships at all — the
    // deleted account kept showing up as an "active" member (rendered as
    // the anonymized "Deleted User" placeholder) in every org's Settings
    // list, and kept inflating captureFeatureUsageSnapshot's usersCount,
    // forever.
    const [target] = await db
      .insert(users)
      .values({
        email: `membership-revoke-target-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "Departing",
        lastName: "Member",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!target) throw new Error("failed to create test user");

    await db.insert(organizationMemberships).values({
      organizationId: sharedOrgId,
      userId: target.id,
      role: "member",
      status: "active",
    });

    try {
      await deleteUserAccount(db, target.id, [sharedOrgId]);

      const [membership] = await db
        .select()
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, sharedOrgId),
            eq(organizationMemberships.userId, target.id),
          ),
        );
      expect(membership?.status).toBe("revoked");
    } finally {
      await db
        .delete(organizationMemberships)
        .where(eq(organizationMemberships.userId, target.id));
      await db.delete(users).where(eq(users.id, target.id));
    }
  });

  it("rolls back the whole deletion, including anonymization, if any audit-log write fails", async () => {
    // Regression: deleteUserAccount wraps anonymize + the per-org audit-log
    // loop + session revocation in one transaction specifically so a
    // failure partway through the loop (here, one bogus/nonexistent
    // organization id among several) can't leave the account anonymized
    // with only a partial audit trail — before this, each step was its own
    // statement and a mid-loop failure did exactly that.
    const [target] = await db
      .insert(users)
      .values({
        email: `atomic-delete-target-${Date.now()}@example.com`,
        passwordHash: "real-hash-before-anonymization",
        firstName: "Still",
        lastName: "Real",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!target) throw new Error("failed to create test user");

    const bogusOrgId = asOrganizationId("00000000-0000-0000-0000-000000000000");

    try {
      await expect(
        deleteUserAccount(db, target.id, [sharedOrgId, bogusOrgId]),
      ).rejects.toThrow();

      const [row] = await db.select().from(users).where(eq(users.id, target.id));
      expect(row?.deletedAt).toBeNull();
      expect(row?.email).toBe(target.email);

      const logs = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.organizationId, sharedOrgId),
            eq(auditLogs.targetId, target.id),
          ),
        );
      expect(logs).toEqual([]);
    } finally {
      await db.delete(users).where(eq(users.id, target.id));
    }
  });
});
