import { test, expect } from "@playwright/test";

/**
 * The KVKK pages (docs/product/KVKK.md): the privacy notice names the controller and the rights, the
 * cookie policy lists exactly the cookies the app sets, the service-provider page lists who processes
 * data — each in English and, for a Turkish browser, in Turkish.
 */

test("the privacy notice, cookie policy and service-provider pages are linked from every page footer", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await footer.getByRole("link", { name: "Cookies" }).click();
  await expect(page).toHaveURL(/\/cookies$/);
  await page.getByRole("contentinfo").getByRole("link", { name: "Service providers" }).click();
  await expect(page).toHaveURL(/\/subprocessors$/);
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
});

test("the privacy notice names the controller, the legal bases, the transfers and the rights", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: /Privacy\s+Notice/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Data controller", exact: true })).toBeVisible();
  // No company details configured in CI: Mediaory and the contact address, and no placeholder text.
  await expect(page.getByText("Contact: hello@mediaory.io")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(/\{\w+\}|undefined|\bnull\b|TODO/);
  await expect(page.getByRole("heading", { name: "Why we process it, and on what legal basis", exact: true })).toBeVisible();
  await expect(page.getByText(/Art\. 5\/2-c/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Transfers abroad", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your rights", exact: true })).toBeVisible();
  await expect(page.getByText(/within 30 days at the latest/)).toBeVisible();
});

test("the cookie policy lists the cookies the app really sets", async ({ page }) => {
  await page.goto("/cookies");
  await expect(page.getByRole("heading", { name: /Cookie\s+Policy/ })).toBeVisible();
  await expect(page.getByText(/cim_session/)).toBeVisible();
  await expect(page.getByText(/NEXT_LOCALE/)).toBeVisible();
  await expect(page.getByText(/no analytics, no advertising, no tracking/)).toBeVisible();
});

test("the service-provider page lists who processes data and where", async ({ page }) => {
  await page.goto("/subprocessors");
  await expect(page.getByRole("heading", { name: /Service\s+providers/ })).toBeVisible();
  for (const provider of [/Railway/, /Cloudflare/, /Resend/, /Anthropic/]) {
    await expect(page.getByRole("heading", { name: provider }).first()).toBeVisible();
  }
});

test.describe("a Turkish browser", () => {
  test.use({ locale: "tr-TR", extraHTTPHeaders: { "accept-language": "tr-TR,tr;q=0.9" } });

  test("reads the notices in Turkish", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Veri sorumlusu", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Haklarınız", exact: true })).toBeVisible();
    await expect(page.getByText(/en geç 30 gün içinde/)).toBeVisible();
    await page.goto("/cookies");
    await expect(page.getByText(/cim_session/)).toBeVisible();
    await page.goto("/subprocessors");
    await expect(page.getByRole("heading", { name: /Yurt dışına aktarım/ })).toBeVisible();
  });
});

test("sign-up tells people about the terms and the privacy notice", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByText(/By creating an account you agree to the/)).toBeVisible();
  await page.getByRole("link", { name: "Privacy Notice" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
});
