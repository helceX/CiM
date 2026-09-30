import { test, expect } from "@playwright/test";
import { latestEmailLinkFor } from "./db";

/**
 * A verification email that never arrives (provider down or not yet
 * configured) must not strand the account: the user can ask for a new link
 * from the register screen, and the new link works.
 */
test("a user who never got the verification email can request a new link and verify with it", async ({
  page,
}) => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  await page.context().setExtraHTTPHeaders({
    "x-forwarded-for": `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`,
  });
  const email = `e2e-resend-${unique}@example.com`;

  await page.goto("/register");
  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Lovelace");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Company name").fill(`Resend Co ${unique}`);
  await page.getByLabel("Position").fill("Engineer");
  await page.getByLabel("Password").fill("Sup3rSecret!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  const firstLink = latestEmailLinkFor(email, "verify_email");

  await page.getByRole("link", { name: "Send it again" }).click();
  await expect(page).toHaveURL(/\/verify-email$/);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Resend verification email" }).click();
  await expect(page.getByRole("status")).toContainText("new verification link is on its way");

  const secondLink = latestEmailLinkFor(email, "verify_email");
  expect(secondLink).not.toBe(firstLink);
  await page.goto(secondLink);
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 5000 });
});

test("resending for an unknown address answers exactly like a known one", async ({ page }) => {
  await page.context().setExtraHTTPHeaders({
    "x-forwarded-for": `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`,
  });
  await page.goto("/verify-email");
  await page.getByLabel("Email").fill(`nobody-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Resend verification email" }).click();
  await expect(page.getByRole("status")).toContainText("new verification link is on its way");
});
