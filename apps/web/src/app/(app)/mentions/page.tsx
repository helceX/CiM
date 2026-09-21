import { db, listMentionsFiltered, type MentionFilters } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";
import { MentionsTable } from "./mentions-table";

const PAGE_SIZE = 20;

type SearchParams = Record<string, string | string[] | undefined>;

function param(searchParams: SearchParams, key: string): string | undefined {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function MentionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireOrgContext();
  const resolvedParams = await searchParams;

  const page = Math.max(1, Number(param(resolvedParams, "page") ?? "1") || 1);
  const filters: MentionFilters = {
    search: param(resolvedParams, "q") || undefined,
    sentiment: param(resolvedParams, "sentiment") as MentionFilters["sentiment"],
    priority: param(resolvedParams, "priority") as MentionFilters["priority"],
    sinceDays: param(resolvedParams, "since") ? Number(param(resolvedParams, "since")) : undefined,
  };

  const result = await listMentionsFiltered(db, context.organizationId, filters, {
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Mentions</h1>
        <p className="text-sm text-muted-foreground">
          {result.totalCount} mention{result.totalCount === 1 ? "" : "s"} matching your filters.
        </p>
      </div>
      <MentionsTable result={result} />
    </div>
  );
}
