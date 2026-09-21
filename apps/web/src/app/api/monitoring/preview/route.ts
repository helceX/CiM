import { NextResponse } from "next/server";
import { previewMonitoringQuerySchema } from "@cim/validation";
import { matchesText, queryQualityWarning } from "@cim/core";
import { db, listRecentArticlesForPreview } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";

const PREVIEW_WINDOW_DAYS = 30;
const SAMPLE_LIMIT = 5;

export async function POST(request: Request) {
  try {
    await requireOrgContext();
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

  return NextResponse.json({
    windowDays: PREVIEW_WINDOW_DAYS,
    matchCount: matches.length,
    sample: matches.slice(0, SAMPLE_LIMIT).map((m) => ({
      title: m.title,
      sourceName: m.sourceName,
      publishedAt: m.publishedAt,
    })),
    warning: queryQualityWarning(ast),
  });
}
