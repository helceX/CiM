import Link from "next/link";
import { getLocale } from "next-intl/server";
import { getEnv } from "@cim/config";
import { getAIProvider } from "@cim/ai";
import { groupStoryRows, sentimentCoverage } from "@/lib/story-presentation";
import { Badge, Button, EmptyState } from "@cim/ui";
import { Radar } from "lucide-react";
import { signalLevelLabel } from "@cim/core";
import {
  db,
  getBrandGroupComparison,
  getCompetitorComparison,
  getDashboardSummary,
  getLatestInsightForOrganization,
  getMentionVolumeSeries,
  listBrandMentions,
  listLatestRecommendationsForOrganization,
  listProjects,
  listRecentMentions,
} from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/session";
import { KpiRow } from "@/components/kpi-row";
import { MentionTrendChart } from "@/components/charts/mention-trend-chart";
import { AiAssistantPanel } from "./ai-assistant-panel";
import { CompetitorComparisonSection } from "./competitor-comparison-section";
import { BrandGroupComparisonSection } from "./brand-group-comparison-section";
import { RecommendationsSection } from "./recommendations-section";
import { RiskBanner } from "./risk-banner";
import { PinnedVisualsSection } from "./pinned-visuals-section";
import { SourceCoverage } from "@/components/source-coverage";

// A "risk" insight row is only ever created when detectRisk actually
// flags something (most periods produce nothing), unlike "whats_changed"
// which refreshes daily whenever there's coverage — so without a cutoff
// the danger-styled RiskBanner could keep showing a resolved risk from
// weeks ago as if it were still live. Same 24h window
// apps/worker/src/jobs/send-executive-brief.ts already applies before
// emailing a "whats_changed" brief.
const RISK_FRESHNESS_HOURS = 24;

const SENTIMENT_TONE = {
  positive: "success",
  neutral: "neutral",
  negative: "danger",
} as const;

const PRIORITY_TONE = {
  low: "neutral",
  normal: "neutral",
  high: "warning",
  critical: "danger",
} as const;

