import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

/**
 * Brand groups end to end (docs/product/NEXT_FEATURES_SPEC.md §1): create a
 * group in Settings, put the onboarding query in it, and see it in the
 * Dashboard's group comparison and as a Mentions filter.
 */
test("create a brand group, assign a query, compare and filter", async ({ page }) => {
  await registerAndOnboard(page);

  await page.goto("/settings");
  await page.getByLabel("New group name").fill("Our brands");
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page.getByText("Our brands").first()).toBeVisible();

  // A second group with the same name (any case) is refused.
  await page.getByLabel("New group name").fill("our BRANDS");
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page.getByText("A group with that name already exists")).toBeVisible();

  const assign = page.getByLabel(/^Group for /).first();
  await assign.selectOption({ label: "Our brands" });
  await expect(assign).toHaveValue(/.+/);

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Group comparison" })).toBeVisible();
  await expect(page.getByRole("table", { name: /Brand group comparison/ })).toContainText("Our brands");

  const dashboardViolations = (
    await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "best-practice"]).analyze()
  ).violations;
  expect(dashboardViolations).toEqual([]);

  await page.goto("/mentions?view=list");
  await expect(page.getByLabel("Group")).toBeVisible();

  // Settings with a populated group list + assignment table stays accessible.
  await page.goto("/settings");
  const settingsViolations = (
    await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "best-practice"]).analyze()
  ).violations;
  expect(settingsViolations).toEqual([]);

  // Removing the group ungroups its queries and removes the comparison.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Delete group Our brands" }).click();
  await expect(page.getByText("No groups yet.")).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Group comparison" })).toHaveCount(0);
});
