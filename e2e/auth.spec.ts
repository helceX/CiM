import { test, expect } from "@playwright/test";
import { login, registerAndOnboard } from "./helpers";

/**
 * docs/testing/TEST_STRATEGY.md E2E list: "Login / logout / session
 * expiry." Registration → verify → onboarding is covered end to end in
 * register-to-dashboard.spec.ts; this covers what happens to an
 * already-onboarded account afterward.
 */
test("logging in with a real account reaches the dashboard, then logging out returns to login", async ({
  page,
}) => {
  const account = await registerAndOnboard(page);

  // registerAndOnboard already lands on /dashboard with a live session —
  // sign out first so this test proves login itself, not just onboarding.
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 5000 });

  await login(page, account.email, account.password);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 5000 });

  // A signed-out session must not still be able to reach a protected page.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
});

test("visiting a protected page while signed out redirects to login with a return path", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/mentions");
  await expect(page).toHaveURL(/\/login\?next=%2Fmentions/, { timeout: 5000 });
});

test("an invalid session cookie is rejected, not trusted", async ({ page, context }) => {
  // The session cookie is an HMAC-signed pointer to a server-side row
  // (ADR-005) — tampering with it must never be treated as a valid
  // session, unlike a client-trusted JWT.
  await context.addCookies([
    {
      name: "cim_session",
      value: "not-a-real-signed-session-value",
      domain: "localhost",
      path: "/",
    },
  ]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
});
