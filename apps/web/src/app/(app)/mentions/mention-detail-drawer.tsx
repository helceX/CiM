"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Sheet, SheetContent, Skeleton } from "@cim/ui";
import type { MentionDetail } from "@cim/db";

const SENTIMENT_TONE = { positive: "success", neutral: "neutral", negative: "danger" } as const;

export function MentionDetailDrawer({
  mentionId,
  onClose,
}: {
  mentionId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<MentionDetail | null>(null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    fetch(`/api/mentions/${mentionId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setDetail(data);
      });
    return () => {
      cancelled = true;
    };
  }, [mentionId]);

  async function submitFeedback(feedback: "relevant" | "irrelevant" | "duplicate") {
    setIsSubmittingFeedback(true);
    try {
      await fetch(`/api/mentions/${mentionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      onClose();
      router.refresh();
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent title={detail?.article.title ?? "Mention"}>
        {!detail ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-6 text-sm">
            <section className="flex flex-col gap-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Source</p>
              <p className="text-foreground">{detail.source.name}</p>
              {detail.article.authorName ? (
                <p className="text-muted-foreground">By {detail.article.authorName}</p>
              ) : null}
              <p className="text-muted-foreground">
                Published {detail.article.publishedAt ? new Date(detail.article.publishedAt).toLocaleString() : "Unknown"}
              </p>
              <a
                href={detail.article.canonicalUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary underline underline-offset-2"
              >
                View original
              </a>
            </section>

            <section className="flex flex-col gap-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Why did this match?
              </p>
              <p className="text-foreground">Matched monitoring query &ldquo;{detail.queryName}&rdquo;</p>
              {detail.mention.matchedTerms.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {detail.mention.matchedTerms.map((term) => (
                    <Badge key={term} tone="info">
                      {term}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sentiment</p>
                {detail.mention.sentiment ? (
                  <Badge tone={SENTIMENT_TONE[detail.mention.sentiment as keyof typeof SENTIMENT_TONE]}>
                    {detail.mention.sentiment}
                  </Badge>
                ) : (
                  <Badge tone="neutral">Unclassified</Badge>
                )}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Engagement</p>
                <p className="text-muted-foreground">Not available</p>
              </div>
            </section>

            <section className="flex flex-col gap-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">AI insight</p>
              <p className="text-muted-foreground">Not available — AI enrichment ships in a later phase.</p>
            </section>

            <section className="flex flex-col gap-2 border-t border-border pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Feedback</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isSubmittingFeedback}
                  onClick={() => submitFeedback("relevant")}
                >
                  Relevant
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isSubmittingFeedback}
                  onClick={() => submitFeedback("irrelevant")}
                >
                  Irrelevant
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isSubmittingFeedback}
                  onClick={() => submitFeedback("duplicate")}
                >
                  Duplicate
                </Button>
              </div>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
