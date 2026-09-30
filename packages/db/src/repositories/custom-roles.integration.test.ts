import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { organizationMemberships, organizations, users } from "../schema/index";
import { asOrganizationId } from "./tenant-scope";
import {
  createCustomRole,
  deleteCustomRole,
  getCustomRole,
  listCustomRolesForOrganization,
  updateCustomRole,
} from "./custom-roles";

/**
 * docs/product/FEATURE_MATRIX.md P2 "RBAC custom roles" / ADR-005 — a
 * real Postgres instance (docs/testing/TEST_STRATEGY.md integration
 * tier), since the whole point of this table is being the thing
 * `getOrgContext` (apps/web/src/lib/tenant.ts) trusts to resolve a
 * membership's permissions; a typo here would silently over- or
 * under-grant access exactly like resolveApiKeyAuth's own tests guard
 * against.
 */
describe("custom roles repository (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let memberUserId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Custom Roles Test Co", slug: `custom-roles-test-${Date.now()}` })
      .returning();
    if (!org) throw new Error("failed to create test organization");
    organizationId = asOrganizationId(org.id);

    const [member] = await db
      .insert(users)
      .values({
        email: `custom-roles-test-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "Custom",
        lastName: "Role Holder",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!member) throw new Error("failed to create test user");
    memberUserId = member.id;
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, organizationId));
    await db.delete(users).where(eq(users.id, memberUserId));
  });

  it("creates a role, reuses no name across a case-insensitive collision, and rejects the duplicate", async () => {
    const created = await createCustomRole(db, organizationId, {
      name: "Crisis Responder",
      permissions: ["mentions:read", "mentions:write", "alerts:read"],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");
    expect(created.role.permissions).toEqual(["mentions:read", "mentions:write", "alerts:read"]);

    const duplicate = await createCustomRole(db, organizationId, {
      name: "crisis responder",
      permissions: ["mentions:read"],
    });
    expect(duplicate).toEqual({ ok: false, reason: "name_taken" });

    const list = await listCustomRolesForOrganization(db, organizationId);
    expect(list.filter((r) => r.id === created.role.id)).toHaveLength(1);
  });

  it("looks a role up scoped to its own organization only", async () => {
    const created = await createCustomRole(db, organizationId, {
      name: "Read Only",
      permissions: ["mentions:read"],
    });
    if (!created.ok) throw new Error("unreachable");

    const found = await getCustomRole(db, organizationId, created.role.id);
    expect(found?.id).toBe(created.role.id);

    const otherOrgId = asOrganizationId("00000000-0000-0000-0000-000000000000");
    const notFound = await getCustomRole(db, otherOrgId, created.role.id);
    expect(notFound).toBeUndefined();
  });

  it("fails closed on a non-uuid role id rather than letting the database throw", async () => {
    const found = await getCustomRole(db, organizationId, "organization_owner");
    expect(found).toBeUndefined();
  });

  it("updates a role's name and permissions, rejecting a rename onto another role's name", async () => {
    const first = await createCustomRole(db, organizationId, {
      name: "Analyst Lite",
      permissions: ["mentions:read"],
    });
    const second = await createCustomRole(db, organizationId, {
      name: "Analyst Heavy",
      permissions: ["mentions:read", "mentions:write"],
    });
    if (!first.ok || !second.ok) throw new Error("unreachable");

    const renamedOntoTaken = await updateCustomRole(db, organizationId, second.role.id, {
      name: "Analyst Lite",
      permissions: ["mentions:read"],
    });
    expect(renamedOntoTaken).toEqual({ ok: false, reason: "name_taken" });

    const updated = await updateCustomRole(db, organizationId, second.role.id, {
      name: "Analyst Heavy Plus",
      permissions: ["mentions:read", "mentions:write", "reports:read"],
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) throw new Error("unreachable");
    expect(updated.role.name).toBe("Analyst Heavy Plus");
    expect(updated.role.permissions).toEqual(["mentions:read", "mentions:write", "reports:read"]);
  });

  it("returns not_found when updating or deleting a role outside the organization", async () => {
    const created = await createCustomRole(db, organizationId, {
      name: "Isolation Check",
      permissions: ["mentions:read"],
    });
    if (!created.ok) throw new Error("unreachable");
    const otherOrgId = asOrganizationId("00000000-0000-0000-0000-000000000000");

    const updateResult = await updateCustomRole(db, otherOrgId, created.role.id, {
      name: "Hijacked",
      permissions: ["mentions:read"],
    });
    expect(updateResult).toEqual({ ok: false, reason: "not_found" });

    const deleteResult = await deleteCustomRole(db, otherOrgId, created.role.id);
    expect(deleteResult).toBe("not_found");
  });

  it("blocks deleting a role that a non-revoked member still holds, then allows it once unassigned", async () => {
    const created = await createCustomRole(db, organizationId, {
      name: "In Use Role",
      permissions: ["mentions:read"],
    });
    if (!created.ok) throw new Error("unreachable");

    const [membership] = await db
      .insert(organizationMemberships)
      .values({ organizationId, userId: memberUserId, role: created.role.id, status: "active" })
      .returning();
    if (!membership) throw new Error("failed to create test membership");

    const blocked = await deleteCustomRole(db, organizationId, created.role.id);
    expect(blocked).toBe("in_use");

    await db
      .update(organizationMemberships)
      .set({ role: "viewer" })
      .where(eq(organizationMemberships.id, membership.id));

    const deleted = await deleteCustomRole(db, organizationId, created.role.id);
    expect(deleted).toBe("ok");
  });
});
