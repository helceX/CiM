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

  it("lets exactly one of several simultaneous requests use a link", async () => {
    const rawToken = "concurrent-reset-token";
    await createPasswordResetToken(db, {
      userId: activeUserId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, i) => POST(makeRequest(rawToken, `NewPassw0rd!${i}`))),
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 400)).toHaveLength(5);
  });

  it("a successful reset also burns the user's other outstanding reset links and revokes sessions", async () => {
    const older = "older-reset-token";
    const newer = "newer-reset-token";
    for (const token of [older, newer]) {
      await createPasswordResetToken(db, {
        userId: activeUserId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
    }
    const [session] = await db
      .insert(schema.sessions)
      .values({ userId: activeUserId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) })
      .returning();

    expect((await POST(makeRequest(newer, "NewPassw0rd!"))).status).toBe(200);
    expect((await POST(makeRequest(older, "AttackerPassw0rd!"))).status).toBe(400);

    const [after] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, session!.id));
    expect(after?.revokedAt).not.toBeNull();
  });

  it("rejects an expired or unknown link", async () => {
    const rawToken = "expired-reset-token";
    await createPasswordResetToken(db, {
      userId: activeUserId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() - 1000),
    });
    expect((await POST(makeRequest(rawToken, "NewPassw0rd!"))).status).toBe(400);
    expect((await POST(makeRequest("never-issued-token", "NewPassw0rd!"))).status).toBe(400);
  });
});
