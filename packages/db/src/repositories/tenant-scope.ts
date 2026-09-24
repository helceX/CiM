/**
 * ADR-001: every repository function below that touches a tenant-scoped
 * table takes `organizationId` as a required, non-optional argument —
 * there is no "unscoped" variant to call by mistake. This branded type
 * exists so a raw string can't be passed where a *validated* (session-
 * derived) tenant id is expected without an explicit cast at the one
 * place session resolution happens (apps/web/src/lib/session.ts).
 */
export type OrganizationId = string & { readonly __brand: "OrganizationId" };

export function asOrganizationId(id: string): OrganizationId {
  return id as OrganizationId;
}
