import "server-only";
import {
  asOrganizationId,
  db,
  getCustomRole,
  listMembershipsForUser,
  resolveApiKeyByRawKey,
  touchApiKeyLastUsed,
  type OrganizationId,
} from "@cim/db";
import { isOrgRole, permissionsForRole, type OrgRole, type Permission } from "@cim/core";
import { getCurrentUser } from "./session";

export type OrgContext = {
  userId: string;
  organizationId: OrganizationId;
  organizationName: string;
  // Null when the membership's role is a custom role rather than one of
  // the six fixed ones (docs/product/FEATURE_MATRIX.md P2 "RBAC custom
  // roles") — `permissions` below is what every permission check
  // actually reads; `role` stays around for the handful of places that
  // specifically mean "the owner", never anything a custom role grants.
  role: OrgRole | null;
  customRoleName: string | null;
  permissions: readonly Permission[];
};

/**
 * ADR-001: the organization a request acts on is resolved *here*, from
 * the authenticated session's real memberships — never from a client-
 * supplied id. MVP has exactly one organization per user (created at
 * registration), so this picks the sole active membership; the shape
 * already supports multiple memberships for later multi-org switching.
 *
 * ADR-005 / FEATURE_MATRIX.md P2 "RBAC custom roles" — a membership's
 * `role` column is either a fixed OrgRole string or a custom role's id
 * (packages/db/src/schema/organizations.ts's own comment on that column
 * named this exact design). Resolving which, and the resulting
 * permission set, happens once here so every downstream permission
 * check (`requirePermission`, the UI's own `can()` reads) stays a
 * simple array-membership test regardless of which kind of role it is.
 * A custom role that no longer exists (deleted out from under an active
 * membership — shouldn't happen since deleteCustomRole blocks that, but
 * never trust a stale read) fails closed the same way an unresolvable
 * fixed role already did.
 */
export async function getOrgContext(): Promise<OrgContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const memberships = await listMembershipsForUser(db, user.id);
  const first = memberships[0];
  if (!first) return null;

  const organizationId = asOrganizationId(first.organization.id);
  const rawRole = first.membership.role;

  if (isOrgRole(rawRole)) {
    return {
      userId: user.id,
      organizationId,
      organizationName: first.organization.name,
      role: rawRole,
      customRoleName: null,
      permissions: permissionsForRole(rawRole),
    };
  }

  const customRole = await getCustomRole(db, organizationId, rawRole);
  if (!customRole) return null;

  return {
    userId: user.id,
    organizationId,
    organizationName: first.organization.name,
    role: null,
    customRoleName: customRole.name,
    permissions: customRole.permissions as Permission[],
  };
}

export async function requireOrgContext(): Promise<OrgContext> {
  const context = await getOrgContext();
  if (!context) {
    throw new Error("UNAUTHENTICATED");
  }
  return context;
}

/**
 * packages/core/authz.ts's permission table has existed since Phase 1,
 * but nothing actually called `can()` until Screen 18 "Organization
 * Users" (docs/ux/SCREEN_INVENTORY.md) needed its first real
 * enforcement point: inviting/re-role-ing/revoking members is
 * `org:manage_members`, owner and admin only. Throws the same
 * "UNAUTHENTICATED"-shaped signal `requireOrgContext` does so route
 * handlers can handle both with one catch — but with its own message,
 * since "not authenticated" and "authenticated but not allowed" are
 * different failures a caller may want to tell apart.
 */
export async function requirePermission(permission: Permission): Promise<OrgContext> {
  const context = await requireOrgContext();
  if (!context.permissions.includes(permission)) {
    throw new Error("FORBIDDEN");
  }
  return context;
}

/**
 * The permission set a role string (fixed OrgRole or a custom role's
 * id) would actually grant — used to enforce a "you can't grant a role
 * more powerful than your own" ceiling on invite/re-role, the same
 * caller-can't-exceed-their-own-permissions rule
 * resolveApiKeyAuth's scope check and createApiKeySchema's doc comment
 * already assume for API keys. Returns null when the role doesn't
 * exist in this organization.
 */
export async function resolvePermissionsForRoleString(
  organizationId: OrganizationId,
  role: string,
): Promise<readonly Permission[] | null> {
  if (isOrgRole(role)) return permissionsForRole(role);
  const customRole = await getCustomRole(db, organizationId, role);
  return customRole ? (customRole.permissions as Permission[]) : null;
}

/**
 * The "you can't grant/modify a permission you don't hold yourself"
 * ceiling invariant — every place a caller can shape another actor's
 * permission set (create/edit a custom role, invite a member to a role,
 * re-role a member) enforces this same check; centralized so it can't
 * drift or be left out of a future call site. Returns the permissions in
 * `requested` that `callerPermissions` doesn't include — empty means the
 * ceiling holds.
 */
export function permissionsBeyondCeiling(
  callerPermissions: readonly Permission[],
  requested: readonly Permission[],
): Permission[] {
  return requested.filter((permission) => !callerPermissions.includes(permission));
}

/**
 * docs/architecture/SECURITY.md §83 "same authorization path as
 * session-based requests" — an API key's scope is checked against the
 * exact same `Permission` enum a session role is checked against
 * (`can()`, above), just via array membership on the key's own `scopes`
 * instead of a role lookup. Returns null (never throws) on anything short
 * of "valid, unrevoked key whose scopes include this permission" — a
 * route calls this first and falls back to `requireOrgContext`/
 * `requirePermission` when it returns null, so a request presenting
 * neither still gets that path's ordinary 401.
 */
export async function resolveApiKeyAuth(
  request: Request,
  permission: Permission,
): Promise<{ organizationId: OrganizationId } | null> {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  if (!match?.[1]) return null;

  const resolved = await resolveApiKeyByRawKey(db, match[1]);
  if (!resolved || !resolved.scopes.includes(permission)) return null;

  await touchApiKeyLastUsed(db, resolved.id);
  return { organizationId: resolved.organizationId };
}
