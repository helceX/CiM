import Link from "next/link";
import { checkMonitoringQueryLimit, db, listProjects } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/session";
import { QueryBuilderForm } from "./query-builder-form";

export default async function NewMonitoringPage() {
  const context = await requireOrgContext();
  const user = await getCurrentUser();
  const [projects, limitCheck] = await Promise.all([
    listProjects(db, context.organizationId),
    // Platform operators are never capped (same rule as POST /api/monitoring).
    checkMonitoringQueryLimit(db, context.organizationId, {
      unlimited: user?.isPlatformSuperAdmin === true,
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">New monitoring</h1>
        <p className="text-sm text-muted-foreground">
          Track a brand, competitor, campaign, or topic across your selected sources.
        </p>
      </div>
      {limitCheck.ok ? (
        <QueryBuilderForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
      ) : (
        <div role="status" className="flex flex-col gap-3 rounded-lg border border-border p-5">
          <p className="text-sm font-medium text-foreground">
            Your plan allows {limitCheck.limit} monitoring{" "}
            {limitCheck.limit === 1 ? "query" : "queries"} and you are using
            {limitCheck.limit === 1 ? " it" : " all of them"}.
          </p>
          <p className="text-sm text-muted-foreground">
            Upgrade to add more, or pause or delete an existing monitoring to free a slot.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/settings?tab=billing#upgrade"
              className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              See plan &amp; upgrade
            </Link>
            <Link
              href="/monitoring"
              className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm text-foreground"
            >
              Back to monitoring
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
