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
import type { RawFetchResult, SourceConnector, SourceHealth } from "./connector";
import type { Source } from "@cim/db/schema";

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
    await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, organizationId));
    await db.delete(schema.sources).where(eq(schema.sources.id, sourceId));
  });

  it("creates an Article and a matching Mention on first ingest", async () => {
    const [source] = await db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.id, sourceId));
    if (!source) throw new Error("test source missing");

    const result = await ingestSource(db, source, new MockNewsConnector());
    expect(result.itemsFetched).toBe(1);
    expect(result.mentionsCreated).toBeGreaterThanOrEqual(1);

    const mentions = await listRecentMentions(db, organizationId, { projectId });
    expect(mentions.length).toBeGreaterThanOrEqual(1);
    expect(mentions[0]?.article.title).toContain("Pipeline Test Wire");
  });

  it("does not create a duplicate Mention on a second ingest within the same cycle", async () => {
    const [source] = await db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.id, sourceId));
    if (!source) throw new Error("test source missing");

    const before = await listRecentMentions(db, organizationId, {
      projectId,
      limit: 100,
    });
    await ingestSource(db, source, new MockNewsConnector());
    const after = await listRecentMentions(db, organizationId, {
      projectId,
      limit: 100,
    });

    expect(after.length).toBe(before.length);
  });

  describe("story clustering across sources", () => {
    /**
     * Returns one fixed item per fetch — lets the test control the exact
     * title two different sources report. `slug` keeps each test's
     * canonicalUrl distinct from every other test in this describe block
     * sharing the same two sources — otherwise a later test's ingest
     * would dedupe onto an earlier test's already-inserted Article (same
     * canonicalUrl) instead of inserting a new one, and
     * maybeAssignStoryCluster only ever runs for a newly-inserted Article.
     */
    class FixedTitleConnector implements SourceConnector {
      constructor(
        private readonly title: string,
        private readonly slug: string = "fixed",
      ) {}
      async fetch(source: Source): Promise<RawFetchResult[]> {
        return [
          {
            externalId: `${source.id}-${this.slug}`,
            canonicalUrl: `https://${source.domain}/${this.slug}`,
            title: this.title,
            bodyText: this.title,
            publishedAt: new Date(),
            authorName: null,
          },
        ];
      }
      async healthCheck(): Promise<SourceHealth> {
        return { status: "healthy" };
      }
    }

    let secondSourceId: string;

    beforeAll(async () => {
      const [secondSource] = await db
        .insert(schema.sources)
        .values({
          name: "Pipeline Test Wire (second source)",
          domain: `pipeline-test-second-${Date.now()}.example`,
          type: "news",
          connector: "mock",
          status: "healthy",
          canDisplayExcerpt: true,
        })
        .returning();
      if (!secondSource) throw new Error("failed to create second test source");
      secondSourceId = secondSource.id;
    });

    afterAll(async () => {
      await db.delete(schema.sources).where(eq(schema.sources.id, secondSourceId));
    });

    it("clusters a similar headline reported by two different sources", async () => {
      const title = `Pipeline Test Wire announces a major regional partnership ${Date.now()}`;
      const [firstSource] = await db
        .select()
        .from(schema.sources)
        .where(eq(schema.sources.id, sourceId));
      const [secondSource] = await db
        .select()
        .from(schema.sources)
        .where(eq(schema.sources.id, secondSourceId));
      if (!firstSource || !secondSource) throw new Error("test sources missing");

      await ingestSource(db, firstSource, new FixedTitleConnector(title));
      await ingestSource(
        db,
        secondSource,
        new FixedTitleConnector(`${title} — live updates`),
      );

      const [firstArticle] = await db
        .select()
        .from(schema.articles)
        .where(eq(schema.articles.canonicalUrl, `https://${firstSource.domain}/fixed`));
      const [secondArticle] = await db
        .select()
        .from(schema.articles)
        .where(
          eq(schema.articles.canonicalUrl, `https://${secondSource.domain}/fixed`),
        );

      expect(firstArticle?.storyClusterId).not.toBeNull();
      expect(firstArticle?.storyClusterId).toBe(secondArticle?.storyClusterId);
    });

    /**
     * Regression: crawlSourceWorker runs at concurrency 5 (apps/worker/
     * src/index.ts), so two different sources' crawls of the same
     * breaking story genuinely run concurrently, not just back-to-back
     * like the test above. Before pipeline.ts's maybeAssignStoryCluster
     * serialized itself with a Postgres advisory lock, both concurrent
     * calls could see the *other* article's storyClusterId as still null
     * and each generate their own new cluster id, cross-writing each
     * other's row — leaving the two articles on two different final
     * cluster ids instead of sharing one.
     */
    it("still clusters two similar headlines together when both sources are ingested concurrently", async () => {
      const title = `Pipeline Test Wire announces a concurrent regional deal ${Date.now()}`;
      const [firstSource] = await db
        .select()
        .from(schema.sources)
        .where(eq(schema.sources.id, sourceId));
      const [secondSource] = await db
        .select()
        .from(schema.sources)
        .where(eq(schema.sources.id, secondSourceId));
      if (!firstSource || !secondSource) throw new Error("test sources missing");

      await Promise.all([
        ingestSource(db, firstSource, new FixedTitleConnector(title, "concurrent")),
        ingestSource(
          db,
          secondSource,
          new FixedTitleConnector(`${title} — live updates`, "concurrent"),
        ),
      ]);

      const [firstArticle] = await db
        .select()
        .from(schema.articles)
        .where(eq(schema.articles.canonicalUrl, `https://${firstSource.domain}/concurrent`));
      const [secondArticle] = await db
        .select()
        .from(schema.articles)
        .where(
          eq(schema.articles.canonicalUrl, `https://${secondSource.domain}/concurrent`),
        );

      expect(firstArticle?.storyClusterId).not.toBeNull();
      expect(firstArticle?.storyClusterId).toBe(secondArticle?.storyClusterId);
    });
  });
});
