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
import type { RawFetchResult, SourceConnector, SourceHealth } from "./connector";

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

  describe("match precision and author-profile freshness", () => {
    /** Returns a scripted sequence of items with fully controllable text/author fields, one call per fetch(). */
    class ScriptedSocialConnector implements SourceConnector {
      private callIndex = 0;
      constructor(private readonly items: RawFetchResult[][]) {}
      async fetch(): Promise<RawFetchResult[]> {
        const items = this.items[this.callIndex] ?? [];
        this.callIndex += 1;
        return items;
      }
      async healthCheck(): Promise<SourceHealth> {
        return { status: "healthy" };
      }
    }

    it("stores only the term that actually matched, not the query's whole include list", async () => {
      const [org] = await db
        .insert(schema.organizations)
        .values({
          name: "Match Precision Test Co",
          slug: `match-precision-test-${Date.now()}`,
        })
        .returning();
      if (!org) throw new Error("failed to create test organization");
      const orgId = asOrganizationId(org.id);

      const [workspace] = await db
        .insert(schema.workspaces)
        .values({ organizationId: orgId, name: "Default" })
        .returning();
      if (!workspace) throw new Error("failed to create test workspace");
      const project = await createProject(db, orgId, {
        workspaceId: workspace.id,
        name: "Match Precision Test Project",
      });

      const [source] = await db
        .insert(schema.sources)
        .values({
          name: "Match Precision Test Source",
          domain: `match-precision-test-${Date.now()}.example`,
          type: "social",
          connector: "mock-social",
          status: "healthy",
          canDisplayExcerpt: true,
        })
        .returning();
      if (!source) throw new Error("failed to create test source");

      // Two include terms — the post only actually contains the hashtag,
      // never "Acme Corp" — so a correct pipeline must record matchedTerms
      // as exactly ["#AcmeLaunch"], not both configured terms.
      await createMonitoringQuery(db, orgId, {
        projectId: project.id,
        name: "Match precision test query",
        queryAst: {
          include: ["Acme Corp", "#AcmeLaunch"],
          exclude: [],
          exactPhrases: [],
        },
        booleanQuery: "",
        sourceTypes: ["social"],
      });

      // Unique per run (not just the canonicalUrl) — findExistingArticle
      // also matches on contentHash (sha256 of title+bodyText) alone, so
      // fixed post text would collide with a leftover article from any
      // earlier failed run regardless of this run's own random domain.
      const runId = Date.now();
      const connector = new ScriptedSocialConnector([
        [
          {
            externalId: `match-precision-${runId}`,
            canonicalUrl: `https://${source.domain}/post/${runId}`,
            title: `Excited for #AcmeLaunch tomorrow! (${runId})`,
            bodyText: `Excited for #AcmeLaunch tomorrow! (${runId})`,
            publishedAt: new Date(),
            authorName: "@precisiontester",
            socialPlatform: "mock",
            socialAuthorExternalId: `precision-author-${runId}`,
            socialAuthorHandle: "@precisiontester",
          },
        ],
      ]);

      await ingestSource(db, source, connector);
      const mentions = await listRecentMentions(db, orgId, { projectId: project.id });
      expect(mentions.length).toBe(1);
      expect(mentions[0]?.mention.matchedTerms).toEqual(["#AcmeLaunch"]);
      expect(mentions[0]?.mention.matchType).toBe("hashtag");

      await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
      await db.delete(schema.sources).where(eq(schema.sources.id, source.id));
    });

    it("refreshes an existing author's follower count and verified status on a later sighting", async () => {
      const [org] = await db
        .insert(schema.organizations)
        .values({
          name: "Profile Freshness Test Co",
          slug: `profile-freshness-test-${Date.now()}`,
        })
        .returning();
      if (!org) throw new Error("failed to create test organization");
      const orgId = asOrganizationId(org.id);

      const [workspace] = await db
        .insert(schema.workspaces)
        .values({ organizationId: orgId, name: "Default" })
        .returning();
      if (!workspace) throw new Error("failed to create test workspace");
      const project = await createProject(db, orgId, {
        workspaceId: workspace.id,
        name: "Profile Freshness Test Project",
      });

      const [source] = await db
        .insert(schema.sources)
        .values({
          name: "Profile Freshness Test Source",
          domain: `profile-freshness-test-${Date.now()}.example`,
          type: "social",
          connector: "mock-social",
          status: "healthy",
          canDisplayExcerpt: true,
        })
        .returning();
      if (!source) throw new Error("failed to create test source");

      await createMonitoringQuery(db, orgId, {
        projectId: project.id,
        name: "Profile freshness test query",
        queryAst: { include: [], exclude: [], exactPhrases: [] },
        booleanQuery: "",
        sourceTypes: ["social"],
      });

      // Both the author's externalId and the post title/body must be
      // unique per test run — findExistingArticle matches on contentHash
      // (sha256 of title+bodyText) alone, independent of canonicalUrl/
      // domain, so fixed post text across runs would make a second run
      // see the first run's leftover article as "existing" and skip
      // resolveAuthorProfileId (and therefore touchSocialProfile)
      // entirely — a real failure mode this test hit once already.
      const runId = Date.now();
      const externalId = `freshness-author-${runId}`;
      const rawItem = (
        followers: number,
        verified: boolean,
        suffix: string,
      ): RawFetchResult => ({
        externalId: `${runId}-${suffix}`,
        canonicalUrl: `https://${source.domain}/${suffix}`,
        title: `Post ${runId}-${suffix}`,
        bodyText: `Post ${runId}-${suffix}`,
        publishedAt: new Date(),
        authorName: "@freshnesstester",
        socialPlatform: "mock",
        socialAuthorExternalId: externalId,
        socialAuthorHandle: "@freshnesstester",
        socialAuthorFollowers: followers,
        socialAuthorVerified: verified,
      });
      const connector = new ScriptedSocialConnector([
        [rawItem(100, false, "post-1")],
        [rawItem(5000, true, "post-2")],
      ]);

      await ingestSource(db, source, connector);
      const [profileAfterFirst] = await db
        .select()
        .from(schema.socialProfiles)
        .where(eq(schema.socialProfiles.externalId, externalId));
      expect(profileAfterFirst?.followers).toBe(100);
      expect(profileAfterFirst?.verified).toBe(false);

      await ingestSource(db, source, connector);
      const [profileAfterSecond] = await db
        .select()
        .from(schema.socialProfiles)
        .where(eq(schema.socialProfiles.externalId, externalId));
      expect(profileAfterSecond?.id).toBe(profileAfterFirst?.id);
      expect(profileAfterSecond?.followers).toBe(5000);
      expect(profileAfterSecond?.verified).toBe(true);

      await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
      await db.delete(schema.sources).where(eq(schema.sources.id, source.id));
      await db
        .delete(schema.socialProfiles)
        .where(eq(schema.socialProfiles.id, profileAfterFirst!.id));
    });
  });
});
