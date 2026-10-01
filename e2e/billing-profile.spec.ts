import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

test("an owner saves invoice details; a mistyped tax number is rejected; values persist", async ({ page }) => {
  await registerAndOnboard(page);
  await page.goto("/settings?tab=billing");
  await expect(page.getByRole("heading", { name: "Invoice details" })).toBeVisible();

  await page.getByLabel("Company name (as registered)").fill("Acme Medya A.Ş.");
  await page.getByLabel("Tax office").fill("Kadıköy");
  await page.getByLabel("Address").fill("Örnek Mah. 1. Sok. No:2");
  await page.getByLabel("City").fill("İstanbul");
  await page.getByLabel("Invoice email").fill("fatura@acme.com");

  // Wrong check digit: caught before it can reach an invoice.
  await page.getByLabel("Tax number (VKN / TCKN)").fill("1234567891");
  await page.getByRole("button", { name: "Save invoice details" }).click();
  await expect(page.getByText("This tax number is not valid")).toBeVisible();

  await page.getByLabel("Tax number (VKN / TCKN)").fill("1234567890");
  await page.getByRole("button", { name: "Save invoice details" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Invoice details saved." })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Company name (as registered)")).toHaveValue("Acme Medya A.Ş.");
  await expect(page.getByLabel("Tax number (VKN / TCKN)")).toHaveValue("1234567890");

  const violations = (
    await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "best-practice"]).analyze()
  ).violations;
  expect(violations).toEqual([]);
});
