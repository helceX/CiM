import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { makePlatformAdmin } from "./db";
import { registerAndOnboard } from "./helpers";

test("the operational overview is admin-only and exposes actionable health checks", async ({ page }) => {
  const admin = await registerAndOnboard(page);
  expect((await page.goto("/admin"))?.status()).toBe(404);
  makePlatformAdmin(admin.email);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();
  await expect(page.getByText("Database reachable", { exact: true })).toBeVisible();
  await expect(page.getByText("Redis reachable", { exact: true })).toBeVisible();
  await expect(page.getByText(/Last loaded \(UTC\):/)).toBeVisible();
  const attention = page.getByRole("region", { name: "Needs attention" });
  await expect(attention).toBeVisible();
  await expect(attention).not.toContainText("Measurements unavailable");
  await expect(attention).toContainText("This summary covers the checks below");
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "best-practice"]).analyze()).violations;
  expect(violations).toEqual([]);
});
