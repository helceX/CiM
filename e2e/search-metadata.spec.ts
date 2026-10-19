import { test, expect } from "@playwright/test";

test("public product pages expose unique search metadata and self canonicals", async ({
  request,
}) => {
  const titles = new Set<string>();
  for (const path of [
    "/",
    "/features",
    "/solutions",
    "/pricing",
    "/resources",
    "/contact",
    "/security",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const html = await response.text();
    const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
    expect(title).toBeTruthy();
    titles.add(title!);
    expect(html).toContain(
      `rel="canonical" href="https://mediaory.io${path === "/" ? "" : path}`,
    );
    expect(html).not.toMatch(/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/);
  }
  expect(titles.size).toBe(7);
});

test("updated article date agrees across sitemap, structured data and visible content", async ({
  request,
}) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  const entry = xml.match(
    /<url>\s*<loc>https:\/\/mediaory.io\/blog\/share-of-voice-nedir<\/loc>[\s\S]*?<\/url>/,
  )?.[0];
  expect(entry).toContain("2026-10-19");
  const article = await request.get("/blog/share-of-voice-nedir");
  expect(article.status()).toBe(200);
  const html = await article.text();
  expect(html).toContain('"dateModified":"2026-10-19T12:17:00+03:00"');
  expect(html).toContain("Güncelleme:");
  expect(html).toContain('datetime="2026-10-19T12:17:00+03:00"');
});
