import { NextResponse } from "next/server";
import { previewMonitoringQuerySchema } from "@cim/validation";
import { astToBooleanQuery, matchesText, queryQualityWarning } from "@cim/core";
import { getAIProvider } from "@cim/ai";
import { getEnv } from "@cim/config";
import { db, listRecentArticlesForPreview } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";

const PREVIEW_WINDOW_DAYS = 30;
const SAMPLE_LIMIT = 5;

export async function POST(request: Request) {
  let context;
  try {
    context = await requireOrgContext();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = previewMonitoringQuerySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const ast = parsed.data;

  const recentArticles = await listRecentArticlesForPreview(db, PREVIEW_WINDOW_DAYS);
  const matches = recentArticles.filter((article) => matchesText(ast, article.title));
  const sample = matches.slice(0, SAMPLE_LIMIT).map((m) => ({
    title: m.title,
    sourceName: m.sourceName,
    publishedAt: m.publishedAt,
  }));

  // docs/product/FEATURE_MATRIX.md P2 "Query quality assistant" — the
  // heuristic `warning` above always runs (instant, free); this real AI
  // call is the upgrade tier, so it's rate-limited per organization (the
  // query builder's own "Preview" button can be clicked repeatedly while
  // iterating) and degrades to null rather than blocking the response —
  // same "Not available" discipline as every other optional AI surface.
  let aiAssessment: { text: string; confidence: number; method: string } | null = null;
  const provider = getAIProvider(getEnv());
  if (provider) {
    const rateLimit = await checkRateLimit(`query-preview-ai:${context.organizationId}`, {
      limit: 20,
      windowSeconds: 10 * 60,
    });
    if (rateLimit.allowed) {
      try {
        const result = await provider.reviewQuery({
          booleanQuery: astToBooleanQuery(ast),
          windowDays: PREVIEW_WINDOW_DAYS,
          matchCount: matches.length,
          sample,
        });
        aiAssessment = {
          text: result.assessment,
          confidence: result.confidence,
          method: result.method,
        };
      } catch (error) {
        console.error("[monitoring/preview] reviewQuery failed:", error);
      }
    }
  }

  return NextResponse.json({
    windowDays: PREVIEW_WINDOW_DAYS,
    matchCount: matches.length,
    sample,
    warning: queryQualityWarning(ast),
    aiAssessment,
  });
}
