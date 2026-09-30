# Billing & pricing — decisions and plan

> Türkçe özet: Anahtar kelime = virgülle ayrılmış her öğe (tek kelime ya da cümle). Fiyatlandırma yalnızca anahtar kelimeye göre; yapay zekâ çağrıları kredi harcamaz. Ödeme: **iyzico** (TL, kart + taksit) ve kurumsal müşteriler için **havale/EFT**; yasal fatura (e-Fatura / e-Arşiv) ödeme sağlayıcısından değil, **lisanslı bir entegratörden** (örn. Paraşüt) kesilir. Sizin yapmanız gerekenler en altta.

Status: **decided by the owner (keywords) and by the assistant on the owner's delegation (provider).** Numbers (prices, allowances) are still open.

## 1. What a "keyword" is (owner's definition)

A keyword is **one comma-separated item** the customer enters — a single word *or* a whole sentence. The platform treats each item as its own search target: it is matched as written (case- and Turkish-diacritic-insensitive, as a substring of the article text) and a mention is produced when **any** keyword matches. Exclusions narrow results and are free.

- Input: `acme, acme holding, yeni ürün lansmanı` → 3 keywords.
- The same text entered twice (any case) is one keyword.
- Credit metering counts these distinct keywords per day (see `NEXT_FEATURES_SPEC.md` §3).

## 2. What is priced

- **Only keywords.** One credit = one tracked keyword for one day. AI calls do **not** consume credits in v1 (simple, predictable, matches "price by keyword"); heavy AI use is covered by a fair-use clause instead.
- A plan is expressed as **keyword slots** (how many keywords can be tracked at once); the ledger converts that to ~30 credits/slot/month. Slot prices and any volume discounts are for the owner to set.

## 3. Payment provider — recommendation: iyzico (+ bank transfer)

Requirement from the owner: customers are **companies** and must receive a **legal invoice (fatura)**.

| Need | Choice | Why |
|---|---|---|
| Card payments in TRY, installments, local cards, 3-D Secure | **iyzico** (subscriptions) | Turkish PSP built for Turkish-registered merchants; TRY settlement |
| Corporate buyers who pay by transfer | **Havale/EFT against an invoice** (manual reconciliation first) | Common B2B practice in Türkiye; no card fee |
| Legal invoice | **e-Fatura / e-Arşiv through a licensed integrator** (e.g. Paraşüt API, or the one your accountant uses) | A payment provider does **not** issue the legal invoice; an integrator does, and must be tied to the company's tax ID |
| Customers outside Türkiye (later) | Stripe or a merchant-of-record (e.g. Paddle) | Out of scope for launch |

Stripe is not the default because, as far as I know, it does not onboard Turkish-registered companies directly — **verify at application time**, this is a fact to confirm, not a certainty. Tax and e-invoice specifics (KDV rate, e-Fatura vs e-Arşiv obligations, invoice timing) are my understanding only: **confirm with your mali müşavir before launch**.

## 4. Build plan (provider-agnostic, in order)

1. **Keyword list input** — comma-separated entry everywhere keywords are typed; counting follows §1. *(in progress)*
2. **Billing profile** — per organization: legal name (unvan), tax office (vergi dairesi), tax number (VKN/TCKN), address, invoice e-mail. Required before any paid plan.
3. **Plans & allowance** — `subscriptions.plan` becomes a real plan with keyword slots; grants written to `credit_ledger`.
4. **Provider adapter** — a small `PaymentProvider` interface (create checkout, handle webhook, cancel) with an iyzico implementation behind it, so the provider can change without touching the rest.
5. **Invoices** — an `invoices` table (number, period, amounts, KDV, status) fed by the integrator; invoice list + PDF link in Settings.
6. **Enforcement** — low-balance banner, then block *creating new keywords* at the limit (never pause existing monitoring silently).

Steps 2–6 start only after the owner has a merchant account and an invoicing integrator to integrate against.

## 5. What the owner needs to do

1. Confirm the business entity that will sell Mediaory (şahıs / limited / anonim) — invoices and the payment account must be in that entity's name.
2. Apply for an **iyzico merchant account** (typically: tax certificate, signature circular, IBAN, company details) and request sandbox API keys.
3. With the mali müşavir: confirm **e-Fatura/e-Arşiv** registration and choose the **integrator**; get API access.
4. Decide the **price per keyword slot** (monthly) and any free tier / trial.
5. Review the terms of service and privacy pages (not written yet).
