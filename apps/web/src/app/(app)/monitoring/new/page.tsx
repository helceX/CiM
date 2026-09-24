import { db, listProjects } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";
import { QueryBuilderForm } from "./query-builder-form";

export default async function NewMonitoringPage() {
  const context = await requireOrgContext();
  const projects = await listProjects(db, context.organizationId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">New monitoring</h1>
        <p className="text-sm text-muted-foreground">
          Track a brand, competitor, campaign, or topic across your selected sources.
        </p>
      </div>
      <QueryBuilderForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
    </div>
  );
}
