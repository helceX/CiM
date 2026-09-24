import { and, eq, ne, sql } from "drizzle-orm";
import type { Permission } from "@cim/core";
import type { Db } from "../client";
import { customRoles, organizationMemberships, type CustomRole } from "../schema/organizations";
import type { OrganizationId } from "./tenant-scope";

export type { CustomRole };

/** For the Settings role picker and the invite/re-role dropdowns. */
export async function listCustomRolesForOrganization(
  db: Db,
  organizationId: OrganizationId,
): Promise<CustomRole[]> {
  return db
    .select()
    .from(customRoles)
    .where(eq(customRoles.organizationId, organizationId))
    .orderBy(customRoles.name);
}

/**
 * `role` in a membership row is either a fixed OrgRole string or a
 * custom role's id (docs/product/FEATURE_MATRIX.md P2 "RBAC custom
 * roles") — this is the lookup `getOrgContext` uses to tell the second
 * case apart and resolve its permission set. Scoped to the organization
 * so a membership row's `role` can never resolve to another tenant's
 * custom role even if the id were somehow guessed.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getCustomRole(
  db: Db,
  organizationId: OrganizationId,
  roleId: string,
): Promise<CustomRole | undefined> {
  // A membership's `role` is a fixed OrgRole string most of the time —
  // callers here have already ruled that out via `isOrgRole`, but a
  // malformed/garbage value is still possible, and `customRoles.id` is
  // a real `uuid` column: querying it with a non-UUID string throws at
  // the database rather than just not matching. Fail closed instead.
  if (!UUID_RE.test(roleId)) return undefined;

  const [row] = await db
    .select()
    .from(customRoles)
    .where(and(eq(customRoles.id, roleId), eq(customRoles.organizationId, organizationId)))
    .limit(1);
  return row;
}

export type CreateCustomRoleResult =
  | { ok: true; role: CustomRole }
  | { ok: false; reason: "name_taken" };

export async function createCustomRole(
  db: Db,
  organizationId: OrganizationId,
  input: { name: string; permissions: Permission[] },
): Promise<CreateCustomRoleResult> {
  const [existing] = await db
    .select({ id: customRoles.id })
    .from(customRoles)
    .where(
      sql`${customRoles.organizationId} = ${organizationId} and lower(${customRoles.name}) = lower(${input.name})`,
    )
    .limit(1);
  if (existing) return { ok: false, reason: "name_taken" };

  // The SELECT above only rules out a name that was already taken —
  // two requests racing the same new name both pass it, so the actual
  // guarantee is `custom_roles_org_name_lower_uidx`. Same
  // check-then-onConflictDoNothing shape as tags.ts's findOrCreateTag,
  // so the loser gets the intended `name_taken` result instead of an
  // unhandled unique-violation 500.
  const [role] = await db
    .insert(customRoles)
    .values({ organizationId, name: input.name, permissions: input.permissions })
    .onConflictDoNothing()
    .returning();
  if (!role) return { ok: false, reason: "name_taken" };
  return { ok: true, role };
}

export type UpdateCustomRoleResult =
  | { ok: true; role: CustomRole }
  | { ok: false; reason: "not_found" | "name_taken" };

/** node-postgres surfaces a unique-violation as an error with this `code` (PostgreSQL error class 23). */
const POSTGRES_UNIQUE_VIOLATION = "23505";

/**
 * drizzle-orm wraps the raw node-postgres error in its own
 * DrizzleQueryError, so the `code` node-postgres set is one level down
 * at `.cause`, not on the error thrown from `await db.update(...)`
 * itself — checking only the top-level error would never match.
 */
function isPostgresUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === POSTGRES_UNIQUE_VIOLATION) return true;
  return "cause" in error && isPostgresUniqueViolation(error.cause);
}

export async function updateCustomRole(
  db: Db,
  organizationId: OrganizationId,
  roleId: string,
  input: { name: string; permissions: Permission[] },
): Promise<UpdateCustomRoleResult> {
  const [existing] = await db
    .select({ id: customRoles.id })
    .from(customRoles)
    .where(
      sql`${customRoles.organizationId} = ${organizationId}
        and lower(${customRoles.name}) = lower(${input.name})
        and ${customRoles.id} != ${roleId}`,
    )
    .limit(1);
  if (existing) return { ok: false, reason: "name_taken" };

  // Same race as createCustomRole above, but an UPDATE has no
  // onConflictDoNothing to fall back on — two renames racing to the
  // same new name both pass the SELECT, so the loser must catch
  // `custom_roles_org_name_lower_uidx`'s violation directly rather than
  // let it surface as an unhandled 500.
  try {
    const [role] = await db
      .update(customRoles)
      .set({ name: input.name, permissions: input.permissions, updatedAt: new Date() })
      .where(and(eq(customRoles.id, roleId), eq(customRoles.organizationId, organizationId)))
      .returning();
    if (!role) return { ok: false, reason: "not_found" };
    return { ok: true, role };
  } catch (error) {
    if (isPostgresUniqueViolation(error)) return { ok: false, reason: "name_taken" };
    throw error;
  }
}

export type DeleteCustomRoleResult = "ok" | "not_found" | "in_use";

/**
 * Blocks deletion while any non-revoked member still holds this role —
 * the same "don't silently break access" reasoning
 * assertNotDemotingSoleOwner (members.ts) applies to the sole-owner
 * case, here applied to "this role still names someone."
 */
export async function deleteCustomRole(
  db: Db,
  organizationId: OrganizationId,
  roleId: string,
): Promise<DeleteCustomRoleResult> {
  const [inUse] = await db
    .select({ id: organizationMemberships.id })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.role, roleId),
        ne(organizationMemberships.status, "revoked"),
      ),
    )
    .limit(1);
  if (inUse) return "in_use";

  const result = await db
    .delete(customRoles)
    .where(and(eq(customRoles.id, roleId), eq(customRoles.organizationId, organizationId)))
    .returning({ id: customRoles.id });
  return result.length > 0 ? "ok" : "not_found";
}
