import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

/**
 * A keyword is one comma-separated item — a word or a whole sentence.
 * Typing or pasting "a, b c, d" in the monitoring form makes three chips.
 */
test("comma-separated keywords become one chip each; phrases stay whole", async ({ page }) => {
  await registerAndOnboard(page);
  await page.goto("/monitoring/new");

  const include = page.getByLabel("Include", { exact: true });
  await include.fill("acme, yeni ürün lansmanı, ACME");
  await include.press("Enter");

  const chips = page.getByRole("listitem");
  await expect(chips.filter({ hasText: "yeni ürün lansmanı" })).toHaveCount(1);
  // "ACME" is the same keyword as "acme": one chip, not two.
  await expect(chips.filter({ hasText: /^acme/i })).toHaveCount(1);

  // Typing a comma commits what has been typed so far.
  await include.fill("third");
  await include.press(",");
  await expect(chips.filter({ hasText: "third" })).toHaveCount(1);
  await expect(include).toHaveValue("");
});
