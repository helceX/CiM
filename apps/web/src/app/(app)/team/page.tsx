import { Mail, ShieldCheck, Users } from "lucide-react";
import { db, listCustomRolesForOrganization, listMembersForOrganization } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/session";
import { CustomRolesSection } from "./custom-roles-section";
import { MembersSection } from "./members-section";

function roleLabel(role: string | null, customRoleName: string | null): string {
  if (customRoleName) return `${customRoleName} (custom)`;
  if (!role) return "Member";
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * "Your account, and the people you work with": who you are in this
 * organization on top, then the whole team — members, pending invitations,
 * roles. Invitations and role changes use the same permission-checked API as
 * before; this page just puts them where people look for them.
 */
export default async function TeamPage() {
  const [context, user] = await Promise.all([requireOrgContext(), getCurrentUser()]);
  const [members, customRoles] = await Promise.all([
    listMembersForOrganization(db, context.organizationId),
    listCustomRolesForOrganization(db, context.organizationId),
  ]);
  const canManageMembers = context.permissions.includes("org:manage_members");
  const active = members.filter((member) => member.status === "active");
  const me = members.find((member) => member.userId === context.userId);
  const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.toUpperCase() || "?";

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div>
        <h1>Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You and the people who work with you in {context.organizationName}.
        </p>
      </div>

      <section aria-labelledby="account-heading" className="mp-hero p-5 md:p-6">
        <div className="relative flex flex-wrap items-center gap-4">
          <span
            aria-hidden="true"
            className="grid size-14 shrink-0 place-items-center rounded-2xl text-lg font-extrabold text-white"
            style={{ background: "var(--mp-gradient-solid)" }}
          >
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="account-heading" className="text-lg font-bold text-foreground">
              {user ? `${user.firstName} ${user.lastName}` : "Your account"}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="size-3.5" aria-hidden="true" /> {user?.email}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" aria-hidden="true" />{" "}
                {roleLabel(context.role, context.customRoleName)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" aria-hidden="true" /> {active.length} member
                {active.length === 1 ? "" : "s"}
                {me ? ` · joined ${new Date(me.createdAt).toLocaleDateString()}` : ""}
              </span>
            </p>
          </div>
        </div>
      </section>

      <MembersSection
        members={members}
        customRoles={customRoles}
        canManageMembers={canManageMembers}
        currentUserId={context.userId}
      />

      {canManageMembers ? <CustomRolesSection customRoles={customRoles} /> : null}
    </div>
  );
}
