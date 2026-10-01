# Print media (newspapers & magazines)

Mediaory reads the **open web**. A printed newspaper or magazine page is not on
the web, so print can only arrive from a source that already holds the printed
edition. This document says what is built, what is not, and the realistic ways
to get print coverage.

## What is built

- Source types **Newspaper** and **Magazine** (shown with a badge next to Digital news, News agency, Blog …; they share the *News & press* cluster).
- A story can carry **print data**: publication, edition date, page, section, a link to the page, and a preview image. Mentions show a "Print · Cumhuriyet · 1 Oct 2026 · p. 12" line with **View page**; the detail drawer shows the page preview and link.
- An admin-added **Clipping / data provider (JSON API)** source, with an optional API key sent in a header of your choice (stored server-side, never shown again). It is fetched like every source (every 2 hours, SSRF-guarded) and **tested before it is saved**.
- Print references are validated: https links only, page numbers and dates sanity-checked, anything malformed is dropped.

We store **references only** — never a copy of the page. The page image stays on the provider's / publisher's servers and is linked.

## How print gets in (options)

| Route | What it needs | Notes |
|---|---|---|
| **A. A clipping provider's API** (recommended) | A commercial agreement with a media-monitoring/clipping company that already scans or licenses printed editions and can expose a JSON/API feed (or build one to the contract below). | Fastest and legally cleanest: they already hold the rights/relationships. This is what "media tracking centres" do. |
| **B. Publisher e-paper partnerships** | An agreement with each publisher (or an e-paper platform such as a digital-newsstand operator) to receive edition metadata or PDFs. | Per-publisher work; best coverage of one publisher, poor breadth. |
| **C. Own scanning / PDF + OCR pipeline** | Access to PDFs, an OCR/layout step, keyword matching per page, storage. | Possible later (the data model already fits), but PDFs are copyrighted: you need a licence to ingest them, and you should still only **link** to pages. Not started. |

**Not an option:** scraping paywalled or logged-in e-paper viewers, or mirroring page images — copyright and terms-of-use exposure, and Mediaory's content policy (`CONTENT_POLICY.md`) forbids it.

## The JSON contract (what a provider must return)

`GET <endpoint>` (with the key in the configured header) → JSON:

```json
{
  "items": [
    {
      "id": "stable external id",
      "title": "Headline",
      "url": "https://… canonical link to the clipping or story (required)",
      "publishedAt": "2026-10-01T04:00:00Z",
      "content": "optional lead text (only a short snippet is kept)",
      "language": "tr",
      "print": {
        "publication": "Cumhuriyet",
        "editionDate": "2026-10-01",
        "page": 12,
        "section": "Ekonomi",
        "pageUrl": "https://…viewer link for the page",
        "pageImageUrl": "https://…preview image of the page/clipping"
      }
    }
  ]
}
```

Only `url` is required per item; `print` is optional and needs at least `publication`. Items without `print` simply appear as normal stories. Use the source type *Newspaper* or *Magazine* so the badge is right.

## Connecting a provider (admin)

1. `/admin/sources` → pick the region (e.g. Türkiye) → **Add an RSS feed to …** → *Kind: Clipping / data provider (JSON API)*.
2. Enter the endpoint, the key and the header it goes in (`Authorization` sends `Bearer <key>`; anything else sends the key as-is), choose *Newspaper* or *Magazine*.
3. **Test** — it fetches the endpoint and reports how many items and how many carry print data — then **Test & add**.

## Limits today

- One endpoint per source; paging, incremental `since=` filters and webhooks are not implemented (the whole `items` list is read each time, de-duplicated by URL).
- No on-site OCR/keyword search inside page images; matching uses the headline like every other source.
- Alerts and reports treat print stories like any other mention.
