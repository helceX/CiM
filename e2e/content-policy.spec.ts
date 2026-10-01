import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { makePlatformAdmin } from "./db";
import { registerAndOnboard } from "./helpers";

const axe = (page: import("@playwright/test").Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "best-practice"]).analyze();

test("publisher-facing pages explain the bot and the terms, and are accessible", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: /Terms of\s+Service/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Sources and content/ })).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);

  await page.goto("/bot");
  await expect(page.getByText("Mediaory-Bot/1.0 (+https://mediaory.io/bot)")).toBeVisible();
  await expect(page.getByText(/at most 200 characters/)).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
  await page.getByRole("link", { name: "Send a takedown request" }).click();
  await expect(page).toHaveURL(/\/takedown$/);
  expect((await axe(page)).violations).toEqual([]);
});

test("a publisher's takedown request reaches the admin, who can block the domain for good", async ({ page, browser }) => {
  const domain = `pub-${Date.now()}.example`;

  // Public form (no account).
  // A unique client IP per run keeps the per-IP rate limit out of the way.
  const visitorContext = await browser.newContext({
    baseURL: "http://localhost:3000",
    extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.9` },
  });
  const visitor = await visitorContext.newPage();
  await visitor.goto("/takedown");
  await visitor.getByLabel("Your name").fill("Ayse Editor");
  await visitor.getByLabel("Your email").fill("editor@pub.example");
  await visitor.getByLabel("Publisher or site name").fill("Pub Gazetesi");
  await visitor.getByLabel("Site or page addresses").fill(domain);
  await visitor.getByLabel(/I am authorized/).check();
  await visitor.getByRole("button", { name: "Send request" }).click();
  await expect(visitor.getByRole("status")).toContainText("Request received");
  await visitorContext.close();

  // Admin sees it and blocks the domain.
  const admin = await registerAndOnboard(page);
  makePlatformAdmin(admin.email);
  await page.goto("/admin/takedowns");
  const card = page.getByRole("listitem").filter({ hasText: "Pub Gazetesi" }).first();
  await expect(card).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);

  page.once("dialog", (dialog) => void dialog.accept());
  await card.getByLabel("Domain to block").fill(domain);
  await card.getByRole("button", { name: "Block and remove stored content" }).click();
  // The domain shows up as blocked.
  await expect(page.getByRole("button", { name: `Unblock ${domain}` })).toBeVisible({ timeout: 10_000 });

  // A blocked publisher cannot be added again — and is never contacted.
  await page.goto("/admin/sources");
  await page.getByLabel("Name").fill("Pub");
  await page.getByLabel("Feed or sitemap address").fill(`https://www.${domain}/rss.xml`);
  await page.getByRole("button", { name: "Test & add", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "asked not to be crawled" })).toBeVisible();

  // A licensed news agency needs an explicit licence confirmation.
  await page.getByLabel("Feed or sitemap address").fill("https://www.aa.com.tr/rss.xml");
  await page.getByRole("button", { name: "Test & add", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "written licence" })).toBeVisible();
  await expect(page.getByLabel(/holds a written licence/)).toBeVisible();
});
