import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BLOG_ORIGIN,
  BLOG_PAGE_SIZE,
  blogCover,
  blogJsonLd,
  blogPosts,
  getBlogPost,
  getBlogListing,
  blogPageHref,
} from "./blog";
describe("published blog content", () => {
  it("has complete, unique articles with real covers and resolvable related links", () => {
    expect(blogPosts.length).toBe(100);
    expect(new Set(blogPosts.map((post) => post.slug)).size).toBe(blogPosts.length);
    expect(new Set(blogPosts.map((post) => post.title)).size).toBe(blogPosts.length);
    for (const post of blogPosts) {
      expect(post.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(
        existsSync(new URL(`../../public${blogCover(post)}`, import.meta.url)),
      ).toBe(true);
      expect(
        post.sections
          .flatMap((section) => section.paragraphs)
          .join(" ")
          .split(/\s+/).length,
      ).toBeGreaterThanOrEqual(200);
      expect(
        post.related.every((slug) => getBlogPost(slug) && slug !== post.slug),
      ).toBe(true);
      expect(post.cta.href).toMatch(/^\/(features|opportunities)$/);
    }
  });
  it("makes every article reachable through bounded, disjoint pages and keeps category navigation", () => {
    const slugs: string[] = [];
    const pages = getBlogListing().pages;
    for (let page = 1; page <= pages; page++) {
      const result = getBlogListing(undefined, String(page));
      expect(result.visible.length).toBeLessThanOrEqual(BLOG_PAGE_SIZE);
      slugs.push(...result.visible.map((post) => post.slug));
    }
    expect(slugs).toEqual(blogPosts.map((post) => post.slug));
    const category = getBlogListing("Medya takibi", "2");
    expect(category.visible.every((post) => post.category === "Medya takibi")).toBe(
      true,
    );
    expect(blogPageHref(category.category, category.page)).toContain("sayfa=2");
    expect(getBlogListing(undefined, "-1").page).toBe(1);
    expect(getBlogListing(undefined, "Infinity").page).toBe(1);
  });
  it("keeps structured publication data consistent with visible articles", () => {
    for (const post of blogPosts) {
      const article = blogJsonLd(post)["@graph"][0]!;
      expect(article.headline).toBe(post.title);
      expect(article.mainEntityOfPage).toBe(`${BLOG_ORIGIN}/blog/${post.slug}`);
      expect(article.image).toBe(`${BLOG_ORIGIN}${blogCover(post)}`);
      expect(article.inLanguage).toBe("tr-TR");
    }
  });
});
