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
import { MockNewsConnector } from "./mock-connector";
import { ingestSource } from "./pipeline";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) — exercises the real
 * pipeline against a real Postgres instance, proving the MockNewsConnector
 * → normalize → dedupe → query-match → Mention chain actually works end
 * to end, and that re-running it is idempotent.
 */
describe("ingestSource (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let projectId: string;
  let sourceId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(schema.organizations)
      .values({ name: "Pipeline Test Co", slug: `pipeline-test-${Date.now()}` })
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
      name: "Pipeline Test Project",
    });
    projectId = project.id;

    const [source] = await db
      .insert(schema.sources)
      .values({
        name: "Pipeline Test Wire",
        domain: `pipeline-test-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        status: "healthy",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;

    await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Pipeline test query",
      queryAst: { include: ["Pipeline Test Wire"], exclude: [], exactPhrases: [] },
      booleanQuery: "Pipeline Test Wire",
      sourceTypes: ["news"],
    });
  });

  afterAll(async () => {
    // Cascades: organization -> workspace/project/memberships/mentions/monitoring_queries.
    await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    await db.delete(schema.sources).where(eq(schema.sources.id, sourceId));
  });

  it("creates an Article and a matching Mention on first ingest", async () => {
    const [source] = await db.select().from(schema.sources).where(eq(schema.sources.id, sourceId));
    if (!source) throw new Error("test source missing");

    const result = await ingestSource(db, source, new MockNewsConnector());
    expect(result.itemsFetched).toBe(1);
    expect(result.mentionsCreated).toBeGreaterThanOrEqual(1);

    const mentions = await listRecentMentions(db, organizationId, { projectId });
    expect(mentions.length).toBeGreaterThanOrEqual(1);
    expect(mentions[0]?.article.title).toContain("Pipeline Test Wire");
  });

  it("does not create a duplicate Mention on a second ingest within the same cycle", async () => {
    const [source] = await db.select().from(schema.sources).where(eq(schema.sources.id, sourceId));
    if (!source) throw new Error("test source missing");

    const before = await listRecentMentions(db, organizationId, { projectId, limit: 100 });
    await ingestSource(db, source, new MockNewsConnector());
    const after = await listRecentMentions(db, organizationId, { projectId, limit: 100 });

    expect(after.length).toBe(before.length);
  });
});
