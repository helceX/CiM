import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BLOG_ORIGIN, blogCover, blogJsonLd, blogPosts, getBlogPost } from "./blog";
describe("published blog content", () => {
  it("has complete, unique articles with real covers and resolvable related links", () => {
    expect(blogPosts.length).toBeGreaterThanOrEqual(15);
    expect(new Set(blogPosts.map((post) => post.slug)).size).toBe(blogPosts.length);
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
