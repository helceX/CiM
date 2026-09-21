import { getEnv } from "@cim/config";
import { getAIProvider } from "@cim/ai";
import {
  createInsight,
  db,
  listActiveProjectsForInsightGeneration,
  listMentionsForInsightPeriod,
} from "@cim/db";

const PERIOD_HOURS = 24;
const PERIOD_LABEL = "the last 24 hours";

/**
 * docs/product/PRODUCT_VISION.md dashboard flow — "Since yesterday"
 * executive brief. Reserved-synthesis tier of the cost-tiered pipeline
 * (AI_ARCHITECTURE.md §Cost control): one call per project per period,
 * never per mention. Silently produces nothing when a project has no new
 * mentions in the period — brief §95's "Not available" rule means no
 * insight, not a fabricated "nothing changed" claim.
 */
export async function processInsightGenerateJob(): Promise<{ generated: number; skipped: string }> {
  const provider = getAIProvider(getEnv());
  if (!provider) {
    return { generated: 0, skipped: "AI_PROVIDER is disabled" };
  }

  const projects = await listActiveProjectsForInsightGeneration(db);
  let generated = 0;

  for (const { organizationId, projectId } of projects) {
    const mentions = await listMentionsForInsightPeriod(db, organizationId, projectId, PERIOD_HOURS);
    if (mentions.length === 0) continue;

    try {
      const result = await provider.generateInsight({ periodLabel: PERIOD_LABEL, mentions });
      await createInsight(db, organizationId, {
        projectId,
        kind: "whats_changed",
        summary: result.summary,
        confidence: result.confidence,
        method: result.method,
        periodStart: new Date(Date.now() - PERIOD_HOURS * 60 * 60 * 1000),
        periodEnd: new Date(),
        evidenceMentionIds: result.evidenceMentionIds,
      });
      generated += 1;
    } catch (error) {
      console.error(
        `[worker] insight_generate failed for org ${organizationId} project ${projectId}:`,
        error,
      );
    }
  }

  return { generated, skipped: "" };
}
