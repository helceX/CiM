import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { organizations, organizationMemberships, workspaces } from "../schema/index";
import { users } from "../schema/users";
import { createProject } from "./projects";
import { createMonitoringQuery } from "./monitoring-queries";
import { insertArticle } from "./articles";
import {
  assignMention,
  getCompetitorComparison,
  getMentionDetail,
  listMentionsFiltered,
  setMentionFeedback,
} from "./mentions";
import { addTagToMention, findOrCreateTag, listTagsForOrganization, removeTagFromMention } from "./tags";
import { addCommentToMention, deleteMentionComment, listCommentsForMention } from "./mention-comments";
import { asOrganizationId } from "./tenant-scope";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) against a real
 * Postgres instance — proves the Mentions table's filtering, pagination,
 * detail lookup, and feedback recording actually work together, not just
 * that each query compiles.
 */
describe("mentions repository (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let projectId: string;
  let sourceId: string;
  let queryId: string;
  let memberUserId: string;
  let outsiderUserId: string;
  const mentionIds: string[] = [];

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Mentions Test Co", slug: `mentions-test-${Date.now()}` })
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
      name: "Mentions Test Project",
    });
    projectId = project.id;

    const [source] = await db
      .insert(sources)
      .values({
        name: "Mentions Test Wire",
        domain: `mentions-test-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;

    const query = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Mentions test query",
      queryAst: { include: ["test"], exclude: [], exactPhrases: [] },
      booleanQuery: "test",
      sourceTypes: ["news"],
    });
    queryId = query.id;

    const seedArticles = [
      {
        title: "Positive story about the brand",
        sentiment: "positive" as const,
        priority: "high" as const,
      },
      {
        title: "Neutral coverage piece",
        sentiment: "neutral" as const,
        priority: "normal" as const,
      },
      {
        title: "Negative press about a recall",
        sentiment: "negative" as const,
        priority: "critical" as const,
      },
      {
        title: "Unclassified mention with no sentiment yet",
        sentiment: null,
        priority: "low" as const,
      },
    ];

    for (const [i, def] of seedArticles.entries()) {
      const article = await insertArticle(db, {
        sourceId,
        canonicalUrl: `https://mentions-test.example/${i}`,
        contentHash: `mentions-test-hash-${i}`,
        title: def.title,
        storedExcerpt: null,
        language: null,
        publishedAt: new Date(Date.now() - i * 1000),
        authorName: null,
      });

      const [mention] = await db
        .insert(mentions)
        .values({
          organizationId,
          projectId,
          queryId,
          articleId: article.id,
          matchedTerms: ["test"],
          sentiment: def.sentiment,
          priority: def.priority,
        })
        .returning();
      if (!mention) throw new Error("failed to create test mention");
      mentionIds.push(mention.id);
    }

    const [member] = await db
      .insert(users)
      .values({
        email: `mentions-test-member-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "Ada",
        lastName: "Reviewer",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!member) throw new Error("failed to create test member user");
    memberUserId = member.id;
    await db.insert(organizationMemberships).values({
      organizationId,
      userId: memberUserId,
      role: "analyst",
      status: "active",
    });

    const [outsider] = await db
      .insert(users)
      .values({
        email: `mentions-test-outsider-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "Outside",
        lastName: "Person",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!outsider) throw new Error("failed to create test outsider user");
    outsiderUserId = outsider.id;
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, organizationId));
    await db.delete(sources).where(eq(sources.id, sourceId));
    await db.delete(users).where(eq(users.id, memberUserId));
    await db.delete(users).where(eq(users.id, outsiderUserId));
  });

  it("filters by sentiment", async () => {
    const result = await listMentionsFiltered(
      db,
      organizationId,
      { sentiment: "negative" },
      { page: 1, pageSize: 10 },
    );
    expect(result.totalCount).toBe(1);
    expect(result.items[0]?.article.title).toContain("recall");
  });

  it("filters unclassified sentiment as null, not a literal string", async () => {
    const result = await listMentionsFiltered(
      db,
      organizationId,
      { sentiment: "unclassified" },
      { page: 1, pageSize: 10 },
    );
    expect(result.totalCount).toBe(1);
    expect(result.items[0]?.mention.sentiment).toBeNull();
  });

  it("filters by priority", async () => {
    const result = await listMentionsFiltered(
      db,
      organizationId,
      { priority: "critical" },
      { page: 1, pageSize: 10 },
    );
    expect(result.totalCount).toBe(1);
  });

  it("searches article titles case-insensitively", async () => {
    const result = await listMentionsFiltered(
      db,
      organizationId,
      { search: "BRAND" },
      { page: 1, pageSize: 10 },
    );
    expect(result.totalCount).toBe(1);
    expect(result.items[0]?.article.title).toContain("brand");
  });

  it("tolerates a small typo via pg_trgm word_similarity", async () => {
    const result = await listMentionsFiltered(
      db,
      organizationId,
      { search: "brnad" },
      { page: 1, pageSize: 10 },
    );
    expect(result.items.some((item) => item.article.title.includes("brand"))).toBe(true);
  });

  it("folds Turkish casing so a dotless-ı search matches a dotted-İ title", async () => {
    const unique = Date.now();
    const article = await insertArticle(db, {
      sourceId,
      canonicalUrl: `https://mentions-test.example/turkish-${unique}`,
      contentHash: `mentions-test-hash-turkish-${unique}`,
      title: "İstanbul haberleri bu hafta artıyor",
      storedExcerpt: null,
      language: "tr",
      publishedAt: new Date(),
      authorName: null,
    });
    const [mention] = await db
      .insert(mentions)
      .values({
        organizationId,
        projectId,
        queryId,
        articleId: article.id,
        matchedTerms: ["istanbul"],
        priority: "normal",
      })
      .returning();
    if (!mention) throw new Error("failed to create Turkish-title test mention");

    try {
      // A naive `.toLowerCase()` on "İstanbul" corrupts to "i̇stanbul" (a
      // combining dot above "i"), which a plain "istanbul" search would
      // never match — this only passes if turkishFold's explicit İ->i
      // mapping is actually wired into both the write path (insertArticle)
      // and the read path (PostgresSearchIndex.search).
      const result = await listMentionsFiltered(
        db,
        organizationId,
        { search: "istanbul" },
        { page: 1, pageSize: 10 },
      );
      expect(result.items.some((item) => item.article.id === article.id)).toBe(true);
    } finally {
      // Self-cleaning — other tests in this file assert exact totalCount
      // values against the shared four-mention fixture above.
      await db.delete(mentions).where(eq(mentions.id, mention.id));
      await db.delete(articles).where(eq(articles.id, article.id));
    }
  });

  it("paginates results", async () => {
    const page1 = await listMentionsFiltered(
      db,
      organizationId,
      {},
      { page: 1, pageSize: 2 },
    );
    const page2 = await listMentionsFiltered(
      db,
      organizationId,
      {},
      { page: 2, pageSize: 2 },
    );
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(2);
    expect(page1.totalCount).toBe(4);
    expect(page1.items[0]?.mention.id).not.toEqual(page2.items[0]?.mention.id);
  });

  it("applies the sinceDays filter even when sinceDays is 0, instead of falsy-skipping it", async () => {
    const unique = Date.now();
    const oldArticle = await insertArticle(db, {
      sourceId,
      canonicalUrl: `https://mentions-test.example/old-${unique}`,
      contentHash: `mentions-test-hash-old-${unique}`,
      title: "Old mention from last month",
      storedExcerpt: null,
      language: null,
      publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      authorName: null,
    });
    const [oldMention] = await db
      .insert(mentions)
      .values({
        organizationId,
        projectId,
        queryId,
        articleId: oldArticle.id,
        matchedTerms: ["test"],
        priority: "normal",
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      })
      .returning();
    if (!oldMention) throw new Error("failed to create old test mention");

    try {
      // sinceDays: 0 is falsy in JS — a naive `filters.sinceDays ? ... :
      // undefined` check would silently skip the date filter entirely
      // and return every mention ever created, including one 30 days
      // old, instead of none from 0 days back.
      const result = await listMentionsFiltered(
        db,
        organizationId,
        { sinceDays: 0 },
        { page: 1, pageSize: 50 },
      );
      expect(result.items.some((item) => item.mention.id === oldMention.id)).toBe(false);
    } finally {
      await db.delete(mentions).where(eq(mentions.id, oldMention.id));
      await db.delete(articles).where(eq(articles.id, oldArticle.id));
    }
  });

  it("breaks a created_at tie by id, not Postgres's unstable default row order", async () => {
    // Eight rows, not two: with only a couple of ties, an unpinned
    // Postgres row order can coincidentally match the id-descending
    // order we assert on (a real failure mode seen while writing this
    // test — a 2-row version passed even with the tiebreak reverted).
    // With 8 randomly-generated UUIDs, the odds of an unordered result
    // coincidentally coming back fully sorted by id are ~1-in-40320,
    // so this only passes when the query actually orders by id.
    const unique = Date.now();
    const sameInstant = new Date();
    const tiedArticles = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        insertArticle(db, {
          sourceId,
          canonicalUrl: `https://mentions-test.example/tied-${unique}-${i}`,
          contentHash: `mentions-test-hash-tied-${unique}-${i}`,
          title: `Tied mention ${i}`,
          storedExcerpt: null,
          language: null,
          publishedAt: sameInstant,
          authorName: null,
        }),
      ),
    );
    const tiedMentions = await db
      .insert(mentions)
      .values(
        tiedArticles.map((article) => ({
          organizationId,
          projectId,
          queryId,
          articleId: article.id,
          matchedTerms: ["test"],
          priority: "normal" as const,
          createdAt: sameInstant,
        })),
      )
      .returning();

    try {
      const expectedOrder = [...tiedMentions].map((m) => m.id).sort().reverse();

      const result = await listMentionsFiltered(
        db,
        organizationId,
        {},
        { page: 1, pageSize: 50 },
      );
      const tiedInResult = result.items
        .filter((item) => tiedMentions.some((m) => m.id === item.mention.id))
        .map((item) => item.mention.id);
      expect(tiedInResult).toEqual(expectedOrder);
    } finally {
      await db.delete(mentions).where(
        inArray(mentions.id, tiedMentions.map((m) => m.id)),
      );
      await db.delete(articles).where(
        inArray(articles.id, tiedArticles.map((a) => a.id)),
      );
    }
  });

  it("never returns another organization's mentions", async () => {
    const otherOrgId = asOrganizationId("00000000-0000-0000-0000-000000000000");
    const result = await listMentionsFiltered(
      db,
      otherOrgId,
      {},
      { page: 1, pageSize: 10 },
    );
    expect(result.totalCount).toBe(0);
  });

  it("returns full detail including the matched query's name", async () => {
    const mentionId = mentionIds[0];
    if (!mentionId) throw new Error("no seeded mention");
    const detail = await getMentionDetail(db, organizationId, mentionId);
    expect(detail?.queryName).toBe("Mentions test query");
    expect(detail?.mention.matchedTerms).toContain("test");
  });

  it("records feedback and moves the mention out of the new/reviewed queue when irrelevant", async () => {
    const mentionId = mentionIds[1];
    if (!mentionId) throw new Error("no seeded mention");
    const updated = await setMentionFeedback(
      db,
      organizationId,
      mentionId,
      "irrelevant",
    );
    expect(updated).toBe(true);

    const [row] = await db.select().from(mentions).where(eq(mentions.id, mentionId));
    expect(row?.reviewFeedback).toBe("irrelevant");
    expect(row?.status).toBe("archived");

    const defaultView = await listMentionsFiltered(
      db,
      organizationId,
      {},
      { page: 1, pageSize: 10 },
    );
    expect(defaultView.items.some((item) => item.mention.id === mentionId)).toBe(false);

    const withArchived = await listMentionsFiltered(
      db,
      organizationId,
      { includeArchived: true },
      { page: 1, pageSize: 10 },
    );
    expect(withArchived.items.some((item) => item.mention.id === mentionId)).toBe(true);
  });

  it("does not let feedback be recorded against another organization's mention", async () => {
    const mentionId = mentionIds[2];
    if (!mentionId) throw new Error("no seeded mention");
    const otherOrgId = asOrganizationId("00000000-0000-0000-0000-000000000000");
    const updated = await setMentionFeedback(db, otherOrgId, mentionId, "relevant");
    expect(updated).toBe(false);
  });

  it("assigns a mention to an active org member and surfaces the name via detail/list", async () => {
    const mentionId = mentionIds[3];
    if (!mentionId) throw new Error("no seeded mention");

    const result = await assignMention(db, organizationId, mentionId, memberUserId);
    expect(result).toBe("ok");

    const detail = await getMentionDetail(db, organizationId, mentionId);
    expect(detail?.mention.assignedToUserId).toBe(memberUserId);
    expect(detail?.assigneeName).toBe("Ada Reviewer");

    const filtered = await listMentionsFiltered(
      db,
      organizationId,
      { assignedToUserId: memberUserId },
      { page: 1, pageSize: 10 },
    );
    expect(filtered.items.some((item) => item.mention.id === mentionId)).toBe(true);
    expect(filtered.items[0]?.assigneeName).toBe("Ada Reviewer");
  });

  it("unassigns when given null", async () => {
    const mentionId = mentionIds[3];
    if (!mentionId) throw new Error("no seeded mention");
    await assignMention(db, organizationId, mentionId, memberUserId);

    const result = await assignMention(db, organizationId, mentionId, null);
    expect(result).toBe("ok");

    const detail = await getMentionDetail(db, organizationId, mentionId);
    expect(detail?.mention.assignedToUserId).toBeNull();
    expect(detail?.assigneeName).toBeNull();
  });

  it("rejects assigning to a user who isn't an active member of the organization", async () => {
    const mentionId = mentionIds[3];
    if (!mentionId) throw new Error("no seeded mention");

    const result = await assignMention(db, organizationId, mentionId, outsiderUserId);
    expect(result).toBe("invalid_assignee");

    const detail = await getMentionDetail(db, organizationId, mentionId);
    expect(detail?.mention.assignedToUserId).not.toBe(outsiderUserId);
  });

  it("returns not_found for a mention outside the organization", async () => {
    const mentionId = mentionIds[3];
    if (!mentionId) throw new Error("no seeded mention");
    const otherOrgId = asOrganizationId("00000000-0000-0000-0000-000000000000");

    // null skips the assignee-membership check entirely, isolating this
    // assertion to the tenant-scope guard on the update itself.
    const result = await assignMention(db, otherOrgId, mentionId, null);
    expect(result).toBe("not_found");
  });

  it("filters to unassigned mentions only", async () => {
    const mentionId = mentionIds[3];
    if (!mentionId) throw new Error("no seeded mention");
    await assignMention(db, organizationId, mentionId, memberUserId);

    const result = await listMentionsFiltered(
      db,
      organizationId,
      { unassignedOnly: true },
      { page: 1, pageSize: 10 },
    );
    expect(result.items.some((item) => item.mention.id === mentionId)).toBe(false);

    await assignMention(db, organizationId, mentionId, null);
  });

  it("tags a mention, reuses an existing tag case-insensitively, and filters by tag", async () => {
    // mentionIds[1] was archived by an earlier test (feedback: irrelevant)
    // and listMentionsFiltered excludes archived by default — [0] and [2]
    // are still "new" here.
    const mentionId = mentionIds[0];
    const otherMentionId = mentionIds[2];
    if (!mentionId || !otherMentionId) throw new Error("no seeded mention");

    const first = await addTagToMention(db, organizationId, mentionId, "Crisis");
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");

    const reused = await addTagToMention(db, organizationId, otherMentionId, "crisis");
    expect(reused.ok).toBe(true);
    if (!reused.ok) throw new Error("unreachable");
    expect(reused.tag.id).toBe(first.tag.id);

    const orgTags = await listTagsForOrganization(db, organizationId);
    expect(orgTags.filter((t) => t.id === first.tag.id)).toHaveLength(1);

    const detail = await getMentionDetail(db, organizationId, mentionId);
    expect(detail?.tags.map((t) => t.name)).toEqual(["Crisis"]);

    const filtered = await listMentionsFiltered(
      db,
      organizationId,
      { tagId: first.tag.id },
      { page: 1, pageSize: 10 },
    );
    expect(filtered.items.map((i) => i.mention.id).sort()).toEqual(
      [mentionId, otherMentionId].sort(),
    );

    const removed = await removeTagFromMention(db, organizationId, mentionId, first.tag.id);
    expect(removed).toBe(true);
    const afterRemove = await getMentionDetail(db, organizationId, mentionId);
    expect(afterRemove?.tags).toHaveLength(0);
  });

  it("does not let a tag be attached to or removed from another organization's mention", async () => {
    const mentionId = mentionIds[0];
    if (!mentionId) throw new Error("no seeded mention");
    const otherOrgId = asOrganizationId("00000000-0000-0000-0000-000000000000");

    const attach = await addTagToMention(db, otherOrgId, mentionId, "Cross-tenant");
    expect(attach).toEqual({ ok: false, reason: "mention_not_found" });

    const tagId = await findOrCreateTag(db, organizationId, "Removable");
    await addTagToMention(db, organizationId, mentionId, "Removable");
    const removed = await removeTagFromMention(db, otherOrgId, mentionId, tagId);
    expect(removed).toBe(false);

    const detail = await getMentionDetail(db, organizationId, mentionId);
    expect(detail?.tags.some((t) => t.id === tagId)).toBe(true);
  });

  it("comments on a mention, lists oldest-first with author names, and lets only the author delete their own", async () => {
    const mentionId = mentionIds[0];
    if (!mentionId) throw new Error("no seeded mention");

    const first = await addCommentToMention(db, organizationId, mentionId, memberUserId, "First note");
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");
    expect(first.comment.authorFirstName).toBe("Ada");
    expect(first.comment.body).toBe("First note");

    const second = await addCommentToMention(
      db,
      organizationId,
      mentionId,
      outsiderUserId,
      "Second note",
    );
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("unreachable");

    const comments = await listCommentsForMention(db, mentionId);
    expect(comments.map((c) => c.body)).toEqual(["First note", "Second note"]);

    const detail = await getMentionDetail(db, organizationId, mentionId);
    expect(detail?.comments.map((c) => c.id)).toEqual(comments.map((c) => c.id));

    // The outsider cannot delete the member's comment...
    const wrongAuthor = await deleteMentionComment(db, organizationId, first.comment.id, outsiderUserId);
    expect(wrongAuthor).toBe(false);
    // ...but can delete their own.
    const ownComment = await deleteMentionComment(db, organizationId, second.comment.id, outsiderUserId);
    expect(ownComment).toBe(true);

    const remaining = await listCommentsForMention(db, mentionId);
    expect(remaining.map((c) => c.id)).toEqual([first.comment.id]);
  });

  it("does not let a comment be added to another organization's mention", async () => {
    const mentionId = mentionIds[0];
    if (!mentionId) throw new Error("no seeded mention");
    const otherOrgId = asOrganizationId("00000000-0000-0000-0000-000000000000");

    const result = await addCommentToMention(db, otherOrgId, mentionId, memberUserId, "Cross-tenant");
    expect(result).toEqual({ ok: false, reason: "mention_not_found" });
  });

  it("groups mentions by tracking target for competitor comparison, excluding non-company/competitor queries", async () => {
    const competitorQuery = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Rival Co monitoring",
      queryAst: { include: ["rival"], exclude: [], exactPhrases: [] },
      booleanQuery: "rival",
      sourceTypes: ["news"],
      trackingTarget: "competitor",
    });
    const topicQuery = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Industry topic monitoring",
      queryAst: { include: ["industry"], exclude: [], exactPhrases: [] },
      booleanQuery: "industry",
      sourceTypes: ["news"],
      trackingTarget: "topic",
    });

    const [rivalArticle] = await db
      .insert(articles)
      .values({
        sourceId,
        canonicalUrl: "https://mentions-test.example/rival",
        contentHash: "mentions-test-hash-rival",
        title: "Rival Co launches new product",
      })
      .returning();
    if (!rivalArticle) throw new Error("failed to create rival test article");
    await db.insert(mentions).values({
      organizationId,
      projectId,
      queryId: competitorQuery.id,
      articleId: rivalArticle.id,
      matchedTerms: ["rival"],
      sentiment: "negative",
      priority: "normal",
    });

    const [topicArticle] = await db
      .insert(articles)
      .values({
        sourceId,
        canonicalUrl: "https://mentions-test.example/topic",
        contentHash: "mentions-test-hash-topic",
        title: "Industry outlook piece",
      })
      .returning();
    if (!topicArticle) throw new Error("failed to create topic test article");
    await db.insert(mentions).values({
      organizationId,
      projectId,
      queryId: topicQuery.id,
      articleId: topicArticle.id,
      matchedTerms: ["industry"],
      sentiment: "positive",
      priority: "normal",
    });

    const comparison = await getCompetitorComparison(db, organizationId, { sinceDays: 7 });

    expect(comparison.some((row) => row.queryId === topicQuery.id)).toBe(false);

    const companyRow = comparison.find((row) => row.queryId === queryId);
    expect(companyRow?.trackingTarget).toBe("company");
    expect(companyRow?.totalMentions).toBe(4);

    const competitorRow = comparison.find((row) => row.queryId === competitorQuery.id);
    expect(competitorRow?.trackingTarget).toBe("competitor");
    expect(competitorRow?.totalMentions).toBe(1);
    expect(competitorRow?.negative).toBe(1);
  });
});
