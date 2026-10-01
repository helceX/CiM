import Link from "next/link";
import {
  db,
  getMonitoringQuery,
  listBrandGroups,
  listMembersForOrganization,
  listMentionDays,
  listMentionsFiltered,
  listTagsForOrganization,
} from "@cim/db";
import { mentionFiltersFromParams } from "@/lib/mention-filters";
import { requireOrgContext } from "@/lib/tenant";
import { MentionsByDay } from "./mentions-by-day";
import { MentionsTable } from "./mentions-table";

const PAGE_SIZE = 20;
const DAYS_PER_PAGE = 14;

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
  const filters = mentionFiltersFromParams((key) => param(resolvedParams, key), context.userId);
  // A deep link straight into one mention (?open=) needs the flat list that hosts its drawer.
  const view = param(resolvedParams, "view") === "list" || param(resolvedParams, "open") ? "list" : "days";

  const [members, tags, brandGroups] = await Promise.all([
    listMembersForOrganization(db, context.organizationId),
    listTagsForOrganization(db, context.organizationId),
    listBrandGroups(db, context.organizationId),
  ]);
  const assignableMembers = members.filter((m) => m.status === "active");
  const queryName = filters.queryId
    ? ((await getMonitoringQuery(db, context.organizationId, filters.queryId))?.name ?? null)
    : null;
  const groups = brandGroups.map((group) => ({ id: group.id, name: group.name }));

  const listResult =
    view === "list"
      ? await listMentionsFiltered(db, context.organizationId, filters, { page, pageSize: PAGE_SIZE })
      : null;
  const dayResult =
    view === "days"
      ? await listMentionDays(db, context.organizationId, filters, { page, pageSize: DAYS_PER_PAGE })
      : null;

  const viewHref = (target: "days" | "list") => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(resolvedParams)) {
      const v = Array.isArray(value) ? value[0] : value;
      if (v && key !== "view" && key !== "page" && key !== "open") params.set(key, v);
    }
    if (target === "list") params.set("view", "list");
    const qs = params.toString();
    return qs ? `/mentions?${qs}` : "/mentions";
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Mentions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {view === "list"
              ? `${listResult!.totalCount} mention${listResult!.totalCount === 1 ? "" : "s"} matching your filters.`
              : `${dayResult!.totalDays} day${dayResult!.totalDays === 1 ? "" : "s"} with coverage — open a day to read it.`}
          </p>
        </div>
        <nav aria-label="Mentions view" className="flex gap-2">
          <Link href={viewHref("days")} aria-current={view === "days" ? "page" : undefined} className="mp-tab">
            By day
          </Link>
          <Link href={viewHref("list")} aria-current={view === "list" ? "page" : undefined} className="mp-tab">
            All, newest first
          </Link>
        </nav>
      </div>
      {view === "list" ? (
        <MentionsTable
          result={listResult!}
          members={assignableMembers}
          tags={tags}
          brandGroups={groups}
          currentUserId={context.userId}
          queryName={queryName}
        />
      ) : (
        <MentionsByDay
          days={dayResult!.days}
          totalDays={dayResult!.totalDays}
          page={page}
          pageSize={DAYS_PER_PAGE}
          members={assignableMembers}
          tags={tags}
          brandGroups={groups}
          currentUserId={context.userId}
          queryName={queryName}
        />
      )}
    </div>
  );
}
