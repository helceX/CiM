"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Badge, Button, EmptyState } from "@cim/ui";
import { Inbox } from "lucide-react";
import type { MentionsPage, Tag } from "@cim/db";
import { FilterBar } from "@/components/filter-bar";
import { MentionDetailDrawer, type AssignableMember } from "./mention-detail-drawer";
import { buildMentionSelects } from "./mention-filter-config";

const SENTIMENT_TONE = {
  positive: "success",
  neutral: "neutral",
  negative: "danger",
} as const;
const PRIORITY_TONE = {
  low: "neutral",
  normal: "neutral",
  high: "warning",
  critical: "danger",
} as const;

/** The keywords that caused this mention — the answer to "why is this here?" without opening it. */
function MatchedTerms({ terms }: { terms: string[] }) {
  if (terms.length === 0) return <span className="text-muted-foreground">—</span>;
  const shown = terms.slice(0, 3);
  const extra = terms.length - shown.length;
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Matched keywords">
      {shown.map((term) => (
        <li key={term} className="rounded-sm bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
          {term}
        </li>
      ))}
      {extra > 0 ? (
        <li className="px-1 py-0.5 text-xs text-muted-foreground" title={terms.slice(3).join(", ")}>
          +{extra}
        </li>
      ) : null}
    </ul>
  );
}

export function MentionsTable({
  result,
  members,
  tags,
  brandGroups,
  currentUserId,
  queryName,
}: {
  result: MentionsPage;
  members: AssignableMember[];
  tags: Tag[];
  brandGroups: { id: string; name: string }[];
  currentUserId: string;
  /** Name of the monitoring query when deep-linked via ?query= */
  queryName?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // ?open=<mention id> deep-links straight into a mention (Dashboard "Top stories").
  const openParam = searchParams.get("open");
  const [selectedMentionId, setSelectedMentionId] = useState<string | null>(
    openParam && /^[0-9a-f-]{36}$/i.test(openParam) ? openParam : null,
  );

  const totalPages = Math.max(1, Math.ceil(result.totalCount / result.pageSize));

  function goToPage(page: number) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("page", String(page));
    router.push(`${pathname}?${next.toString()}`);
  }

  function clearQuery() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("query");
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-col gap-4">
      {queryName ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          Showing only mentions from monitoring
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
            {queryName}
            <button
              type="button"
              onClick={clearQuery}
              aria-label={`Show all monitoring, not just ${queryName}`}
              className="text-muted-foreground hover:text-foreground"
            >
              &times;
            </button>
          </span>
        </p>
      ) : null}
      <FilterBar
        extraKeys={["query"]}
        searchPlaceholder="Search mentions…"
        selects={buildMentionSelects(tags, brandGroups)}
      />

      {result.items.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-8" aria-hidden="true" />}
          title="No mentions match your filters."
          description="Try widening the date range or clearing a filter. Keywords match whole words and their usual endings, so a short abbreviation will not match inside longer words."

        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Headline</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Matched</th>
                <th className="px-4 py-2 font-medium">Sentiment</th>
                <th className="px-4 py-2 font-medium">Priority</th>
                <th className="px-4 py-2 font-medium">Assigned</th>
                <th className="px-4 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.items.map(({ mention, article, source, assigneeName }) => (
                <tr
                  key={mention.id}
                  onClick={() => setSelectedMentionId(mention.id)}
                  className="cursor-pointer hover:bg-surface-muted focus-within:bg-surface-muted"
                >
                  <td className="max-w-md px-4 py-3 font-medium text-foreground">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMentionId(mention.id);
                      }}
                      className="rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {article.title}
                      <span className="sr-only"> — open details</span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{source.name}</td>
                  <td className="px-4 py-3">
                    <MatchedTerms terms={mention.matchedTerms ?? []} />
                  </td>
                  <td className="px-4 py-3">
                    {mention.sentiment ? (
                      <Badge
                        tone={
                          SENTIMENT_TONE[
                            mention.sentiment as keyof typeof SENTIMENT_TONE
                          ]
                        }
                      >
                        {mention.sentiment}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Unclassified</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        PRIORITY_TONE[mention.priority as keyof typeof PRIORITY_TONE]
                      }
                    >
                      {mention.priority}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {assigneeName ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <time
                      dateTime={new Date(mention.createdAt).toISOString()}
                      title={new Date(mention.createdAt).toLocaleString()}
                    >
                      {new Date(mention.createdAt).toLocaleDateString()}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {result.page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={result.page <= 1}
              onClick={() => goToPage(result.page - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={result.page >= totalPages}
              onClick={() => goToPage(result.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {selectedMentionId ? (
        <MentionDetailDrawer
          mentionId={selectedMentionId}
          members={members}
          existingTagNames={tags.map((tag) => tag.name)}
          currentUserId={currentUserId}
          onClose={() => {
            setSelectedMentionId(null);
            if (searchParams.get("open")) {
              const next = new URLSearchParams(searchParams.toString());
              next.delete("open");
              const qs = next.toString();
              router.replace(qs ? `${pathname}?${qs}` : pathname);
            }
          }}
        />
      ) : null}
    </div>
  );
}
