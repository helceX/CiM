import Link from "next/link";
import { CATALOG_GROUPS, TURKEY_SOURCE_CATALOG } from "@cim/core";
import {
  WORLD_CATALOG_GROUP_LABELS,
  WORLD_SOURCE_CATALOG,
} from "@cim/core/world-catalog";
import { CATALOG_IMPORT_ORDER } from "@cim/core/catalog-import";
import {
  FEED_FAILURE_LABELS,
  isTransientFeedFailure,
  tallyFailures,
  type FeedFailureClass,
} from "@cim/core";
import {
  countCatalogImportAttempts,
  db,
  getCatalogImportState,
  listCatalogImportFailures,
  listSourcesForAdmin,
} from "@cim/db";
import { requireSuperAdmin } from "@/lib/admin";
import { AddSocialFeedForm, CatalogBrowser } from "./source-controls";
import { CatalogImportPanel } from "./catalog-import-panel";
import { CrawlActivity } from "./crawl-activity";
import { getCrawlStats } from "@/lib/crawl-stats";
import { SourceExplorer } from "./source-explorer";
import { WorldCatalogBrowser } from "./world-catalog-browser";

const GROUP_LABEL: Record<string, string> = {
  general: "General news",
  economy: "Economy & finance",
  business: "Business",
  technology: "Technology",
  science: "Science",
  sports: "Sports",
  culture: "Culture & arts",
  entertainment: "Entertainment",
  lifestyle: "Lifestyle",
  defense: "Defense & industry",
  english: "English-language",
  columns: "Columnists (one feed per writer)",
  forums: "Forums",
};

/**
 * Platform admin: which sites Mediaory crawls. Sources are shared by every
 * customer (a customer's keywords are matched against whatever is crawled),
 * so adding one here widens coverage for everyone. Every add is fetch-tested
 * first; nothing unreadable is stored.
 */
