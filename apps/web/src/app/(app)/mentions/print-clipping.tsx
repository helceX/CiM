import { ExternalLink, Newspaper } from "lucide-react";
import { describeArticlePrint, type ArticlePrint } from "@cim/core";

/** One-line marker for a story from a printed edition: "Cumhuriyet · 1 Oct 2026 · p. 12". */
export function PrintLine({ print }: { print: ArticlePrint }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Newspaper className="size-3" aria-hidden="true" />
      <span className="font-medium text-foreground">Print</span> · {describeArticlePrint(print)}
      {print.section ? ` · ${print.section}` : ""}
    </span>
  );
}

/**
 * The printed page behind a story: where it ran, a link to view the page and a
 * preview of it. Both come from the clipping provider's own servers — we link,
 * we do not copy pages.
 */
export function PrintClipping({ print }: { print: ArticlePrint }) {
  return (
    <section aria-label="Print edition" className="flex flex-col gap-2 rounded-xl border border-border bg-background/30 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Print edition</p>
      <p className="text-foreground">
        {describeArticlePrint(print)}
        {print.section ? <span className="text-muted-foreground"> · {print.section}</span> : null}
      </p>
      {print.pageImageUrl ? (
        <a href={print.pageUrl ?? print.pageImageUrl} target="_blank" rel="noopener noreferrer" className="block">
          {/* third-party preview: linked, never mirrored */}
          <img
            src={print.pageImageUrl}
            alt={`Page ${print.page ?? ""} of ${print.publication}`.replace("  ", " ")}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="max-h-72 w-auto rounded-md border border-border"
          />
        </a>
      ) : null}
      {print.pageUrl ? (
        <a
          href={print.pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
        >
          View the page<span className="sr-only"> of {print.publication} (new tab)</span>
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      ) : null}
    </section>
  );
}
