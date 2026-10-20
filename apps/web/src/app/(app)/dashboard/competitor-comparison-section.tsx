import { getLocale } from "next-intl/server";
import { sentimentNetScore } from "@/lib/story-presentation";
import type { CompetitorComparisonRow } from "@cim/db";

export async function CompetitorComparisonSection({ rows }: { rows: CompetitorComparisonRow[] }) {
  const locale = await getLocale();
  const text = (tr: string, en: string) => locale === "tr" ? tr : en;
  return (
    <section className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{text("Rakip karşılaştırması", "Competitor comparison")}</h2>
        <span className="text-xs text-muted-foreground">{text("Son 7 gün", "Last 7 days")}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{text("Net duygu yalnızca analiz edilmiş kayıtlardan hesaplanır; analiz yoksa çizgi gösterilir. Eşleşme toplamları tekil haber sayısı değildir.", "Net sentiment uses analyzed records only; a dash means no analysis. Match totals are not unique-story counts.")}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-1.5 pr-4 font-medium">{text("İzleme", "Query")}</th>
              <th className="py-1.5 pr-4 font-medium">{text("Takip türü", "Tracking")}</th>
              <th className="py-1.5 pr-4 font-medium">{text("Eşleşmeler", "Mentions")}</th>
              <th className="py-1.5 pr-4 font-medium">{text("Olumlu / Nötr / Olumsuz", "Sentiment mix")}</th>
              <th className="py-1.5 font-medium">{text("Net duygu", "Net sentiment")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const score = sentimentNetScore(row);
              return (
                <tr key={row.queryId}>
                  <td className="py-2 pr-4 text-foreground">{row.queryName}</td>
                  <td className="py-2 pr-4 capitalize text-muted-foreground">{text(({ company: "Kendi kurumunuz", competitor: "Rakip", topic: "Konu" })[row.trackingTarget] ?? row.trackingTarget, row.trackingTarget)}</td>
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
