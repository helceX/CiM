import "server-only";
import { asOrganizationId, db, listMembershipsForUser, type OrganizationId } from "@cim/db";
import { isOrgRole, type OrgRole } from "@cim/core";
import { getCurrentUser } from "./session";

export type OrgContext = {
  userId: string;
  organizationId: OrganizationId;
  organizationName: string;
  role: OrgRole;
};

/**
 * ADR-001: the organization a request acts on is resolved *here*, from
 * the authenticated session's real memberships — never from a client-
 * supplied id. MVP has exactly one organization per user (created at
 * registration), so this picks the sole active membership; the shape
 * already supports multiple memberships for later multi-org switching.
 */
export async function getOrgContext(): Promise<OrgContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const memberships = await listMembershipsForUser(db, user.id);
  const first = memberships[0];
  if (!first) return null;
  if (!isOrgRole(first.membership.role)) return null;

  return {
    userId: user.id,
    organizationId: asOrganizationId(first.organization.id),
    organizationName: first.organization.name,
    role: first.membership.role,
  };
}

export async function requireOrgContext(): Promise<OrgContext> {
  const context = await getOrgContext();
  if (!context) {
    throw new Error("UNAUTHENTICATED");
  }
  return context;
}
