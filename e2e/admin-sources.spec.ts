import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { makePlatformAdmin } from "./db";
import { registerAndOnboard } from "./helpers";

test("a platform admin sees the Türkiye catalog and gets a clear error for an unreadable feed", async ({ page }) => {
  const admin = await registerAndOnboard(page);

  // Not an admin yet: the page doesn't reveal itself.
  expect((await page.goto("/admin/sources"))?.status()).toBe(404);

  makePlatformAdmin(admin.email);
  await page.goto("/admin/sources");
  await expect(page.getByRole("heading", { name: "Crawl sources" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Türkiye catalog" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Hürriyet", exact: true })).toBeVisible();

  // The community list is searchable and filterable; licence-required agencies are never offered.
  await expect(page.getByText(/\d{3} feeds match/)).toBeVisible();
  await page.getByLabel("Search").fill("webrazzi");
  await expect(page.getByRole("button", { name: "Add Webrazzi", exact: true })).toBeVisible();
  await page.getByLabel("Search").fill("aa.com.tr");
  await expect(page.getByText("0 feeds match")).toBeVisible();
  await page.getByLabel("Search").fill("");
  await page.getByLabel("Category").selectOption("sports");
  await expect(page.getByText(/\d+ feeds match/)).toBeVisible();
  await page.getByLabel("Category").selectOption("all");

  const violations = (
    await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "best-practice"]).analyze()
  ).violations;
  expect(violations).toEqual([]);

  // A private address is refused by the SSRF guard, and nothing is stored.
  await page.getByLabel("Name").fill("Internal");
  await page.getByLabel("Feed or sitemap address").fill("https://10.0.0.1/rss.xml");
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not allowed" })).toBeVisible();

  await page.getByRole("button", { name: "Test & add", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not allowed" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Internal/ })).toHaveCount(0);
});
