import Link from "next/link";
import { CATALOG_GROUPS, TURKEY_SOURCE_CATALOG } from "@cim/core";
import { db, listSourcesForAdmin } from "@cim/db";
import { requireSuperAdmin } from "@/lib/admin";
import { CatalogBrowser } from "./source-controls";
import { SourceExplorer } from "./source-explorer";

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
};

/**
 * Platform admin: which sites Mediaory crawls. Sources are shared by every
 * customer (a customer's keywords are matched against whatever is crawled),
 * so adding one here widens coverage for everyone. Every add is fetch-tested
 * first; nothing unreadable is stored.
 */
export default async function AdminSourcesPage() {
  await requireSuperAdmin();
  const sources = await listSourcesForAdmin(db);
  const addedUrls = new Set(sources.map((s) => s.url).filter((u): u is string => Boolean(u)));

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
          Sources are shared by every customer. Mediaory reads titles and excerpts from public
          RSS feeds and sitemaps only — never full article text. A source is saved only after
          its feed has been fetched and read successfully.
        </p>
      </div>

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
          {TURKEY_SOURCE_CATALOG.length} public feeds of Turkish outlets (curated list plus the community list
          at github.com/bakinazik/rss; news agencies that license their content are left out). Feed addresses
          change, so each one is fetch-tested when you add it — if a feed fails, use the custom form below with the
          publisher&apos;s current address. These are candidates, not permissions: check a publisher&apos;s terms
          of use before adding it.
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
            addedUrls={[...addedUrls]}
            groupLabels={Object.fromEntries(CATALOG_GROUPS.map((g) => [g, GROUP_LABEL[g] ?? g]))}
          />
        </div>
      </section>

    </div>
  );
}
