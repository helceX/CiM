import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { asOrganizationId, createMentionIfNotExists, createMonitoringQuery, createProject, db, insertArticle, schema } from "@cim/db";
import { processScoreSignalsJob } from "./score-signals";

describe("processScoreSignalsJob (integration)", () => {
  const stamp = Date.now();
  const brand = `Jobcorp${stamp}`;
  let organizationId: ReturnType<typeof asOrganizationId>;
  let sourceId: string;
  let mentionId: string;

  beforeAll(async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Score Job Co", slug: `score-job-${stamp}` }).returning();
    organizationId = asOrganizationId(org!.id);
    const [workspace] = await db.insert(schema.workspaces).values({ organizationId, name: "Default" }).returning();
    const project = await createProject(db, organizationId, { workspaceId: workspace!.id, name: "Score" });
    const query = await createMonitoringQuery(db, organizationId, {
      projectId: project.id,
      name: "Score job watch",
      queryAst: { include: [brand], exclude: [], exactPhrases: [] },
      booleanQuery: brand,
      sourceTypes: ["news"],
      trackingTarget: "company",
    });
    const [source] = await db
      .insert(schema.sources)
      .values({ name: `Score job ${stamp}`, domain: `score-job-${stamp}.example`, type: "news", connector: "mock", status: "healthy" })
      .returning();
    sourceId = source!.id;
    const article = await insertArticle(db, {
      sourceId,
      canonicalUrl: `https://score-job-${stamp}.example/1`,
      contentHash: `score-job-${stamp}`,
      title: `${brand} opens a plant`,
      storedExcerpt: null,
      language: "en",
      publishedAt: new Date(),
      authorName: null,
      wordFingerprint: null,
    });
    mentionId = (await createMentionIfNotExists(db, organizationId, { projectId: project.id, queryId: query.id, articleId: article.id, matchedTerms: [brand] }))!;
  });

  afterAll(async () => {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    await db.delete(schema.sources).where(eq(schema.sources.id, sourceId));
  });

  it("gives a mention saved without a signal its level and its reasons", async () => {
    const before = (await db.select().from(schema.mentions).where(eq(schema.mentions.id, mentionId)))[0]!;
    expect(before.signalReasons).toBeNull();

    const result = await processScoreSignalsJob();
    expect(result.scored).toBeGreaterThanOrEqual(1);

    const after = (await db.select().from(schema.mentions).where(eq(schema.mentions.id, mentionId)))[0]!;
    expect(after.priority).toBe("high");
    expect(after.signalReasons?.map((reason) => reason.code)).toEqual(["headline", "editorial"]);
    expect(after.signalScore).toBeGreaterThan(0);
  });
});
