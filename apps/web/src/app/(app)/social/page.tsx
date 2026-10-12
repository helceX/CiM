import Link from "next/link";
import { getLocale } from "next-intl/server";
import { Badge, EmptyState } from "@cim/ui";
import { Share2 } from "lucide-react";
import {
  db,
  getSocialOverviewStats,
  getSocialPlatformDistribution,
  getSocialSentimentBreakdown,
  getTopSocialAuthors,
  getTopSocialPosts,
  getTrendingHashtags,
  listMonitoringQueries,
  getSocialSearchHealth,
} from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";
import { ChangeBadge } from "@/components/change-badge";
import { DistributionBarChart } from "@/components/charts/distribution-bar-chart";
import { KpiRow } from "@/components/kpi-row";
import { RangeSelect } from "@/components/range-select";
import { SocialSetup } from "./social-setup";
import { SocialMonitorings } from "./social-monitorings";

const VALID_RANGES = [7, 30, 90];

const SENTIMENT_TONE = {
  positive: "success",
  neutral: "neutral",
  negative: "danger",
} as const;

/**
 * docs/ux/SCREEN_INVENTORY_V2.md "Social Listening Overview" — same
 * information hierarchy as the main Dashboard (what happened -> what
 * changed -> why it matters), scoped to social-sourced mentions
 * (docs/architecture/ADR-006-SOCIAL-LISTENING.md). Engagement/Reach and
 * "Unprompted Conversations" are intentionally absent from this MVP —
 * see getSocialOverviewStats's own docstring for why showing them now
 * would mean fabricating data.
 */
