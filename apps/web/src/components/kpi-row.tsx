export type Kpi = { label: string; value: string; hint?: string };

/** One restrained KPI row shared everywhere a dashboard needs one — the
 * brief is explicit that KPI density must stay controlled (§9). */
export function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="bg-surface px-4 py-3">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 text-xl font-semibold text-foreground">{item.value}</dd>
          {item.hint ? <p className="mt-0.5 text-xs text-muted-foreground">{item.hint}</p> : null}
        </div>
      ))}
    </dl>
  );
}
