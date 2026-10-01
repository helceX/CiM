export type Kpi = { label: string; value: string; hint?: string };

const ACCENTS = [
  { line: "linear-gradient(90deg, #7b5cff, #a78bfa)", glow: "rgb(123 92 255 / 0.30)" },
  { line: "linear-gradient(90deg, #ff4fa3, #ff8ec4)", glow: "rgb(255 79 163 / 0.26)" },
  { line: "linear-gradient(90deg, #ff8a4c, #ffc857)", glow: "rgb(255 138 76 / 0.24)" },
  { line: "linear-gradient(90deg, #2fd6ff, #7be7ff)", glow: "rgb(47 214 255 / 0.22)" },
];

/** One restrained KPI row shared everywhere a dashboard needs one — the
 * brief is explicit that KPI density must stay controlled (§9). Each tile
 * carries one accent from the brand gradient so the row reads as a set. */
export function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item, index) => {
        const accent = ACCENTS[index % ACCENTS.length]!;
        return (
          <div
            key={item.label}
            className="mp-kpi"
            style={{ "--kpi-accent": accent.line, "--kpi-glow": accent.glow } as React.CSSProperties}
          >
            <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
            <dd className="mt-1.5 text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
              {item.value}
              {item.hint ? (
                <span className="mt-0.5 block text-xs font-normal tracking-normal text-muted-foreground">{item.hint}</span>
              ) : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
