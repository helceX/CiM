import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { isEmailVerified, makePlatformAdmin } from "./db";
import { registerAndOnboard } from "./helpers";

test("a platform admin sees email delivery status and can verify a stuck account by hand", async ({ page }) => {
  const admin = await registerAndOnboard(page);

  // A normal user gets a plain 404 for the admin page, not a hint that it exists.
  const denied = await page.goto("/admin/email");
  expect(denied?.status()).toBe(404);

  makePlatformAdmin(admin.email);

  // Someone registers but their verification email never arrives.
  const stuckEmail = `e2e-stuck-${Date.now()}@example.com`;
  const register = await page.request.post("/api/auth/register", {
    headers: {
      origin: "http://localhost:3000", // state-changing requests must be same-origin (CSRF check)
      "x-forwarded-for": `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.7`,
    },
    data: {
      firstName: "Stuck",
      lastName: "User",
      email: stuckEmail,
      companyName: `Stuck Co ${Date.now()}`,
      jobTitle: "Owner",
      password: "Sup3rSecret!",
    },
  });
  expect(register.ok()).toBe(true);
  expect(isEmailVerified(stuckEmail)).toBe(false);

  await page.goto("/admin/email");
  await expect(page.getByRole("heading", { name: "Email delivery" })).toBeVisible();
  // CI and dev use the console provider: the page must say plainly that nothing is delivered.
  await expect(page.getByRole("alert").filter({ hasText: "not configured" })).toBeVisible();

  const row = page.getByRole("listitem").filter({ hasText: stuckEmail });
  await expect(row).toBeVisible();

  const violations = (
    await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "best-practice"]).analyze()
  ).violations;
  expect(violations).toEqual([]);

  await row.getByRole("button", { name: `Mark ${stuckEmail} as verified` }).click();
  await expect(page.getByRole("listitem").filter({ hasText: stuckEmail })).toHaveCount(0, { timeout: 10_000 });
  expect(isEmailVerified(stuckEmail)).toBe(true);

  // The test-email button queues a message to the admin's own address.
  await page.getByRole("button", { name: /Send a test email to/ }).click();
  await expect(page.getByRole("status")).toContainText("Queued");
});
