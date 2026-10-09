# Panel language — English and Türkçe

Decision (owner, 9 Oct 2026): the panel gets a Turkish version. This page is the working agreement for it:
how the language is chosen, how strings are kept, the Turkish vocabulary, and what is translated so far.

## How the language is chosen

One mechanism for the whole site (marketing and panel), already in place since the marketing translation:

1. the visitor's explicit choice (cookie `NEXT_LOCALE`, set by the language switch) wins;
2. otherwise the browser's `Accept-Language` (Turkish browsers get Turkish);
3. otherwise English.

No locale in the URL: the panel is behind a sign-in, so there is nothing to index. A signed-in person changes
language from the account menu; the choice is also stored on their user record (`users.locale`) so e-mails and
reports can follow it (a later slice — see "Not yet").

## How strings are kept

- `apps/web/messages/<locale>/<area>.json` — one file per area (`marketing`, `shell`, `auth`, `monitoring`,
  `mentions`, …). The files of one locale are merged into one catalog; namespaces never repeat across files.
- English is the source: a key exists in `en/` first, and `tr/` must have **exactly the same keys** (a test
  enforces it, per file).
- Components use `next-intl`: `useTranslations("area.section")` in client components,
  `await getTranslations("area.section")` in server components. Keys are type-checked against the English catalog.
- Numbers and dates go through `useFormatter()` / `getFormatter()` (never `toLocaleString("en-US")`).
- Plurals use ICU: `{count, plural, one {# story} other {# stories}}` (Turkish needs only `other`, but write both
  forms in English).
- A string that is built from pieces is a single message with placeholders — never concatenate translated
  fragments, because Turkish word order differs.
- The client only receives the namespaces its route group needs (`pickMessages`), so the panel catalog does not
  weigh down marketing pages.
- ESLint forbids visible English text in JSX in the areas already converted
  (`no-restricted-syntax` on `JSXText` and on `placeholder/title/aria-label/alt` literals), so they do not slide back.
- The platform admin area stays English (internal tool).
- API routes answer in the caller's language: `const e = await getTranslations("errors")` (server-only namespace
  `errors`), and form errors from validation go through `messageKey()` (`src/lib/validation-keys.ts`) so the form
  shows the Turkish sentence for the same rule.
- Unit tests alias `next-intl/server` to an English stand-in (`vitest.next-intl-server.ts`): its API needs a running
  Next.js request. An alias, not `vi.mock` in a setup file — a mock is keyed by the module the specifier resolves
  to, and `next-intl` is installed under `apps/web` only, so a mock registered from the repository root never matched.

## Turkish vocabulary

Kept consistent with the marketing copy that already exists.

| English | Türkçe | Not |
|---|---|---|
| Dashboard | Pano | |
| Monitoring / monitorings | İzleme / izlemeler | |
| Mention(s) | Bahsetme / Bahsetmeler | "anma" |
| Story / stories (an article) | Haber / haberler | |
| Alert / alert rule | Uyarı / uyarı kuralı | |
| Report | Rapor | |
| Archive | Arşiv | |
| Source | Kaynak | |
| Keyword | Anahtar kelime | |
| Workspace | Çalışma alanı | |
| Organization | Organizasyon | "kurum" only in marketing prose |
| Team / member | Ekip / üye | |
| Role | Rol | |
| Settings | Ayarlar | |
| Sign in / Sign out | Giriş yap / Çıkış yap | |
| Sentiment: positive / neutral / negative | Duygu: olumlu / nötr / olumsuz | |
| Priority / Importance | Önem | |
| Important / Worth a look / Passing mention | Önemli / Göz atmaya değer / Kısa değinme | |
| Folded away | Gizlendi (katlandı) | |
| Competitor | Rakip | |
| Brand group | Marka grubu | |
| Share of voice | Ses payı | |
| Tag / assign / assignee | Etiket / ata / atanan kişi | |
| Digest | Özet (günlük özet) | |
| Notification | Bildirim | |
| Connected account | Bağlı hesap | |
| Billing profile | Fatura profili | |

Tone: "siz" (formal plural), short sentences, verbs for buttons in the imperative ("Kaydet", "Oluştur", "Sil").
Product and brand names stay as they are (Mediaory, YouTube, X, Reddit). Technical identifiers the person types
(keywords, query syntax) are never translated.

## Slices

| # | Slice | Status |
|---|---|---|
| 1 | Language mechanism for the panel, shell (sidebar, top bar, account menu with language switch, notifications, command palette, mobile nav), shared components | done |
| 2 | Onboarding and sign-in / sign-up / reset / invitation pages, and the messages of their API routes | done |
| 3 | Dashboard, analytics, charts, alerts, archive | planned |
| 4 | Monitoring (list, create/edit, intent questions, check tool) | planned |
| 5 | Mentions (by day, list, drawer, filters) and the signal explanations ("why you see this") | planned |
| 6 | Reports, visuals, social | planned |
| 7 | Team and settings | planned |
| 8 | E-mails, digests, alert messages and report documents in the person's language | planned |

## Not yet

- E-mails, digests, webhook text and generated reports are produced by the worker without a request, so they
  need the person's stored language (`users.locale`) — slice 8.
- API error messages outside sign-in, sign-up, password, invitation and onboarding (`{ "error": "…" }`) are still
  English; the panel shows a translated generic message where it can and the English text otherwise. They move
  over with the slice of the page that calls them.
