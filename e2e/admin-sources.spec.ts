import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { makePlatformAdmin, seedSources, sourceStatus } from "./db";
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
  await page.getByText(/^Add an RSS feed to World/).click();
  await page.getByLabel("Name").fill("Internal");
  await page.getByLabel("Feed or sitemap address").fill("https://10.0.0.1/rss.xml");
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not allowed" })).toBeVisible();

  await page.getByRole("button", { name: "Test & add", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not allowed" })).toBeVisible();
  await expect(page.getByText("Internal", { exact: true })).toHaveCount(0);
});

test("a platform admin browses sources by region and kind and pauses a slice", async ({ page }) => {
  const admin = await registerAndOnboard(page);
  makePlatformAdmin(admin.email);
  const tag = `regtest${Date.now()}`;
  seedSources(tag);

  await page.goto("/admin/sources");
  await page.getByLabel("Filter sources").fill(tag);

  // World shows all three; the kind chips cluster them.
  await expect(page.getByRole("button", { name: /^World 3$/ })).toBeVisible();
  await expect(page.getByText("News sites", { exact: false }).first()).toBeVisible();

  // Continent → country narrows the list (Türkiye is under both Europe and Asia).
  await page.getByRole("button", { name: /^Europe 3$/ }).click();
  await page.getByRole("button", { name: /^Germany 1$/ }).click();
  await expect(page.getByText(`${tag}-de-blog`, { exact: true })).toBeVisible();
  await expect(page.getByText(`${tag}-tr-news`, { exact: true })).toHaveCount(0);

  // The add-feed form follows the selected region: only Germany is offered under "Germany".
  await page.getByText(/^Add an RSS feed to Germany/).click();
  await expect(page.getByLabel("Country")).toHaveValue("DE");
  await expect(page.getByLabel("Country").locator("option")).toHaveCount(1);
  await page.getByText(/^Add an RSS feed to Germany/).click(); // collapse again

  // Pause only what's shown (the one German blog).
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Pause the 1 shown" }).click();
  await expect(page.getByText("Paused 1 source.")).toBeVisible();
  expect(sourceStatus(`${tag}-de-blog`)).toBe("unavailable");
  expect(sourceStatus(`${tag}-tr-news`)).toBe("healthy");
  expect(sourceStatus(`${tag}-tr-forum`)).toBe("healthy");

  // Kind filter: only forums in Asia (Türkiye also counts as Asia).
  await page.getByRole("button", { name: /^Germany/ }).click(); // un-select country
  await page.getByRole("button", { name: /^Asia/ }).click();
  await page.getByRole("button", { name: /^Forums & comments/ }).click();
  await expect(page.getByText(`${tag}-tr-forum`, { exact: true })).toBeVisible();
  await expect(page.getByText(`${tag}-tr-news`, { exact: true })).toHaveCount(0);

  const violations = (
    await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "best-practice"]).analyze()
  ).violations;
  expect(violations).toEqual([]);
});
