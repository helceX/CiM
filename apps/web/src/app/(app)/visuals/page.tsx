import Link from "next/link";
import { Button, EmptyState } from "@cim/ui";
import { ChartColumn } from "lucide-react";
import { db, listSavedVisuals } from "@cim/db";
import { DIMENSION_LABELS, MEASURE_LABELS, type VisualDimension, type VisualMeasure } from "@cim/core";
import { requireOrgContext } from "@/lib/tenant";

export default async function VisualsPage() {
  const context = await requireOrgContext();
  const visuals = await listSavedVisuals(db, context.organizationId);
  const canWrite = context.permissions.includes("monitoring:write");

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Visuals</h1>
          <p className="text-sm text-muted-foreground">
            Charts and tables you build from your monitoring data.
          </p>
        </div>
        {canWrite ? (
          <Button asChild size="sm">
            <Link href="/visuals/new">New visual</Link>
          </Button>
        ) : null}
      </div>

      {visuals.length === 0 ? (
        <EmptyState
          icon={<ChartColumn className="size-8" aria-hidden="true" />}
          title="No visuals yet."
          description="Pick a measure and how to group it to answer a question the standard dashboards don't."
          action={
            canWrite ? (
              <Button asChild size="sm">
                <Link href="/visuals/new">Build your first visual</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {visuals.map((visual) => {
            const spec = visual.spec as { measure: VisualMeasure; dimension: VisualDimension; periodDays: number };
            return (
              <li key={visual.id}>
                <Link href={`/visuals/${visual.id}`} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-surface-muted">
                  <span className="text-sm font-medium text-foreground">{visual.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {MEASURE_LABELS[spec.measure] ?? spec.measure} by{" "}
                    {(DIMENSION_LABELS[spec.dimension] ?? spec.dimension).toLowerCase()} · last {spec.periodDays} days
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
