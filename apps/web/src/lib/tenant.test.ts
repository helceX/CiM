import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { asOrganizationId, createApiKey, db, schema } from "@cim/db";
import { resolveApiKeyAuth } from "./tenant";

function bearerRequest(rawKey: string): Request {
  return new Request("https://example.test/api/mentions/some-id", {
    headers: { authorization: `Bearer ${rawKey}` },
  });
}

/**
 * docs/architecture/SECURITY.md §83 "same authorization path as
 * session-based requests" — real Postgres (the integration tier), since
 * this is exactly the kind of check that must fail closed: a typo in the
 * scope-membership logic here would silently over- or under-grant access.
 */
describe("resolveApiKeyAuth (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let userId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(schema.organizations)
      .values({ name: "API Key Test Co", slug: `api-key-test-${Date.now()}` })
      .returning();
    if (!org) throw new Error("failed to create test organization");
    organizationId = asOrganizationId(org.id);

    const [user] = await db
      .insert(schema.users)
      .values({
        email: `api-key-test-${Date.now()}@example.com`,
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
    await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  it("resolves a valid key whose scopes include the required permission", async () => {
    const { rawKey } = await createApiKey(db, organizationId, {
      name: "Read-only key",
      scopes: ["mentions:read"],
      createdByUserId: userId,
    });

    const result = await resolveApiKeyAuth(bearerRequest(rawKey), "mentions:read");
    expect(result).toEqual({ organizationId });
  });

  it("returns null when the key's scopes don't include the required permission", async () => {
    const { rawKey } = await createApiKey(db, organizationId, {
      name: "Reports-only key",
      scopes: ["reports:read"],
      createdByUserId: userId,
    });

    const result = await resolveApiKeyAuth(bearerRequest(rawKey), "mentions:read");
    expect(result).toBeNull();
  });

  it("returns null for a revoked key, even with the right scope", async () => {
    const { rawKey, summary } = await createApiKey(db, organizationId, {
      name: "Soon-revoked key",
      scopes: ["mentions:read"],
      createdByUserId: userId,
    });
    await db
      .update(schema.apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(schema.apiKeys.id, summary.id));

    const result = await resolveApiKeyAuth(bearerRequest(rawKey), "mentions:read");
    expect(result).toBeNull();
  });

  it("returns null for a garbage bearer token, never throwing", async () => {
    const result = await resolveApiKeyAuth(bearerRequest("not-a-real-key"), "mentions:read");
    expect(result).toBeNull();
  });

  it("returns null when there is no Authorization header at all", async () => {
    const result = await resolveApiKeyAuth(
      new Request("https://example.test/api/mentions/some-id"),
      "mentions:read",
    );
    expect(result).toBeNull();
  });
});
