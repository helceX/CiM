import Link from "next/link";
import { notFound } from "next/navigation";
import { db, getSavedVisual, runVisual } from "@cim/db";
import { DIMENSION_LABELS, MEASURE_LABELS } from "@cim/core";
import { visualSpecSchema } from "@cim/validation";
import { VisualView } from "@/components/charts/visual-view";
import { requireOrgContext } from "@/lib/tenant";
import { Button } from "@cim/ui";
import { DeleteVisualButton } from "./delete-button";
import { PinButton } from "./pin-button";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function VisualPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireOrgContext();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const visual = await getSavedVisual(db, context.organizationId, id);
  if (!visual) notFound();

  const parsed = visualSpecSchema.safeParse(visual.spec);
  let result: Awaited<ReturnType<typeof runVisual>> | null = null;
  if (parsed.success) {
    try {
      result = await runVisual(db, context.organizationId, parsed.data);
    } catch (error) {
      console.error("[visuals] render failed:", error);
    }
  }
  const canWrite = context.permissions.includes("monitoring:write");

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link href="/visuals" className="underline underline-offset-2">
              Visuals
            </Link>
          </p>
          <h1 className="text-lg font-semibold text-foreground">{visual.name}</h1>
          {parsed.success ? (
            <p className="text-sm text-muted-foreground">
              {MEASURE_LABELS[parsed.data.measure]} by {DIMENSION_LABELS[parsed.data.dimension].toLowerCase()}, last{" "}
              {parsed.data.periodDays} days
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {parsed.success ? (
            <Button asChild variant="secondary" size="sm">
              <a href={`/api/visuals/${visual.id}/export`} download>
                Export CSV
              </a>
            </Button>
          ) : null}
          {parsed.success ? (
            <Button asChild variant="secondary" size="sm">
              <a href={`/api/visuals/${visual.id}/export?format=xlsx`} download>
                Export XLSX
              </a>
            </Button>
          ) : null}
          {canWrite ? (
            <>
              <Button asChild variant="secondary" size="sm">
                <Link href={`/visuals/${visual.id}/edit`}>Edit</Link>
              </Button>
              <PinButton id={visual.id} pinned={visual.pinnedAt !== null} />
              <DeleteVisualButton id={visual.id} />
            </>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-border p-4">
        {parsed.success && result ? (
          <VisualView
            rows={result.rows}
            truncated={result.truncated}
            chartType={visual.kind === "table" ? "table" : parsed.data.chartType}
            measure={parsed.data.measure}
            dimension={parsed.data.dimension}
            title={visual.name}
          />
        ) : (
          <p role="alert" className="text-sm text-danger">
            This visual couldn&apos;t be computed right now.
          </p>
        )}
      </div>
    </div>
  );
}
