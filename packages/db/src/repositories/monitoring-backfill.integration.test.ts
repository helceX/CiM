import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { buildWordFingerprint } from "@cim/core";
import { db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { organizations, workspaces } from "../schema/organizations";
import { createProject } from "./projects";
import { createMonitoringQuery } from "./monitoring-queries";
import { backfillMentionsForQuery } from "./monitoring-backfill";
import { asOrganizationId } from "./tenant-scope";

/**
 * A monitoring saved AFTER its stories were fetched must still pick them up
 * (the preview already showed them): headline or stored lead matches, only
 * inside the window and only for the chosen source types, dated to the story.
 */
describe("backfillMentionsForQuery (integration)", () => {
  const stamp = Date.now();
  let organizationId: ReturnType<typeof asOrganizationId>;
  let projectId: string;
  let newsSourceId: string;
  let blogSourceId: string;
  let trSourceId: string;
  let deSourceId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Backfill Co", slug: `backfill-${stamp}` })
      .returning();
    if (!org) throw new Error("org");
    organizationId = asOrganizationId(org.id);
    const [workspace] = await db.insert(workspaces).values({ organizationId, name: "Default" }).returning();
    if (!workspace) throw new Error("workspace");
    projectId = (await createProject(db, organizationId, { workspaceId: workspace.id, name: "P" })).id;

    const [news, blog] = await db
      .insert(sources)
      .values([
        { name: "BF News", domain: `bf-news-${stamp}.example`, type: "news", connector: "mock" },
        { name: "BF Blog", domain: `bf-blog-${stamp}.example`, type: "blog", connector: "mock" },
      ])
      .returning();
    if (!news || !blog) throw new Error("sources");
    newsSourceId = news.id;
    blogSourceId = blog.id;
    const [tr, de] = await db
      .insert(sources)
      .values([
        { name: "BF TR", domain: `bf-tr-${stamp}.example`, type: "news", connector: "mock", country: "TR" },
        { name: "BF DE", domain: `bf-de-${stamp}.example`, type: "news", connector: "mock", country: "DE" },
      ])
      .returning();
    if (!tr || !de) throw new Error("region sources");
    trSourceId = tr.id;
    deSourceId = de.id;
    await db.insert(articles).values([
      { sourceId: trSourceId, canonicalUrl: `https://bf.example/${stamp}/tr`, contentHash: `bf-${stamp}-tr`, title: `Zyxwvut Corp Türkiye haberi ${stamp}`, publishedAt: new Date(Date.now() - 86_400_000) },
      { sourceId: deSourceId, canonicalUrl: `https://bf.example/${stamp}/de`, contentHash: `bf-${stamp}-de`, title: `Zyxwvut Corp Deutschland ${stamp}`, publishedAt: new Date(Date.now() - 86_400_000) },
    ]);

    const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);
    await db.insert(articles).values([
      { sourceId: newsSourceId, canonicalUrl: `https://bf.example/${stamp}/title`, contentHash: `bf-${stamp}-1`, title: `Zorlu Holding yeni yatırım ${stamp}`, publishedAt: daysAgo(2) },
      { sourceId: newsSourceId, canonicalUrl: `https://bf.example/${stamp}/lead`, contentHash: `bf-${stamp}-2`, title: `Enerji piyasasında hareket ${stamp}`, storedExcerpt: "Zorlu Holding açıklama yaptı.", publishedAt: daysAgo(3) },
      { sourceId: newsSourceId, canonicalUrl: `https://bf.example/${stamp}/old`, contentHash: `bf-${stamp}-3`, title: `Zorlu Holding eski haber ${stamp}`, publishedAt: daysAgo(90) },
      { sourceId: newsSourceId, canonicalUrl: `https://bf.example/${stamp}/other`, contentHash: `bf-${stamp}-4`, title: `Alakasız başlık ${stamp}`, publishedAt: daysAgo(1) },
      {
        sourceId: newsSourceId,
        canonicalUrl: `https://bf.example/${stamp}/fingerprint`,
        contentHash: `bf-${stamp}-6`,
        title: `Piyasa özeti ${stamp}`,
        storedExcerpt: "Günün kısa özeti burada.",
        // The brand is named far past the stored excerpt, in the feed's long summary.
        wordFingerprint: buildWordFingerprint(`Piyasa özeti ${stamp}\n${"Genel gelişmeler sürüyor. ".repeat(20)} Quasarion Dynamics yeni fabrikasını açtı.`),
        publishedAt: daysAgo(2),
      },
      { sourceId: blogSourceId, canonicalUrl: `https://bf.example/${stamp}/blog`, contentHash: `bf-${stamp}-5`, title: `Zorlu Holding blog yazısı ${stamp}`, publishedAt: daysAgo(1) },
    ]);
  });

  afterAll(async () => {
    await db.delete(sources).where(eq(sources.id, newsSourceId));
    await db.delete(sources).where(eq(sources.id, blogSourceId));
    await db.delete(sources).where(eq(sources.id, trSourceId));
    await db.delete(sources).where(eq(sources.id, deSourceId));
    await db.delete(organizations).where(eq(organizations.id, organizationId));
  });

  it("creates mentions for stored stories that match, inside the window and the chosen source types", async () => {
    const ast = { include: ["Zorlu Holding"], exclude: [], exactPhrases: [] };
    const query = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Zorlu",
      queryAst: ast,
      booleanQuery: '"Zorlu Holding"',
      sourceTypes: ["news"],
    });

    const result = await backfillMentionsForQuery(db, organizationId, {
      id: query.id,
      projectId,
      queryAst: ast,
      sourceTypes: ["news"],
    });
    expect(result.created).toBe(2); // headline match + lead match; not the 90-day-old, unrelated or blog ones

    const rows = await db.select().from(mentions).where(eq(mentions.queryId, query.id));
    expect(rows).toHaveLength(2);
    // dated to the story, not to now
    for (const row of rows) expect(Date.now() - row.createdAt.getTime()).toBeGreaterThan(86_400_000);

    // running again creates nothing new
    const again = await backfillMentionsForQuery(db, organizationId, {
      id: query.id,
      projectId,
      queryAst: ast,
      sourceTypes: ["news"],
    });
    expect(again.created).toBe(0);
  });

  it("also matches a story by the words of its whole summary, beyond the stored excerpt", async () => {
    const ast = { include: [], exclude: [], exactPhrases: ["Quasarion Dynamics"] };
    const query = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Quasarion",
      queryAst: ast,
      booleanQuery: '"Quasarion Dynamics"',
      sourceTypes: ["news"],
    });
    const result = await backfillMentionsForQuery(db, organizationId, { id: query.id, projectId, queryAst: ast, sourceTypes: ["news"] });
    expect(result.created).toBe(1);

    const [row] = await db.select().from(mentions).where(eq(mentions.queryId, query.id));
    expect(row?.matchedTerms).toEqual(["Quasarion Dynamics"]);

    // a story stored without a fingerprint (all older ones) is only matched on its stored text
    const none = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Absent",
      queryAst: { include: [], exclude: [], exactPhrases: ["Quasarion Holdings"] },
      booleanQuery: '"Quasarion Holdings"',
      sourceTypes: ["news"],
    });
    const absent = await backfillMentionsForQuery(db, organizationId, {
      id: none.id,
      projectId,
      queryAst: { include: [], exclude: [], exactPhrases: ["Quasarion Holdings"] },
      sourceTypes: ["news"],
    });
    expect(absent.created).toBe(0);
  });

  it("only looks at sources inside the monitoring's region scope", async () => {
    const ast = { include: ["Zyxwvut Corp"], exclude: [], exactPhrases: [] };
    const run = async (name: string, regionScopes: string[]) => {
      const query = await createMonitoringQuery(db, organizationId, {
        projectId,
        name,
        queryAst: ast,
        booleanQuery: '"Zyxwvut Corp"',
        sourceTypes: ["news"],
        regionScopes,
      });
      return (await backfillMentionsForQuery(db, organizationId, { id: query.id, projectId, queryAst: ast, sourceTypes: ["news"], regionScopes })).created;
    };
    expect(await run("Worldwide", [])).toBe(2);
    expect(await run("Local", ["TR"])).toBe(1);
    expect(await run("Europe", ["EUR"])).toBe(2); // Türkiye and Germany are both in Europe
    expect(await run("Japan", ["JP"])).toBe(0);
  });
});
