import Link from "next/link";
import { Badge, Button, EmptyState } from "@cim/ui";
import { Radar } from "lucide-react";
import { parseKeywordSpec } from "@cim/core";
import { countMentionsByQuery, db, listMonitoringQueries } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";

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

export default async function MonitoringListPage() {
  const context = await requireOrgContext();
  const [queries, counts] = await Promise.all([
    listMonitoringQueries(db, context.organizationId),
    countMentionsByQuery(db, context.organizationId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Monitoring</h1>
          <p className="text-sm text-muted-foreground">
            Queries tracking your brands, competitors, and topics. Keywords match whole words
            only.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/monitoring/new">New monitoring</Link>
        </Button>
      </div>

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
        <ul className="flex flex-col gap-3">
          {queries.map((query) => {
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
                  <p className="text-xs text-muted-foreground">
                    Sources: {query.sourceTypes.join(", ")} · Created{" "}
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
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
