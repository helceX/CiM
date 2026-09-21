import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";
import { latestEmailLinkFor } from "./db";

/**
 * docs/ux/SCREEN_INVENTORY.md Screen 18 "Organization Users": invite a
 * teammate, they accept and get their own session, the owner changes
 * their role, then revokes access and the revoked user is signed out —
 * exercised end to end through the real invite email link, not a
 * fabricated token.
 */
test("invite a member, they accept, owner changes role and revokes access", async ({
  page,
  browser,
}) => {
  const owner = await registerAndOnboard(page, { keyword: "Members E2E Co" });

  const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const inviteeEmail = `e2e-invitee-${unique}@example.com`;

  await page.goto("/settings");
  await page.getByRole("button", { name: "Invite member" }).click();
  await page.getByLabel("Email").fill(inviteeEmail);
  await page.getByLabel("Role").selectOption({ label: "Analyst" });
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText(inviteeEmail)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Invited", { exact: true })).toBeVisible();

  const inviteLink = latestEmailLinkFor(inviteeEmail, "invitation");

  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  await inviteePage.goto(inviteLink);
  await expect(
    inviteePage.getByRole("heading", { name: `Join ${owner.companyName}` }),
  ).toBeVisible();
  await inviteePage.getByLabel("First name").fill("Ivy");
  await inviteePage.getByLabel("Last name").fill("Invitee");
  await inviteePage.getByLabel("Password").fill("Sup3rSecret!");
  await inviteePage.getByRole("button", { name: "Accept invitation" }).click();
  await expect(inviteePage).toHaveURL(/\/dashboard/, { timeout: 5000 });

  await page.reload();
  await expect(page.getByText("Invited", { exact: true })).toHaveCount(0);
  const roleSelect = page.getByLabel("Role");
  await expect(roleSelect).toHaveValue("analyst");

  const roleChangeResponse = page.waitForResponse(
    (response) =>
      /\/api\/organizations\/members\/.+$/.test(response.url()) &&
      response.request().method() === "PATCH" &&
      response.ok(),
  );
  await roleSelect.selectOption({ label: "Viewer" });
  await roleChangeResponse;
  await page.reload();
  await expect(page.getByLabel("Role")).toHaveValue("viewer");

  await page.getByRole("button", { name: "Revoke" }).click();
  const revokeResponse = page.waitForResponse(
    (response) =>
      /\/api\/organizations\/members\/.+$/.test(response.url()) &&
      response.request().method() === "DELETE" &&
      response.ok(),
  );
  await page.getByRole("button", { name: "Revoke access" }).click();
  await revokeResponse;
  await expect(page.getByText(inviteeEmail)).toHaveCount(0);

  await inviteePage.goto("/dashboard");
  await expect(inviteePage).toHaveURL(/\/login/, { timeout: 5000 });

  await inviteeContext.close();
});
