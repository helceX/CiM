import { test, expect } from "@playwright/test";
import { latestEmailLinkFor } from "./db";

/**
 * The core value chain (docs/product/USER_FLOWS.md §1): registration →
 * email verification → onboarding → dashboard shows real data. This is
 * the one flow that must never be broken (brief §112).
 */
test("register, verify email, complete onboarding, see dashboard", async ({ page }) => {
  const uniqueEmail = `e2e-${Date.now()}@example.com`;

  await page.goto("/register");
  await page.getByLabel("First name").fill("Grace");
  await page.getByLabel("Last name").fill("Hopper");
  await page.getByLabel("Work email").fill(uniqueEmail);
  await page.getByLabel("Company name").fill("E2E Test Co");
  await page.getByLabel("Position").fill("QA Lead");
  await page.getByLabel("Password").fill("Sup3rSecret!");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Check your email")).toBeVisible();

  const verifyLink = latestEmailLinkFor(uniqueEmail, "verify_email");
  await page.goto(verifyLink);
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 5000 });

  // Step 1: tracking target — "Company" is selected by default, continue.
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: keywords
  await page.getByLabel("Keyword").fill("E2E Test Co");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("button", { name: "Remove E2E Test Co" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: sources — defaults (News, Web) are pre-checked, continue.
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4: notification preference — default selected, continue.
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 5: project name — prefilled from the keyword, finish.
  await page.getByRole("button", { name: "Go to dashboard" }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Total mentions")).toBeVisible();
});

test("logging in with the wrong password shows a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo-owner@northwind.example");
  await page.getByLabel("Password").fill("WrongPassword1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
});
