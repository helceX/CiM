import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { asOrganizationId, backfillMentionsForQuery, createMonitoringQuery, createProject, db, schema } from "@cim/db";
import type { Source } from "@cim/db/schema";
import type { RawFetchResult, SourceConnector, SourceHealth } from "./connector";
import { ingestSource } from "./pipeline";

/**
 * Several monitorings run at the same time and independently: every story is matched against every
 * active monitoring, a monitoring saved later does not change what an earlier one keeps matching, and
 * a story two monitorings both match becomes one mention for each.
 */
class StoriesConnector implements SourceConnector {
  constructor(private readonly titles: string[]) {}
  async fetch(source: Source): Promise<RawFetchResult[]> {
    return this.titles.map((title, index) => ({
      externalId: `${source.id}-${title}`,
      canonicalUrl: `https://${source.domain}/${index}-${encodeURIComponent(title)}`,
      title,
      bodyText: title,
      publishedAt: new Date(),
      authorName: null,
    }));
  }
  async healthCheck(): Promise<SourceHealth> {
    return { status: "healthy" };
  }
}

describe("several monitorings at once (integration)", () => {
  const stamp = Date.now();
  const alpha = `Alphacorp${stamp}`;
  const beta = `Betacorp${stamp}`;
  let organizationId: ReturnType<typeof asOrganizationId>;
  let projectId: string;
  let source: Source;

  beforeAll(async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Multi Co", slug: `multi-${stamp}` }).returning();
    organizationId = asOrganizationId(org!.id);
    const [workspace] = await db.insert(schema.workspaces).values({ organizationId, name: "Default" }).returning();
    projectId = (await createProject(db, organizationId, { workspaceId: workspace!.id, name: "Multi" })).id;
    const [created] = await db
      .insert(schema.sources)
      .values({ name: `Multi Wire ${stamp}`, domain: `multi-${stamp}.example`, type: "news", connector: "mock", status: "healthy", canDisplayExcerpt: true })
      .returning();
    source = created!;
  });

  afterAll(async () => {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    await db.delete(schema.sources).where(eq(schema.sources.id, source.id));
  });

  const monitoring = (name: string, term: string) =>
    createMonitoringQuery(db, organizationId, {
      projectId,
      name,
      queryAst: { include: [term], exclude: [], exactPhrases: [] },
      booleanQuery: term,
      sourceTypes: ["news"],
    });
  const titlesOf = async (queryId: string) =>
    (
      await db
        .select({ title: schema.articles.title })
        .from(schema.mentions)
        .innerJoin(schema.articles, eq(schema.articles.id, schema.mentions.articleId))
        .where(and(eq(schema.mentions.organizationId, organizationId), eq(schema.mentions.queryId, queryId)))
    )
      .map((row) => row.title)
      .sort();

  it("keeps matching the first monitoring after a second one is saved, and gives a shared story to both", async () => {
    const first = await monitoring("Alpha watch", alpha);

    // First crawl: only the first monitoring exists.
    await ingestSource(db, source, new StoriesConnector([`${alpha} opens a plant`, `${beta} raises money`, `${alpha} and ${beta} merge`]));
    expect(await titlesOf(first.id)).toEqual([`${alpha} and ${beta} merge`, `${alpha} opens a plant`]);

    // A second monitoring is saved (and picks up the stories already stored, like POST /api/monitoring does).
    const second = await monitoring("Beta watch", beta);
    await backfillMentionsForQuery(db, organizationId, {
      id: second.id,
      projectId,
      queryAst: second.queryAst,
      sourceTypes: second.sourceTypes,
      regionScopes: second.regionScopes,
    });
    expect(await titlesOf(second.id)).toEqual([`${alpha} and ${beta} merge`, `${beta} raises money`]);
    // Saving the second one changed nothing for the first.
    expect(await titlesOf(first.id)).toEqual([`${alpha} and ${beta} merge`, `${alpha} opens a plant`]);

    // The next crawl: new stories for either monitoring, plus the ones the feed still carries.
    const next = await ingestSource(
      db,
      source,
      new StoriesConnector([
        `${alpha} opens a plant`,
        `${beta} raises money`,
        `${alpha} and ${beta} merge`,
        `${alpha} hires a new chief`,
        `${beta} opens an office`,
      ]),
    );
    expect(next.mentionsCreated).toBe(2);
    expect(await titlesOf(first.id)).toEqual([`${alpha} and ${beta} merge`, `${alpha} hires a new chief`, `${alpha} opens a plant`]);
    expect(await titlesOf(second.id)).toEqual([`${alpha} and ${beta} merge`, `${beta} opens an office`, `${beta} raises money`]);
  });
});
