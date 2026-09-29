import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  db,
  schema,
  createProject,
  createMonitoringQuery,
  listRecentMentions,
  asOrganizationId,
} from "@cim/db";
import { MockSocialConnector } from "./mock-social-connector";
import { ingestSource } from "./pipeline";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) — exercises the real
 * pipeline for a social source: MockSocialConnector → normalize → dedupe
 * → findOrCreateSocialProfile → Mention, against a real Postgres
 * instance. Uses a match-everything query (no include/exactPhrase terms)
 * rather than matching on the connector's cycling post text — the
 * connector's six templates aren't all guaranteed to contain any single
 * fixed substring for a given one-minute time bucket (unlike
 * MockNewsConnector, where every template embeds the source name), so
 * asserting on a specific matched term here would be flaky depending on
 * which minute the test runs in. Match-type classification itself is
 * unit-tested deterministically in packages/core/src/query-ast.test.ts.
 */
describe("MockSocialConnector ingestion (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let projectId: string;
  let sourceId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(schema.organizations)
      .values({
        name: "Social Pipeline Test Co",
        slug: `social-pipeline-test-${Date.now()}`,
      })
      .returning();
    if (!org) throw new Error("failed to create test organization");
    organizationId = asOrganizationId(org.id);

    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ organizationId, name: "Default" })
      .returning();
    if (!workspace) throw new Error("failed to create test workspace");

    const project = await createProject(db, organizationId, {
      workspaceId: workspace.id,
      name: "Social Pipeline Test Project",
    });
    projectId = project.id;

    const [source] = await db
      .insert(schema.sources)
      .values({
        name: "Social Pipeline Test Source",
        domain: `social-pipeline-test-${Date.now()}.example`,
        type: "social",
        connector: "mock-social",
        status: "healthy",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;

    await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Match everything (social pipeline test)",
      queryAst: { include: [], exclude: [], exactPhrases: [] },
      booleanQuery: "",
      sourceTypes: ["social"],
    });
  });

  afterAll(async () => {
    // Cascades: organization -> workspace/project/memberships/mentions/monitoring_queries.
    await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, organizationId));
    await db.delete(schema.sources).where(eq(schema.sources.id, sourceId));
  });

  it("links the ingested article to a social profile and creates a mention", async () => {
    const [source] = await db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.id, sourceId));
    if (!source) throw new Error("test source missing");

    const result = await ingestSource(db, source, new MockSocialConnector());
    expect(result.itemsFetched).toBe(1);
    expect(result.mentionsCreated).toBeGreaterThanOrEqual(1);

    const mentions = await listRecentMentions(db, organizationId, { projectId });
    expect(mentions.length).toBeGreaterThanOrEqual(1);

    const article = mentions[0]?.article;
    expect(article?.authorProfileId).not.toBeNull();

    const [profile] = await db
      .select()
      .from(schema.socialProfiles)
      .where(eq(schema.socialProfiles.id, article!.authorProfileId!));
    expect(profile?.platform).toBe("mock");
    expect(profile?.handle.startsWith("@")).toBe(true);
  });

  it("does not create a duplicate social profile row on a second ingest cycle", async () => {
    const [source] = await db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.id, sourceId));
    if (!source) throw new Error("test source missing");

    await ingestSource(db, source, new MockSocialConnector());
    const before = await db.select().from(schema.socialProfiles);
    await ingestSource(db, source, new MockSocialConnector());
    const after = await db.select().from(schema.socialProfiles);

    expect(after.length).toBe(before.length);
  });
});
