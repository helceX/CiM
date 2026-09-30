import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { users } from "../schema/index";
import { createSession, getActiveSession, revokeSession } from "./auth";

/**
 * docs/testing/TEST_STRATEGY.md security suite — "session fixation" is an
 * explicit, named item. ADR-005: session ids are server-generated
 * (`sessions.id` defaults to a random UUID; `createSession`'s input type
 * has no `id` field at all) and a fresh row is created on every login —
 * never a client-supplied id accepted, never an existing session reused
 * across a privilege boundary. This proves that by construction, not by
 * inspection.
 */
describe("session fixation safety (integration)", () => {
  let userId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: `session-fixation-test-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "Session",
        lastName: "Tester",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!user) throw new Error("failed to create test user");
    userId = user.id;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  it("issues a fresh, unpredictable session id on every login — never reused", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const first = await createSession(db, { userId, expiresAt });
    const second = await createSession(db, { userId, expiresAt });

    expect(first.id).not.toBe(second.id);
    // A UUID, not a short/guessable/sequential token.
    expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("revoking one session never invalidates another session for the same user", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const sessionA = await createSession(db, { userId, expiresAt });
    const sessionB = await createSession(db, { userId, expiresAt });

    await revokeSession(db, sessionA.id);

    expect(await getActiveSession(db, sessionA.id)).toBeUndefined();
    expect(await getActiveSession(db, sessionB.id)).toBeDefined();
  });

  it("an expired session is never returned as active, even if never explicitly revoked", async () => {
    const alreadyExpired = new Date(Date.now() - 1000);
    const session = await createSession(db, { userId, expiresAt: alreadyExpired });

    expect(await getActiveSession(db, session.id)).toBeUndefined();
  });

  it("a random guessed session id never resolves to any real session", async () => {
    expect(await getActiveSession(db, "00000000-0000-0000-0000-000000000000")).toBeUndefined();
  });
});
