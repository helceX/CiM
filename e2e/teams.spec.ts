import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

test("create a team, see it on the account card, reject a duplicate name, leave and delete it", async ({ page }) => {
  const owner = await registerAndOnboard(page);
  await page.goto("/team");
  await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
  await expect(page.getByText("No teams yet.")).toBeVisible();

  await page.getByRole("button", { name: "New team" }).click();
  await page.getByLabel("Team name").fill("Press office");
  await page.getByLabel("What does it do? (optional)").fill("Daily media monitoring");
  await page.getByRole("button", { name: "Create team" }).click();

  const card = page.getByRole("heading", { name: /Press office/ });
  await expect(card).toBeVisible();
  await expect(page.getByText("Daily media monitoring")).toBeVisible();
  // The creator is the lead and the team shows on their own account card.
  const members = page.getByRole("list", { name: "Members of Press office" });
  await expect(members.getByText("lead")).toBeVisible();
  await expect(page.getByText("Your teams:")).toBeVisible();

  // The same name, any case, is refused.
  await page.getByRole("button", { name: "New team" }).click();
  await page.getByLabel("Team name").fill("PRESS OFFICE");
  await page.getByRole("button", { name: "Create team" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already exists" })).toBeVisible();
  await page.keyboard.press("Escape");

  const violations = (
    await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "best-practice"]).analyze()
  ).violations;
  expect(violations).toEqual([]);

  // Leaving removes you; the team stays until it is deleted.
  await members.getByRole("button", { name: "Leave Press office" }).click();
  await expect(page.getByText("0 members")).toBeVisible();
  void owner;

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete team Press office" }).click();
  await expect(page.getByText("No teams yet.")).toBeVisible();
});
