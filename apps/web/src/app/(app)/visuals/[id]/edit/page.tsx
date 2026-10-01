import { notFound } from "next/navigation";
import { db, getSavedVisual, listBrandGroups, listMonitoringQueries } from "@cim/db";
import { visualSpecSchema } from "@cim/validation";
import { requireOrgContext } from "@/lib/tenant";
import { VisualBuilder } from "../../new/visual-builder";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditVisualPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireOrgContext();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const visual = await getSavedVisual(db, context.organizationId, id);
  if (!visual) notFound();
  const spec = visualSpecSchema.safeParse(visual.spec);
  if (!spec.success) notFound();

  const [brandGroups, queries] = await Promise.all([
    listBrandGroups(db, context.organizationId),
    listMonitoringQueries(db, context.organizationId),
  ]);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Edit visual</h1>
        <p className="text-sm text-muted-foreground">Change what it measures or how it is grouped.</p>
      </div>
      {context.permissions.includes("monitoring:write") ? (
        <VisualBuilder
          brandGroups={brandGroups.map((g) => ({ id: g.id, name: g.name }))}
          queries={queries.map((q) => ({ id: q.id, name: q.name }))}
          initial={{
            id: visual.id,
            name: visual.name,
            measure: spec.data.measure,
            dimension: spec.data.dimension,
            periodDays: spec.data.periodDays,
            sentiments: spec.data.filters.sentiments ?? [],
            brandGroupIds: spec.data.filters.brandGroupIds ?? [],
            queryIds: spec.data.filters.queryIds ?? [],
            chartType: spec.data.chartType,
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">You don&apos;t have permission to edit visuals.</p>
      )}
    </div>
  );
}
