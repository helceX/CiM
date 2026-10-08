import { test, expect, type Page } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

const ink = (page: Page) => page.locator(".mp-sidebar img.mp-logo-ink");
const paper = (page: Page) => page.locator(".mp-sidebar img.mp-logo-paper");

/**
 * The panel has its own dark/light switch, independent of the computer's colour scheme. The logo's
 * wordmark has to follow the panel: white on the dark canvas, dark on the light one — in either
 * computer setting (a dark wordmark on the dark canvas disappears).
 */
for (const colorScheme of ["light", "dark"] as const) {
  test(`the sidebar logo follows the panel theme when the computer is set to ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await registerAndOnboard(page);
    await page.goto("/dashboard");

    // Dark is the panel's default: the white wordmark shows.
    await expect(ink(page)).toBeVisible();
    await expect(paper(page)).toBeHidden();

    // The logo is large enough to read as the brand, not a small badge.
    const box = await ink(page).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await page.getByRole("button", { name: "Switch to light theme" }).click();
    await expect(paper(page)).toBeVisible();
    await expect(ink(page)).toBeHidden();

    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(ink(page)).toBeVisible();
    await expect(paper(page)).toBeHidden();
  });
}
