import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

/**
 * On a phone the sidebar is hidden, so navigation lives in a sheet behind
 * the topbar menu button, and no screen may scroll sideways. Regression
 * cover for the app shell being unusable at ~390px.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("phone: navigation is reachable and pages do not overflow horizontally", async ({ page }) => {
  await registerAndOnboard(page);
  await expect(page).toHaveURL(/\/dashboard/);

  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  for (const [label, path] of [
    ["Dashboard", "/dashboard"],
    ["Mentions", "/mentions"],
    ["Alerts", "/alerts"],
    ["Analytics", "/analytics"],
    ["Visuals", "/visuals"],
    ["Reports", "/reports"],
    ["Monitoring", "/monitoring"],
  ] as const) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("navigation", { name: "Primary (mobile)" })
      .getByRole("link", { name: label })
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}`));
    // The sheet closes after navigating.
    await expect(page.getByRole("navigation", { name: "Primary (mobile)" })).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(await overflow(), `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
});
