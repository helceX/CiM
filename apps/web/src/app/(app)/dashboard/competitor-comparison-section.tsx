import type { CompetitorComparisonRow } from "@cim/db";

function sentimentScore(row: CompetitorComparisonRow): number | null {
  if (row.totalMentions === 0) return null;
  return Math.round(((row.positive - row.negative) / row.totalMentions) * 100);
}

export function CompetitorComparisonSection({ rows }: { rows: CompetitorComparisonRow[] }) {
  return (
    <section className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Competitor comparison</h2>
        <span className="text-xs text-muted-foreground">Last 7 days</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-1.5 pr-4 font-medium">Query</th>
              <th className="py-1.5 pr-4 font-medium">Tracking</th>
              <th className="py-1.5 pr-4 font-medium">Mentions</th>
              <th className="py-1.5 pr-4 font-medium">Sentiment mix</th>
              <th className="py-1.5 font-medium">Net sentiment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const score = sentimentScore(row);
              return (
                <tr key={row.queryId}>
                  <td className="py-2 pr-4 text-foreground">{row.queryName}</td>
                  <td className="py-2 pr-4 capitalize text-muted-foreground">{row.trackingTarget}</td>
                  <td className="py-2 pr-4 text-foreground">{row.totalMentions}</td>
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
