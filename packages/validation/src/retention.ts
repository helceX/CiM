import { z } from "zod";

/**
 * docs/ux/SCREEN_INVENTORY.md Screen 17 (Settings) — "data retention
 * policy (display + configure, enforcement per roadmap)". `null` means
 * keep forever. The 30-day floor guards against an accidental value that
 * would purge nearly everything the moment the (still P2, not yet built)
 * enforcement worker ships; 10 years is a generous ceiling, not a real
 * constraint anyone should hit.
 */
export const updateRetentionPolicySchema = z.object({
  mentionRetentionDays: z.int().min(30).max(3650).nullable(),
});
export type UpdateRetentionPolicyInput = z.infer<typeof updateRetentionPolicySchema>;
