import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { articles, sources } from "../schema/content";
import { findExistingArticle, insertArticle, listRecentArticlesForPreview } from "./articles";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) against a real
 * Postgres instance — proves insertArticle's upsert-on-race behavior
 * and listRecentArticlesForPreview's recency window actually work
 * against the real articles_content_hash_uidx/articles_canonical_url_uidx
 * unique indexes and a real `now()`.
 */
describe("articles repository (integration)", () => {
  let sourceId: string;

  beforeAll(async () => {
    const [source] = await db
      .insert(sources)
      .values({
        name: "Articles Test Wire",
        domain: `articles-test-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;
  });

  afterAll(async () => {
    await db.delete(sources).where(eq(sources.id, sourceId));
  });

  it("returns the existing row instead of throwing when insertArticle loses a canonicalUrl race", async () => {
    // Regression: insertArticle had no DB-level dedup behind its
    // findExistingArticle pre-check, only a plain (non-unique) index —
    // a losing concurrent insert (crawlSource runs at concurrency:5)
    // would previously hit the DB's own default behavior of just
    // inserting a duplicate row, silently defeating the "never creates
    // a duplicate Mention" guarantee pipeline.ts's docstring promises.
    // Simulated here without real concurrency: insert the "winning" row
    // directly, then call insertArticle with the same canonicalUrl as
    // if this caller's own findExistingArticle pre-check had raced and
    // missed it.
    const canonicalUrl = `https://articles-test.example/race-${Date.now()}`;
    const contentHash = `articles-race-hash-${Date.now()}`;

    const [winner] = await db
      .insert(articles)
      .values({
        sourceId,
        canonicalUrl,
        contentHash,
        title: "The winning insert",
        storedExcerpt: null,
        language: null,
        publishedAt: null,
        authorName: null,
      })
      .returning();
    if (!winner) throw new Error("failed to seed the winning article");

    const loser = await insertArticle(db, {
      sourceId,
      canonicalUrl,
      contentHash: `${contentHash}-different`,
      title: "The losing insert — never actually stored",
      storedExcerpt: null,
      language: null,
      publishedAt: null,
      authorName: null,
    });

    expect(loser.id).toBe(winner.id);
    expect(loser.title).toBe("The winning insert");

    const rows = await db.select().from(articles).where(eq(articles.canonicalUrl, canonicalUrl));
    expect(rows).toHaveLength(1);
  });

  it("findExistingArticle and insertArticle still work normally for a genuinely new article", async () => {
    const canonicalUrl = `https://articles-test.example/normal-${Date.now()}`;
    const contentHash = `articles-normal-hash-${Date.now()}`;

    const before = await findExistingArticle(db, { canonicalUrl, contentHash });
    expect(before).toBeUndefined();

    const created = await insertArticle(db, {
      sourceId,
      canonicalUrl,
      contentHash,
      title: "A genuinely new article",
      storedExcerpt: null,
      language: null,
      publishedAt: null,
      authorName: null,
    });
    expect(created.title).toBe("A genuinely new article");

    const after = await findExistingArticle(db, { canonicalUrl, contentHash });
    expect(after?.id).toBe(created.id);
  });

  it("includes an article with no publishedAt in the preview window, not just ones with a known date", async () => {
    // Regression: WebConnector (and ApiConnector, when the upstream item
    // omits a date) always sets publishedAt: null. A plain
    // gte(publishedAt, cutoff) treats NULL as unknown/false and excludes
    // the row from every preview regardless of the days window, even
    // though the real ingestion pipeline doesn't filter on publishedAt
    // at all — the fix falls back to createdAt (never null).
    const [article] = await db
      .insert(articles)
      .values({
        sourceId,
        canonicalUrl: `https://articles-test.example/no-date-${Date.now()}`,
        contentHash: `articles-no-date-hash-${Date.now()}`,
        title: "A scraped page with no known publish date",
        storedExcerpt: null,
        language: null,
        publishedAt: null,
        authorName: null,
      })
      .returning();
    if (!article) throw new Error("failed to create test article");

    const preview = await listRecentArticlesForPreview(db, 30, 500);
    expect(preview.some((row) => row.id === article.id)).toBe(true);
  });

  it("excludes an article outside the days window even when it has no publishedAt", async () => {
    const [article] = await db
      .insert(articles)
      .values({
        sourceId,
        canonicalUrl: `https://articles-test.example/old-no-date-${Date.now()}`,
        contentHash: `articles-old-no-date-hash-${Date.now()}`,
        title: "An old scraped page with no known publish date",
        storedExcerpt: null,
        language: null,
        publishedAt: null,
        authorName: null,
        createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      })
      .returning();
    if (!article) throw new Error("failed to create test article");

    const preview = await listRecentArticlesForPreview(db, 30, 500);
    expect(preview.some((row) => row.id === article.id)).toBe(false);
  });
});
