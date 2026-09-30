import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

test("build a visual with a live preview, save it, see it as chart and table, delete it", async ({ page }) => {
  await registerAndOnboard(page);
  await page.goto("/visuals");
  await expect(page.getByText("No visuals yet.")).toBeVisible();

  await page.getByRole("link", { name: "Build your first visual" }).click();
  await expect(page).toHaveURL(/\/visuals\/new$/);

  // Live preview renders without saving; switching to a category dimension offers a pie.
  await expect(page.getByText("Computing…")).toBeHidden({ timeout: 10_000 });
  await page.getByLabel("Group by").selectOption("sentiment");
  await expect(page.getByLabel("Show as").locator("option", { hasText: "Pie" })).toHaveCount(1);
  // A brand-new organization has no mentions yet; a day series is zero-filled, so it always has rows.
  await page.getByLabel("Group by").selectOption("day");
  await page.getByLabel("Show as").selectOption("bar");
  await page.getByRole("button", { name: "View as table" }).click();
  await expect(page.getByRole("table")).toBeVisible();

  const violations = (
    await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "best-practice"]).analyze()
  ).violations;
  expect(violations).toEqual([]);

  // A name is required.
  await page.getByRole("button", { name: "Save visual" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Give this visual a name" })).toBeVisible();

  await page.getByLabel("Name").fill("Sentiment mix");
  await page.getByRole("button", { name: "Save visual" }).click();
  await expect(page).toHaveURL(/\/visuals\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Sentiment mix" })).toBeVisible();

  await page.goto("/visuals");
  await expect(page.getByRole("link", { name: /Sentiment mix/ })).toBeVisible();
  await page.getByRole("link", { name: /Sentiment mix/ }).click();

  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL(/\/visuals$/);
  await expect(page.getByText("No visuals yet.")).toBeVisible();
});

test("a visual id from nowhere is a 404, not an error page", async ({ page }) => {
  await registerAndOnboard(page);
  const response = await page.goto("/visuals/00000000-0000-4000-8000-000000000000");
  expect(response?.status()).toBe(404);
});
