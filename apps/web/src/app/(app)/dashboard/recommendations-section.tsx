import type { InsightWithEvidence } from "@cim/db";
import { Badge } from "@cim/ui";

const PRIORITY_TONE = {
  low: "neutral",
  medium: "warning",
  high: "danger",
} as const;

/**
 * docs/architecture/AI_ARCHITECTURE.md "Recommendations are never
 * auto-applied" (brief §44) — each item is read-only, presented for a
 * human to act on. Same Answer/Evidence/Confidence trust contract as the
 * "Since yesterday" insight card above it, plus the Priority AI_
 * ARCHITECTURE.md's Recommendation shape adds.
 */
export function RecommendationsSection({ items }: { items: InsightWithEvidence[] }) {
  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Recommendations</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-md border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-foreground">{item.summary}</p>
              {item.priority ? (
                <Badge tone={PRIORITY_TONE[item.priority as keyof typeof PRIORITY_TONE] ?? "neutral"}>
                  {item.priority}
                </Badge>
              ) : null}
            </div>
            {item.why ? <p className="mt-1 text-sm text-muted-foreground">{item.why}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Confidence {Math.round(Number(item.confidence) * 100)}%</span>
              <span>Method: {item.method}</span>
              <span>
                Based on {item.evidence.length} mention{item.evidence.length === 1 ? "" : "s"}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