export default async function SocialListeningPage({
  searchParams,
}: {
  searchParams: Promise<{ since?: string; query?: string; edit?: string }>;
}) {
  const context = await requireOrgContext();
  const locale = await getLocale();
  const text = (tr: string, en: string) => locale === "tr" ? tr : en;
  const resolved = await searchParams;
  const sinceDaysRaw = Number(resolved.since ?? "30");
  const sinceDays = VALID_RANGES.includes(sinceDaysRaw) ? sinceDaysRaw : 30;
  const socialQueries = (await listMonitoringQueries(db, context.organizationId)).filter((query) => query.sourceTypes.includes("social"));
  const selectedQuery = socialQueries.find((query) => query.id === resolved.query);
  const editing = resolved.edit === "1" && selectedQuery?.sourceTypes.length === 1 ? selectedQuery : undefined;
  const health = await getSocialSearchHealth(db, context.organizationId);
  const scope = { sinceDays, ...(selectedQuery ? { queryId: selectedQuery.id } : {}) };

  const [overview, platforms, sentiment, hashtags, authors, posts] = await Promise.all([
    getSocialOverviewStats(db, context.organizationId, scope),
    getSocialPlatformDistribution(db, context.organizationId, scope),
    getSocialSentimentBreakdown(db, context.organizationId, scope),
    getTrendingHashtags(db, context.organizationId, scope),
    getTopSocialAuthors(db, context.organizationId, scope),
    getTopSocialPosts(db, context.organizationId, scope),
  ]);

  const sentimentTotal =
    sentiment.positive +
    sentiment.neutral +
    sentiment.negative +
    sentiment.unclassified;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{text("Sosyal takip", "Social Listening")}</h1>
          <p className="text-sm text-muted-foreground">
            {text("Markanızın adı geçen gönderiler, hesap etiketleri ve yeni eşleşme bildirimleri.", "Posts mentioning your brand, account tags and alerts for new matches.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/social/mentions" className="text-sm text-primary underline underline-offset-2">
            {text("Bağlı hesapların bahsetmeleri ve etiketleri", "Mentions & tags of your connected accounts")}
          </Link>
          <RangeSelect current={sinceDays} />
        </div>
      </div>

      <SocialSetup key={editing?.id ?? "new"} canSetup={context.permissions.includes("monitoring:write") && context.permissions.includes("alerts:write")} turkish={locale === "tr"} editing={editing ? { id: editing.id, brand: editing.queryAst.company?.name ?? editing.queryAst.include.find((term) => !term.startsWith("@")) ?? "", handle: editing.queryAst.include.find((term) => term.startsWith("@")) ?? "", excluded: editing.queryAst.exclude } : undefined} />
      {health.length > 0 ? <SocialMonitorings items={health.map((item) => ({ ...item, sources: item.sources.map((source) => ({ ...source, checkedAt: source.checkedAt?.toISOString() ?? null })) }))} canEdit={context.permissions.includes("monitoring:write")} turkish={locale === "tr"} /> : null}
      <details className="rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">{text("Hangi platformda neleri takip edebilirsiniz?", "What can you monitor on each platform?")}</summary><ul className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground"><li><strong className="text-foreground">Bluesky:</strong> {text("Kendi kelimeleriniz ve hesap etiketleri için açık gönderi araması kullanılabilir. Son 3 günün en yeni 30 sonucu, arama başına yaklaşık 2 saatte bir; eksiksiz ağ taraması değildir.", "Public keyword and account-tag searches are available. Up to 30 recent results per search from the past 3 days, approximately every 2 hours; not a complete network scan.")}</li><li><strong className="text-foreground">Mastodon:</strong> {text("Genel gönderi araması sunucu ayarlarına ve yetkili hesap bağlantısına bağlıdır; bu formda etkin değildir.", "Post search depends on the server configuration and an authorized account connection; it is not enabled in this form.")}</li><li><strong className="text-foreground">Instagram · X · Facebook · LinkedIn:</strong> {text("Genel marka ve etiket takibi bu formda etkin değildir. Platforma uygun izinli bağlantılar gerekir; ücretli veya izinsiz bir tarama başlatılmadı.", "General brand/tag monitoring is not enabled in this form. Platform-compatible authorized connections are required; no paid or unauthorized collection has been started.")}</li><li><strong className="text-foreground">YouTube · Reddit · RSS:</strong> {text("Kanal veya kaynak akışları, bütün platformda yorum ve marka aramasıyla aynı kapsamda değildir. Burada bütün ağı izliyormuş gibi gösterilmez.", "Channel/source feeds are different from network-wide comment or brand search. They are not presented here as complete platform coverage.")}</li></ul></details>
      {socialQueries.length > 0 ? <nav aria-label={locale === "tr" ? "Sosyal izleme seçimi" : "Social monitoring selection"} className="flex flex-wrap gap-2">
        <Link href={`/social?since=${sinceDays}`} aria-current={!selectedQuery ? "page" : undefined} className="rounded border border-border px-3 py-2 text-sm">{locale === "tr" ? "Tüm izlemeler" : "All monitorings"}</Link>
        {socialQueries.map((query) => <Link key={query.id} href={`/social?since=${sinceDays}&query=${query.id}`} aria-current={selectedQuery?.id === query.id ? "page" : undefined} className="rounded border border-border px-3 py-2 text-sm">{query.name}</Link>)}
      </nav> : null}

      {overview.totalConversations === 0 ? (
        <EmptyState
          icon={<Share2 className="size-8" aria-hidden="true" />}
          title={text("Bu dönemde henüz sosyal eşleşme yok.", "No social conversations in this period yet.")}
          description={text("Bir takip kurun. Sonuç yoksa kaynak durumunu ve ifadelerinizi kontrol edin; ilk tarama veya sonraki kontrol bekleniyor olabilir.", "Set up monitoring. If no results appear, check the source health and your terms; the first crawl or next check may still be pending.")}
        />
      ) : (
        <>
          <KpiRow
            items={[
              {
                label: text("İzleme eşleşmeleri", "Monitoring matches"),
                value: String(overview.totalConversations),
              },
              { label: text("Doğrulanmış hesap etiketleri", "Verified account tags"), value: String(overview.verifiedAccountTags) },
              { label: text("Etiketi doğrulanmayan hesap adları", "Unverified account-name matches"), value: String(overview.directMentions - overview.verifiedAccountTags) },
              { label: text("Etiketsiz kelime eşleşmeleri", "Name / topic matches without a tag"), value: String(overview.totalConversations - overview.directMentions) },
              { label: text("Farklı yazarlar", "Unique authors"), value: String(overview.uniqueAuthors) },
              {
                label: text("Duygu analizi yapılan", "Sentiment classified"),
                value:
                  sentimentTotal > 0
                    ? `${Math.round(((sentimentTotal - sentiment.unclassified) / sentimentTotal) * 100)}%`
                    : text("Veri yok", "Not available"),
              },
            ]}
          />
          <p className="text-xs text-muted-foreground">{text("Sayılar izleme eşleşmeleridir; tekil gönderi sayısı değildir. Bir gönderi birden fazla izlemede eşleşebilir. Doğrulama bilgisi olmayan eski hesap eşleşmeleri ayrı gösterilir; normal tarama sırasında kimlik bilgisi tamamlanabilir. Geçmiş korunur; yeni eşleşmelerde bağlantı içindeki kelimeler dikkate alınmaz.", "Counts refer to monitoring matches, not unique posts. A post may match several monitorings. Legacy account-name matches without identity metadata are shown separately and may be verified during normal crawls. History is kept; new matches ignore words inside URLs.")}</p>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground">
                {text("Platform dağılımı", "Platform distribution")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {text("Bu dönemde eşleşmelerin geldiği platformlar.", "Conversations by platform in this period.")}
              </p>
              <div className="mt-3">
                {platforms.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {text("Bu dönemde platform etkinliği yok.", "No platform activity in this period.")}
                  </p>
                ) : (
                  <DistributionBarChart
                    data={platforms.map((p) => ({ label: p.platform, value: p.count }))}
                  />
                )}
              </div>
            </section>

            <section className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground">{text("Duygu analizi", "Sentiment")}</h2>
              <p className="text-xs text-muted-foreground">
                {text("Bu ücretsiz bağlantıda ücretli yapay zekâ analizi çalışmaz. Analiz edilmeyen içerikler sınıflandırılmamış olarak gösterilir.", "No paid AI analysis runs for this free connection. Unanalyzed posts remain unclassified.")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["positive", "neutral", "negative", "unclassified"] as const).map(
                  (key) => (
                    <Badge
                      key={key}
                      tone={key === "unclassified" ? "neutral" : SENTIMENT_TONE[key]}
                    >
                      {text(({ positive: "Olumlu", neutral: "Nötr", negative: "Olumsuz", unclassified: "Sınıflandırılmamış" })[key], key)} · {sentiment[key]}
                    </Badge>
                  ),
                )}
              </div>
            </section>
          </div>

          <section className="rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold text-foreground">{text("Eşleşen konu etiketleri", "Trending hashtags")}</h2>
            <p className="text-xs text-muted-foreground">
              {text("İzlemelerinizle eşleşen konu etiketleri; bu dönem ve önceki dönem karşılaştırması.", "Hashtags matched by your monitoring queries, current vs. previous period.")}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {hashtags.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {text("Bu dönemde konu etiketi eşleşmesi yok.", "No hashtag matches in this period.")}
                </p>
              ) : (
                hashtags.map((h) => (
                  <div
                    key={h.hashtag}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-foreground">{h.hashtag}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">{h.currentCount}</span>
                      <ChangeBadge
                        current={h.currentCount}
                        previous={h.previousCount}
                      />
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground">{text("Öne çıkan yazarlar", "Top authors")}</h2>
              <p className="text-xs text-muted-foreground">
                {text("Bu dönemdeki eşleşme sayısına göre.", "By conversation count in this period.")}
              </p>
              <ul className="mt-3 flex flex-col gap-3">
                {authors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {text("Bu dönemde yazar kaydı yok.", "No authors in this period.")}
                  </p>
                ) : (
                  authors.map((author) => (
                    <li
                      key={author.profileId}
                      className="flex items-center justify-between text-sm"
                    >
                      <div>
                        <p className="text-foreground">
                          {author.displayName ?? author.handle}
                          {author.verified ? (
                            <Badge tone="info" className="ml-2">
                              {text("Doğrulanmış", "Verified")}
                            </Badge>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {author.handle} ·{" "}
                          {author.followers !== null
                            ? `${author.followers.toLocaleString()} ${text("takipçi", "followers")}`
                            : text("Takipçi sayısı bilinmiyor", "Followers unknown")}
                        </p>
                      </div>
                      <span className="text-muted-foreground">
                        {author.mentionCount}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground">{text("Öne çıkan gönderiler", "Top posts")}</h2>
              <p className="text-xs text-muted-foreground">
                {text("Eşleşme önceliği ve yeniliğe göre sıralanır. Bu kaynak için etkileşim ve erişim sayıları mevcut değildir.", "Ranked by match priority and recency. Engagement and reach metrics are not available for this source.")}
              </p>
              <ul className="mt-3 flex flex-col gap-3">
                {posts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {text("Bu dönemde gönderi yok.", "No posts in this period.")}
                  </p>
                ) : (
                  posts.map((post) => (
                    <li key={post.mentionId} className="text-sm">
                      <p className="mb-1 text-xs text-muted-foreground">{post.queryName} · {post.accountTagVerified ? text("Doğrulanmış hesap etiketi", "Verified account tag") : post.matchType === "direct_mention" ? text("Hesap adı · etiket doğrulanmadı", "Account name · tag not verified") : text("Marka / konu eşleşmesi", "Name / topic match")}</p>
                      <a
                        href={post.canonicalUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-primary underline underline-offset-2"
                      >
                        {post.title}
                      </a>
                      {post.excerpt ? <p className="mt-1 text-sm text-muted-foreground">{post.excerpt}</p> : null}
                      <p className="mt-1 text-xs text-muted-foreground">{locale === "tr" ? "Eşleşen ifade" : "Matched term"}: {post.matchedTerms?.join(", ") ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {post.authorHandle ?? text("Yazar bilinmiyor", "Unknown author")} ·{" "}
                        {new Date(post.createdAt).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-GB", { timeZone: "Europe/Istanbul" })}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
