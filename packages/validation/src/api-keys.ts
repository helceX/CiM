import { z } from "zod";
import { PERMISSIONS } from "@cim/core";

/**
 * docs/architecture/SECURITY.md §83 — a key's scopes are validated to be
 * an actual subset of `Permission` here; whether the *creating user's own
 * role* actually holds each requested scope is checked server-side in the
 * API route (packages/core's `can()`), the same defense-in-depth every
 * other privileged mutation in this codebase applies.
 */
export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(PERMISSIONS)).min(1).max(PERMISSIONS.length),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
