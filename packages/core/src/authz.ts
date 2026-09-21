/**
 * ADR-005: roles are string keys resolved against this single permission
 * table — not a hard-coded switch statement scattered through routes.
 * Adding a custom role later (post-MVP) means adding a row here (or, once
 * custom roles ship, a DB-backed equivalent of this table), not touching
 * every call site that currently calls `can()`.
 */

export const ORG_ROLES = [
  "organization_owner",
  "organization_admin",
  "communications_manager",
  "analyst",
  "viewer",
  "report_recipient",
] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const PERMISSIONS = [
  "org:manage_settings",
  "org:manage_members",
  "org:manage_billing",
  "monitoring:read",
  "monitoring:write",
  "mentions:read",
  "mentions:write",
  "alerts:read",
  "alerts:write",
  "reports:read",
  "reports:write",
  "sources:read",
  "sources:manage",
  "api_keys:manage",
  "audit_log:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS;

const rolePermissions: Record<OrgRole, readonly Permission[]> = {
  organization_owner: ALL_PERMISSIONS,
  organization_admin: ALL_PERMISSIONS,
  communications_manager: [
    "monitoring:read",
    "monitoring:write",
    "mentions:read",
    "mentions:write",
    "alerts:read",
    "alerts:write",
    "reports:read",
    "reports:write",
    "sources:read",
    "audit_log:read",
  ],
  analyst: [
    "monitoring:read",
    "monitoring:write",
    "mentions:read",
    "mentions:write",
    "alerts:read",
    "reports:read",
    "sources:read",
  ],
  viewer: ["monitoring:read", "mentions:read", "alerts:read", "reports:read", "sources:read"],
  report_recipient: ["reports:read"],
};

export function isOrgRole(value: string): value is OrgRole {
  return (ORG_ROLES as readonly string[]).includes(value);
}

export function can(role: OrgRole, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}

export function permissionsForRole(role: OrgRole): readonly Permission[] {
  return rolePermissions[role];
}
