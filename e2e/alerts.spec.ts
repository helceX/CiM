import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";
import { simulateCrawl } from "./simulate";

/**
 * docs/testing/TEST_STRATEGY.md E2E list: "Create alert rule → simulate
 * trigger → notification appears." The "trigger" is a real crawl +
 * real alert evaluation (e2e/simulate.ts, the exact sequence
 * apps/worker/src/jobs/crawl-source.ts runs), not a fabricated
 * notification row — what's faked is only the email send, which is
 * separately covered by apps/worker's own integration tests.
 */
test("create a keyword alert rule, trigger it for real, and see the notification", async ({ page }) => {
  await registerAndOnboard(page, { keyword: "Daily Tech Wire" });

  await page.goto("/alerts/new");
  const ruleName = `Daily Tech Wire alert ${Date.now()}`;
  await page.getByLabel("Name").fill(ruleName);
  // "Keyword" type is already selected by default; in-app channel is
  // already checked by default — both left as is, matching what a user
  // creating their first alert would actually click through.
  await page.getByRole("button", { name: "Save alert" }).click();
  await expect(page).toHaveURL(/\/alerts$/, { timeout: 5000 });
  await expect(page.getByRole("cell", { name: ruleName })).toBeVisible();

  await simulateCrawl("Daily Tech Wire");

  await page.reload();
  await page.getByRole("button", { name: /Notifications/ }).click();
  const notificationsMenu = page.getByRole("menu", { name: /Notifications/ });
  await expect(notificationsMenu.getByText(ruleName, { exact: true })).toBeVisible({ timeout: 5000 });
  // exact:true matters here — the notification body text itself reads
  // "1 new mention matched …", which getByText("New") would otherwise
  // also match case-insensitively as a substring, alongside the actual
  // unread Badge this is meant to check for.
  await expect(notificationsMenu.getByText("New", { exact: true })).toBeVisible();

  const readResponse = page.waitForResponse(
    (response) => /\/api\/notifications\/.+\/read$/.test(response.url()) && response.ok(),
  );
  await notificationsMenu.getByRole("menuitem").filter({ hasText: ruleName }).click();
  await readResponse;
  await expect(notificationsMenu.getByText("New", { exact: true })).toHaveCount(0);
});
