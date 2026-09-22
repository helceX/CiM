import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { organizations } from "../schema/organizations";
import { users } from "../schema/users";
import {
  createApiKey,
  listApiKeys,
  resolveApiKeyByRawKey,
  revokeApiKey,
  touchApiKeyLastUsed,
} from "./api-keys";
import { asOrganizationId } from "./tenant-scope";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) against real Postgres
 * — docs/architecture/SECURITY.md §83: the raw secret is returned exactly
 * once, only its hash is ever stored, and a revoked key stops resolving
 * immediately.
 */
describe("api-keys repository (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let userId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "API Key Repo Test Co", slug: `api-key-repo-test-${Date.now()}` })
      .returning();
    if (!org) throw new Error("failed to create test organization");
    organizationId = asOrganizationId(org.id);

    const [user] = await db
      .insert(users)
      .values({
        email: `api-key-repo-test-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "Key",
        lastName: "Creator",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!user) throw new Error("failed to create test user");
    userId = user.id;
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, organizationId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("creates a key, returns the raw secret once, and never includes it in the list", async () => {
    const { rawKey, summary } = await createApiKey(db, organizationId, {
      name: "Test key",
      scopes: ["mentions:read", "reports:read"],
      createdByUserId: userId,
    });
    expect(rawKey).toMatch(/^cim_/);
    expect(summary.name).toBe("Test key");
    expect(summary.scopes.sort()).toEqual(["mentions:read", "reports:read"]);

    const list = await listApiKeys(db, organizationId);
    const listed = list.find((k) => k.id === summary.id);
    expect(listed).toBeDefined();
    expect(listed).not.toHaveProperty("hashedSecret");
  });

  it("resolves a key by its raw value and rejects a wrong one", async () => {
    const { rawKey } = await createApiKey(db, organizationId, {
      name: "Resolve test key",
      scopes: ["mentions:read"],
      createdByUserId: userId,
    });

    const resolved = await resolveApiKeyByRawKey(db, rawKey);
    expect(resolved?.organizationId).toBe(organizationId);
    expect(resolved?.scopes).toEqual(["mentions:read"]);

    const notResolved = await resolveApiKeyByRawKey(db, "cim_not-a-real-key");
    expect(notResolved).toBeNull();
  });

  it("stops resolving a revoked key", async () => {
    const { rawKey, summary } = await createApiKey(db, organizationId, {
      name: "To be revoked",
      scopes: ["mentions:read"],
      createdByUserId: userId,
    });
    expect(await resolveApiKeyByRawKey(db, rawKey)).not.toBeNull();

    const revoked = await revokeApiKey(db, organizationId, summary.id);
    expect(revoked).toBe(true);
    expect(await resolveApiKeyByRawKey(db, rawKey)).toBeNull();

    const list = await listApiKeys(db, organizationId);
    expect(list.find((k) => k.id === summary.id)?.revokedAt).not.toBeNull();
  });

  it("does not let one organization revoke another organization's key", async () => {
    const { summary } = await createApiKey(db, organizationId, {
      name: "Cross-tenant target",
      scopes: ["mentions:read"],
      createdByUserId: userId,
    });
    const otherOrgId = asOrganizationId("00000000-0000-0000-0000-000000000000");

    const revoked = await revokeApiKey(db, otherOrgId, summary.id);
    expect(revoked).toBe(false);

    const list = await listApiKeys(db, organizationId);
    expect(list.find((k) => k.id === summary.id)?.revokedAt).toBeNull();
  });

  it("records when a key was last used", async () => {
    const { summary } = await createApiKey(db, organizationId, {
      name: "Last-used test key",
      scopes: ["mentions:read"],
      createdByUserId: userId,
    });
    expect(summary.lastUsedAt).toBeNull();

    await touchApiKeyLastUsed(db, summary.id);

    const list = await listApiKeys(db, organizationId);
    expect(list.find((k) => k.id === summary.id)?.lastUsedAt).not.toBeNull();
  });
});
