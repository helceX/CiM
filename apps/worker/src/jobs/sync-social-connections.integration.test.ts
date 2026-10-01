import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  asOrganizationId,
  db,
  listNotifications,
  listSocialConnections,
  listSocialEvents,
  saveSocialConnection,
  schema,
} from "@cim/db";
import { encryptSecret, mockSocialProvider, SOCIAL_PROVIDERS } from "@cim/ingestion";
import { processSyncSocialConnectionsJob } from "./sync-social-connections";

/**
 * Integration test against real Postgres with the built-in demo network: a
 * connected account is polled, new posts become events + notifications that
 * link to the post, a repeat poll adds nothing, and a rejected grant flips the
 * connection to "needs reconnect" and tells the person who connected it.
 */
const SECRET = "test-secret-test-secret-test-secret-xx";
const env = { SESSION_SECRET: SECRET, SOCIAL_MOCK_PROVIDER: "1" };

describe("processSyncSocialConnectionsJob (integration)", () => {
  const unique = `${Date.now()}`;
  let orgId: ReturnType<typeof asOrganizationId>;
  let otherOrgId: ReturnType<typeof asOrganizationId>;
  let userId: string;

  beforeAll(async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Social Sync Co", slug: `social-sync-${unique}` }).returning();
    const [other] = await db.insert(schema.organizations).values({ name: "Other Co", slug: `social-sync-other-${unique}` }).returning();
    const [user] = await db
      .insert(schema.users)
      .values({ email: `social-sync-${unique}@example.com`, passwordHash: "x", firstName: "S", lastName: "S" })
      .returning();
    if (!org || !other || !user) throw new Error("setup failed");
    orgId = asOrganizationId(org.id);
    otherOrgId = asOrganizationId(other.id);
    userId = user.id;
  });

  afterAll(async () => {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    await db.delete(schema.organizations).where(eq(schema.organizations.id, otherOrgId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  const connect = (organization: typeof orgId, accessToken = "mock-access") =>
    saveSocialConnection(db, organization, {
      platform: "mock",
      externalAccountId: "mock-account",
      handle: "@mediaory_demo",
      accessTokenEnc: encryptSecret(accessToken, SECRET),
      refreshTokenEnc: encryptSecret("mock-refresh", SECRET),
      scopes: "mock",
      connectedByUserId: userId,
    });

  it("is only ever run for configured providers", () => {
    expect(mockSocialProvider.isConfigured({})).toBe(false);
    expect(SOCIAL_PROVIDERS.map((provider) => provider.key)).toContain("mock");
  });

  it("stores new posts, links the notification to the post, and does not repeat on the next poll", async () => {
    await connect(orgId);
    await processSyncSocialConnectionsJob({ env });

    const events = await listSocialEvents(db, orgId);
    expect(events.map((event) => event.externalId).sort()).toEqual(["mock-1", "mock-2"]);

    const notes = await listNotifications(db, orgId, userId);
    expect(notes).toHaveLength(2);
    expect(notes.map((note) => note.linkUrl).sort()).toEqual([
      "https://social.example/someone/status/1",
      "https://social.example/watch/2#comment",
    ]);
    expect(notes.every((note) => note.kind === "alert")).toBe(true);

    const [connection] = await listSocialConnections(db, orgId);
    expect(connection?.status).toBe("active");
    expect(connection?.lastSyncAt).not.toBeNull();

    // Not due again yet, and even when forced the unique key drops repeats.
    await processSyncSocialConnectionsJob({ env, now: () => new Date(Date.now() + 10 * 60_000) });
    expect(await listSocialEvents(db, orgId)).toHaveLength(2);
    expect(await listNotifications(db, orgId, userId)).toHaveLength(2);
  });

  it("keeps each organization's events to itself", async () => {
    await connect(otherOrgId);
    await processSyncSocialConnectionsJob({ env });
    expect(await listSocialEvents(db, otherOrgId)).toHaveLength(2);
    expect(await listSocialEvents(db, orgId)).toHaveLength(2);
  });

  it("asks the person to reconnect when the stored credentials are unreadable", async () => {
    await saveSocialConnection(db, orgId, {
      platform: "mock",
      externalAccountId: "mock-account",
      handle: "@mediaory_demo",
      accessTokenEnc: "v1.garbage.garbage.garbage",
      scopes: "mock",
      connectedByUserId: userId,
    });
    await db.update(schema.socialConnections).set({ lastSyncAt: new Date(Date.now() - 3_600_000) }).where(eq(schema.socialConnections.organizationId, orgId));
    await processSyncSocialConnectionsJob({ env });

    const [connection] = await listSocialConnections(db, orgId);
    expect(connection?.status).toBe("needs_reauth");
    const notes = await listNotifications(db, orgId, userId);
    expect(notes.some((note) => note.title === "Reconnect @mediaory_demo" && note.linkUrl === "/settings")).toBe(true);

    // A connection waiting for the customer is left alone — no polling, no repeat notification.
    const before = (await listNotifications(db, orgId, userId)).length;
    await processSyncSocialConnectionsJob({ env, now: () => new Date(Date.now() + 3_600_000) });
    expect((await listNotifications(db, orgId, userId)).length).toBe(before);
  });
});
