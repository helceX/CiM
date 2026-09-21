import { and, eq } from "drizzle-orm";
import { Badge } from "@cim/ui";
import { db, schema } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";

export default async function SettingsPage() {
  const context = await requireOrgContext();

  const members = await db
    .select({ membership: schema.organizationMemberships, user: schema.users })
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.organizationMemberships.userId))
    .where(
      and(
        eq(schema.organizationMemberships.organizationId, context.organizationId),
        eq(schema.organizationMemberships.status, "active"),
      ),
    );

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Organization profile and members.</p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-foreground">Organization</h2>
        <p className="mt-2 text-sm text-foreground">{context.organizationName}</p>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground">Members</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <ul className="divide-y divide-border">
            {members.map(({ membership, user }) => (
              <li key={membership.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <Badge tone="neutral">{formatRole(membership.role)}</Badge>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Inviting additional members ships in a later phase — see the product roadmap.
        </p>
      </section>
    </div>
  );
}

function formatRole(role: string): string {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
