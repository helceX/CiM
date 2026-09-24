import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { hashToken } from "@cim/core";
import { db, anonymizeUser, createEmailVerificationToken, schema } from "@cim/db";

const { users } = schema;

// Real Postgres for everything else (this is otherwise an integration
// test, same rationale as ../reset-password/route.integration.test.ts)
// — only createUserSession is mocked, since it calls next/headers'
// cookies(), which needs a real Next.js request context this test
// harness doesn't provide. What's under test (whether a deleted user's
// token still reaches markUserVerified/createUserSession at all) is
// fully covered by asserting on this mock's call count.
const createUserSession = vi.fn();
vi.mock("@/lib/session", () => ({
  createUserSession: (...args: unknown[]) => createUserSession(...args),
}));

const { POST } = await import("./route");

/**
 * Integration test against real Postgres — same rationale as the
 * sibling ../reset-password/route.integration.test.ts. Regression: this
 * route consumed a valid (unconsumed, unexpired) verification token and
 * called markUserVerified + createUserSession with no check that the
 * token's target user hadn't been soft-deleted after the token was
 * issued — the exact invariant reset-password.ts enforces (and
 * getCurrentUser applies to sessions) was missing here.
 */
describe("POST /api/auth/verify-email (integration)", () => {
  let activeUserId: string;
  let deletedUserId: string;

  function makeRequest(token: string): Request {
    return new Request("http://localhost/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  }

  beforeAll(async () => {
    const [activeUser] = await db
      .insert(users)
      .values({
        email: `verify-email-active-${Date.now()}@example.com`,
        passwordHash: "original-hash",
        firstName: "Active",
        lastName: "User",
      })
      .returning();
    if (!activeUser) throw new Error("failed to create active test user");
    activeUserId = activeUser.id;

    const [targetUser] = await db
      .insert(users)
      .values({
        email: `verify-email-deleted-${Date.now()}@example.com`,
        passwordHash: "original-hash",
        firstName: "To Be Deleted",
        lastName: "User",
      })
      .returning();
    if (!targetUser) throw new Error("failed to create to-be-deleted test user");
    deletedUserId = targetUser.id;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, activeUserId));
    await db.delete(users).where(eq(users.id, deletedUserId));
  });

  it("verifies the email and creates a session for an active user", async () => {
    const rawToken = "active-user-verify-token";
    await createEmailVerificationToken(db, {
      userId: activeUserId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const response = await POST(makeRequest(rawToken));
    expect(response.status).toBe(200);
    expect(createUserSession).toHaveBeenCalledWith(activeUserId, expect.anything());

    const [row] = await db.select().from(users).where(eq(users.id, activeUserId));
    expect(row?.emailVerifiedAt).not.toBeNull();
  });

  it("rejects a verification token whose user was deleted after the token was issued", async () => {
    const rawToken = "deleted-user-verify-token";
    await createEmailVerificationToken(db, {
      userId: deletedUserId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    // The account is deleted (anonymized) *after* the token was issued —
    // the realistic ordering this bug depends on.
    await anonymizeUser(db, deletedUserId);

    const response = await POST(makeRequest(rawToken));
    expect(response.status).toBe(400);
    expect(createUserSession).not.toHaveBeenCalled();

    const [row] = await db.select().from(users).where(eq(users.id, deletedUserId));
    // Must not stamp a fresh emailVerifiedAt onto an anonymized row.
    expect(row?.emailVerifiedAt).toBeNull();
  });
});
