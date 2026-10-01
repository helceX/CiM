import Link from "next/link";
import { Badge } from "@cim/ui";
import { TURKEY_SOURCE_CATALOG } from "@cim/core";
import { db, listSourcesForAdmin } from "@cim/db";
import { requireSuperAdmin } from "@/lib/admin";
import { AddSourceForm, CatalogAddButton, CrawlToggle } from "./source-controls";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  healthy: "success",
  delayed: "warning",
  error: "danger",
  blocked: "danger",
  unavailable: "neutral",
};

const GROUP_LABEL: Record<string, string> = {
  general: "General news",
  economy: "Economy",
  technology: "Technology",
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
  const groups = Object.keys(GROUP_LABEL);

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

      <section aria-labelledby="catalog-heading">
        <h2 id="catalog-heading" className="text-sm font-semibold text-foreground">
          Türkiye catalog
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Well-known outlets with a public feed. Feed addresses change, so each one is tested
          when you add it — if a feed fails, use the custom form below with the publisher&apos;s
          current address.
        </p>
        <div className="mt-3 flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group}>
              <h3 className="text-xs font-medium text-muted-foreground">{GROUP_LABEL[group]}</h3>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {TURKEY_SOURCE_CATALOG.filter((entry) => entry.group === group).map((entry) => (
                  <li
                    key={entry.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {entry.name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{entry.url}</div>
                    </div>
                    {addedUrls.has(entry.url) ? (
                      <Badge tone="success">Added</Badge>
                    ) : (
                      <CatalogAddButton entry={entry} />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="custom-heading">
        <h2 id="custom-heading" className="text-sm font-semibold text-foreground">
          Add a source
        </h2>
        <div className="mt-3">
          <AddSourceForm />
        </div>
      </section>

      <section aria-labelledby="current-heading">
        <h2 id="current-heading" className="text-sm font-semibold text-foreground">
          Current sources ({sources.length})
        </h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Connector</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sources.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    No sources yet.
                  </td>
                </tr>
              ) : (
                sources.map((source) => (
                  <tr key={source.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <div className="font-medium text-foreground">{source.name}</div>
                      <div className="text-xs text-muted-foreground">{source.domain}</div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{source.type}</td>
                    <td className="px-4 py-2 text-muted-foreground">{source.connector}</td>
                    <td className="px-4 py-2">
                      <Badge tone={STATUS_TONE[source.status] ?? "neutral"}>
                        {source.status === "unavailable" ? "paused / unavailable" : source.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {source.connector === "rss" || source.connector === "sitemap" ? (
                        <CrawlToggle
                          id={source.id}
                          name={source.name}
                          paused={source.status === "unavailable"}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
