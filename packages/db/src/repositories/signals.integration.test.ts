import { afterAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { organizations, workspaces } from "../schema/index";
import { insertArticle, setArticleStoryCluster } from "./articles";
import { createMentionIfNotExists } from "./mentions";
import { createMonitoringQuery, updateMonitoringQuery } from "./monitoring-queries";
import { createProject } from "./projects";
import {
  applyCoverageToCluster,
  clearSignalsForQuery,
  countClusterOutlets,
  countOutletsByCluster,
  scoreUnscoredMentions,
} from "./signals";
import { asOrganizationId } from "./tenant-scope";

const tag = `signals-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function makeOrg(label: string) {
  const [org] = await db.insert(organizations).values({ name: `${label} Co`, slug: `${tag}-${label}` }).returning();
  const organizationId = asOrganizationId(org!.id);
  const [workspace] = await db.insert(workspaces).values({ organizationId, name: "W" }).returning();
  const project = await createProject(db, organizationId, { workspaceId: workspace!.id, name: `${label} P` });
  return { organizationId, projectId: project.id };
}

let counter = 0;
async function makeSource(type = "news") {
  counter += 1;
  const [source] = await db
    .insert(sources)
    .values({ name: `${tag}-src-${counter}`, domain: `${tag}-${counter}.example`, type, connector: "mock", status: "healthy" })
    .returning();
  return source!;
}

async function makeStory(sourceId: string, title: string, lead: string | null = null) {
  counter += 1;
  return insertArticle(db, {
    sourceId,
    canonicalUrl: `https://${tag}.example/${counter}`,
    contentHash: `${tag}-${counter}`,
    title,
    storedExcerpt: lead,
    language: "en",
    publishedAt: new Date(),
    authorName: null,
    wordFingerprint: null,
  });
}

const signalOf = async (mentionId: string) => {
  const [row] = await db.select().from(mentions).where(eq(mentions.id, mentionId));
  return row!;
};

