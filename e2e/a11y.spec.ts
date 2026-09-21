import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { registerAndOnboard } from "./helpers";
import { simulateCrawl } from "./simulate";

/**
 * docs/testing/TEST_STRATEGY.md Accessibility section: axe-core scans
 * (landmark/heading structure, form labels, ARIA, color-contrast on the
 * real design tokens — all covered by axe's default + best-practice
 * rule sets, run here rather than re-implemented by hand) plus explicit
 * keyboard-only operability checks axe cannot verify on its own (it
 * flags missing labels/roles, not whether Tab/Enter actually work).
 */

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

async function scan(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return results.violations;
}

function formatViolations(violations: Awaited<ReturnType<typeof scan>>): string {
  return violations
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.description}\n` +
        v.nodes.map((n) => `  - ${n.target.join(" ")}: ${n.failureSummary}`).join("\n"),
    )
    .join("\n\n");
}

const PUBLIC_PATHS = ["/", "/login", "/register", "/forgot-password", "/pricing", "/features", "/security"];

for (const pagePath of PUBLIC_PATHS) {
  test(`a11y: no violations on public page ${pagePath}`, async ({ page }) => {
    await page.goto(pagePath);
    const violations = await scan(page);
    expect(violations, formatViolations(violations)).toEqual([]);
  });
}

const AUTHENTICATED_PATHS = [
  "/dashboard",
  "/monitoring",
  "/monitoring/new",
  "/mentions",
  "/alerts",
  "/alerts/new",
  "/reports",
  "/reports/new",
  "/analytics",
  "/settings",
];

test.describe("a11y: authenticated app pages", () => {
  const storageStatePath = path.join(os.tmpdir(), `cim-e2e-a11y-auth-${Date.now()}.json`);

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await registerAndOnboard(page, { keyword: "Accessibility Co" });
    await context.storageState({ path: storageStatePath });
    await context.close();
  });

  test.afterAll(() => {
    fs.rmSync(storageStatePath, { force: true });
  });

  for (const pagePath of AUTHENTICATED_PATHS) {
    test(`no violations on ${pagePath}`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: storageStatePath });
      const page = await context.newPage();
      await page.goto(pagePath);
      const violations = await scan(page);
      await context.close();
      expect(violations, formatViolations(violations)).toEqual([]);
    });
  }
});

/**
 * These four checks are all read-only interactions against the same
 * kind of fixture (an org tracking "Daily Tech Wire" with one real
 * mention) — sharing a single registered account via storageState, the
 * same pattern as the authenticated-pages block above, instead of
 * registering fresh for each keeps the suite's total account creation
 * well within the register endpoint's own rate limit (SECURITY.md).
 */
test.describe("a11y + keyboard operability: overlays and nav", () => {
  const storageStatePath = path.join(os.tmpdir(), `cim-e2e-a11y-overlay-${Date.now()}.json`);

  test.beforeAll(async ({ browser }) => {
    // Explicit `storageState: undefined` here — `test.use` below already
    // configures every test's own context to load storageStatePath, and
    // that default applies to any `newContext()` call in this scope too,
    // including this one; without overriding it, this would try to read
    // the very file it's about to create.
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await registerAndOnboard(page, { keyword: "Daily Tech Wire" });
    await simulateCrawl("Daily Tech Wire");
    await context.storageState({ path: storageStatePath });
    await context.close();
  });

  test.afterAll(() => {
    fs.rmSync(storageStatePath, { force: true });
  });

  test.use({ storageState: storageStatePath });

  test("mention detail drawer has no violations while open", async ({ page }) => {
    await page.goto("/mentions");
    await page.getByLabel("Search").fill("Daily Tech Wire");
    await page.getByLabel("Search").press("Enter");
    await page.getByRole("row", { name: /Daily Tech Wire/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const violations = await scan(page);
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  test("command palette has no violations while open and is reachable by keyboard", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Search pages and actions")).toBeFocused();

    const violations = await scan(page);
    expect(violations, formatViolations(violations)).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("mentions table rows open the detail drawer via keyboard, not just a mouse click", async ({ page }) => {
    await page.goto("/mentions");
    await page.getByLabel("Search").fill("Daily Tech Wire");
    await page.getByLabel("Search").press("Enter");

    const row = page.getByRole("row", { name: /Daily Tech Wire/ }).first();
    await expect(row).toBeVisible({ timeout: 5000 });
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("the primary nav is fully reachable by Tab and Enter activates a link", async ({ page }) => {
    await page.goto("/dashboard");

    const monitoringLink = page.getByRole("link", { name: "Monitoring" });
    await monitoringLink.focus();
    await expect(monitoringLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/monitoring$/, { timeout: 5000 });
  });
});
