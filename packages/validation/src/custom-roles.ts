import { z } from "zod";
import { PERMISSIONS } from "@cim/core";

/**
 * docs/product/FEATURE_MATRIX.md P2 "RBAC custom roles" — a custom role
 * can grant any subset of the same `Permission` table a fixed role is
 * defined against (packages/core/src/authz.ts); no extra restriction
 * invented beyond what that table already is, since it's the actual
 * enforcement boundary either way.
 */
export const customRolePermissionSchema = z.enum(PERMISSIONS);

export const createCustomRoleSchema = z.object({
  name: z.string().trim().min(1).max(50),
  permissions: z.array(customRolePermissionSchema).min(1).max(PERMISSIONS.length),
});
export type CreateCustomRoleInput = z.infer<typeof createCustomRoleSchema>;

export const updateCustomRoleSchema = createCustomRoleSchema;
export type UpdateCustomRoleInput = z.infer<typeof updateCustomRoleSchema>;
