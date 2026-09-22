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
 * recommendations" and "AI risk detection" (AI_ARCHITECTURE.md
 * "Recommendations are never auto-applied", brief §44). Reserved-synthesis
 * tier of the cost-tiered pipeline (AI_ARCHITECTURE.md §Cost control): one
 * call per project per period, never per mention, reusing the same
 * mention window for all three. Silently produces nothing when a project
 * has no new mentions in the period, or when nothing in that period
 * actually warrants an insight/recommendation/risk flag — brief §95's
 * "Not available" rule means none of those, never a fabricated "nothing
 * changed"/"all clear" claim or an invented action item.
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

    // docs/product/FEATURE_MATRIX.md P2 "AI risk detection" — same
    // reserved-synthesis tier and mention window as the two calls above,
    // in its own try/catch so one failure doesn't block the others. Most
    // periods yield no risk (`result.risk === null`) and nothing is
    // created, per detectRisk's "don't fabricate a low-risk claim" rule.
    try {
      const riskResult = await provider.detectRisk({ periodLabel: PERIOD_LABEL, mentions });
      if (riskResult.risk) {
        await createInsight(db, organizationId, {
          projectId,
          kind: "risk",
          summary: riskResult.risk.summary,
          priority: riskResult.risk.level,
          confidence: riskResult.risk.confidence,
          method: riskResult.method,
          periodStart,
          periodEnd,
          evidenceMentionIds: riskResult.risk.evidenceMentionIds,
        });
      }
    } catch (error) {
      console.error(
        `[worker] risk detection failed for org ${organizationId} project ${projectId}:`,
        error,
      );
    }
  }

  return { generated, skipped: "" };
}
