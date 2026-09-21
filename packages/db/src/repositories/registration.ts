import type { Db } from "../client";
import { organizationMemberships, organizations, workspaces } from "../schema/organizations";
import { users } from "../schema/users";

/**
 * ADR-005: registration is one transactional unit — User + Organization +
 * Workspace + owner Membership. A failure partway through must not leave
 * an orphaned User with no Organization (email sending is a best-effort
 * side effect triggered by the caller *after* this commits, not inside
 * the transaction).
 */
export async function registerOrganizationOwner(
  db: Db,
  input: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    companyName: string;
  },
) {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: input.email,
        passwordHash: input.passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
      })
      .returning();
    if (!user) throw new Error("Failed to create user");

    const slug = await uniqueSlug(tx as unknown as Db, input.companyName);
    const [organization] = await tx
      .insert(organizations)
      .values({ name: input.companyName, slug })
      .returning();
    if (!organization) throw new Error("Failed to create organization");

    const [workspace] = await tx
      .insert(workspaces)
      .values({ organizationId: organization.id, name: "Default Workspace" })
      .returning();
    if (!workspace) throw new Error("Failed to create workspace");

    await tx.insert(organizationMemberships).values({
      organizationId: organization.id,
      userId: user.id,
      role: "organization_owner",
      status: "active",
    });

    return { user, organization, workspace };
  });
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

async function uniqueSlug(db: Db, companyName: string): Promise<string> {
  const base = slugify(companyName) || "organization";
  const suffix = Math.random().toString(36).slice(2, 8);
  // Base + random suffix avoids a pre-check query inside the transaction
  // (which would need SERIALIZABLE isolation to be race-free anyway);
  // the slug column's unique constraint is the real guarantee.
  return `${base}-${suffix}`;
}
