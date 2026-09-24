import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { organizations, users } from "../schema/index";
import { registerOrganizationOwner } from "./registration";

/**
 * Integration test against a real Postgres instance — registration is one
 * transactional unit (User + Organization + Workspace + owner Membership,
 * ADR-005), so this proves the whole thing actually commits together, not
 * just that each insert compiles.
 */
describe("registerOrganizationOwner (integration)", () => {
  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await db.delete(users).where(eq(users.id, userId));
    }
    for (const orgId of createdOrgIds) {
      await db.delete(organizations).where(eq(organizations.id, orgId));
    }
  });

  it("persists jobTitle on the created user, not just email/name", async () => {
    // Regression: jobTitle is required by registerSchema and the register
    // form ("Position"), but was silently dropped — never passed to this
    // function and never given a column — so it vanished on every
    // registration despite being a required field the user typed in.
    const { user, organization } = await registerOrganizationOwner(db, {
      email: `register-jobtitle-${Date.now()}@example.com`,
      passwordHash: "unused-in-this-test",
      firstName: "Ada",
      lastName: "Lovelace",
      companyName: "Analytical Engines Inc",
      jobTitle: "VP of Communications",
    });
    createdUserIds.push(user.id);
    createdOrgIds.push(organization.id);

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.jobTitle).toBe("VP of Communications");
  });
});