describe("signals (integration)", () => {
  afterAll(async () => {
    await db.delete(organizations).where(like(organizations.slug, `${tag}-%`));
    await db.delete(sources).where(like(sources.name, `${tag}%`));
  });

  it("scores mentions that have no signal yet, and only once", async () => {
    const org = await makeOrg("score");
    const brand = `Scorecorp${Date.now()}`;
    const query = await createMonitoringQuery(db, org.organizationId, {
      projectId: org.projectId,
      name: "Score watch",
      queryAst: { include: [brand], exclude: [], exactPhrases: [], intent: { goals: ["risk"], focus: "essentials", signalWords: [] } },
      booleanQuery: brand,
      sourceTypes: ["news"],
      trackingTarget: "company",
    });
    const news = await makeSource("news");
    const headline = await makeStory(news.id, `${brand} sued over data breach`);
    const lead = await makeStory(news.id, "A plant opens in Izmir", `${brand} said on Monday that the plant opens.`);
    const mention = (articleId: string) =>
      createMentionIfNotExists(db, org.organizationId, { projectId: org.projectId, queryId: query.id, articleId, matchedTerms: [brand] });
    const headlineMention = (await mention(headline.id))!;
    const leadMention = (await mention(lead.id))!;
    // Saved without a signal: the defaults are all there is.
    expect((await signalOf(headlineMention)).signalReasons).toBeNull();
    expect((await signalOf(headlineMention)).priority).toBe("normal");

    expect(await scoreUnscoredMentions(db, { queryId: query.id })).toBe(2);
    const scoredHeadline = await signalOf(headlineMention);
    const scoredLead = await signalOf(leadMention);
    expect(scoredHeadline.priority).toBe("high");
    expect(scoredHeadline.signalReasons?.map((reason) => reason.code)).toEqual(["headline", "goal", "editorial"]);
    expect(scoredLead.priority).toBe("normal");
    expect(scoredLead.signalReasons?.[0]).toEqual({ code: "lead", terms: [brand] });
    expect(scoredHeadline.signalScore!).toBeGreaterThan(scoredLead.signalScore!);

    // Nothing left to do, and nothing is redone.
    expect(await scoreUnscoredMentions(db, { queryId: query.id })).toBe(0);
  });

  it("scores again after the monitoring changes, once its old signals are cleared", async () => {
    const org = await makeOrg("rescore");
    const brand = `Rescorecorp${Date.now()}`;
    const query = await createMonitoringQuery(db, org.organizationId, {
      projectId: org.projectId,
      name: "Rescore watch",
      queryAst: { include: [brand], exclude: [], exactPhrases: [] },
      booleanQuery: brand,
      sourceTypes: ["news"],
      trackingTarget: "company",
    });
    const news = await makeSource("news");
    const story = await makeStory(news.id, `${brand} opens a grant programme`);
    const id = (await createMentionIfNotExists(db, org.organizationId, { projectId: org.projectId, queryId: query.id, articleId: story.id, matchedTerms: [brand] }))!;
    await scoreUnscoredMentions(db, { queryId: query.id });
    const before = await signalOf(id);
    expect(before.signalReasons?.some((reason) => reason.code === "goal")).toBe(false);

    // The person now looks for opportunities.
    await updateMonitoringQuery(db, org.organizationId, query.id, {
      name: query.name,
      queryAst: { ...query.queryAst, intent: { goals: ["opportunity"], focus: "balanced", signalWords: [] } },
      booleanQuery: brand,
      sourceTypes: ["news"],
      regionScopes: [],
    });
    await clearSignalsForQuery(db, org.organizationId, query.id);
    expect((await signalOf(id)).signalReasons).toBeNull();
    expect(await scoreUnscoredMentions(db, { queryId: query.id })).toBe(1);
    const after = await signalOf(id);
    expect(after.signalReasons).toContainEqual({ code: "goal", goal: "opportunity", headline: ["grant"], text: [] });
    expect(after.signalScore!).toBeGreaterThan(before.signalScore!);
  });

  it("does not touch another organization's mentions when it is told which monitoring to score", async () => {
    const mine = await makeOrg("mine");
    const theirs = await makeOrg("theirs");
    const brand = `Sharedcorp${Date.now()}`;
    const news = await makeSource("news");
    const story = await makeStory(news.id, `${brand} wins a contract`);
    const make = async (org: typeof mine) => {
      const query = await createMonitoringQuery(db, org.organizationId, {
        projectId: org.projectId,
        name: "Shared watch",
        queryAst: { include: [brand], exclude: [], exactPhrases: [] },
        booleanQuery: brand,
        sourceTypes: ["news"],
        trackingTarget: "company",
      });
      const id = (await createMentionIfNotExists(db, org.organizationId, { projectId: org.projectId, queryId: query.id, articleId: story.id, matchedTerms: [brand] }))!;
      return { query, id };
    };
    const a = await make(mine);
    const b = await make(theirs);
    expect(await scoreUnscoredMentions(db, { queryId: a.query.id })).toBe(1);
    expect((await signalOf(a.id)).signalReasons).not.toBeNull();
    expect((await signalOf(b.id)).signalReasons).toBeNull();
  });

  it("lifts every mention of a story once enough outlets carry it, and only then", async () => {
    const org = await makeOrg("cover");
    const brand = `Covercorp${Date.now()}`;
    const query = await createMonitoringQuery(db, org.organizationId, {
      projectId: org.projectId,
      name: "Cover watch",
      queryAst: { include: [brand], exclude: [], exactPhrases: [] },
      booleanQuery: brand,
      sourceTypes: ["news"],
      trackingTarget: "company",
    });
    const clusterId = crypto.randomUUID();
    const mentionIds: string[] = [];
    const addOutlet = async (title: string) => {
      const source = await makeSource("news");
      const story = await makeStory(source.id, title);
      await setArticleStoryCluster(db, story.id, clusterId);
      mentionIds.push(
        (await createMentionIfNotExists(db, org.organizationId, { projectId: org.projectId, queryId: query.id, articleId: story.id, matchedTerms: [brand] }))!,
      );
    };
    await addOutlet(`${brand} opens a plant`);
    await addOutlet(`${brand} opens a new plant`);
    await scoreUnscoredMentions(db, { queryId: query.id });
    const alone = await signalOf(mentionIds[0]!);
    expect(await countClusterOutlets(db, clusterId)).toBe(2);
    expect(await applyCoverageToCluster(db, clusterId)).toBe(0); // two outlets: not yet a wide story

    await addOutlet(`${brand} opens its plant`);
    await scoreUnscoredMentions(db, { queryId: query.id });
    expect(await countClusterOutlets(db, clusterId)).toBe(3);
    // The third was just scored with the reach already known; the first two learn of it.
    expect(await applyCoverageToCluster(db, clusterId)).toBe(2);
    for (const id of mentionIds) {
      const row = await signalOf(id);
      expect(row.signalReasons).toContainEqual({ code: "covered", n: 3 });
    }
    expect((await signalOf(mentionIds[0]!)).signalScore).toBe(alone.signalScore! + 10);
    expect(await applyCoverageToCluster(db, clusterId)).toBe(0); // repeating changes nothing

    await addOutlet(`${brand} opens a plant today`);
    await scoreUnscoredMentions(db, { queryId: query.id });
    await applyCoverageToCluster(db, clusterId);
    for (const id of mentionIds) expect((await signalOf(id)).signalReasons).toContainEqual({ code: "covered", n: 4 });
  });

  it("counts different outlets, not different stories, per cluster", async () => {
    const clusterId = crypto.randomUUID();
    const source = await makeSource("news");
    const other = await makeSource("news");
    for (const [sourceId, title] of [[source.id, `${tag} one`], [source.id, `${tag} two`], [other.id, `${tag} three`]] as const) {
      const story = await makeStory(sourceId, title);
      await setArticleStoryCluster(db, story.id, clusterId);
    }
    expect((await countOutletsByCluster(db, [clusterId])).get(clusterId)).toBe(2);
    expect((await countOutletsByCluster(db, [])).size).toBe(0);
    expect(await countClusterOutlets(db, crypto.randomUUID())).toBe(1);
    // Clean up the articles this test made outside any organization.
    await db.delete(articles).where(like(articles.title, `${tag}%`));
  });
});
