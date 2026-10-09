import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { asOrganizationId, createMonitoringQuery, createProject, db, schema } from "@cim/db";
import type { Source } from "@cim/db/schema";
import type { RawFetchResult, SourceConnector, SourceHealth } from "./connector";
import { ingestSource } from "./pipeline";

/**
 * Every story that matches a monitoring arrives with a signal — how much it matters to THAT monitoring
 * and why — and a story that more outlets pick up climbs as they do.
 */
class StoriesConnector implements SourceConnector {
  constructor(private readonly stories: { title: string; body: string }[]) {}
  async fetch(source: Source): Promise<RawFetchResult[]> {
    return this.stories.map((story, index) => ({
      externalId: `${source.id}-${index}`,
      canonicalUrl: `https://${source.domain}/${index}-${encodeURIComponent(story.title)}`,
      title: story.title,
      bodyText: story.body,
      publishedAt: new Date(),
      authorName: null,
      language: "en",
    }));
  }
  async healthCheck(): Promise<SourceHealth> {
    return { status: "healthy" };
  }
}

describe("signals at ingest (integration)", () => {
  const stamp = Date.now();
  const brand = `Signalcorp${stamp}`;
  let organizationId: ReturnType<typeof asOrganizationId>;
  let projectId: string;
  let queryId: string;
  const createdSources: Source[] = [];

  async function newsSource(label: string, type = "news"): Promise<Source> {
    const [created] = await db
      .insert(schema.sources)
      .values({ name: `Signal ${label} ${stamp}`, domain: `signal-${label}-${stamp}.example`, type, connector: "mock", status: "healthy", canDisplayExcerpt: true })
      .returning();
    createdSources.push(created!);
    return created!;
  }

  beforeAll(async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Signal Co", slug: `signal-${stamp}` }).returning();
    organizationId = asOrganizationId(org!.id);
    const [workspace] = await db.insert(schema.workspaces).values({ organizationId, name: "Default" }).returning();
    projectId = (await createProject(db, organizationId, { workspaceId: workspace!.id, name: "Signal" })).id;
    const query = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Signal watch",
      queryAst: { include: [brand], exclude: [], exactPhrases: [], intent: { goals: ["risk"], focus: "essentials", signalWords: [] } },
      booleanQuery: brand,
      sourceTypes: ["news", "blog"],
      trackingTarget: "company",
    });
    queryId = query.id;
  });

  afterAll(async () => {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    for (const source of createdSources) await db.delete(schema.sources).where(eq(schema.sources.id, source.id));
  });

  const mentionOf = async (title: string) => {
    const [row] = await db
      .select({ mention: schema.mentions })
      .from(schema.mentions)
      .innerJoin(schema.articles, eq(schema.articles.id, schema.mentions.articleId))
      .where(and(eq(schema.mentions.organizationId, organizationId), eq(schema.mentions.queryId, queryId), eq(schema.articles.title, title)));
    return row!.mention;
  };

  it("gives each matching story the level and the reasons that fit this monitoring", async () => {
    const wire = await newsSource("wire");
    const blog = await newsSource("blog", "blog");
    const filler = "background ".repeat(30);
    const headline = `${brand} sued over data breach`;
    const opening = "Plant opens in Izmir";
    const buried = "Quarterly roundup";
    const result = await ingestSource(
      db,
      wire,
      new StoriesConnector([
        { title: headline, body: "Short summary." },
        { title: opening, body: `${brand} said on Monday that the plant will employ 300 people.` },
        { title: buried, body: `${filler} ${brand} was mentioned once.` },
      ]),
    );
    expect(result.mentionsCreated).toBe(3);

    const high = await mentionOf(headline);
    expect(high.priority).toBe("high");
    expect(high.signalReasons?.map((reason) => reason.code)).toEqual(["headline", "goal", "editorial"]);
    expect(high.signalReasons).toContainEqual({ code: "goal", goal: "risk", headline: ["sued", "data breach"], text: [] });

    const normal = await mentionOf(opening);
    expect(normal.priority).toBe("normal");
    expect(normal.signalReasons?.[0]).toEqual({ code: "lead", terms: [brand] });

    const low = await mentionOf(buried);
    expect(low.priority).toBe("low");
    expect(low.signalReasons?.[0]).toEqual({ code: "deep" });

    expect(high.signalScore!).toBeGreaterThan(normal.signalScore!);
    expect(normal.signalScore!).toBeGreaterThan(low.signalScore!);

    // The records handed to the alert engine carry the level too.
    expect(result.newMentions.map((record) => record.priority).sort()).toEqual(["high", "low", "normal"]);

    // The same headline on a blog: a name in the headline is still a name in the headline, but a blog is not a news outlet.
    const onBlog = await ingestSource(db, blog, new StoriesConnector([{ title: `${brand} inaugurates a robotics laboratory`, body: "x" }]));
    expect(onBlog.newMentions.map((record) => record.priority)).toEqual(["normal"]);
  });

  it("raises a story as more outlets pick it up", async () => {
    const first = await newsSource("a");
    const second = await newsSource("b");
    const third = await newsSource("c");
    const title = (variant: string) => `${brand} ${variant} a new plant in Izmir`;
    await ingestSource(db, first, new StoriesConnector([{ title: title("opens"), body: "First outlet" }]));
    const alone = await mentionOf(title("opens"));
    expect(alone.signalReasons?.map((reason) => reason.code)).not.toContain("covered");

    await ingestSource(db, second, new StoriesConnector([{ title: title("opens today"), body: "Second outlet" }]));
    expect((await mentionOf(title("opens"))).signalReasons?.map((reason) => reason.code)).not.toContain("covered");

    await ingestSource(db, third, new StoriesConnector([{ title: title("is opening"), body: "Third outlet" }]));
    for (const variant of ["opens", "opens today", "is opening"]) {
      const row = await mentionOf(title(variant));
      expect(row.signalReasons, variant).toContainEqual({ code: "covered", n: 3 });
    }
    // The first outlet's mention learned of the others without being re-ingested.
    expect((await mentionOf(title("opens"))).signalScore).toBe(alone.signalScore! + 10);
  });
});
