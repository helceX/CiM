# Dış servisler ve API'ler — denetim, öncelik, kurulum rehberi

Sahibi (siz) için yazıldı. "Nasıl kuracağım, hangi API'ler olmalı, bağlantıları ver" sorusunun cevabı.
Bağlantılar ve fiyatlar **canlı doğrulanmadı** — kayıt olmadan önce sayfayı açıp güncel şartları okuyun.

> **Anahtar güvenliği:** API anahtarlarını **sohbete, GitHub'a, e-postaya yapıştırmayın.** Sadece
> Railway → ilgili servis → *Variables* ekranına girin (rehber: https://docs.railway.com/guides/variables).
> Bir anahtar yanlışlıkla paylaşıldıysa sağlayıcı panelinden iptal edip yenisini üretin.

---

## 1. Denetim — bugün kodda hangi dış bağlantılar var?

| Bağlantı | Ne için | Durum | Ayar |
|---|---|---|---|
| Postgres | Veri | Çalışıyor (Railway) | `DATABASE_URL` |
| Redis | İş kuyruğu, hız sınırı | Çalışıyor (Railway) | `REDIS_URL` |
| **E-posta (Resend)** | Doğrulama, şifre sıfırlama, davet, özet | **Kapalı** — varsayılan `console`, hiçbir şey gönderilmiyor | `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` |
| **AI (Anthropic)** | Özet, duygu, öneri, asistan | **Kapalı** — varsayılan `disabled`, AI alanları "Not available" | `AI_PROVIDER`, `AI_API_KEY` |
| Giden webhook (Slack/Teams) | Uyarı bildirimi | Çalışıyor (müşteri kendi URL'sini girer) | — |
| Kaynak çekme (RSS/sitemap/web/JSON-API) | İzleme verisi | Çalışıyor; kayıtlı kaynak gerekir | Admin → Sources |
| Headless Chromium | PDF rapor | Çalışıyor | `PLAYWRIGHT_CHROMIUM_PATH` (genelde boş) |
| Meilisearch, S3, SES, OpenAI | — | Ayarı tanımlı ama **kullanılmıyor** (arama Postgres'te, dosyalar veritabanında) | boş bırakın |

**Bizim kendi API'miz:** ~50 uç nokta, hepsi uygulamanın kendi ekranları için (kimlik doğrulama, izleme,
mention, uyarı, rapor, görsel, faturalama profili…). Dışarıya açık API yalnızca *API anahtarı ile
`GET /api/mentions/{id}`*; "API & webhooks" dokümantasyonu sitede "yakında" olarak işaretli. Yani şu an
müşterilere satılabilir bir public API **yok** — bilinçli, sonraki sürüm.

### Denetimde bulduklarım (yapılacaklar)
1. **E-posta kapalı** → yeni kullanıcı doğrulama maili alamıyor. En acil. (§3.1)
2. **AI kapalı** → ürünün "akıllı" yüzü boş görünüyor. (§3.2)
3. **AI model adları:** varsayılan `AI_SYNTHESIS_MODEL=claude-sonnet-5` geçerli bir model kimliği olmayabilir.
   Canlıda açıkça şunları girin: `AI_SYNTHESIS_MODEL=claude-sonnet-5-5`, `AI_CHEAP_MODEL=claude-haiku-4-5-20251001`.
4. **Kayıt formunda bot koruması yok** (yalnızca IP başına saatte 10 kayıt sınırı). Captcha ekleyin (§3.5).
5. **Hata izleme ve uptime izleme yok** — bir şey bozulursa ilk siz değil müşteri fark eder (§3.6).
6. Yedekleme politikası kodda görünmüyor; Railway Postgres yedeklerini panelden kontrol edin.

---

## 2. Yönlendirme — hangi sırayla?

| Sıra | Ne | Neden |
|---|---|---|
| **0 — bugün** | Resend + Anthropic anahtarları, model adları | Kayıt çalışsın, AI görünsün |
| **1 — lansmandan önce** | Turnstile (captcha), Sentry + uptime, Cloudflare e-posta yönlendirme, yasal metinler | Güven ve güvenlik |
| **2 — gelir** | iyzico, e-fatura entegratörü | Para almak ve fatura kesmek |
| **3 — veri (çekirdek vaat)** | Haber kaynak kataloğu → GDELT / haber API'si | "Neyi izliyor?" sorusunun gerçek cevabı |
| **4 — genişleme** | YouTube, podcast (+ yazıya dökme), Reddit, X, bağlanan Facebook/Instagram/LinkedIn sayfaları | Sosyal ve video |
| **5 — ortakla** | TV/radyo, geniş sosyal arama (lisanslı sağlayıcı) | Pahalı, ortak gerektirir |
| **İsteğe bağlı** | Google/Microsoft ile giriş (SSO), SMS/WhatsApp/Telegram uyarıları, web analitiği | Büyüdükçe |

---

## 3. Katalog ve kurulum

### 3.1 E-posta — Resend (sıra 0)
- Site: https://resend.com · Anahtar: https://resend.com/api-keys · Domain: https://resend.com/domains
- Adımlar: (1) Hesap aç. (2) *Domains → Add domain* → `mediaory.io`. (3) Resend'in verdiği **SPF/DKIM DNS kayıtlarını** Cloudflare DNS'e ekle
  (https://dash.cloudflare.com/ → mediaory.io → DNS). (4) "Verified" olunca *API Keys → Create* (yalnızca *Sending access*).
  (5) Railway'de **hem `worker` hem `web`** servisine: `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY=<anahtar>`,
  `EMAIL_FROM=Mediaory <no-reply@mediaory.io>`. (6) Servisler yeniden başlar; kayıt olup deneyin.
- Not: mailleri gönderen **worker**'dır; değişkenler orada şart.
- Maliyet: ücretsiz katman küçük, sonra kullanım başına (doğrulayın).
- Gelen mail (`hello@mediaory.io`): Cloudflare Email Routing — https://developers.cloudflare.com/email-routing/

### 3.2 AI — Anthropic (sıra 0)
- Konsol: https://console.anthropic.com/ · Anahtar: https://console.anthropic.com/settings/keys · Doküman: https://docs.anthropic.com/
- Adımlar: (1) Hesap + ödeme yöntemi + aylık harcama limiti koy. (2) *API Keys → Create*.
  (3) Railway **worker ve web**: `AI_PROVIDER=anthropic`, `AI_API_KEY=<anahtar>`,
  `AI_SYNTHESIS_MODEL=claude-sonnet-5-5`, `AI_CHEAP_MODEL=claude-haiku-4-5-20251001`.
- Not: `AI_PROVIDER=anthropic` ama anahtar yoksa servis **açılışta bilerek hata verir** (sessizce bozulmaz).
- Maliyet: kullanım başına (token); harcama limitini mutlaka koyun.

### 3.3 Ödeme — iyzico (sıra 2)
- Site: https://www.iyzico.com · Geliştirici dokümanı: https://docs.iyzico.com/ · Sandbox: https://sandbox-merchant.iyzipay.com
- Adımlar: şirket evraklarıyla üye iş yeri başvurusu → onay → sandbox anahtarlarıyla geliştirme → canlı anahtar.
  Kod tarafı (adapter) başvuru onayı beklemeden sandbox ile yazılabilir. Havale/EFT kurumsal müşteriler için ayrıca.
- Stripe Türkiye'deki şirketlere açık olmayabilir; karar öncesi https://stripe.com/global adresinden doğrulayın.

### 3.4 e-Fatura / e-Arşiv entegratörü (sıra 2)
- Yasal fatura bir **özel entegratör** üzerinden kesilir. Mali müşavirinizle seçin. Aday örnekler (doğrulayın):
  Paraşüt (API: https://apidocs.parasut.com/), Nilvera (https://www.nilvera.com), Uyumsoft, Logo İşbaşı.
- Gereken: entegratörün **API erişimi** olması. Kod tarafında fatura profili (VKN/vergi dairesi/adres) zaten hazır.

### 3.5 Bot koruması — Cloudflare Turnstile (sıra 1)
- https://developers.cloudflare.com/turnstile/ · Panel: https://dash.cloudflare.com/ (Turnstile)
- Ücretsiz. Site anahtarı + gizli anahtar alınır; kayıt/şifre sıfırlama formlarına eklenir (ben kodlarım).
  Değişkenler: `TURNSTILE_SITE_KEY` (web), `TURNSTILE_SECRET_KEY` (web).

### 3.6 Hata ve uptime izleme (sıra 1)
- Sentry (hata): https://sentry.io — proje aç, `SENTRY_DSN` ver (ben bağlarım). Ücretsiz katman var.
- Uptime: https://uptimerobot.com veya https://betterstack.com — `https://mediaory.io/login` adresini 1-5 dk'da bir kontrol etsin.

### 3.7 Veri toplama API'leri (sıra 3–5) — detay: `COVERAGE.md`
| Kaynak | Bağlantı | Not |
|---|---|---|
| **Kaynak kataloğu (RSS/sitemap)** | — (API gerekmez) | Önce bu. Türkiye haber/iş/sektör siteleri |
| GDELT (global haber, ücretsiz) | https://www.gdeltproject.org/ · DOC API: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/ | Anahtarsız; Türkçe dahil |
| Haber arama API'leri (uzun kuyruk, ücretli) | https://newsapi.org · https://newsapi.ai (Event Registry) · https://www.thenewsapi.com · https://mediastack.com | Kelime ver, haber al; fiyat/şart karşılaştırın |
| Açık web arama (keşif) | https://brave.com/search/api/ · https://serpapi.com | Bing Web Search API 2025'te kapatıldı; Google Custom Search'ün yeni müşteri durumunu kontrol edin |
| YouTube | https://developers.google.com/youtube/v3 · kota: https://developers.google.com/youtube/v3/determine_quota_cost · konsol: https://console.cloud.google.com/apis/library/youtube.googleapis.com | Ücretsiz günlük kota; başlık/açıklama/yorum. `YOUTUBE_API_KEY` |
| Podcast keşfi | https://podcastindex.org/ (API: https://podcastindex-org.github.io/docs-api/) | Ücretsiz; bölüm RSS'leri açık |
| Yazıya dökme (podcast/ses) | https://www.assemblyai.com · https://deepgram.com · https://platform.openai.com/docs/guides/speech-to-text | Ses saati başına ücret |
| Reddit | https://www.reddit.com/dev/api/ | Ticari kullanım için anlaşma gerekir |
| X (Twitter) | https://developer.x.com/ | Ücretli; fiyat sık değişir |
| Facebook / Instagram | https://developers.facebook.com/docs/graph-api/ · https://developers.facebook.com/docs/instagram-platform/ | Yalnızca müşterinin **bağladığı** sayfalar/hesaplar; herkese açık kelime araması yok |
| LinkedIn | https://learn.microsoft.com/en-us/linkedin/ | Herkese açık gönderi araması yok; yönetilen sayfalar, onay gerekir |
| TikTok | https://developers.tiktok.com/ | Kısıtlı erişim, başvuru |
| Bluesky / Mastodon | https://docs.bsky.app/ · https://docs.joinmastodon.org/api/ | Açık, ücretsiz; Türkiye'de küçük kitle |
| TV/radyo | Medya izleme ajansı / sağlayıcı ortaklığı | Kendimiz kayıt yapmayız |

### 3.8 İsteğe bağlı site API'leri
- **Google ile giriş:** https://developers.google.com/identity/protocols/oauth2 · **Microsoft (Entra) SSO:** https://learn.microsoft.com/entra/identity-platform/
- **Slack uyarıları (müşteri tarafı):** https://api.slack.com/messaging/webhooks · **Teams:** https://learn.microsoft.com/microsoftteams/platform/webhooks-and-connectors/ (zaten destekli)
- **Telegram uyarıları:** https://core.telegram.org/bots/api · **WhatsApp Business:** https://developers.facebook.com/docs/whatsapp
- **SMS (Türkiye):** https://www.netgsm.com.tr · https://www.iletimerkezi.com — ticari ileti izni/İYS kurallarına dikkat
- **Web analitiği:** https://plausible.io (çerezsiz, KVKK dostu) veya https://posthog.com
- **Sağlık kontrolü / durum sayfası:** https://betterstack.com/status-page

---

## 4. Railway değişken haritası

| Değişken | web | worker | Not |
|---|:-:|:-:|---|
| `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `APP_URL` | ✓ | ✓ | Zaten var |
| `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` | ✓ | ✓ | **Eksik — acil** |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_SYNTHESIS_MODEL`, `AI_CHEAP_MODEL` | ✓ | ✓ | **Eksik** |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | ✓ | | Eklenecek |
| `SENTRY_DSN` | ✓ | ✓ | Eklenecek |
| `YOUTUBE_API_KEY`, haber/transkript anahtarları | | ✓ | Veri çekmeyi worker yapar |
| iyzico / e-fatura anahtarları | ✓ | ✓ | Sonra |

## 5. Benim yapabileceğim / sizin yapmanız gereken
- **Siz:** hesap açmak, ödeme yöntemi, DNS kaydı, anahtar üretmek, Railway'e girmek (kimlik ve ödeme gerektirir).
- **Ben:** her entegrasyonun kodu, bağlantı testi, hata durumları, yönetici ekranı, dokümantasyon.
- Bir anahtarı Railway'e girdikten sonra bana "girdim" yazmanız yeter; anahtarı göstermeyin.
