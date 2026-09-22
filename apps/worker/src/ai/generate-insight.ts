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
 * executive brief, plus docs/product/FEATURE_MATRIX.md P2 "AI:
 * recommendations" (AI_ARCHITECTURE.md "Recommendations are never
 * auto-applied", brief §44). Reserved-synthesis tier of the cost-tiered
 * pipeline (AI_ARCHITECTURE.md §Cost control): one call per project per
 * period, never per mention, reusing the same mention window for both.
 * Silently produces nothing when a project has no new mentions in the
 * period, or when nothing in that period actually warrants a
 * recommendation — brief §95's "Not available" rule means no insight/no
 * recommendations, never a fabricated "nothing changed" claim or an
 * invented action item.
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
    const periodStart = new Date(Date.now() - PERIOD_HOURS * 60 * 60 * 1000);
    const periodEnd = new Date();

    try {
      const result = await provider.generateInsight({ periodLabel: PERIOD_LABEL, mentions });
      await createInsight(db, organizationId, {
        projectId,
        kind: "whats_changed",
        summary: result.summary,
        confidence: result.confidence,
        method: result.method,
        periodStart,
        periodEnd,
        evidenceMentionIds: result.evidenceMentionIds,
      });
      generated += 1;
    } catch (error) {
      console.error(
        `[worker] insight_generate failed for org ${organizationId} project ${projectId}:`,
        error,
      );
    }

    // docs/product/FEATURE_MATRIX.md P2 "AI: recommendations" — same
    // reserved-synthesis tier and mention window as the insight above, so
    // one failure doesn't block the other (each in its own try/catch).
    try {
      const recResult = await provider.generateRecommendations({
        periodLabel: PERIOD_LABEL,
        mentions,
      });
      for (const item of recResult.recommendations) {
        await createInsight(db, organizationId, {
          projectId,
          kind: "recommendation",
          summary: item.recommendation,
          why: item.why,
          priority: item.priority,
          confidence: item.confidence,
          method: recResult.method,
          periodStart,
          periodEnd,
          evidenceMentionIds: item.evidenceMentionIds,
        });
      }
    } catch (error) {
      console.error(
        `[worker] recommendation generation failed for org ${organizationId} project ${projectId}:`,
        error,
      );
    }
  }

  return { generated, skipped: "" };
}