export default async function DashboardPage() {
  const context = await requireOrgContext();
  const locale = await getLocale();
  const text = (tr: string, en: string) => locale === "tr" ? tr : en;
  const date = (value: Date | string) => new Date(value).toLocaleDateString(locale, { timeZone: "Europe/Istanbul" });
  const [projects, user] = await Promise.all([
    listProjects(db, context.organizationId),
    getCurrentUser(),
  ]);

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<Radar className="size-8" aria-hidden="true" />}
        title={text("Henüz izleme oluşturulmadı.", "No monitoring has been created yet.")}
        description={text("Burada sonuç görmek için markanızı, bir rakibi veya sektör konusunu izleyin.", "Track your brand, a competitor, or an industry topic to start seeing mentions here.")}
        action={
          <Button asChild size="sm">
            <Link href="/onboarding">{text("İlk izlemenizi oluşturun", "Create your first monitoring")}</Link>
          </Button>
        }
      />
    );
  }

  const [
    summary,
    recentMentions,
    trend,
    insight,
    competitorComparison,
    recommendations,
    risk,
    brandGroupComparison,
    brand,
  ] = await Promise.all([
    getDashboardSummary(db, context.organizationId, { sinceDays: 7 }),
    listRecentMentions(db, context.organizationId, { limit: 50 }),
    getMentionVolumeSeries(db, context.organizationId, { sinceDays: 14 }),
    getLatestInsightForOrganization(db, context.organizationId, "whats_changed"),
    getCompetitorComparison(db, context.organizationId, { sinceDays: 7 }),
    listLatestRecommendationsForOrganization(db, context.organizationId),
    getLatestInsightForOrganization(db, context.organizationId, "risk", {
      freshSince: new Date(Date.now() - RISK_FRESHNESS_HOURS * 60 * 60 * 1000),
    }),
    getBrandGroupComparison(db, context.organizationId, { sinceDays: 7 }),
    listBrandMentions(db, context.organizationId, { limit: 8, sinceDays: 30 }),
  ]);
  const coverage = sentimentCoverage(summary);
  const recentStories = groupStoryRows(recentMentions, 10);
  const brandStories = groupStoryRows(brand.items, 8);
  const aiAvailable = getAIProvider(getEnv()) !== null;
  const sentimentLabel = (value: string) => locale === "tr" ? ({ positive: "Olumlu", neutral: "Nötr", negative: "Olumsuz" }[value] ?? value) : value;
  const priorityLabel = (value: string) => locale === "tr" ? ({ low: "Düşük sinyal", normal: "İncelemeye değer", high: "Yüksek öncelik", critical: "Kritik" }[value] ?? value) : signalLevelLabel(value);
  const hasCompetitor = competitorComparison.some(
    (row) => row.trackingTarget === "competitor",
  );
  // AI_ARCHITECTURE.md Trust Layer — an Insight with zero evidence rows is
  // never rendered (send-executive-brief.ts applies the same filter to
  // "whats_changed" before emailing it). Reachable here too: evidence rows
  // cascade-delete with their Mention (schema/ai.ts), and unlike "risk"'s
  // own 24h freshness window, a recommendation has no staleness bound —
  // a dormant project's months-old recommendation can outlive its own
  // evidence once retention (30+ days minimum) catches up to it.
  const evidencedRecommendations = recommendations.filter(
    (item) => item.evidence.length > 0,
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="mp-hero p-6 md:p-8">
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {context.organizationName} · {text("son 7 gün", "last 7 days")} · {projects.length} {text("proje", projects.length === 1 ? "project" : "projects")}
            </p>
            <h1 className="mt-2">
              <span className="sr-only">{text("Pano — ", "Dashboard — ")}</span>
              {user ? text(`Merhaba, ${user.firstName}.`, `Hello, ${user.firstName}.`) : text("Pano", "Dashboard")}{" "}
              <span className="mp-gradient-text">{text("Gündeminiz burada.", "Here’s what changed.")}</span>
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/monitoring/new">{text("Yeni izleme", "New monitoring")}</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/mentions">{text("Bahsetmeleri aç", "Open mentions")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <SourceCoverage organizationId={context.organizationId} />

      <KpiRow
        items={[
          { label: text("İzleme eşleşmeleri", "Total mentions"), value: String(summary.totalMentions) },
          { label: text("Farklı kaynaklar", "Unique sources"), value: String(summary.uniqueSources) },
          { label: text("Yüksek öncelik", "High priority"), value: String(summary.highPriority) },
          {
            label: text("Duygu analizi kapsamı", "Sentiment analysis coverage"),
            value: coverage.percent === null ? text("Veri yok", "No data") : coverage.classified === 0 ? text("Henüz analiz yok", "Not analyzed yet") : `${coverage.percent}% ${text("analiz edildi", "analyzed")}`,
            hint: `${coverage.classified} ${text("analiz edilmiş", "classified")} · ${coverage.unclassified} ${text("analiz edilmemiş", "unclassified")}`,
          },
        ]}
      />

      {risk && risk.evidence.length > 0 ? <RiskBanner risk={risk} /> : null}

      {insight && insight.evidence.length > 0 ? (
        <section className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">{text("Dünden bu yana", "Since yesterday")}</h2>
            <span className="text-xs text-muted-foreground">{insight.projectName}</span>
          </div>
          <p className="mt-2 text-sm text-foreground">{insight.summary}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{text("Güven", "Confidence")} {Math.round(Number(insight.confidence) * 100)}%</span>
            <span>{text("Yöntem", "Method")}: {insight.method}</span>
            <span>
              {insight.evidence.length} {text("bahsetmeye dayanır", "supporting mentions")}
            </span>
          </div>
        </section>
      ) : null}

      {evidencedRecommendations.length > 0 ? (
        <RecommendationsSection items={evidencedRecommendations} />
      ) : null}

      <p className="text-xs text-muted-foreground">{text("Toplamlar izleme eşleşmeleridir; aynı haber birden fazla izlemede sayılabilir. Analiz edilmemiş kayıtlar nötr sayılmaz.", "Totals count monitoring matches; one story can match several monitorings. Unanalyzed records are not neutral.")}</p>
      {aiAvailable ? <AiAssistantPanel /> : <section className="rounded-lg border border-border p-4"><h2 className="text-sm font-semibold">{text("Yapay zekâ analizi kapalı", "AI analysis is off")}</h2><p className="mt-1 text-sm text-muted-foreground">{text("Bu ortamda bir yapay zekâ sağlayıcısı etkin değil. Haber takibi ve kaynak bağlantıları çalışmaya devam eder; duygu ve yapay zekâ özetleri üretilmez.", "No AI provider is enabled in this environment. Monitoring and source links still work; sentiment and AI summaries are not generated.")}</p></section>}

      {summary.totalMentions > 0 ? (
        <section className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">{text("Bahsetme eğilimi", "Mention trend")}</h2>
            <Link
              href="/analytics"
              className="text-xs text-primary underline underline-offset-2"
            >
              {text("Analizi aç", "View analytics")}
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">{text("Son 14 gün.", "Last 14 days.")}</p>
          <div className="mt-2">
            <MentionTrendChart data={trend} />
          </div>
        </section>
      ) : null}

      {brandGroupComparison.length > 0 ? (
        <BrandGroupComparisonSection rows={brandGroupComparison} />
      ) : null}

      {hasCompetitor ? (
        <CompetitorComparisonSection rows={competitorComparison} />
      ) : null}

      <PinnedVisualsSection organizationId={context.organizationId} />

      {brand.names.length > 0 ? (
        <section aria-labelledby="your-brand-heading">
          <div className="flex items-center justify-between">
            <h2
              id="your-brand-heading"
              className="text-sm font-semibold text-foreground"
            >
              {text("Haberlerde markanız", "Your brand in the news")}
            </h2>
            <Link
              href="/mentions"
              className="text-xs text-primary underline underline-offset-2"
            >
              {text("Tüm bahsetmeler", "View all mentions")}
            </Link>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {text("Şu adların", "Stories that name")}{" "}
            <strong className="font-semibold text-foreground">
              {brand.names.join(" · ")}
            </strong>{" "}
            {text("doğrudan geçen hikâyeler — son 30 gün.", "directly — last 30 days.")}
          </p>
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            {brand.items.length === 0 ? (
              <EmptyState
                title={text("Henüz şirket adınızı içeren hikâye yok", "No story names your company yet")}
                description={text("Şirket adınız başlıkta veya özette bulunduğunda, kaynak kontrolünün ardından burada görünür.", "Stories show up here the moment a source writes your company's name in a headline or its first lines.")}
                className="border-none"
              />
            ) : (
              <ul className="divide-y divide-border">
                {brandStories.map(({ representative: { mention, article, source, matchedName, where }, matches }) => (
                  <li key={mention.id} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        <Link
                          href={`/mentions?open=${mention.id}`}
                          className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {article.title}
                        </Link>
                      </p>
                      {mention.sentiment ? (
                        <Badge
                          tone={
                            SENTIMENT_TONE[
                              mention.sentiment as keyof typeof SENTIMENT_TONE
                            ]
                          }
                        >
                          {sentimentLabel(mention.sentiment)}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {source.name} · {matches} {text("gösterimdeki eşleşme", "matches in this view")}
                      {article.publishedAt
                        ? ` · ${date(article.publishedAt)}`
                        : ""}{" "}
                      · {text("eşleşen ad", "matched name")}: <span className="text-foreground">{matchedName}</span> · {text(where === "headline" ? "başlıkta" : "özette", where)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : (
        <section aria-labelledby="top-stories-heading">
          <div className="flex items-center justify-between">
            <h2
              id="top-stories-heading"
              className="text-sm font-semibold text-foreground"
            >
              {text("Son hikâyeler", "Latest stories")}
            </h2>
            <Link
              href="/mentions"
              className="text-xs text-primary underline underline-offset-2"
            >
              {text("Tüm bahsetmeler", "View all mentions")}
            </Link>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {text("En yeni 50 eşleşme içindeki ortak haber ve hikâye kimlikleri birleştirilir; en fazla 10 hikâye gösterilir. Eşleşmelerin tamamı Bahsetmeler ekranında korunur.", "Known article and story identities within the latest 50 matches are grouped; up to 10 stories are shown. All matches remain available in Mentions.")}{" "}
            <Link
              href="/monitoring"
              className="text-primary underline underline-offset-2"
            >
              {text("İzlemeleri aç", "Open monitoring")}
            </Link>
          </p>
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            {recentMentions.length === 0 ? (
              <EmptyState
                title={text("Henüz eşleşme yok", "No mentions yet")}
                description={text("Önce kayıtlı haberler kontrol edilir; yeni haberler yaklaşık 8 saatlik kaynak kontrollerinde eşleştirilir. Sonuç yoksa ayırt edici marka adınızı ve kaynak kapsamını kontrol edin.", "We check stored stories first, then match new stories as sources are checked. If nothing matches, review your keywords and source coverage. Try a distinctive brand name, spelling variant or relevant phrase.")}
                action={
                  <Link
                    href="/monitoring"
                    className="text-sm text-primary underline underline-offset-2"
                  >
                    {text("Kelimeleri ve kaynakları gözden geçirin", "Review monitoring keywords and sources")}
                  </Link>
                }
                className="border-none"
              />
            ) : (
              <ul className="divide-y divide-border">
                {recentStories.map(({ representative: { mention, article, source }, matches }) => (
                  <li key={mention.id} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        <Link
                          href={`/mentions?open=${mention.id}`}
                          className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {article.title}
                        </Link>
                      </p>
                      <div className="flex shrink-0 items-center gap-2">
                        {mention.sentiment ? (
                          <Badge
                            tone={
                              SENTIMENT_TONE[
                                mention.sentiment as keyof typeof SENTIMENT_TONE
                              ]
                            }
                          >
                            {sentimentLabel(mention.sentiment)}
                          </Badge>
                        ) : (
                          <Badge tone="neutral">{text("Analiz edilmedi", "Unclassified")}</Badge>
                        )}
                        <Badge
                          tone={
                            PRIORITY_TONE[
                              mention.priority as keyof typeof PRIORITY_TONE
                            ]
                          }
                        >
                          {priorityLabel(mention.priority)}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {source.name} · {matches} {text("gösterimdeki eşleşme", "matches in this view")}
                      {article.publishedAt
                        ? ` · ${date(article.publishedAt)}`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
