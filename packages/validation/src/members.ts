import { z } from "zod";
import { ORG_ROLES } from "@cim/core";
import { passwordSchema } from "./auth";

/**
 * docs/ux/SCREEN_INVENTORY.md Screen 18 "Organization Users" — invite,
 * role change, accept. `organization_owner` is deliberately excluded
 * from the assignable set here: ownership transfer isn't built (see the
 * sole-owner protections in packages/db/src/repositories/members.ts), so
 * an invite or role change can never hand out a second owner through
 * this path — only registration creates one.
 */
const ASSIGNABLE_ROLES = ORG_ROLES.filter(
  (role): role is Exclude<(typeof ORG_ROLES)[number], "organization_owner"> =>
    role !== "organization_owner",
);
const assignableFixedRole = z.enum(ASSIGNABLE_ROLES);

/**
 * docs/product/FEATURE_MATRIX.md P2 "RBAC custom roles" — `role` here is
 * either a fixed OrgRole string (as above) or a custom role's id. A
 * shape-valid uuid still isn't proof the role exists in this org or
 * hasn't been deleted since the form loaded — the route itself
 * (getCustomRole, scoped to the caller's organizationId) is what
 * actually checks that before this ever reaches inviteMember/
 * updateMemberRole.
 */
export const assignableRole = z.union([assignableFixedRole, z.uuid()]);

export const inviteMemberSchema = z.object({
  email: z.email("Enter a valid email").max(255).toLowerCase(),
  role: assignableRole,
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: assignableRole,
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  password: passwordSchema,
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
