import { db, listProjects } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";
import { ReportForm } from "./report-form";

export default async function NewReportPage() {
  const context = await requireOrgContext();
  const projects = await listProjects(db, context.organizationId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">New report</h1>
        <p className="text-sm text-muted-foreground">
          Pick a fixed template and a period — generation runs in the background.
        </p>
      </div>
      <ReportForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
    </div>
  );
}