export default async function AdminSourcesPage() {
  await requireSuperAdmin();
  const [sources, importState, importCounts, importFailures, crawlStats] =
    await Promise.all([
      listSourcesForAdmin(db),
      getCatalogImportState(db),
      countCatalogImportAttempts(db),
      listCatalogImportFailures(db),
      getCrawlStats(24),
    ]);
  // Why the unreadable catalog feeds could not be added, most common first.
  const failureTally = tallyFailures(
    importFailures.map((row) => ({ url: row.url, message: row.error ?? "" })),
  );
  const failureBreakdown = (
    Object.entries(failureTally.byClass) as [FeedFailureClass, number][]
  )
    .sort((a, b) => b[1] - a[1])
    .map(([failureClass, count]) => ({
      label: FEED_FAILURE_LABELS[failureClass],
      count,
      transient: isTransientFeedFailure(failureClass),
    }));
  const worldCountryCounts: Record<string, number> = {};
  let worldGlobalCount = 0;
  for (const entry of WORLD_SOURCE_CATALOG) {
    if (entry.country)
      worldCountryCounts[entry.country] = (worldCountryCounts[entry.country] ?? 0) + 1;
    else worldGlobalCount += 1;
  }
  const sourceUrls = new Set(
    sources.map((s) => s.url).filter((u): u is string => Boolean(u)),
  );
  // Only the catalog addresses that are already sources — not every source's address — go to the browser.
  const addedCatalogUrls = TURKEY_SOURCE_CATALOG.filter((entry) =>
    sourceUrls.has(entry.url),
  ).map((entry) => entry.url);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm">
          <Link href="/admin" className="text-primary underline underline-offset-2">
            ← Platform overview
          </Link>
        </p>
        <h1 className="mt-2 text-lg font-semibold text-foreground">Crawl sources</h1>
        <p className="text-sm text-muted-foreground">
          Sources are shared by every customer. Mediaory reads titles and excerpts from
          public RSS feeds and sitemaps only — never full article text. A source is
          saved only after its feed has been fetched and read successfully.
        </p>
      </div>

      <section aria-labelledby="import-heading">
        <h2 id="import-heading" className="sr-only">
          Automatic catalog import
        </h2>
        <CatalogImportPanel
          enabled={importState.enabled}
          lastRunAt={importState.lastRunAt?.toISOString() ?? null}
          lastNote={importState.lastNote}
          added={importCounts.added}
          failed={importCounts.failed}
          skipped={importCounts.skipped}
          failureBreakdown={failureBreakdown}
          catalogTotal={CATALOG_IMPORT_ORDER.length}
          sourceCount={sources.length}
        />
      </section>
      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="text-sm font-semibold text-foreground">
          Crawl activity, last 24 hours
        </h2>
        <div className="mt-3 rounded-xl border border-border p-4">
          <CrawlActivity stats={crawlStats} />
        </div>
      </section>
      <section aria-labelledby="current-heading">
        <h2 id="current-heading" className="text-sm font-semibold text-foreground">
          Current sources ({sources.length})
        </h2>
        <div className="mt-3">
          <SourceExplorer
            sources={sources.map((source) => ({
              id: source.id,
              name: source.name,
              domain: source.domain,
              type: source.type,
              connector: source.connector,
              country: source.country,
              status: source.status,
            }))}
          />
        </div>
      </section>
      <section aria-labelledby="catalog-heading">
        <h2 id="catalog-heading" className="text-sm font-semibold text-foreground">
          Türkiye catalog
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {TURKEY_SOURCE_CATALOG.length} public feeds of Turkish outlets (curated list
          plus the community list at github.com/bakinazik/rss; news agencies that
          license their content are left out). Feed addresses change, so each one is
          fetch-tested when you add it — if a feed fails, use the custom form below with
          the publisher&apos;s current address. These are candidates, not permissions:
          check a publisher&apos;s terms of use before adding it.
        </p>
        <div className="mt-3">
          <CatalogBrowser
            entries={TURKEY_SOURCE_CATALOG.map((entry) => ({
              key: entry.key,
              name: entry.name,
              url: entry.url,
              group: entry.group,
              type: entry.type,
              language: entry.language,
              country: entry.country,
            }))}
            addedUrls={addedCatalogUrls}
            groupLabels={Object.fromEntries(
              CATALOG_GROUPS.map((g) => [g, GROUP_LABEL[g] ?? g]),
            )}
          />
        </div>
      </section>
      <section aria-labelledby="world-heading">
        <h2 id="world-heading" className="text-sm font-semibold text-foreground">
          World catalog
        </h2>
        <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
          {WORLD_SOURCE_CATALOG.length.toLocaleString()} more candidate feeds from
          outlets, blogs, forums and podcasts around the world (research pack of 5 Oct
          2026; feeds already in the Türkiye catalog, plain-http feeds, Reddit and
          licence-required agencies are left out). Browse by place — click a country on
          the map or a row in the table — then add one feed or everything that matches.
          Each feed is fetch-tested before it is stored; the pack&apos;s own XML check
          is shown as &quot;XML ✓&quot;. Many sites refuse server requests, so expect
          some to fail. Country is the pack&apos;s directory label or community focus,
          not where a publisher is registered.
        </p>
        <div className="mt-3">
          <WorldCatalogBrowser
            countryCounts={worldCountryCounts}
            globalCount={worldGlobalCount}
            groupLabels={WORLD_CATALOG_GROUP_LABELS}
          />
        </div>
      </section>
      <section aria-labelledby="social-heading">
        <h2 id="social-heading" className="text-sm font-semibold text-foreground">
          Social feeds
        </h2>
        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
          Follow public feeds from YouTube, Mastodon, Bluesky, GitHub releases and
          Discourse forums. Mediaory never scrapes a network or logs in as someone.
          Reddit commercial use requires approval. Instagram, X, LinkedIn and Facebook
          have no free public RSS connector here; see their access requirements below.
          An open-source bridge does not grant platform permissions. Customers&apos;
          keywords are matched against permitted feeds like any other source.
        </p>
        <div className="mt-3">
          <AddSocialFeedForm />
        </div>
      </section>
    </div>
  );
}
