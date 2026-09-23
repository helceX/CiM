import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { hashToken } from "@cim/core";
import { db, anonymizeUser, createPasswordResetToken, schema } from "@cim/db";

const { users } = schema;
import { POST } from "./route";

/**
 * Integration test against a real Postgres instance, not a mocked unit
 * test — this route composes raw drizzle query-builder chains directly
 * (db.select().from(schema.users).where(...), db.transaction(...)) rather
 * than clean, individually-mockable repository functions, so a full mock
 * would mean re-implementing most of the route's own control flow. Real
 * Postgres against the actual route handler proves the behavior, not a
 * simulation of it.
 */
describe("POST /api/auth/reset-password (integration)", () => {
  let activeUserId: string;
  let deletedUserId: string;

  function makeRequest(token: string, password: string): Request {
    return new Request("http://localhost/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
  }

  beforeAll(async () => {
    const [activeUser] = await db
      .insert(users)
      .values({
        email: `reset-password-active-${Date.now()}@example.com`,
        passwordHash: "original-hash",
        firstName: "Active",
        lastName: "User",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!activeUser) throw new Error("failed to create active test user");
    activeUserId = activeUser.id;

    const [targetUser] = await db
      .insert(users)
      .values({
        email: `reset-password-deleted-${Date.now()}@example.com`,
        passwordHash: "original-hash",
        firstName: "To Be Deleted",
        lastName: "User",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!targetUser) throw new Error("failed to create to-be-deleted test user");
    deletedUserId = targetUser.id;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, activeUserId));
    await db.delete(users).where(eq(users.id, deletedUserId));
  });

  it("resets the password for an active user and consumes the token", async () => {
    const rawToken = "active-user-reset-token";
    await createPasswordResetToken(db, {
      userId: activeUserId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const response = await POST(makeRequest(rawToken, "NewPassw0rd!"));
    expect(response.status).toBe(200);

    const [row] = await db.select().from(users).where(eq(users.id, activeUserId));
    expect(row?.passwordHash).not.toBe("original-hash");
  });

  it("rejects a reset token whose user was deleted after the token was issued", async () => {
    const rawToken = "deleted-user-reset-token";
    await createPasswordResetToken(db, {
      userId: deletedUserId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    // The account is deleted (anonymized) *after* the token was issued —
    // the realistic ordering this bug depends on.
    await anonymizeUser(db, deletedUserId);

    const response = await POST(makeRequest(rawToken, "NewPassw0rd!"));
    expect(response.status).toBe(400);

    const [row] = await db.select().from(users).where(eq(users.id, deletedUserId));
    // anonymizeUser's sentinel must survive untouched — this route must
    // never overwrite it with a real, working password hash.
    expect(row?.passwordHash).toBe("deleted-account-no-login");
  });
});
