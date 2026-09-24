import { z } from "zod";

/**
 * docs/architecture/SECURITY.md — both destructive privacy actions require
 * an explicit re-confirmation from the client, not just "are you sure?" in
 * the UI (a stolen/idle session shouldn't be enough on its own).
 */

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export const deleteOrganizationSchema = z.object({
  confirmName: z.string().min(1, "Type the organization name to confirm"),
});
export type DeleteOrganizationInput = z.infer<typeof deleteOrganizationSchema>;
