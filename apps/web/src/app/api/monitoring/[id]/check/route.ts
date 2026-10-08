import { NextResponse } from "next/server";
import { explainMonitoringCheck } from "@cim/core";
import { db, getMonitoringCheck } from "@cim/db";
import { requirePermission } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * "Why is this monitoring quiet?" — measures, from the live data, how many sources the monitoring can
 * read, whether the crawler is scanning, how many stories were collected, how often its keywords appear in
 * them, what it holds and whether a story it should hold is missing. Read-only; counts a day and a week of
 * stories, so it is rate-limited per organization.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let context;
  try {
    context = await requirePermission("monitoring:read");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "You don't have permission to view monitoring queries" }, { status: 403 });
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(`monitoring-check:${context.organizationId}`, { limit: 30, windowSeconds: 10 * 60 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many checks — wait a few minutes and try again." }, { status: 429 });
  }

  const { id } = await params;
  let check;
  try {
    check = await getMonitoringCheck(db, context.organizationId, id);
  } catch (error) {
    // A statement that ran out of its time budget (or a database that is struggling) is an answer too.
    console.error("[monitoring/check] failed:", error);
    return NextResponse.json({ error: "The check took too long. Try again in a minute." }, { status: 503 });
  }
  if (!check) return NextResponse.json({ error: "Monitoring query not found" }, { status: 404 });

  return NextResponse.json({
    verdict: explainMonitoringCheck(check),
    sources: check.sources,
    crawl: check.crawl,
    stories: check.stories,
    keywords: check.keywords,
    mentions: check.mentions,
    missed: check.missed,
    missedSamples: check.missedSamples.map((sample) => ({ ...sample, fetchedAt: sample.fetchedAt.toISOString() })),
    query: {
      id: check.query.id,
      name: check.query.name,
      sourceTypes: check.query.sourceTypes,
      regionScopes: check.query.regionScopes,
      latestMentionAt: check.query.latestMentionAt?.toISOString() ?? null,
    },
  });
}
