import "server-only";
import { getCurrentUser, type CurrentUser } from "./session";

/**
 * docs/architecture/SECURITY.md (brief §86) — Platform Super Admin is a
 * platform-wide flag on User (`users.is_platform_super_admin`), entirely
 * separate from any OrganizationMembership role: it does not grant
 * implicit access to tenant application views (no `/dashboard`,
 * `/mentions`, etc. — those still go through `requireOrgContext()`), and
 * nothing here ever resolves or accepts an `organizationId`. `/admin`
 * shows platform-wide operational aggregates only.
 */
export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !user.isPlatformSuperAdmin) {
    throw new Error("NOT_SUPER_ADMIN");
  }
  return user;
}
