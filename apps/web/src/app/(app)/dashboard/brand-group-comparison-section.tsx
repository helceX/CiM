import { getLocale } from "next-intl/server";
import { sentimentNetScore } from "@/lib/story-presentation";
import type { BrandGroupComparisonRow } from "@cim/db";
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
export async function BrandGroupComparisonSection({ rows }: { rows: BrandGroupComparisonRow[] }) {
  const locale = await getLocale();
  const text = (tr: string, en: string) => locale === "tr" ? tr : en;
  const totalMentions = rows.reduce((sum, row) => sum + row.totalMentions, 0);
  return (
    <section className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{text("Grup karşılaştırması", "Group comparison")}</h2>
        <span className="text-xs text-muted-foreground">{text("Son 7 gün", "Last 7 days")}</span>
      </div>

      {totalMentions === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {text("Bu gruplarda henüz eşleşme yok. Grubun izlemeleri sonuç bulduğunda görünürlük payı hesaplanır.", "No mentions in these groups yet. Share of voice appears once a group’s queries match something.")}
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

      <p className="mt-2 text-xs text-muted-foreground">{text("Net duygu yalnızca analiz edilmiş kayıtlardan hesaplanır; analiz yoksa çizgi gösterilir. Eşleşme toplamları tekil haber sayısı değildir.", "Net sentiment uses analyzed records only; a dash means no analysis. Match totals are not unique-story counts.")}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{text("Marka grubu karşılaştırması, son 7 gün", "Brand group comparison, last 7 days")}</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="py-1.5 pr-4 font-medium">{text("Grup", "Group")}</th>
              <th scope="col" className="py-1.5 pr-4 font-medium">{text("İzlemeler", "Queries")}</th>
              <th scope="col" className="py-1.5 pr-4 font-medium">{text("Eşleşmeler", "Mentions")}</th>
              <th scope="col" className="py-1.5 pr-4 font-medium">{text("Görünürlük payı", "Share of voice")}</th>
              <th scope="col" className="py-1.5 pr-4 font-medium">{text("Olumlu / Nötr / Olumsuz", "Sentiment mix")}</th>
              <th scope="col" className="py-1.5 font-medium">{text("Net duygu", "Net sentiment")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const score = sentimentNetScore(row);
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
                      <span className="text-xs text-muted-foreground">{text(({ own: "Kendi markalarınız", competitor: "Rakip", category: "Kategori" })[row.kind], KIND_LABEL[row.kind])}</span>
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
