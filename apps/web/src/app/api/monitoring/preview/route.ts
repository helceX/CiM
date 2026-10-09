import { NextResponse } from "next/server";
import { previewMonitoringQuerySchema } from "@cim/validation";
import {
  astToBooleanQuery,
  describeSignal,
  matchesFingerprint,
  matchesText,
  queryQualityWarning,
  scoreSignal,
  sourceInRegionScopes,
  termsToTsQuery,
} from "@cim/core";
import { getAIProvider } from "@cim/ai";
import { getEnv } from "@cim/config";
import { db, listStoriesForPreview } from "@cim/db";
import { matchableText } from "@cim/core";
import { requireOrgContext } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";

const PREVIEW_WINDOW_DAYS = 30;
const SAMPLE_LIMIT = 5;
const TOP_LIMIT = 3;

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

  // The newest stories (what saving the monitoring would scan) plus every stored story containing the keywords'
  // words — a rare name is not lost among the thousands of stories collected each day.
  const { stories, scanned, scannedSince, windowDays } = await listStoriesForPreview(db, {
    tsQuery: termsToTsQuery([...ast.exactPhrases, ...ast.include]),
    days: PREVIEW_WINDOW_DAYS,
  });
  // Same rule as saving the monitoring (backfillMentionsForQuery): exact on the stored text, or a hit in the
  // story's word fingerprint, so the preview count and the first result agree.
  const matches = stories
    .filter(
      (article) =>
        sourceInRegionScopes(article.sourceCountry, ast.regionScopes) &&
        (matchesText(ast, matchableText({ title: article.title, lead: article.storedExcerpt }), { language: article.language }) ||
          matchesFingerprint(ast, article.wordFingerprint, { language: article.language })),
    )
    .sort((a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime());
  // Where the matches come from — shows the chosen scope is what is actually applied.
  const countryCounts = new Map<string, number>();
  for (const match of matches) countryCounts.set(match.sourceCountry ?? "", (countryCounts.get(match.sourceCountry ?? "") ?? 0) + 1);
  const byCountry = [...countryCounts.entries()]
    .map(([code, count]) => ({ code: code || null, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  // How much each match would matter for what the person is looking for — the answer to "how many of these
  // will I actually see?" before anything is saved. Same scoring as the stories a saved monitoring holds.
  const scored = matches.map((story) => ({
    story,
    signal: scoreSignal({
      ast,
      target: ast.trackingTarget,
      intent: ast.intent,
      title: story.title,
      lead: story.storedExcerpt,
      language: story.language,
      sourceType: story.sourceType,
    }),
  }));
  const levels = { high: 0, normal: 0, low: 0 };
  for (const { signal } of scored) levels[signal.level] += 1;
  const top = [...scored]
    .sort((a, b) => b.signal.score - a.signal.score || b.story.fetchedAt.getTime() - a.story.fetchedAt.getTime())
    .slice(0, TOP_LIMIT)
    .map(({ story, signal }) => ({
      title: story.title,
      sourceName: story.sourceName,
      level: signal.level,
      why: describeSignal(signal.level, signal.reasons)?.short ?? "",
    }));
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
          windowDays,
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
    windowDays,
    matchCount: matches.length,
    scanned,
    scannedSince: scannedSince?.toISOString() ?? null,
    byCountry,
    levels,
    top,
    sample,
    warning: queryQualityWarning(ast),
    aiAssessment,
  });
}
