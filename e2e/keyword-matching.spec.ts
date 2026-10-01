import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

test("the query builder says how each keyword will be matched", async ({ page }) => {
  await registerAndOnboard(page);
  await page.goto("/monitoring/new");

  await expect(page.getByText(/Matched as whole words/)).toBeVisible();

  const include = page.getByLabel("Include", { exact: true });
  await include.fill("THY, banka*, enflasyon");
  await include.press("Enter");

  // A short ALL-CAPS abbreviation keeps its capitals, a trailing * opens the ending,
  // an ordinary word is a plain whole-word match (no extra tag).
  await expect(page.getByRole("listitem").filter({ hasText: "THY" }).getByText("exact capitals, whole word")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "banka*" }).getByText("word starts with")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "enflasyon" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "enflasyon" }).getByText(/exact capitals|starts with/)).toHaveCount(0);

  const violations = (
    await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "best-practice"]).analyze()
  ).violations;
  expect(violations).toEqual([]);
});
