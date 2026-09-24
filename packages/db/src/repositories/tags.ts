import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { mentions, mentionTags, tags, type Tag } from "../schema/content";
import type { OrganizationId } from "./tenant-scope";

export type { Tag };

/**
 * docs/architecture/DATA_MODEL.md "Tag — user-created label, tenant-
 * scoped" — the "tag" slice of FEATURE_MATRIX.md P2 "Collaboration
 * (assign/comment/tag)". Reuses an existing tag case-insensitively rather
 * than forking a near-duplicate, the same discipline
 * findOrCreateEntity/findOrCreateTopic already apply (./ai.ts) — including
 * the same create-race fallback: two requests racing to tag the first
 * "Product Launch" mention in an org could both lose the SELECT and hit
 * the unique index on the INSERT.
 */
export async function findOrCreateTag(
  db: Db,
  organizationId: OrganizationId,
  name: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(sql`${tags.organizationId} = ${organizationId} and lower(${tags.name}) = lower(${name})`)
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(tags)
    .values({ organizationId, name })
    .onConflictDoNothing()
    .returning({ id: tags.id });
  if (created) return created.id;

  const [fallback] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(sql`${tags.organizationId} = ${organizationId} and lower(${tags.name}) = lower(${name})`)
    .limit(1);
  if (!fallback) throw new Error("failed to find or create tag");
  return fallback.id;
}

/** For the tag filter's option list and the drawer's add-tag autocomplete. */
export async function listTagsForOrganization(
  db: Db,
  organizationId: OrganizationId,
): Promise<Tag[]> {
  return db.select().from(tags).where(eq(tags.organizationId, organizationId)).orderBy(asc(tags.name));
}

export async function listTagsForMention(db: Db, mentionId: string): Promise<Tag[]> {
  const rows = await db
    .select({ tag: tags })
    .from(mentionTags)
    .innerJoin(tags, eq(tags.id, mentionTags.tagId))
    .where(eq(mentionTags.mentionId, mentionId))
    .orderBy(asc(tags.name));
  return rows.map((row) => row.tag);
}

export type AddTagResult = { ok: true; tag: Tag } | { ok: false; reason: "mention_not_found" };

/**
 * Verifies the mention belongs to this org before touching it — the same
 * defense-in-depth assignMention applies (packages/db/src/repositories/
 * mentions.ts): a crafted mentionId from another tenant must 404, not
 * silently tag a mention this org can't see.
 */
export async function addTagToMention(
  db: Db,
  organizationId: OrganizationId,
  mentionId: string,
  tagName: string,
): Promise<AddTagResult> {
  const [mention] = await db
    .select({ id: mentions.id })
    .from(mentions)
    .where(sql`${mentions.id} = ${mentionId} and ${mentions.organizationId} = ${organizationId}`)
    .limit(1);
  if (!mention) return { ok: false, reason: "mention_not_found" };

  const tagId = await findOrCreateTag(db, organizationId, tagName);
  await db.insert(mentionTags).values({ mentionId, tagId }).onConflictDoNothing();

  const [tag] = await db.select().from(tags).where(eq(tags.id, tagId)).limit(1);
  if (!tag) throw new Error("tag vanished immediately after find-or-create");
  return { ok: true, tag };
}

export async function removeTagFromMention(
  db: Db,
  organizationId: OrganizationId,
  mentionId: string,
  tagId: string,
): Promise<boolean> {
  const [mention] = await db
    .select({ id: mentions.id })
    .from(mentions)
    .where(sql`${mentions.id} = ${mentionId} and ${mentions.organizationId} = ${organizationId}`)
    .limit(1);
  if (!mention) return false;

  const result = await db
    .delete(mentionTags)
    .where(sql`${mentionTags.mentionId} = ${mentionId} and ${mentionTags.tagId} = ${tagId}`)
    .returning({ mentionId: mentionTags.mentionId });
  return result.length > 0;
}
