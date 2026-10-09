import { NextResponse } from "next/server";
import { describeSignal, effectiveAliasGroups, type FocusLevel } from "@cim/core";
import { db, listBrandGroups, listMentionsForDay } from "@cim/db";
import { monitoringFamily } from "@/lib/monitoring-families";
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
  const { items, truncated, totals } = await listMentionsForDay(db, context.organizationId, filters, day);

  // Monitoring groups of the day: the one the reader filtered on comes first,
  // the rest follow in the order the monitorings were created (their order on
  // the Monitoring page), so the same keyword always sits in the same place.
  const groupNames = new Map((await listBrandGroups(db, context.organizationId)).map((group) => [group.id, group.name]));
  const seen = new Map<
    string,
    {
      id: string;
      name: string;
      createdAt: number;
      terms: string[];
      aliasGroups: string[][];
      family: { key: string; label: string; mapped: boolean };
      /** How much the person wants to see without asking; null for a monitoring saved before it existed (everything). */
      focus: FocusLevel | null;
    }
  >();
  for (const { mention, queryName, queryCreatedAt, queryAst, queryBrandGroupId } of items) {
    if (!seen.has(mention.queryId)) {
      seen.set(mention.queryId, {
        id: mention.queryId,
        name: queryName,
        createdAt: queryCreatedAt.getTime(),
        // the monitoring's keywords in the order it lists them, so concepts always appear in the same order
        terms: [...queryAst.exactPhrases, ...queryAst.include],
        // the customer's own groups plus forms of one word (girişimci · girişimcilik) found automatically
        aliasGroups: effectiveAliasGroups(queryAst.aliasGroups, queryAst.include),
        // monitorings of one family (BTM Monitoring v1, v2, v3 — or one group the customer chose) are read together
        family: monitoringFamily({ name: queryName, brandGroupId: queryBrandGroupId }, groupNames),
        focus: queryAst.intent?.focus ?? null,
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
    .map(({ id, name, terms, aliasGroups, family, focus }) => ({ id, name, terms, aliasGroups, family, focus }));

  return NextResponse.json({
    truncated,
    // every story of the day per monitoring — a monitoring shows its newest ones and says how many more there are
    totals,
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
      signalScore: mention.signalScore,
      // why the story is here and where it ranks, in a line ("The headline names “X” · Risks & crises: “lawsuit”")
      why: describeSignal(mention.priority, mention.signalReasons)?.short ?? null,
      // stories of one cluster are the same story reported by several outlets
      storyClusterId: article.storyClusterId,
      assigneeName,
      print: article.print ?? null,
    })),
  });
}
