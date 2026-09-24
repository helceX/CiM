import {
  db,
  listMembersForOrganization,
  listMentionsFiltered,
  listTagsForOrganization,
  type MentionFilters,
} from "@cim/db";
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
  const assigned = param(resolvedParams, "assigned");
  const filters: MentionFilters = {
    search: param(resolvedParams, "q") || undefined,
    sentiment: param(resolvedParams, "sentiment") as MentionFilters["sentiment"],
    priority: param(resolvedParams, "priority") as MentionFilters["priority"],
    sinceDays: param(resolvedParams, "since")
      ? Number(param(resolvedParams, "since"))
      : undefined,
    // Resolved from the session here, never a raw userId off the URL
    // (MentionFilters' own contract) — "me" is the only client-facing value.
    assignedToUserId: assigned === "me" ? context.userId : undefined,
    unassignedOnly: assigned === "unassigned",
    tagId: param(resolvedParams, "tag") || undefined,
  };

  const [result, members, tags] = await Promise.all([
    listMentionsFiltered(db, context.organizationId, filters, {
      page,
      pageSize: PAGE_SIZE,
    }),
    listMembersForOrganization(db, context.organizationId),
    listTagsForOrganization(db, context.organizationId),
  ]);
  const assignableMembers = members.filter((m) => m.status === "active");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Mentions</h1>
        <p className="text-sm text-muted-foreground">
          {result.totalCount} mention{result.totalCount === 1 ? "" : "s"} matching your
          filters.
        </p>
      </div>
      <MentionsTable
        result={result}
        members={assignableMembers}
        tags={tags}
        currentUserId={context.userId}
      />
    </div>
  );
}
