import Link from "next/link";
import { db, listPinnedVisuals, runVisual } from "@cim/db";
import { DIMENSION_LABELS, MEASURE_LABELS } from "@cim/core";
import { visualSpecSchema } from "@cim/validation";
import type { OrganizationId } from "@cim/db";
import { VisualView } from "@/components/charts/visual-view";

/**
 * Visuals pinned from /visuals (at most four). Each one is computed here at
 * render time; one that fails to compute shows a note instead of taking the
 * whole Dashboard down.
 */
export async function PinnedVisualsSection({ organizationId }: { organizationId: OrganizationId }) {
  const pinned = await listPinnedVisuals(db, organizationId);
  if (pinned.length === 0) return null;

  const cards = await Promise.all(
    pinned.map(async (visual) => {
      const spec = visualSpecSchema.safeParse(visual.spec);
      if (!spec.success) return { visual, spec: null, result: null };
      try {
        return { visual, spec: spec.data, result: await runVisual(db, organizationId, spec.data) };
      } catch (error) {
        console.error("[visuals] pinned render failed:", error);
        return { visual, spec: spec.data, result: null };
      }
    }),
  );

  return (
    <section aria-labelledby="pinned-visuals-heading">
      <div className="flex items-center justify-between">
        <h2 id="pinned-visuals-heading" className="text-sm font-semibold text-foreground">
          Your visuals
        </h2>
        <Link href="/visuals" className="text-xs text-primary underline underline-offset-2">
          Manage
        </Link>
      </div>
      <div className="mt-2 grid gap-4 lg:grid-cols-2">
        {cards.map(({ visual, spec, result }) => (
          <div key={visual.id} className="min-w-0 rounded-lg border border-border p-4">
            <h3 className="text-sm font-medium text-foreground">
              <Link href={`/visuals/${visual.id}`} className="hover:underline">
                {visual.name}
              </Link>
            </h3>
            {spec ? (
              <p className="mb-3 text-xs text-muted-foreground">
                {MEASURE_LABELS[spec.measure]} by {DIMENSION_LABELS[spec.dimension].toLowerCase()}, last {spec.periodDays} days
              </p>
            ) : null}
            {spec && result ? (
              <VisualView
                rows={result.rows}
                truncated={result.truncated}
                chartType={visual.kind === "table" ? "table" : spec.chartType}
                measure={spec.measure}
                dimension={spec.dimension}
                title={visual.name}
              />
            ) : (
              <p className="text-sm text-muted-foreground">This visual couldn&apos;t be computed right now.</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
