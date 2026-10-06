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

  // Monitoring groups of the day: the one the reader filtered on comes first,
  // the rest follow in the order the monitorings were created (their order on
  // the Monitoring page), so the same keyword always sits in the same place.
  const seen = new Map<string, { id: string; name: string; createdAt: number; terms: string[]; aliasGroups: string[][] }>();
  for (const { mention, queryName, queryCreatedAt, queryAst } of items) {
    if (!seen.has(mention.queryId)) {
      seen.set(mention.queryId, {
        id: mention.queryId,
        name: queryName,
        createdAt: queryCreatedAt.getTime(),
        // the monitoring's keywords in the order it lists them, so concepts always appear in the same order
        terms: [...queryAst.exactPhrases, ...queryAst.include],
        aliasGroups: queryAst.aliasGroups ?? [],
      });
    }
  }
  const queries = [...seen.values()]
    .sort((a, b) => {
      if (filters.queryId) {
        if (a.id === filters.queryId) return -1;
        if (b.id === filters.queryId) return 1;
      }
      return a.createdAt - b.createdAt || a.name.localeCompare(b.name);
    })
    .map(({ id, name, terms, aliasGroups }) => ({ id, name, terms, aliasGroups }));

  return NextResponse.json({
    truncated,
    queries,
    items: items.map(({ mention, article, source, assigneeName }) => ({
      id: mention.id,
      queryId: mention.queryId,
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
      print: article.print ?? null,
    })),
  });
}
