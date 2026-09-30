import { and, eq, sql } from "drizzle-orm";
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
 *
 * The in-use check and the delete used to be two separate statements —
 * a check-then-act race: a concurrent invite/re-role assigning someone
 * to this exact role between the SELECT and the DELETE would pass the
 * check (not yet committed, or committed after the SELECT ran) and then
 * lose that assignment out from under them anyway, leaving their
 * membership row's `role` pointing at a deleted custom role. getOrgContext
 * fails closed on that (the same way it does for any unresolvable role),
 * silently locking them out of the app until an admin notices and
 * re-roles them. Folding the check into the DELETE's own WHERE (a
 * `NOT EXISTS` against organizationMemberships) makes "is this role
 * still in use" and "delete it" one atomic statement, closing the
 * original unbounded gap (an entire concurrent request's round trip)
 * down to this single statement's own execution — organizationMemberships.role
 * is a plain text column (it also holds fixed OrgRole strings), not a
 * real foreign key, so a concurrent invite/re-role's own INSERT/UPDATE
 * landing in that now much narrower window is still theoretically
 * possible, not fully impossible; closing that residual would need a
 * lock shared with every place that writes this column (inviteMember,
 * updateMemberRole), which isn't worth the spread for a fail-closed,
 * admin-self-recoverable edge case this narrow.
 */
export async function deleteCustomRole(
  db: Db,
  organizationId: OrganizationId,
  roleId: string,
): Promise<DeleteCustomRoleResult> {
  const result = await db
    .delete(customRoles)
    .where(
      and(
        eq(customRoles.id, roleId),
        eq(customRoles.organizationId, organizationId),
        sql`not exists (
          select 1 from ${organizationMemberships}
          where ${organizationMemberships.organizationId} = ${organizationId}
            and ${organizationMemberships.role} = ${roleId}
            and ${organizationMemberships.status} != 'revoked'
        )`,
      ),
    )
    .returning({ id: customRoles.id });
  if (result.length > 0) return "ok";

  // The atomic delete above already refused to remove an in-use role —
  // this is purely to pick the right error message for the caller, and
  // being racy here (the role could be deleted or put back in use by
  // the time this runs) only risks a slightly stale message, never an
  // incorrect deletion.
  const [stillExists] = await db
    .select({ id: customRoles.id })
    .from(customRoles)
    .where(and(eq(customRoles.id, roleId), eq(customRoles.organizationId, organizationId)))
    .limit(1);
  return stillExists ? "in_use" : "not_found";
}
