import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../client";
import { articles, sources } from "../schema/content";
import {
  assignStoryCluster,
  findExistingArticle,
  findSimilarRecentArticle,
  findSimilarRecentArticleExact,
  insertArticle,
  listRecentArticlesForPreview,
  listRelatedArticles,
  listStoriesForPreview,
  setArticleStoryCluster,
} from "./articles";

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

    const rows = await db
      .select()
      .from(articles)
      .where(eq(articles.canonicalUrl, canonicalUrl));
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

  it("lists every stored story containing a rare keyword's words for a preview, even when newer stories fill the scan", async () => {
    const stamp = Date.now();
    const rare = `Previewrare${stamp}`;
    const make = async (title: string, hoursAgo: number) => {
      const article = await insertArticle(db, {
        sourceId,
        canonicalUrl: `https://articles-test.example/preview-${stamp}-${hoursAgo}-${title.length}`,
        contentHash: `articles-preview-${stamp}-${hoursAgo}-${title.length}`,
        title,
        storedExcerpt: "",
        language: "en",
        publishedAt: null,
        authorName: null,
      });
      await db.update(articles).set({ fetchedAt: new Date(Date.now() - hoursAgo * 3_600_000) }).where(eq(articles.id, article.id));
      return article;
    };
    const old = await make(`${rare} opens a new plant`, 100);
    await make(`Unrelated story one ${stamp}`, 1);
    await make(`Unrelated story two ${stamp}`, 2);

    // The newest-stories scan is shorter than the keyword's age (3 stories scanned at most), so only the full-text
    // candidates can bring the old story in.
    const withoutIndex = await listStoriesForPreview(db, { tsQuery: null, days: 30, scanLimit: 2 });
    expect(withoutIndex.stories.some((story) => story.id === old.id)).toBe(false);

    const withIndex = await listStoriesForPreview(db, { tsQuery: `(${rare.toLowerCase()}:*)`, days: 30, scanLimit: 2 });
    expect(withIndex.stories.some((story) => story.id === old.id)).toBe(true);
    expect(withIndex.stories.filter((story) => story.id === old.id)).toHaveLength(1);
    expect(withIndex.scanned).toBe(2);
    expect(withIndex.scannedSince).toBeInstanceOf(Date);
    expect(withIndex.windowDays).toBeGreaterThanOrEqual(5);
    expect(withIndex.windowDays).toBeLessThanOrEqual(30);
  });

  describe("story clustering (findSimilarRecentArticle / listRelatedArticles)", () => {
    let otherSourceId: string;

    beforeAll(async () => {
      const [otherSource] = await db
        .insert(sources)
        .values({
          name: "Articles Test Wire (other source)",
          domain: `articles-test-other-${Date.now()}.example`,
          type: "news",
          connector: "mock",
          canDisplayExcerpt: true,
        })
        .returning();
      if (!otherSource) throw new Error("failed to create second test source");
      otherSourceId = otherSource.id;
    });

    afterAll(async () => {
      await db.delete(sources).where(eq(sources.id, otherSourceId));
    });

    // A story stored by the crawler (insertArticle) carries the full-text vector the lookup narrows by.
    const store = (source: string, title: string, tag: string) =>
      insertArticle(db, {
        sourceId: source,
        canonicalUrl: `https://articles-test.example/${tag}-${Date.now()}-${Math.random()}`,
        contentHash: `articles-${tag}-${Date.now()}-${Math.random()}`,
        title,
        storedExcerpt: null,
        language: null,
        publishedAt: null,
        authorName: null,
      });

    it("finds a similar recent article from a different source, but not from the same source", async () => {
      const title = `Northwind Atlas wins regional innovation award ${Date.now()}`;
      await store(sourceId, title, "cluster-own");

      const sameSourceMatch = await findSimilarRecentArticle(db, {
        title,
        excludeSourceId: sourceId,
      });
      expect(sameSourceMatch).toBeUndefined();

      const otherSourceArticle = await store(otherSourceId, `${title} — updated`, "cluster-other");

      const crossSourceMatch = await findSimilarRecentArticle(db, {
        title,
        excludeSourceId: sourceId,
      });
      expect(crossSourceMatch?.id).toBe(otherSourceArticle.id);
      expect(crossSourceMatch?.storyClusterId).toBeNull();
    });

    it("gives the same answer as the exhaustive scan for the look-alikes it is meant to find", async () => {
      const stamp = Date.now();
      const originals = [
        `Zorlu Holding yeni enerji yatırımını duyurdu ${stamp}`,
        `Borsa İstanbul güne yükselişle başladı ${stamp}`,
        `Turkcell ve Vodafone ortak fiber altyapı anlaşması imzaladı ${stamp}`,
      ];
      const lookAlikes = [
        `Zorlu Holding yeni enerji yatırımını açıkladı ${stamp}`, // one word changed
        `BORSA İSTANBUL GÜNE YÜKSELİŞLE BAŞLADI ${stamp}`, // other case
        `Turkcell ile Vodafone ortak fiber altyapı anlaşması imzaladı ${stamp}`, // one word swapped
      ];
      for (const title of originals) await store(otherSourceId, title, "recall");
      for (const [index, title] of [...lookAlikes, `Bambaşka bir konuda tamamen alakasız başlık ${stamp}`].entries()) {
        const fast = await findSimilarRecentArticle(db, { title, excludeSourceId: sourceId });
        const exact = await findSimilarRecentArticleExact(db, { title, excludeSourceId: sourceId });
        expect(fast?.id, `look-alike ${index}`).toBe(exact?.id);
        if (index < lookAlikes.length) expect(fast, `look-alike ${index} is found`).toBeDefined();
      }
    });

    it("starts one cluster for two stories that find each other at the same moment", async () => {
      const stamp = Date.now();
      const a = await store(sourceId, `Mutual race story headline alpha ${stamp}`, "mutual-a");
      const b = await store(otherSourceId, `Mutual race story headline alpha ${stamp}`, "mutual-b");
      const [fromA, fromB] = await Promise.all([
        assignStoryCluster(db, { articleId: a.id, candidate: { id: b.id, storyClusterId: null } }),
        assignStoryCluster(db, { articleId: b.id, candidate: { id: a.id, storyClusterId: null } }),
      ]);
      expect(fromA).toBe(fromB);
      const rows = await db.select({ id: articles.id, cluster: articles.storyClusterId }).from(articles).where(inArray(articles.id, [a.id, b.id]));
      expect(new Set(rows.map((row) => row.cluster))).toEqual(new Set([fromA]));
    });

    it("gives many stories that find the same look-alike one shared cluster", async () => {
      const stamp = Date.now();
      const candidate = await store(otherSourceId, `Shared candidate story headline beta ${stamp}`, "shared-c");
      const joiners = await Promise.all(Array.from({ length: 8 }, (_, i) => store(sourceId, `Shared candidate story headline beta ${stamp} v${i}`, `shared-j${i}`)));
      const clusters = await Promise.all(joiners.map((joiner) => assignStoryCluster(db, { articleId: joiner.id, candidate: { id: candidate.id, storyClusterId: null } })));
      expect(new Set(clusters).size).toBe(1);
      const [row] = await db.select({ cluster: articles.storyClusterId }).from(articles).where(eq(articles.id, candidate.id));
      expect(row?.cluster).toBe(clusters[0]);
    });

    it("joins a cluster that already exists without taking a lock, and keeps its id", async () => {
      const stamp = Date.now();
      const existing = crypto.randomUUID();
      const candidate = await store(otherSourceId, `Existing cluster candidate gamma ${stamp}`, "joined-c");
      await setArticleStoryCluster(db, candidate.id, existing);
      const joiner = await store(sourceId, `Existing cluster candidate gamma ${stamp} again`, "joined-j");
      // Another transaction holds a lock on this very pair: a join must not wait for it.
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const holder = db.transaction(async (tx) => {
        for (const id of [joiner.id, candidate.id].sort()) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`story-cluster:${id}`}, 0))`);
        await held;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const joined = await Promise.race([
        assignStoryCluster(db, { articleId: joiner.id, candidate: { id: candidate.id, storyClusterId: existing } }),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error("waited for a lock it does not need")), 3000)),
      ]);
      release();
      await holder;
      expect(joined).toBe(existing);
    });

    it("does not make unrelated clusters wait for each other (the lock is per pair, not global)", async () => {
      const stamp = Date.now();
      const a = await store(sourceId, `Pair lock story headline delta ${stamp}`, "pair-a");
      const b = await store(otherSourceId, `Pair lock story headline delta ${stamp}`, "pair-b");
      const x = await store(sourceId, `Different pair story headline epsilon ${stamp}`, "pair-x");
      const y = await store(otherSourceId, `Different pair story headline epsilon ${stamp}`, "pair-y");
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const holder = db.transaction(async (tx) => {
        for (const id of [x.id, y.id].sort()) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`story-cluster:${id}`}, 0))`);
        await held;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const cluster = await Promise.race([
        assignStoryCluster(db, { articleId: a.id, candidate: { id: b.id, storyClusterId: null } }),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error("blocked by an unrelated pair's lock")), 3000)),
      ]);
      release();
      await holder;
      expect(cluster).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("does not match an unrelated headline", async () => {
      const [article] = await db
        .insert(articles)
        .values({
          sourceId: otherSourceId,
          canonicalUrl: `https://articles-test-other.example/unrelated-${Date.now()}`,
          contentHash: `articles-unrelated-hash-${Date.now()}`,
          title: "Completely unrelated story about local weather patterns",
        })
        .returning();
      if (!article) throw new Error("failed to create test article");

      const match = await findSimilarRecentArticle(db, {
        title: `Some entirely different headline ${Date.now()}`,
        excludeSourceId: sourceId,
      });
      expect(match?.id).not.toBe(article.id);
    });

    it("listRelatedArticles returns every other article sharing a storyClusterId, most recent first", async () => {
      const clusterId = crypto.randomUUID();
      const [older] = await db
        .insert(articles)
        .values({
          sourceId,
          canonicalUrl: `https://articles-test.example/related-older-${Date.now()}`,
          contentHash: `articles-related-older-hash-${Date.now()}`,
          title: "Older related coverage",
          publishedAt: new Date(Date.now() - 60 * 60 * 1000),
          storyClusterId: clusterId,
        })
        .returning();
      const [newer] = await db
        .insert(articles)
        .values({
          sourceId: otherSourceId,
          canonicalUrl: `https://articles-test-other.example/related-newer-${Date.now()}`,
          contentHash: `articles-related-newer-hash-${Date.now()}`,
          title: "Newer related coverage",
          publishedAt: new Date(),
          storyClusterId: clusterId,
        })
        .returning();
      const [subject] = await db
        .insert(articles)
        .values({
          sourceId,
          canonicalUrl: `https://articles-test.example/related-subject-${Date.now()}`,
          contentHash: `articles-related-subject-hash-${Date.now()}`,
          title: "The subject article itself",
          storyClusterId: clusterId,
        })
        .returning();
      if (!older || !newer || !subject)
        throw new Error("failed to create test articles");

      const related = await listRelatedArticles(db, clusterId, subject.id);
      expect(related.map((r) => r.id)).toEqual([newer.id, older.id]);
    });

    it("setArticleStoryCluster persists the cluster id on the article row", async () => {
      const [article] = await db
        .insert(articles)
        .values({
          sourceId,
          canonicalUrl: `https://articles-test.example/set-cluster-${Date.now()}`,
          contentHash: `articles-set-cluster-hash-${Date.now()}`,
          title: "An article that will be assigned to a cluster",
        })
        .returning();
      if (!article) throw new Error("failed to create test article");

      const clusterId = crypto.randomUUID();
      await setArticleStoryCluster(db, article.id, clusterId);

      const [updated] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, article.id));
      expect(updated?.storyClusterId).toBe(clusterId);
    });
  });
});
