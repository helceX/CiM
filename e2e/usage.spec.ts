import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

/** Credit metering v1 is measure-only: Settings shows what is tracked and says nothing is charged. */
test("settings shows tracked keywords and the measure-only credit note", async ({ page }) => {
  await registerAndOnboard(page);
  await page.goto("/settings?tab=billing");

  await expect(page.getByRole("heading", { name: "Credits" })).toBeVisible();
  // Onboarding created one query with one include term.
  await expect(page.getByText("Tracked keywords now").locator("xpath=following-sibling::dd")).toHaveText("1");
  await expect(page.getByText(/Credits are measured only/)).toBeVisible();

  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "best-practice"]).analyze()).violations;
  expect(violations).toEqual([]);
});
