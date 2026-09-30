import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { Queue } from "bullmq";
import type { SendEmailJobData } from "@cim/core";
import {
  asOrganizationId,
  createInsight,
  createMonitoringQuery,
  createProject,
  db,
  schema,
} from "@cim/db";
import { processSendExecutiveBriefJob } from "./send-executive-brief";

describe("processSendExecutiveBriefJob (integration)", () => {
  let orgWithFreshBriefId: ReturnType<typeof asOrganizationId>;
  let orgWithStaleBriefId: ReturnType<typeof asOrganizationId>;
  let orgWithNoBriefId: ReturnType<typeof asOrganizationId>;
  let memberEmailFresh: string;
  let memberEmailStale: string;
  let memberEmailNone: string;
  let sourceId: string;

  beforeAll(async () => {
    const orgDefs = [
      { key: "fresh", name: "Exec Brief Fresh Co" },
      { key: "stale", name: "Exec Brief Stale Co" },
      { key: "none", name: "Exec Brief None Co" },
    ] as const;

    const orgIds: Record<string, ReturnType<typeof asOrganizationId>> = {};
    const memberEmails: Record<string, string> = {};

    for (const def of orgDefs) {
      const [org] = await db
        .insert(schema.organizations)
        .values({ name: def.name, slug: `exec-brief-${def.key}-${Date.now()}` })
        .returning();
      if (!org) throw new Error("failed to create test organization");
      const organizationId = asOrganizationId(org.id);
      orgIds[def.key] = organizationId;

      const [user] = await db
        .insert(schema.users)
        .values({
          email: `exec-brief-${def.key}-${Date.now()}@example.com`,
          passwordHash: "unused-in-this-test",
          firstName: "Exec",
          lastName: "Tester",
          emailVerifiedAt: new Date(),
        })
        .returning();
      if (!user) throw new Error("failed to create test user");
      await db.insert(schema.organizationMemberships).values({
        organizationId,
        userId: user.id,
        role: "organization_owner",
        status: "active",
      });
      memberEmails[def.key] = user.email;
    }

    orgWithFreshBriefId = orgIds.fresh!;
    orgWithStaleBriefId = orgIds.stale!;
    orgWithNoBriefId = orgIds.none!;
    memberEmailFresh = memberEmails.fresh!;
    memberEmailStale = memberEmails.stale!;
    memberEmailNone = memberEmails.none!;

    // Fresh org: a real whats_changed insight with evidence, created now.
    const [freshWorkspace] = await db
      .insert(schema.workspaces)
      .values({ organizationId: orgWithFreshBriefId, name: "Default" })
      .returning();
    if (!freshWorkspace) throw new Error("failed to create test workspace");
    const freshProject = await createProject(db, orgWithFreshBriefId, {
      workspaceId: freshWorkspace.id,
      name: "Exec Brief Fresh Project",
    });
    const [source] = await db
      .insert(schema.sources)
      .values({
        name: "Exec Brief Wire",
        domain: `exec-brief-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;
    const query = await createMonitoringQuery(db, orgWithFreshBriefId, {
      projectId: freshProject.id,
      name: "Exec brief query",
      queryAst: { include: ["Northwind"], exclude: [], exactPhrases: [] },
      booleanQuery: "Northwind",
      sourceTypes: ["news"],
    });
    const [article] = await db
      .insert(schema.articles)
      .values({
        sourceId: source.id,
        canonicalUrl: `https://exec-brief.example/item-${Date.now()}`,
        contentHash: `exec-brief-item-${Date.now()}`,
        title: "Northwind expands into new markets",
      })
      .returning();
    if (!article) throw new Error("failed to create test article");
    const [mention] = await db
      .insert(schema.mentions)
      .values({
        organizationId: orgWithFreshBriefId,
        projectId: freshProject.id,
        queryId: query.id,
        articleId: article.id,
        matchedTerms: ["Northwind"],
        sentiment: "positive",
        priority: "high",
      })
      .returning();
    if (!mention) throw new Error("failed to create test mention");

    await createInsight(db, orgWithFreshBriefId, {
      projectId: freshProject.id,
      kind: "whats_changed",
      summary: "Positive coverage of Northwind's market expansion.",
      confidence: 0.9,
      method: "mock-heuristic-v1",
      periodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
      periodEnd: new Date(),
      evidenceMentionIds: [mention.id],
    });

    // Stale org: a whats_changed insight, but from well outside the
    // freshness window (createdAt has no input override on createInsight,
    // so this row is backdated directly).
    const [staleWorkspace] = await db
      .insert(schema.workspaces)
      .values({ organizationId: orgWithStaleBriefId, name: "Default" })
      .returning();
    if (!staleWorkspace) throw new Error("failed to create test workspace");
    const staleProject = await createProject(db, orgWithStaleBriefId, {
      workspaceId: staleWorkspace.id,
      name: "Exec Brief Stale Project",
    });
    const staleQuery = await createMonitoringQuery(db, orgWithStaleBriefId, {
      projectId: staleProject.id,
      name: "Exec brief stale query",
      queryAst: { include: ["Northwind"], exclude: [], exactPhrases: [] },
      booleanQuery: "Northwind",
      sourceTypes: ["news"],
    });
    const [staleArticle] = await db
      .insert(schema.articles)
      .values({
        sourceId: source.id,
        canonicalUrl: `https://exec-brief.example/stale-item-${Date.now()}`,
        contentHash: `exec-brief-stale-item-${Date.now()}`,
        title: "Northwind stale coverage",
      })
      .returning();
    if (!staleArticle) throw new Error("failed to create test article");
    const [staleMention] = await db
      .insert(schema.mentions)
      .values({
        organizationId: orgWithStaleBriefId,
        projectId: staleProject.id,
        queryId: staleQuery.id,
        articleId: staleArticle.id,
        matchedTerms: ["Northwind"],
        priority: "normal",
      })
      .returning();
    if (!staleMention) throw new Error("failed to create test mention");

    // Real evidence, so this row is provably skipped for being stale —
    // not for the separate zero-evidence guard the fresh-org case doesn't
    // exercise.
    const staleInsightId = await createInsight(db, orgWithStaleBriefId, {
      projectId: staleProject.id,
      kind: "whats_changed",
      summary: "Old news from three days ago.",
      confidence: 0.9,
      method: "mock-heuristic-v1",
      periodStart: new Date(Date.now() - 96 * 60 * 60 * 1000),
      periodEnd: new Date(Date.now() - 72 * 60 * 60 * 1000),
      evidenceMentionIds: [staleMention.id],
    });
    await db
      .update(schema.insights)
      .set({ createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000) })
      .where(eq(schema.insights.id, staleInsightId));

    // None org: no insight at all — the common case for a quiet/new org.
  });

  afterAll(async () => {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, orgWithFreshBriefId));
    await db.delete(schema.organizations).where(eq(schema.organizations.id, orgWithStaleBriefId));
    await db.delete(schema.organizations).where(eq(schema.organizations.id, orgWithNoBriefId));
    await db.delete(schema.sources).where(eq(schema.sources.id, sourceId));
  });

  it("emails only members of organizations with a fresh, evidenced brief", async () => {
    // Every still-existing organization is in scope for this job by
    // design (the documented cross-tenant fan-out, ADR-001) — other
    // integration test files running against this same real database may
    // also have recent insights, so assertions are scoped to exactly our
    // three test recipients, the same discipline
    // generate-digest.integration.test.ts already follows.
    const emailQueue = { add: async () => undefined } as unknown as Queue<SendEmailJobData>;

    await processSendExecutiveBriefJob(emailQueue);

    const ourRows = await db
      .select()
      .from(schema.emailOutbox)
      .where(
        and(
          inArray(schema.emailOutbox.toEmail, [memberEmailFresh, memberEmailStale, memberEmailNone]),
          eq(schema.emailOutbox.kind, "executive_brief"),
        ),
      );

    const forFresh = ourRows.filter((row) => row.toEmail === memberEmailFresh);
    const forStale = ourRows.filter((row) => row.toEmail === memberEmailStale);
    const forNone = ourRows.filter((row) => row.toEmail === memberEmailNone);

    expect(forFresh).toHaveLength(1);
    expect(forFresh[0]!.bodyText).toContain("Positive coverage of Northwind's market expansion.");
    expect(forStale).toHaveLength(0);
    expect(forNone).toHaveLength(0);
  });
});
