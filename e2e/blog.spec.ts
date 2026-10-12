import { expect, test } from "@playwright/test";
test("public blog can be explored and has crawlable metadata", async ({
  page,
  request,
}) => {
  await page.goto("/blog");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Gündemi okuyun");
  await expect(page.getByText("100 Türkçe rehber", { exact: true })).toBeVisible();
  await expect(page.locator(".blog-grid article")).toHaveCount(18);
  await page.getByRole("link", { name: "Sonraki sayfa" }).click();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://mediaory.io/blog?sayfa=2",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator(".blog-grid article")).toHaveCount(18);
  await page.getByRole("link", { name: "6. sayfa", exact: true }).click();
  await expect(page.locator(".blog-grid article")).toHaveCount(10);
  await expect(page.getByRole("link", { name: "Sonraki sayfa" })).toHaveCount(0);
  await page.getByRole("link", { name: "Fırsat radarı", exact: true }).click();
  await expect(page.locator(".blog-grid article")).toHaveCount(18);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, follow",
  );
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
  expect((await feed.text()).match(/<item>/g)).toHaveLength(100);
  expect((await request.get("/blog?sayfa=999")).status()).toBe(404);
  await page.goto("/blog/medya-takibi-nedir");
  await page.getByRole("link", { name: "Mediaory hesabınızı oluşturun" }).click();
  await expect(page).toHaveURL(/\/register\/blog\/medya-takibi-nedir$/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.getByRole("textbox", { name: /e-posta|email/i })).toBeVisible();
  // No account or conversion is created by this navigation-only regression test.
  expect((await request.get("/register/blog/not-a-published-article")).status()).toBe(404);
  await page.goto("/blog/kalici-gundem-icerigi");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("kalıcı rehber");
  await expect(page.locator(".blog-article-cover")).toBeVisible();
  const opportunityEntry = await request.get("/opportunities", { maxRedirects: 0 });
  expect(opportunityEntry.status()).toBe(307);
  const loginTarget = new URL(
    opportunityEntry.headers()["location"]!,
    "http://localhost:3000",
  );
  expect(loginTarget.pathname).toBe("/login");
  expect(loginTarget.searchParams.get("next")).toBe("/opportunities");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/blog");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
