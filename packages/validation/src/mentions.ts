import { z } from "zod";

/**
 * docs/product/FEATURE_MATRIX.md P2 "Collaboration (assign/comment/tag)"
 * — the "assign" slice. `null` unassigns; a non-null value is checked
 * against the organization's active membership server-side
 * (assignMention in packages/db), never trusted from this shape alone.
 */
export const assignMentionSchema = z.object({
  assignedToUserId: z.uuid().nullable(),
});
export type AssignMentionInput = z.infer<typeof assignMentionSchema>;

/**
 * docs/product/FEATURE_MATRIX.md P2 "Collaboration (assign/comment/tag)"
 * — the "tag" slice. Trimmed and length-bounded here; case-insensitive
 * reuse-vs-create is the DB layer's job (findOrCreateTag).
 */
export const addTagToMentionSchema = z.object({
  name: z.string().trim().min(1).max(50),
});
export type AddTagToMentionInput = z.infer<typeof addTagToMentionSchema>;
