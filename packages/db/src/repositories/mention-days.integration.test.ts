import { afterAll, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { organizations, workspaces } from "../schema/index";
import { createProject } from "./projects";
import { createMonitoringQuery } from "./monitoring-queries";
import { listMentionDays, listMentionsForDay } from "./mentions";
import { asOrganizationId } from "./tenant-scope";

const tag = `days-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function makeOrg(label: string) {
  const [org] = await db.insert(organizations).values({ name: `${label} Co`, slug: `${tag}-${label}` }).returning();
  const organizationId = asOrganizationId(org!.id);
  const [workspace] = await db.insert(workspaces).values({ organizationId, name: "W" }).returning();
  const project = await createProject(db, organizationId, { workspaceId: workspace!.id, name: `${label} P` });
  const query = await createMonitoringQuery(db, organizationId, {
    projectId: project.id,
    name: "Q",
    queryAst: { include: ["x"], exclude: [], exactPhrases: [] },
    booleanQuery: "x",
    sourceTypes: ["news"],
  });
  return { organizationId, projectId: project.id, queryId: query.id };
}

describe("mention days (integration)", () => {
  afterAll(async () => {
    await db.delete(organizations).where(like(organizations.slug, `${tag}-%`));
    await db.delete(sources).where(like(sources.name, `${tag}%`));
  });

  it("buckets by publication day in Istanbul time, counts per source type, and loads one day at a time", async () => {
    const org = await makeOrg("a");
    const other = await makeOrg("b");
    const mk = async (type: string, key: string) => {
      const [s] = await db
        .insert(sources)
        .values({ name: `${tag}-${key}`, domain: `${tag}-${key}.example`, type, connector: "mock" })
        .returning();
      return s!.id;
    };
    const digital = await mk("news", "digital");
    const paper = await mk("newspaper", "paper");
    const mag = await mk("magazine", "mag");

    let n = 0;
    async function add(ctx: typeof org, sourceId: string, publishedAt: string, title: string) {
      n += 1;
      const [article] = await db
        .insert(articles)
        .values({
          sourceId,
          canonicalUrl: `https://${tag}.example/${n}`,
          contentHash: `${tag}-${n}`,
          title,
          publishedAt: new Date(publishedAt),
        })
        .returning();
      await db.insert(mentions).values({
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        queryId: ctx.queryId,
        articleId: article!.id,
        matchedTerms: ["x"],
      });
    }

    // 2026-09-30 21:30 UTC is already 2026-10-01 00:30 in Istanbul (UTC+3).
    await add(org, digital, "2026-09-30T21:30:00Z", "Late night story");
    await add(org, digital, "2026-10-01T09:00:00Z", "Morning story");
    await add(org, paper, "2026-10-01T05:00:00Z", "Printed story");
    await add(org, mag, "2026-09-29T10:00:00Z", "Older magazine story");
    await add(other, digital, "2026-10-01T09:00:00Z", "Someone else's story");

    const { days, totalDays } = await listMentionDays(db, org.organizationId, {}, { page: 1, pageSize: 10 });
    expect(totalDays).toBe(2);
    expect(days.map((d) => d.day)).toEqual(["2026-10-01", "2026-09-29"]);
    expect(days[0]).toMatchObject({ total: 3, byType: { news: 2, newspaper: 1 } });
    expect(days[1]).toMatchObject({ total: 1, byType: { magazine: 1 } });

    // Paging is by day.
    const page2 = await listMentionDays(db, org.organizationId, {}, { page: 2, pageSize: 1 });
    expect(page2.days.map((d) => d.day)).toEqual(["2026-09-29"]);

    // Opening one day returns only its stories, newest first, and nothing from another tenant.
    const day = await listMentionsForDay(db, org.organizationId, {}, "2026-10-01");
    expect(day.items.map((i) => i.article.title)).toEqual(["Morning story", "Printed story", "Late night story"]);
    expect(day.truncated).toBe(false);
    expect((await listMentionsForDay(db, org.organizationId, {}, "2026-10-01", 2)).truncated).toBe(true);
    expect(await listMentionsForDay(db, other.organizationId, {}, "2026-09-29")).toEqual({ items: [], truncated: false, totals: {} });

    // Filters narrow the days too.
    const filtered = await listMentionDays(db, org.organizationId, { queryId: org.queryId, sentiment: "negative" }, { page: 1, pageSize: 10 });
    expect(filtered).toEqual({ days: [], totalDays: 0 });
  });

  it("keeps every monitoring on the day — a broad one cannot push a narrow one off the page", async () => {
    const org = await makeOrg("c");
    const narrow = org.queryId;
    const broad = (
      await createMonitoringQuery(db, org.organizationId, {
        projectId: org.projectId,
        name: "Broad",
        queryAst: { include: ["y"], exclude: [], exactPhrases: [] },
        booleanQuery: "y",
        sourceTypes: ["news"],
      })
    ).id;
    const [source] = await db
      .insert(sources)
      .values({ name: `${tag}-fair`, domain: `${tag}-fair.example`, type: "news", connector: "mock" })
      .returning();
    let n = 1000;
    async function add(queryId: string, publishedAt: string, title: string) {
      n += 1;
      const [article] = await db
        .insert(articles)
        .values({ sourceId: source!.id, canonicalUrl: `https://${tag}.example/f${n}`, contentHash: `${tag}-f${n}`, title, publishedAt: new Date(publishedAt) })
        .returning();
      await db.insert(mentions).values({
        organizationId: org.organizationId,
        projectId: org.projectId,
        queryId,
        articleId: article!.id,
        matchedTerms: ["x"],
      });
    }

    // The narrow monitoring has one early-morning story; the broad one has five that are all newer.
    await add(narrow, "2026-10-02T03:00:00Z", "Narrow story");
    for (let i = 0; i < 5; i += 1) await add(broad, `2026-10-02T1${i}:00:00Z`, `Broad story ${i}`);

    const day = await listMentionsForDay(db, org.organizationId, {}, "2026-10-02", 3);
    expect(day.items.filter((item) => item.mention.queryId === narrow).map((item) => item.article.title)).toEqual(["Narrow story"]);
    expect(day.items.filter((item) => item.mention.queryId === broad).map((item) => item.article.title)).toEqual([
      "Broad story 4",
      "Broad story 3",
      "Broad story 2",
    ]);
    expect(day.totals).toEqual({ [narrow]: 1, [broad]: 5 });
    expect(day.truncated).toBe(true);
    // Newest first across the whole day.
    expect(day.items.map((item) => item.article.title)).toEqual(["Broad story 4", "Broad story 3", "Broad story 2", "Narrow story"]);
  });
});
