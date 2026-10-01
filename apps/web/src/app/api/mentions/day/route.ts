import { NextResponse } from "next/server";
import { db, listMentionsForDay } from "@cim/db";
import { mentionFiltersFromParams } from "@/lib/mention-filters";
import { requireOrgContext } from "@/lib/tenant";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The mentions of one day (same filters as the Mentions page) — loaded when a day is opened. */
export async function GET(request: Request) {
  let context;
  try {
    context = await requireOrgContext();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!context.permissions.includes("mentions:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const day = params.get("day") ?? "";
  if (!DAY.test(day)) return NextResponse.json({ error: "Invalid day." }, { status: 400 });

  const filters = mentionFiltersFromParams((key) => params.get(key), context.userId);
  const { items, truncated } = await listMentionsForDay(db, context.organizationId, filters, day);

  return NextResponse.json({
    truncated,
    items: items.map(({ mention, article, source, assigneeName }) => ({
      id: mention.id,
      title: article.title,
      url: article.canonicalUrl,
      sourceName: source.name,
      sourceType: source.type,
      sourceCountry: source.country,
      publishedAt: (article.publishedAt ?? mention.createdAt).toISOString(),
      matchedTerms: mention.matchedTerms ?? [],
      sentiment: mention.sentiment,
      priority: mention.priority,
      assigneeName,
    })),
  });
}
