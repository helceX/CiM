import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";
import { latestEmailLinkFor } from "./db";
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

  /**
   * docs/product/FEATURE_MATRIX.md P2 "Collaboration (assign/comment/tag)"
   * — the "comment" slice. Reuses the same shared session/org as the
   * tests above, for the same rate-limit-headroom reason documented at
   * the top of this file.
   */
  test("adds and deletes a comment on a mention", async ({ page }) => {
    await page.goto("/mentions");
    await page.getByLabel("Search").fill("Daily Tech Wire");
    await page.getByLabel("Search").press("Enter");

    const row = page.getByRole("row", { name: /Daily Tech Wire/ }).first();
    await expect(row).toBeVisible({ timeout: 5000 });
    await row.click();

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("No comments yet.")).toBeVisible();

    const commentResponse = page.waitForResponse(
      (response) => response.url().includes("/comments") && response.request().method() === "POST",
    );
    await drawer.getByLabel("Comment").fill("Flagging this for legal review");
    await drawer.getByRole("button", { name: "Comment", exact: true }).click();
    const addResponse = await commentResponse;
    expect(addResponse.ok()).toBe(true);
    await expect(drawer.getByText("Flagging this for legal review")).toBeVisible();

    const deleteResponse = page.waitForResponse(
      (response) => response.url().includes("/comments/") && response.request().method() === "DELETE",
    );
    await drawer.getByRole("button", { name: "Delete comment" }).click();
    expect((await deleteResponse).ok()).toBe(true);
    await expect(drawer.getByText("Flagging this for legal review")).not.toBeVisible();
    await expect(drawer.getByText("No comments yet.")).toBeVisible();
  });

  /**
   * Regression: the assignee <select> (mention-detail-drawer.tsx) used to
   * build its <option> list from only currently-active members, but never
   * cleared assignedToUserId when a member's access was later revoked — so
   * once that happened, the select's value matched no option and the
   * browser silently fell back to displaying "Unassigned", hiding that the
   * mention was still actually assigned to the departed teammate. Exercises
   * the real lifecycle through the same invite/accept/revoke flow
   * members.spec.ts uses, not a fabricated membership row.
   */
  test("keeps naming a former member as assignee after their membership is revoked", async ({
    page,
    browser,
  }) => {
    await simulateCrawl("Daily Tech Wire");

    const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const inviteeEmail = `e2e-assignee-${unique}@example.com`;

    await page.goto("/team");
    await page.getByRole("button", { name: "Invite member" }).click();
    await page.getByLabel("Email", { exact: true }).fill(inviteeEmail);
    await page.getByLabel("Role").selectOption({ label: "Analyst" });
    await page.getByRole("button", { name: "Send invite" }).click();
    await expect(page.getByText(inviteeEmail)).toBeVisible({ timeout: 5000 });

    const inviteLink = latestEmailLinkFor(inviteeEmail, "invitation");
    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    await inviteePage.goto(inviteLink);
    await inviteePage.getByLabel("First name").fill("Ivy");
    await inviteePage.getByLabel("Last name").fill("Departing");
    await inviteePage.getByLabel("Password").fill("Sup3rSecret!");
    await inviteePage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(inviteePage).toHaveURL(/\/dashboard/, { timeout: 5000 });
    await inviteeContext.close();

    await page.goto("/mentions");
    await page.getByLabel("Search").fill("Daily Tech Wire");
    await page.getByLabel("Search").press("Enter");
    const row = page.getByRole("row", { name: /Daily Tech Wire/ }).first();
    await expect(row).toBeVisible({ timeout: 5000 });
    await row.click();

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    const assignResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/assign") && response.request().method() === "PATCH",
    );
    await drawer.getByLabel("Assigned to").selectOption({ label: "Ivy Departing" });
    expect((await assignResponse).ok()).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();

    await page.goto("/team");
    await expect(page.getByText(inviteeEmail)).toBeVisible();
    await page.getByRole("button", { name: "Revoke" }).click();
    const revokeResponse = page.waitForResponse(
      (response) =>
        /\/api\/organizations\/members\/.+$/.test(response.url()) &&
        response.request().method() === "DELETE" &&
        response.ok(),
    );
    await page.getByRole("button", { name: "Revoke access" }).click();
    await revokeResponse;

    await page.goto("/mentions");
    await page.getByLabel("Search").fill("Daily Tech Wire");
    await page.getByLabel("Search").press("Enter");
    const revisitedRow = page.getByRole("row", { name: /Daily Tech Wire/ }).first();
    await expect(revisitedRow).toBeVisible({ timeout: 5000 });
    await revisitedRow.click();

    const reopenedDrawer = page.getByRole("dialog");
    await expect(reopenedDrawer).toBeVisible();
    const assigneeSelect = reopenedDrawer.getByLabel("Assigned to");
    const selectedLabel = await assigneeSelect.evaluate(
      (el: HTMLSelectElement) => el.options[el.selectedIndex]?.textContent,
    );
    expect(selectedLabel).toContain("Ivy Departing");
    expect(selectedLabel).not.toBe("Unassigned");
  });
});
