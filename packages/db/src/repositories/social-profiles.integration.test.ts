import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../client";
import { socialProfiles } from "../schema/social";
import { findOrCreateSocialProfile, getSocialProfile, touchSocialProfile } from "./social-profiles";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) against a real
 * Postgres instance — proves findOrCreateSocialProfile's upsert-on-race
 * behavior against the real social_profiles_platform_external_id_uidx
 * unique index, following the exact pattern
 * articles.integration.test.ts already established for insertArticle.
 */
describe("social profiles repository (integration)", () => {
  const platform = "mock";
  const cleanupIds: string[] = [];

  afterEach(async () => {
    while (cleanupIds.length > 0) {
      const id = cleanupIds.pop();
      if (id) await db.delete(socialProfiles).where(eq(socialProfiles.id, id));
    }
  });

  it("creates a new profile when none exists for (platform, externalId)", async () => {
    const externalId = `ext-${Date.now()}`;
    const before = await getSocialProfile(db, platform, externalId);
    expect(before).toBeUndefined();

    const created = await findOrCreateSocialProfile(db, {
      platform,
      externalId,
      handle: "@newaccount",
      displayName: "New Account",
      profileUrl: null,
      followers: null,
      following: null,
      verified: null,
      accountType: null,
      language: null,
      country: null,
      avatarUrl: null,
    });
    cleanupIds.push(created.id);

    expect(created.handle).toBe("@newaccount");
    expect(created.followers).toBeNull();

    const after = await getSocialProfile(db, platform, externalId);
    expect(after?.id).toBe(created.id);
  });

  it("returns the existing row instead of throwing when findOrCreateSocialProfile loses a create race", async () => {
    // Regression pattern: simulates a concurrent ingestion job (pipeline.ts
    // runs crawlSource at concurrency:5) winning the insert first — the
    // caller's own getSocialProfile pre-check missed it, so
    // findOrCreateSocialProfile must fall back to reading the winner's row
    // rather than hitting the unique index and throwing.
    const externalId = `race-${Date.now()}`;
    const [winner] = await db
      .insert(socialProfiles)
      .values({
        platform,
        externalId,
        handle: "@winner",
        displayName: "The winning insert",
      })
      .returning();
    if (!winner) throw new Error("failed to seed the winning profile");
    cleanupIds.push(winner.id);

    const loser = await findOrCreateSocialProfile(db, {
      platform,
      externalId,
      handle: "@loser",
      displayName: "The losing insert — never actually stored",
      profileUrl: null,
      followers: null,
      following: null,
      verified: null,
      accountType: null,
      language: null,
      country: null,
      avatarUrl: null,
    });

    expect(loser.id).toBe(winner.id);
    expect(loser.displayName).toBe("The winning insert");

    const rows = await db
      .select()
      .from(socialProfiles)
      .where(and(eq(socialProfiles.platform, platform), eq(socialProfiles.externalId, externalId)));
    expect(rows).toHaveLength(1);
  });

  it("touchSocialProfile refreshes lastSeenAt and reported fields without forking the row", async () => {
    const externalId = `touch-${Date.now()}`;
    const created = await findOrCreateSocialProfile(db, {
      platform,
      externalId,
      handle: "@touched",
      displayName: "Original Name",
      profileUrl: null,
      followers: 100,
      following: null,
      verified: false,
      accountType: null,
      language: null,
      country: null,
      avatarUrl: null,
    });
    cleanupIds.push(created.id);
    const originalLastSeenAt = created.lastSeenAt;

    await new Promise((resolve) => setTimeout(resolve, 10));
    await touchSocialProfile(db, created.id, { followers: 250, verified: true });

    const updated = await getSocialProfile(db, platform, externalId);
    expect(updated?.id).toBe(created.id);
    expect(updated?.followers).toBe(250);
    expect(updated?.verified).toBe(true);
    expect(updated?.lastSeenAt.getTime()).toBeGreaterThan(originalLastSeenAt.getTime());
  });
});
