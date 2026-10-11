import { expect, test } from "@playwright/test";
test("public blog can be explored and has crawlable metadata", async ({
  page,
  request,
}) => {
  await page.goto("/blog");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Gündemi okuyun");
  await expect(page.locator(".blog-grid article")).toHaveCount(17);
  await page.getByRole("link", { name: "Fırsat radarı", exact: true }).click();
  await expect(page.locator(".blog-grid article")).toHaveCount(2);
  await page.goto("/blog/medya-takibi-nedir");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Medya takibi nedir?",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://mediaory.io/blog/medya-takibi-nedir",
  );
  await expect(page.locator(".blog-article-cover")).toBeVisible();
  await page
    .getByText("Medya takibi yalnızca büyük şirketler için mi?", { exact: true })
    .click();
  await expect(
    page.getByText("Hayır. Küçük ekipler de", { exact: false }),
  ).toBeVisible();
  expect(
    await page.locator('script[type="application/ld+json"]').textContent(),
  ).toContain('"@type":"BlogPosting"');
  expect((await request.get("/blog/not-a-published-article")).status()).toBe(404);
  const sitemap = await request.get("/sitemap.xml");
  expect(await sitemap.text()).toContain(
    "https://mediaory.io/blog/seo-geo-icerik-stratejisi",
  );
  const feed = await request.get("/blog/feed.xml");
  expect(feed.headers()["content-type"]).toContain("application/rss+xml");
  expect((await feed.text()).match(/<item>/g)).toHaveLength(17);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/blog");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
