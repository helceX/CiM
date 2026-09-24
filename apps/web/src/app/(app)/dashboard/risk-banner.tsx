import type { InsightWithEvidence } from "@cim/db";
import { Badge } from "@cim/ui";

const LEVEL_TONE = {
  low: "neutral",
  medium: "warning",
  high: "danger",
  critical: "danger",
} as const;

/**
 * docs/architecture/AI_ARCHITECTURE.md `detectRisk` — same Answer/
 * Evidence/Confidence trust contract as the "Since yesterday" insight
 * card, surfaced ahead of it (docs/ux/INFORMATION_ARCHITECTURE.md
 * "Crisis/risk signals" is the top Communications Manager concern). Only
 * rendered when a risk insight actually exists — most periods have none.
 */
export function RiskBanner({ risk }: { risk: InsightWithEvidence }) {
  const level = risk.priority ?? "medium";
  return (
    <section className="rounded-lg border border-danger/40 bg-danger/5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Risk signal</h2>
          <Badge tone={LEVEL_TONE[level as keyof typeof LEVEL_TONE] ?? "warning"}>{level}</Badge>
        </div>
      </div>
      <p className="mt-2 text-sm text-foreground">{risk.summary}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Confidence {Math.round(Number(risk.confidence) * 100)}%</span>
        <span>Method: {risk.method}</span>
        <span>
          Based on {risk.evidence.length} mention{risk.evidence.length === 1 ? "" : "s"}
        </span>
      </div>
    </section>
  );
}
