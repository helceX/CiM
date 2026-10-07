import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { articles, organizations, sources, workspaces } from "../schema/index";
import { createMonitoringQuery } from "./monitoring-queries";
import { createMentionIfNotExists, listBrandMentions } from "./mentions";
import { createProject } from "./projects";
import { asOrganizationId } from "./tenant-scope";

const stamp = Date.now();

describe("listBrandMentions (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let otherOrganizationId: ReturnType<typeof asOrganizationId>;
  let sourceId: string;

  async function addStory(title: string, queryId: string, projectId: string, org = organizationId, excerpt?: string) {
    const [article] = await db
      .insert(articles)
      .values({
        sourceId,
        canonicalUrl: `https://brand.example/${stamp}/${Math.random()}`,
        contentHash: `brand-${stamp}-${Math.random()}`,
        title,
        storedExcerpt: excerpt ?? null,
        publishedAt: new Date(),
      })
      .returning();
    await createMentionIfNotExists(db, org, { projectId, queryId, articleId: article!.id, matchedTerms: [] });
  }

  beforeAll(async () => {
    const [org] = await db.insert(organizations).values({ name: `Brand Co ${stamp}`, slug: `brand-${stamp}` }).returning();
    const [other] = await db.insert(organizations).values({ name: `Other Co ${stamp}`, slug: `brand-other-${stamp}` }).returning();
    organizationId = asOrganizationId(org!.id);
    otherOrganizationId = asOrganizationId(other!.id);
    const [source] = await db.insert(sources).values({ name: `Brand Wire ${stamp}`, domain: `brand-${stamp}.example`, type: "news", connector: "mock" }).returning();
    sourceId = source!.id;

    const [ws] = await db.insert(workspaces).values({ organizationId, name: "Default" }).returning();
    const project = await createProject(db, organizationId, { workspaceId: ws!.id, name: "P" });
    const withCompany = await createMonitoringQuery(db, organizationId, {
      projectId: project.id,
      name: "ITO",
      queryAst: {
        include: ["İstanbul Ticaret Odası", "İTO", "ticaret"],
        exclude: [],
        exactPhrases: [],
        company: { name: "İstanbul Ticaret Odası", short: "İTO" },
      },
      booleanQuery: "x",
      sourceTypes: ["news"],
    });
    await addStory("İTO'dan yeni destek paketi", withCompany.id, project.id); // short name, with a Turkish suffix
    await addStory("İstanbul Ticaret Odası seçime gidiyor", withCompany.id, project.id); // full name
    await addStory("Ticaret hacmi arttı", withCompany.id, project.id, organizationId, "Haberin ilk paragrafı: İstanbul Ticaret Odası verileri paylaştı."); // only the lead names it
    await addStory("Dış ticaret rakamları", withCompany.id, project.id); // matched "ticaret", but never names the company
    const plain = await createMonitoringQuery(db, organizationId, {
      projectId: project.id,
      name: "plain",
      queryAst: { include: ["İTO"], exclude: [], exactPhrases: [] },
      booleanQuery: "y",
      sourceTypes: ["news"],
    });
    await addStory("İTO başkanı konuştu", plain.id, project.id); // a monitoring with no company: not "your brand"

    const [ws2] = await db.insert(workspaces).values({ organizationId: otherOrganizationId, name: "Default" }).returning();
    const project2 = await createProject(db, otherOrganizationId, { workspaceId: ws2!.id, name: "P" });
    const theirs = await createMonitoringQuery(db, otherOrganizationId, {
      projectId: project2.id,
      name: "theirs",
      queryAst: { include: ["İTO"], exclude: [], exactPhrases: [], company: { name: "İTO" } },
      booleanQuery: "z",
      sourceTypes: ["news"],
    });
    await addStory("Başka kuruluşun İTO haberi", theirs.id, project2.id, otherOrganizationId);
  });

  afterAll(async () => {
    await db.delete(sources).where(eq(sources.id, sourceId));
    await db.delete(organizations).where(eq(organizations.id, organizationId));
    await db.delete(organizations).where(eq(organizations.id, otherOrganizationId));
  });

  it("lists only the stories that name the company, in the headline or lead, and says which name", async () => {
    const { names, items } = await listBrandMentions(db, organizationId);
    expect(names).toEqual(["İstanbul Ticaret Odası", "İTO"]);
    const titles = items.map((item) => item.article.title);
    expect(titles).toHaveLength(3);
    expect(titles).toEqual(expect.arrayContaining(["İTO'dan yeni destek paketi", "İstanbul Ticaret Odası seçime gidiyor", "Ticaret hacmi arttı"]));
    expect(titles).not.toContain("Dış ticaret rakamları");
    expect(titles).not.toContain("İTO başkanı konuştu");
    expect(items.find((i) => i.article.title === "Ticaret hacmi arttı")).toMatchObject({ matchedName: "İstanbul Ticaret Odası", where: "lead" });
    expect(items.find((i) => i.article.title === "İTO'dan yeni destek paketi")).toMatchObject({ matchedName: "İTO", where: "headline" });
  });

  it("never reaches into another organization, and honours the limit", async () => {
    const mine = await listBrandMentions(db, organizationId, { limit: 1 });
    expect(mine.items).toHaveLength(1);
    expect(mine.items.every((item) => item.mention.organizationId === organizationId)).toBe(true);
    const theirs = await listBrandMentions(db, otherOrganizationId);
    expect(theirs.items.map((i) => i.article.title)).toEqual(["Başka kuruluşun İTO haberi"]);
  });

  it("returns nothing, and no names, when no monitoring has a company", async () => {
    const [org] = await db.insert(organizations).values({ name: `No Co ${stamp}`, slug: `brand-none-${stamp}` }).returning();
    try {
      expect(await listBrandMentions(db, asOrganizationId(org!.id))).toEqual({ names: [], items: [] });
    } finally {
      await db.delete(organizations).where(eq(organizations.id, org!.id));
    }
  });
});
