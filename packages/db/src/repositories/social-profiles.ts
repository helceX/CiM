import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import { socialProfiles, type SocialProfile } from "../schema/social";

export type SocialProfileInput = {
  platform: string;
  externalId: string;
  handle: string;
  displayName: string | null;
  profileUrl: string | null;
  followers: number | null;
  following: number | null;
  verified: boolean | null;
  accountType: string | null;
  language: string | null;
  country: string | null;
  avatarUrl: string | null;
};

/**
 * docs/architecture/ADR-006-SOCIAL-LISTENING.md — one profile row per
 * (platform, externalId), same reuse discipline as
 * packages/db/src/repositories/ai.ts's findOrCreateTopic: check first,
 * insert with onConflictDoNothing, and if a concurrent ingestion job won
 * the race (social_profiles_platform_external_id_uidx), read the row it
 * created back rather than throwing — pipeline.ts's ingestSource runs at
 * concurrency:5, the same race window articles/insertArticle already
 * guards against.
 */
export async function findOrCreateSocialProfile(
  db: Db,
  input: SocialProfileInput,
): Promise<SocialProfile> {
  const existing = await getSocialProfile(db, input.platform, input.externalId);
  if (existing) return existing;

  const [created] = await db
    .insert(socialProfiles)
    .values(input)
    .onConflictDoNothing({ target: [socialProfiles.platform, socialProfiles.externalId] })
    .returning();
  if (created) return created;

  const fallback = await getSocialProfile(db, input.platform, input.externalId);
  if (!fallback) throw new Error("failed to create social profile");
  return fallback;
}

export async function getSocialProfile(
  db: Db,
  platform: string,
  externalId: string,
): Promise<SocialProfile | undefined> {
  const [row] = await db
    .select()
    .from(socialProfiles)
    .where(and(eq(socialProfiles.platform, platform), eq(socialProfiles.externalId, externalId)))
    .limit(1);
  return row;
}

/**
 * A platform's reported follower/verification state can change between
 * sightings of the same account — refreshed on each new post from that
 * profile so "Unknown" only ever means "the platform never reported
 * this," not "reported once, now stale."
 */
export async function touchSocialProfile(
  db: Db,
  id: string,
  update: Partial<Pick<SocialProfileInput, "followers" | "following" | "verified" | "displayName" | "avatarUrl">>,
): Promise<void> {
  await db
    .update(socialProfiles)
    .set({ ...update, lastSeenAt: new Date() })
    .where(eq(socialProfiles.id, id));
}
