import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";
import { simulateCrawl } from "./simulate";

/**
 * docs/testing/TEST_STRATEGY.md E2E list: "Filter mentions, open detail
 * drawer, mark relevant/irrelevant." Onboarding with "Daily Tech Wire" as
 * the tracked keyword gives this org a real MonitoringQuery matching one
 * of the seeded demo sources out of the box.
 */
test("filter mentions, open the detail drawer, and submit relevant feedback", async ({ page }) => {
  await registerAndOnboard(page, { keyword: "Daily Tech Wire" });
  await simulateCrawl("Daily Tech Wire");

  await page.goto("/mentions");
  await page.getByLabel("Search").fill("Daily Tech Wire");
  await page.getByLabel("Search").press("Enter");

  const row = page.getByRole("row", { name: /Daily Tech Wire/ }).first();
  await expect(row).toBeVisible({ timeout: 5000 });
  await row.click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Why did this match?")).toBeVisible();
  await expect(drawer.getByText(/Matched monitoring query/)).toBeVisible();

  const feedbackResponse = page.waitForResponse(
    (response) => response.url().includes("/feedback") && response.request().method() === "POST",
  );
  await drawer.getByRole("button", { name: "Relevant", exact: true }).click();
  const response = await feedbackResponse;
  expect(response.ok()).toBe(true);

  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("an empty filter combination shows the empty state, not a broken table", async ({ page }) => {
  await registerAndOnboard(page, { keyword: "a keyword nothing will ever match xyzzy123" });

  await page.goto("/mentions");
  await expect(page.getByText("No mentions match your filters.")).toBeVisible();
});
