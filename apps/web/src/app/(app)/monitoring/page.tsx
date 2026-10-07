import Link from "next/link";
import { Badge, Button, EmptyState } from "@cim/ui";
import { Radar } from "lucide-react";
import { autoKeywordClusters, companyNames, describeRegionScopes, parseKeywordSpec } from "@cim/core";
import { countMentionsByQuery, db, getCrawlCoverage, listBrandGroups, listMonitoringQueries } from "@cim/db";
import type { CrawlCoverage } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";
import { monitoringFamily } from "@/lib/monitoring-families";

/** Small suffix on a chip when the keyword has a stricter-than-default rule. */
function KeywordRule({ term }: { term: string }) {
  const spec = parseKeywordSpec(term);
  if (spec.caseSensitive) {
    return <span className="ml-1 text-[11px] text-muted-foreground" title="Matched as the whole word with exactly these capitals">· exact caps</span>;
  }
  if (spec.prefix) {
    return <span className="ml-1 text-[11px] text-muted-foreground" title="Matches words that start with this">· word start</span>;
  }
  return null;
}

/** "14 minutes ago" — coarse on purpose; the exact time is in the tooltip. */
function ago(date: Date): string {
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/**
 * Answers "is it even running?" on the page where people wait for results. The
 * crawler runs on our servers around the clock — it does not depend on anyone
 * having the app open — so this shows what it has actually done, not a promise.
 */
function CoverageStrip({ coverage }: { coverage: CrawlCoverage }) {
  const stale = coverage.lastScanAt !== null && Date.now() - coverage.lastScanAt.getTime() > 6 * 3_600_000;
  return (
    <p
      className={`rounded-lg border px-3 py-2 text-xs ${stale ? "border-warning/50 text-warning" : "border-border text-muted-foreground"}`}
      role="status"
    >
      {coverage.activeSources === 0 ? (
        "No sources are being scanned yet."
      ) : (
        <>
          Scanning <strong className="text-foreground">{coverage.activeSources.toLocaleString()}</strong> sources every 2 hours on our
          servers (your computer does not need to be on).{" "}
          {coverage.lastScanAt ? (
            <>
              Last scan <time dateTime={coverage.lastScanAt.toISOString()} title={coverage.lastScanAt.toISOString()}>{ago(coverage.lastScanAt)}</time>
              {stale ? " — longer than expected." : ""}
            </>
          ) : (
            "First scan has not finished yet."
          )}{" "}
          {coverage.storiesLast24h.toLocaleString()} new stories in the last 24 hours.
        </>
      )}
    </p>
  );
}

export default async function MonitoringListPage() {
  const context = await requireOrgContext();
  const [queries, counts, coverage, brandGroups] = await Promise.all([
    listMonitoringQueries(db, context.organizationId),
    countMentionsByQuery(db, context.organizationId),
    getCrawlCoverage(db),
    listBrandGroups(db, context.organizationId),
  ]);
  const canEdit = context.permissions.includes("monitoring:write");

  // Monitorings of one family (BTM Monitoring v1, v2, v3) sit together.
  const groupNames = new Map(brandGroups.map((group) => [group.id, group.name]));
  const families = new Map<string, { label: string; mapped: boolean; items: typeof queries }>();
  for (const query of queries) {
    const family = monitoringFamily(query, groupNames);
    const entry = families.get(family.key) ?? { label: family.label, mapped: family.mapped, items: [] };
    entry.items.push(query);
    families.set(family.key, entry);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Monitoring</h1>
          <p className="text-sm text-muted-foreground">
            Queries tracking your brands, competitors, and topics. Keywords match whole words
            and their usual endings (girişimci → girişimcilerin).
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/monitoring/new">New monitoring</Link>
        </Button>
      </div>

      <CoverageStrip coverage={coverage} />

      {queries.length === 0 ? (
        <EmptyState
          icon={<Radar className="size-8" aria-hidden="true" />}
          title="No monitoring has been created yet."
          description="Try tracking your brand, campaign, or a competitor."
          action={
            <Button asChild size="sm">
              <Link href="/monitoring/new">Create your first monitoring query</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {[...families.values()].map((family) => (
            <section key={family.label} aria-label={family.label} className="flex flex-col gap-3">
              {family.items.length > 1 || family.mapped ? (
                <h2 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
                  {family.label}
                  <span className="text-xs font-normal text-muted-foreground">
                    {family.items.length} monitoring{family.items.length === 1 ? "" : "s"}
                    {family.mapped ? " · your group" : " · grouped by name"}
                  </span>
                </h2>
              ) : null}
              <ul className="flex flex-col gap-3">
          {family.items.map((query) => {
            const count = counts.get(query.id) ?? { total: 0, last7Days: 0 };
            const ast = query.queryAst;
            const keywords = [
              ...ast.include.map((term) => ({ term, kind: "include" as const })),
              ...ast.exactPhrases.map((term) => ({ term: `"${term}"`, kind: "include" as const })),
              ...ast.exclude.map((term) => ({ term, kind: "exclude" as const })),
            ];
            return (
              <li
                key={query.id}
                className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">{query.name}</h2>
                    <Badge tone={query.status === "active" ? "success" : "neutral"}>
                      {query.status}
                    </Badge>
                  </div>
                  {keywords.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5" aria-label={`Keywords for ${query.name}`}>
                      {keywords.slice(0, 12).map(({ term, kind }) => (
                        <li
                          key={`${kind}:${term}`}
                          className={
                            kind === "exclude"
                              ? "rounded-sm bg-danger/10 px-2 py-0.5 text-xs text-danger line-through decoration-1"
                              : "rounded-sm bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                          }
                        >
                          {kind === "exclude" ? <span className="sr-only">Excluded: </span> : null}
                          {term}
                          {kind === "include" && !term.startsWith('"') ? (
                            <KeywordRule term={term} />
                          ) : null}
                        </li>
                      ))}
                      {keywords.length > 12 ? (
                        <li className="px-1 py-0.5 text-xs text-muted-foreground">
                          +{keywords.length - 12} more
                        </li>
                      ) : null}
                    </ul>
                  ) : (
                    <p className="truncate text-xs text-muted-foreground">{query.booleanQuery}</p>
                  )}
                  {companyNames(ast).length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Company: <span className="text-foreground">{companyNames(ast).join(" = ")}</span>
                    </p>
                  ) : null}
                  {autoKeywordClusters(ast.include).length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Grouped automatically:{" "}
                      {autoKeywordClusters(ast.include)
                        .map((cluster) => cluster.join(" · "))
                        .join(" | ")}
                    </p>
                  ) : null}
                  {ast.aliasGroups && ast.aliasGroups.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Same thing: {ast.aliasGroups.map((group) => group.join(" = ")).join(" · ")}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Sources: {query.sourceTypes.join(", ")} · Where: {describeRegionScopes(query.regionScopes)} · Created{" "}
                    {new Date(query.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:items-end sm:gap-1">
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">{count.last7Days}</span>{" "}
                    <span className="text-muted-foreground">in 7 days</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{count.total} total</p>
                  <Link
                    href={`/mentions?query=${query.id}`}
                    className="text-sm text-primary underline underline-offset-2"
                  >
                    View mentions
                    <span className="sr-only"> for {query.name}</span>
                  </Link>
                  {canEdit ? (
                    <Link
                      href={`/monitoring/${query.id}/edit`}
                      className="text-sm text-primary underline underline-offset-2"
                    >
                      Edit
                      <span className="sr-only"> {query.name}</span>
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
