import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { organizations, organizationMemberships, workspaces } from "../schema/index";
import { users } from "../schema/users";
import { createProject } from "./projects";
import { createMonitoringQuery } from "./monitoring-queries";
import {
  assignMention,
  getMentionDetail,
  listMentionsFiltered,
  setMentionFeedback,
} from "./mentions";
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
      const [article] = await db
        .insert(articles)
        .values({
          sourceId,
          canonicalUrl: `https://mentions-test.example/${i}`,
          contentHash: `mentions-test-hash-${i}`,
          title: def.title,
          publishedAt: new Date(Date.now() - i * 1000),
        })
        .returning();
      if (!article) throw new Error("failed to create test article");

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
});
