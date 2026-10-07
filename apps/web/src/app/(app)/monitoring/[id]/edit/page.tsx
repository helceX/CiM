import Link from "next/link";
import { notFound } from "next/navigation";
import { db, getMonitoringQuery, listBrandGroups, listProjects } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";
import { QueryBuilderForm } from "../../new/query-builder-form";

export default async function EditMonitoringPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireOrgContext();
  const { id } = await params;
  const query = await getMonitoringQuery(db, context.organizationId, id);
  if (!query) notFound();
  const [projects, brandGroups] = await Promise.all([
    listProjects(db, context.organizationId),
    listBrandGroups(db, context.organizationId, query.projectId),
  ]);
  const canEdit = context.permissions.includes("monitoring:write");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm">
          <Link href="/monitoring" className="text-primary underline underline-offset-2">
            ← Monitoring
          </Link>
        </p>
        <h1 className="mt-2 text-lg font-semibold text-foreground">Edit monitoring</h1>
        <p className="text-sm text-muted-foreground">
          Add or remove keywords, change where it looks, rename it. Stories it already found stay; new keywords are
          also checked against the stories we stored in the last 30 days, and the next scans use the new rules.
        </p>
      </div>
      {!canEdit ? (
        <p role="status" className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Your role can view monitorings but not change them.
        </p>
      ) : null}
      <QueryBuilderForm
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        saveBlocked={!canEdit}
        brandGroups={brandGroups.map((group) => ({ id: group.id, name: group.name }))}
        existing={{
          id: query.id,
          projectId: query.projectId,
          name: query.name,
          trackingTarget: query.trackingTarget,
          queryAst: query.queryAst,
          sourceTypes: query.sourceTypes,
          regionScopes: query.regionScopes,
          brandGroupId: query.brandGroupId,
        }}
      />
    </div>
  );
}
