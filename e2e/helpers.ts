import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { latestEmailLinkFor } from "./db";

export type OnboardedAccount = {
  email: string;
  password: string;
  companyName: string;
  keyword: string;
};

/**
 * The register → verify email → onboarding chain (e2e/register-to-
 * dashboard.spec.ts) is the one flow every other authenticated E2E test
 * needs first, just to get a fresh, isolated organization + session —
 * shared here so those tests don't each re-implement it. `keyword` seeds
 * the onboarding wizard's tracked term, which becomes the org's first
 * MonitoringQuery — callers that need a specific query to attach a
 * monitoring/alert test to should pass one.
 */
export async function registerAndOnboard(
  page: Page,
  options: { keyword?: string } = {},
): Promise<OnboardedAccount> {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const email = `e2e-${unique}@example.com`;
  const password = "Sup3rSecret!";
  const companyName = `E2E Co ${unique}`;
  const keyword = options.keyword ?? companyName;

  await page.goto("/register");
  await page.getByLabel("First name").fill("Grace");
  await page.getByLabel("Last name").fill("Hopper");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Company name").fill(companyName);
  await page.getByLabel("Position").fill("QA Lead");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();

  const verifyLink = latestEmailLinkFor(email, "verify_email");
  await page.goto(verifyLink);
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 5000 });

  await page.getByRole("button", { name: "Continue" }).click(); // step 1: tracking target

  await page.getByLabel("Keyword").fill(keyword);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("button", { name: `Remove ${keyword}` })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click(); // step 2: keywords

  await page.getByRole("button", { name: "Continue" }).click(); // step 3: sources (defaults)
  await page.getByRole("button", { name: "Continue" }).click(); // step 4: notification preference
  await page.getByRole("button", { name: "Go to dashboard" }).click(); // step 5: project name

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });

  return { email, password, companyName, keyword };
}

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });
}
