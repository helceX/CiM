import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";
import { simulateCrawl } from "./simulate";

/**
 * docs/testing/TEST_STRATEGY.md E2E list: "Filter mentions, open detail
 * drawer, mark relevant/irrelevant." Both tests below use one org tracking
 * "Daily Tech Wire" — the empty-state test runs first, before any crawl
 * has populated mentions, then the second simulates a crawl and exercises
 * the populated table. Sharing one registered account via storageState
 * (the same fix already applied in e2e/reports.spec.ts and e2e/a11y.spec.ts)
 * keeps the suite's total account creation within headroom of the register
 * endpoint's own rate limit (SECURITY.md): with zero headroom, a single
 * unrelated test failure elsewhere that trips Playwright's
 * restart-the-worker-on-failure behavior — which re-runs a worker-scoped
 * beforeAll — is enough to push the suite's real registration count over
 * the limit and cascade-fail whichever file happens to register last.
 */
test.describe("mentions", () => {
  const storageStatePath = path.join(os.tmpdir(), `cim-e2e-mentions-${Date.now()}.json`);

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await registerAndOnboard(page, { keyword: "Daily Tech Wire" });
    await context.storageState({ path: storageStatePath });
    await context.close();
  });

  test.afterAll(() => {
    fs.rmSync(storageStatePath, { force: true });
  });

  test.use({ storageState: storageStatePath });

  test("an empty filter combination shows the empty state, not a broken table", async ({ page }) => {
    await page.goto("/mentions");
    await expect(page.getByText("No mentions match your filters.")).toBeVisible();
  });

  test("filter mentions, open the detail drawer, and submit relevant feedback", async ({ page }) => {
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

  /**
   * docs/product/FEATURE_MATRIX.md P2 "Collaboration (assign/comment/tag)"
   * — the "tag" slice. Reuses the same shared session/org as the test
   * above rather than registering again, for the same rate-limit-headroom
   * reason documented at the top of this file.
   */
  test("adds and removes a tag from a mention", async ({ page }) => {
    await page.goto("/mentions");
    await page.getByLabel("Search").fill("Daily Tech Wire");
    await page.getByLabel("Search").press("Enter");

    const row = page.getByRole("row", { name: /Daily Tech Wire/ }).first();
    await expect(row).toBeVisible({ timeout: 5000 });
    await row.click();

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();

    const tagResponse = page.waitForResponse(
      (response) => response.url().includes("/tags") && response.request().method() === "POST",
    );
    await drawer.getByLabel("Tag").fill("Needs follow-up");
    await drawer.getByRole("button", { name: "Add" }).click();
    const addResponse = await tagResponse;
    expect(addResponse.ok()).toBe(true);
    await expect(drawer.getByText("Needs follow-up")).toBeVisible();

    const removeResponse = page.waitForResponse(
      (response) => response.url().includes("/tags/") && response.request().method() === "DELETE",
    );
    await drawer.getByRole("button", { name: "Remove Needs follow-up" }).click();
    expect((await removeResponse).ok()).toBe(true);
    await expect(drawer.getByText("Needs follow-up")).not.toBeVisible();
  });
});
