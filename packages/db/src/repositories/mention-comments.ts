import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { mentionComments, mentions, type MentionComment } from "../schema/content";
import { users } from "../schema/users";
import type { OrganizationId } from "./tenant-scope";

export type { MentionComment };

export type MentionCommentWithAuthor = MentionComment & {
  authorFirstName: string;
  authorLastName: string;
};

/** For the Mention Detail Drawer's comment thread — oldest first, like a conversation. */
export async function listCommentsForMention(
  db: Db,
  mentionId: string,
): Promise<MentionCommentWithAuthor[]> {
  const rows = await db
    .select({
      comment: mentionComments,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
    })
    .from(mentionComments)
    .innerJoin(users, eq(users.id, mentionComments.authorUserId))
    .where(eq(mentionComments.mentionId, mentionId))
    .orderBy(asc(mentionComments.createdAt));
  return rows.map((row) => ({ ...row.comment, authorFirstName: row.authorFirstName, authorLastName: row.authorLastName }));
}

export type AddCommentResult =
  | { ok: true; comment: MentionCommentWithAuthor }
  | { ok: false; reason: "mention_not_found" };

/**
 * Verifies the mention belongs to this org before touching it — the same
 * defense-in-depth addTagToMention/assignMention apply (packages/db/src/
 * repositories/tags.ts, mentions.ts): a crafted mentionId from another
 * tenant must 404, not silently attach a comment to a mention this org
 * can't see.
 */
export async function addCommentToMention(
  db: Db,
  organizationId: OrganizationId,
  mentionId: string,
  authorUserId: string,
  body: string,
): Promise<AddCommentResult> {
  const [mention] = await db
    .select({ id: mentions.id })
    .from(mentions)
    .where(sql`${mentions.id} = ${mentionId} and ${mentions.organizationId} = ${organizationId}`)
    .limit(1);
  if (!mention) return { ok: false, reason: "mention_not_found" };

  const [created] = await db
    .insert(mentionComments)
    .values({ organizationId, mentionId, authorUserId, body })
    .returning();
  if (!created) throw new Error("failed to create comment");

  const [author] = await db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, authorUserId))
    .limit(1);
  if (!author) throw new Error("comment author vanished immediately after insert");

  return { ok: true, comment: { ...created, authorFirstName: author.firstName, authorLastName: author.lastName } };
}

/**
 * Only the comment's own author may delete it — checked here, not just
 * left to the caller's UI, the same defense-in-depth every tenant-scoped
 * mutation in this codebase applies (ADR-001). A crafted request naming
 * another member's comment id is rejected rather than silently deleting
 * someone else's note. Also requires the comment to belong to `mentionId`
 * — otherwise a DELETE against /mentions/{A}/comments/{commentId}, where
 * commentId is actually the caller's own comment on mention B, would
 * still succeed and the caller's audit-log entry would misattribute the
 * deletion to mention A.
 */
export async function deleteMentionComment(
  db: Db,
  organizationId: OrganizationId,
  mentionId: string,
  commentId: string,
  requestingUserId: string,
): Promise<boolean> {
  const result = await db
    .delete(mentionComments)
    .where(
      sql`${mentionComments.id} = ${commentId}
        and ${mentionComments.mentionId} = ${mentionId}
        and ${mentionComments.organizationId} = ${organizationId}
        and ${mentionComments.authorUserId} = ${requestingUserId}`,
    )
    .returning({ id: mentionComments.id });
  return result.length > 0;
}
