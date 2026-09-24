import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { Queue } from "bullmq";
import type { SendEmailJobData } from "@cim/core";
import { asOrganizationId, createMonitoringQuery, createProject, db, schema } from "@cim/db";
import { processGenerateDigestJob } from "./generate-digest";

describe("processGenerateDigestJob (integration)", () => {
  let orgWithMentionsId: ReturnType<typeof asOrganizationId>;
  let orgWithoutMentionsId: ReturnType<typeof asOrganizationId>;
  let sourceId: string;
  let memberEmailWithMentions: string;
  let memberEmailWithoutMentions: string;

  beforeAll(async () => {
    const [orgWithMentions] = await db
      .insert(schema.organizations)
      .values({ name: "Digest Job Co", slug: `digest-job-${Date.now()}` })
      .returning();
    const [orgWithoutMentions] = await db
      .insert(schema.organizations)
      .values({ name: "Digest Job Quiet Co", slug: `digest-job-quiet-${Date.now()}` })
      .returning();
    if (!orgWithMentions || !orgWithoutMentions) throw new Error("failed to create test organizations");
    orgWithMentionsId = asOrganizationId(orgWithMentions.id);
    orgWithoutMentionsId = asOrganizationId(orgWithoutMentions.id);

    for (const [organizationId, orgRow] of [
      [orgWithMentionsId, orgWithMentions],
      [orgWithoutMentionsId, orgWithoutMentions],
    ] as const) {
      const [user] = await db
        .insert(schema.users)
        .values({
          email: `digest-job-${orgRow.id}@example.com`,
          passwordHash: "unused-in-this-test",
          firstName: "Digest",
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
      if (organizationId === orgWithMentionsId) memberEmailWithMentions = user.email;
      else memberEmailWithoutMentions = user.email;
    }

    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ organizationId: orgWithMentionsId, name: "Default" })
      .returning();
    if (!workspace) throw new Error("failed to create test workspace");

    const project = await createProject(db, orgWithMentionsId, {
      workspaceId: workspace.id,
      name: "Digest Job Project",
    });

    const [source] = await db
      .insert(schema.sources)
      .values({
        name: "Digest Job Wire",
        domain: `digest-job-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;

    const query = await createMonitoringQuery(db, orgWithMentionsId, {
      projectId: project.id,
      name: "Digest job query",
      queryAst: { include: ["Northwind"], exclude: [], exactPhrases: [] },
      booleanQuery: "Northwind",
      sourceTypes: ["news"],
    });

    const [article] = await db
      .insert(schema.articles)
      .values({
        sourceId,
        canonicalUrl: `https://digest-job.example/item-${Date.now()}`,
        contentHash: `digest-job-item-${Date.now()}`,
        title: "Northwind quarterly results",
      })
      .returning();
    if (!article) throw new Error("failed to create test article");

    await db.insert(schema.mentions).values({
      organizationId: orgWithMentionsId,
      projectId: project.id,
      queryId: query.id,
      articleId: article.id,
      matchedTerms: ["Northwind"],
      sentiment: "positive",
      priority: "high",
    });
  });

  afterAll(async () => {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, orgWithMentionsId));
    await db.delete(schema.organizations).where(eq(schema.organizations.id, orgWithoutMentionsId));
    await db.delete(schema.sources).where(eq(schema.sources.id, sourceId));
  });

  it("emails only members of organizations with new mentions, skipping quiet ones", async () => {
    // Every still-existing organization is in scope for this job by
    // design (the documented cross-tenant fan-out, ADR-001) — other
    // integration test files running against this same real database may
    // also have recent mentions and trigger their own digest emails, so
    // assertions are scoped to exactly our two test recipients rather
    // than "every enqueued email", which would be flaky under that
    // shared-database reality.
    const emailQueue = { add: async () => undefined } as unknown as Queue<SendEmailJobData>;

    await processGenerateDigestJob(emailQueue);

    const ourRows = await db
      .select()
      .from(schema.emailOutbox)
      .where(
        and(
          inArray(schema.emailOutbox.toEmail, [memberEmailWithMentions, memberEmailWithoutMentions]),
          eq(schema.emailOutbox.kind, "digest"),
        ),
      );

    const forMemberWithMentions = ourRows.filter((row) => row.toEmail === memberEmailWithMentions);
    const forMemberWithoutMentions = ourRows.filter((row) => row.toEmail === memberEmailWithoutMentions);

    expect(forMemberWithMentions).toHaveLength(1);
    expect(forMemberWithMentions[0]!.bodyText).toContain("1 new mention");
    expect(forMemberWithoutMentions).toHaveLength(0);
  });
});
