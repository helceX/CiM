"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Badge, Button, EmptyState } from "@cim/ui";
import { Inbox } from "lucide-react";
import type { MentionsPage } from "@cim/db";
import { FilterBar } from "@/components/filter-bar";
import { MentionDetailDrawer } from "./mention-detail-drawer";

const SENTIMENT_TONE = { positive: "success", neutral: "neutral", negative: "danger" } as const;
const PRIORITY_TONE = { low: "neutral", normal: "neutral", high: "warning", critical: "danger" } as const;

export function MentionsTable({ result }: { result: MentionsPage }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedMentionId, setSelectedMentionId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(result.totalCount / result.pageSize));

  function goToPage(page: number) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("page", String(page));
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        searchPlaceholder="Search mentions…"
        selects={[
          {
            key: "sentiment",
            label: "Sentiment",
            options: [
              { value: "positive", label: "Positive" },
              { value: "neutral", label: "Neutral" },
              { value: "negative", label: "Negative" },
              { value: "unclassified", label: "Unclassified" },
            ],
          },
          {
            key: "priority",
            label: "Priority",
            options: [
              { value: "low", label: "Low" },
              { value: "normal", label: "Normal" },
              { value: "high", label: "High" },
              { value: "critical", label: "Critical" },
            ],
          },
          {
            key: "since",
            label: "Date",
            options: [
              { value: "1", label: "Today" },
              { value: "7", label: "Last 7 days" },
              { value: "30", label: "Last 30 days" },
              { value: "90", label: "Last 90 days" },
            ],
          },
        ]}
      />

      {result.items.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-8" aria-hidden="true" />}
          title="No mentions match your filters."
          description="Try widening the date range or clearing a filter."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Headline</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Sentiment</th>
                <th className="px-4 py-2 font-medium">Priority</th>
                <th className="px-4 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.items.map(({ mention, article, source }) => (
                <tr
                  key={mention.id}
                  onClick={() => setSelectedMentionId(mention.id)}
                  className="cursor-pointer hover:bg-surface-muted"
                >
                  <td className="max-w-md px-4 py-3 font-medium text-foreground">{article.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{source.name}</td>
                  <td className="px-4 py-3">
                    {mention.sentiment ? (
                      <Badge tone={SENTIMENT_TONE[mention.sentiment as keyof typeof SENTIMENT_TONE]}>
                        {mention.sentiment}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Unclassified</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={PRIORITY_TONE[mention.priority as keyof typeof PRIORITY_TONE]}>
                      {mention.priority}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(mention.createdAt).toLocaleDateString()}
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
        <MentionDetailDrawer mentionId={selectedMentionId} onClose={() => setSelectedMentionId(null)} />
      ) : null}
    </div>
  );
}
