import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { organizations, workspaces } from "../schema/index";
import { socialProfiles } from "../schema/social";
import { createProject } from "./projects";
import { createMonitoringQuery } from "./monitoring-queries";
import {
  getSocialOverviewStats,
  getSocialPlatformDistribution,
  getSocialSentimentBreakdown,
  getTopSocialAuthors,
  getTopSocialPosts,
  getTrendingHashtags,
} from "./social-listening";
import { asOrganizationId } from "./tenant-scope";

describe("social listening repository (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let sourceId: string;
  let profileAId: string;
  let profileBId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Social Listening Test Co", slug: `social-listening-test-${Date.now()}` })
      .returning();
    if (!org) throw new Error("failed to create test organization");
    organizationId = asOrganizationId(org.id);

    const [workspace] = await db
      .insert(workspaces)
      .values({ organizationId, name: "Default" })
      .returning();
    if (!workspace) throw new Error("failed to create test workspace");

    const project = await createProject(db, organizationId, {
      workspaceId: workspace.id,
      name: "Social Listening Test Project",
    });

    const query = await createMonitoringQuery(db, organizationId, {
      projectId: project.id,
      name: "Social listening test query",
      queryAst: { include: [], exclude: [], exactPhrases: [] },
      booleanQuery: "",
      sourceTypes: ["social"],
    });

    const [source] = await db
      .insert(sources)
      .values({
        name: "Social Listening Test Source",
        domain: `social-listening-test-${Date.now()}.example`,
        type: "social",
        connector: "mock-social",
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;

    const [profileA] = await db
      .insert(socialProfiles)
      .values({
        platform: "mock",
        externalId: `ext-a-${Date.now()}`,
        handle: "@authora",
        followers: 500,
        verified: true,
      })
      .returning();
    const [profileB] = await db
      .insert(socialProfiles)
      .values({
        platform: "mock",
        externalId: `ext-b-${Date.now()}`,
        handle: "@authorb",
      })
      .returning();
    if (!profileA || !profileB) throw new Error("failed to create test social profiles");
    profileAId = profileA.id;
    profileBId = profileB.id;

    const articleDefs = [
      { authorProfileId: profileAId, matchType: "direct_mention", sentiment: "positive" as const, matchedTerms: ["@authora"] },
      { authorProfileId: profileAId, matchType: "hashtag", sentiment: "negative" as const, matchedTerms: ["#brand"] },
      { authorProfileId: profileBId, matchType: null, sentiment: null, matchedTerms: [] },
    ];
    for (const [i, def] of articleDefs.entries()) {
      const [article] = await db
        .insert(articles)
        .values({
          sourceId,
          canonicalUrl: `https://social-listening-test.example/${i}`,
          contentHash: `social-listening-test-hash-${i}`,
          title: `Social listening test post ${i}`,
          authorProfileId: def.authorProfileId,
        })
        .returning();
      if (!article) throw new Error("failed to create test article");
      await db.insert(mentions).values({
        organizationId,
        projectId: project.id,
        queryId: query.id,
        articleId: article.id,
        matchedTerms: def.matchedTerms,
        matchType: def.matchType,
        sentiment: def.sentiment,
      });
    }
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, organizationId));
    await db.delete(sources).where(eq(sources.id, sourceId));
    await db.delete(socialProfiles).where(eq(socialProfiles.id, profileAId));
    await db.delete(socialProfiles).where(eq(socialProfiles.id, profileBId));
  });

  it("counts total conversations, direct mentions, and unique authors", async () => {
    const stats = await getSocialOverviewStats(db, organizationId, { sinceDays: 7 });
    expect(stats.totalConversations).toBe(3);
    expect(stats.directMentions).toBe(1);
    expect(stats.uniqueAuthors).toBe(2);
  });

  it("groups platform distribution by the linked social profile's platform", async () => {
    const platforms = await getSocialPlatformDistribution(db, organizationId, { sinceDays: 7 });
    expect(platforms).toEqual([{ platform: "mock", count: 3 }]);
  });

  it("breaks sentiment into positive/neutral/negative/unclassified", async () => {
    const sentiment = await getSocialSentimentBreakdown(db, organizationId, { sinceDays: 7 });
    expect(sentiment).toEqual({ positive: 1, neutral: 0, negative: 1, unclassified: 1 });
  });

  it("surfaces the matched hashtag as a trending hashtag with a zero baseline", async () => {
    const hashtags = await getTrendingHashtags(db, organizationId, { sinceDays: 7 });
    const brand = hashtags.find((h) => h.hashtag === "#brand");
    expect(brand).toEqual({ hashtag: "#brand", currentCount: 1, previousCount: 0 });
  });

  it("ranks authors by mention count, most active first", async () => {
    const authors = await getTopSocialAuthors(db, organizationId, { sinceDays: 7 });
    expect(authors[0]?.profileId).toBe(profileAId);
    expect(authors[0]?.mentionCount).toBe(2);
    expect(authors[0]?.followers).toBe(500);
    expect(authors[0]?.verified).toBe(true);
    expect(authors[1]?.profileId).toBe(profileBId);
    expect(authors[1]?.mentionCount).toBe(1);
    expect(authors[1]?.followers).toBeNull();
  });

  it("lists all matching posts with their author handle", async () => {
    const posts = await getTopSocialPosts(db, organizationId, { sinceDays: 7 });
    expect(posts.length).toBe(3);
    expect(posts.every((p) => p.title.startsWith("Social listening test post"))).toBe(true);
  });
});
