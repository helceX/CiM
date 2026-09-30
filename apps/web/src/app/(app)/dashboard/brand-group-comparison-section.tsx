import type { BrandGroupComparisonRow } from "@cim/db";
import { netSentiment } from "@cim/core";
import { groupColorVar } from "@/lib/brand-group-colors";

const KIND_LABEL = { own: "Own brands", competitor: "Competitor", category: "Category" } as const;

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/**
 * docs/product/NEXT_FEATURES_SPEC.md §1 — compares brand groups on share of
 * voice (each group's mentions ÷ all compared groups') and sentiment. Every
 * bar is labelled with its group name and value, so colour is never the only
 * carrier of identity; the table underneath is the accessible data view.
 */
export function BrandGroupComparisonSection({ rows }: { rows: BrandGroupComparisonRow[] }) {
  const totalMentions = rows.reduce((sum, row) => sum + row.totalMentions, 0);
  return (
    <section className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Group comparison</h2>
        <span className="text-xs text-muted-foreground">Last 7 days</span>
      </div>

      {totalMentions === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No mentions in these groups yet. Share of voice appears once a group&apos;s queries
          match something.
        </p>
      ) : (
        <div
          className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-surface-muted"
          role="img"
          aria-label={`Share of voice: ${rows
            .map((row) => `${row.name} ${percent(row.shareOfVoice)}`)
            .join(", ")}`}
        >
          {rows
            .filter((row) => (row.shareOfVoice ?? 0) > 0)
            .map((row) => (
              <span
                key={row.groupId}
                style={{ width: `${(row.shareOfVoice ?? 0) * 100}%`, background: groupColorVar(row.color) }}
                // 2px gap between adjacent fills, per the chart mark spec.
                className="border-r-2 border-surface last:border-r-0"
              />
            ))}
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Brand group comparison, last 7 days</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="py-1.5 pr-4 font-medium">Group</th>
              <th scope="col" className="py-1.5 pr-4 font-medium">Queries</th>
              <th scope="col" className="py-1.5 pr-4 font-medium">Mentions</th>
              <th scope="col" className="py-1.5 pr-4 font-medium">Share of voice</th>
              <th scope="col" className="py-1.5 pr-4 font-medium">Sentiment mix</th>
              <th scope="col" className="py-1.5 font-medium">Net sentiment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const net = netSentiment(row);
              const score = net === null ? null : Math.round(net * 100);
              return (
                <tr key={row.groupId}>
                  <th scope="row" className="py-2 pr-4 text-left font-normal text-foreground">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-sm"
                        style={{ background: groupColorVar(row.color) }}
                      />
                      {row.name}
                      <span className="text-xs text-muted-foreground">{KIND_LABEL[row.kind]}</span>
                    </span>
                  </th>
                  <td className="py-2 pr-4 text-muted-foreground">{row.queryCount}</td>
                  <td className="py-2 pr-4 text-foreground">{row.totalMentions}</td>
                  <td className="py-2 pr-4 text-foreground">{percent(row.shareOfVoice)}</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {row.positive}/{row.neutral}/{row.negative}
                  </td>
                  <td className="py-2 text-foreground">
                    {score === null ? "—" : `${score > 0 ? "+" : ""}${score}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
