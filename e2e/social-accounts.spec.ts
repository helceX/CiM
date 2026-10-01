import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";
import { simulateSocialSync } from "./simulate";

/**
 * Connect an account (the built-in demo network stands in for a real platform —
 * no external sign-in), see its mentions with direct links, get a notification
 * that opens the post, and disconnect.
 */
test("connect an account, see its mentions with links, open one from a notification, disconnect", async ({ page }) => {
  await registerAndOnboard(page);

  await page.goto("/settings");
  const section = page.getByRole("region", { name: "Connected accounts" });
  await expect(section).toBeVisible();
  await expect(section.getByText("Demo network", { exact: true })).toBeVisible();

  await section.getByRole("link", { name: "Connect Demo network" }).click();
  await expect(page).toHaveURL(/social=connected/);
  const connected = page.getByRole("region", { name: "Connected accounts" });
  await expect(connected.getByRole("status")).toContainText("Account connected");
  await expect(connected.getByText("Demo network · @mediaory_demo")).toBeVisible();

  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "best-practice"]).analyze()).violations;
  expect(violations).toEqual([]);

  await simulateSocialSync();

  await page.goto("/social/mentions");
  await expect(page.getByRole("heading", { name: "Mentions & tags" })).toBeVisible();
  const post = page.getByRole("link", { name: /Open on Demo network/ }).first();
  await expect(post).toHaveAttribute("href", /^https:\/\/social\.example\//);
  await expect(post).toHaveAttribute("target", "_blank");
  await expect(page.getByText("Loving what @mediaory_demo shipped this week.")).toBeVisible();

  // The same two posts are in the notification bell, each linking straight to the post.
  await page.getByRole("button", { name: /Notifications/ }).click();
  const open = page.getByRole("menuitem", { name: /mentioned you on Demo network/ });
  await expect(open).toHaveAttribute("href", "https://social.example/someone/status/1");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByText("New", { exact: true })).toHaveCount(0);

  await page.goto("/settings");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Disconnect Demo network @mediaory_demo" }).click();
  await expect(page.getByText("Demo network · @mediaory_demo")).toHaveCount(0);

  await page.goto("/social/mentions");
  await expect(page.getByText("No account connected yet")).toBeVisible();
});

test("a forged callback is refused and connects nothing", async ({ page }) => {
  await registerAndOnboard(page);
  await page.goto("/api/social/callback/mock?code=mock-code&state=forged");
  await expect(page).toHaveURL(/social=expired/);
  await expect(page.getByRole("alert").filter({ hasText: "took too long" })).toBeVisible();
  await expect(page.getByText("Demo network · @mediaory_demo")).toHaveCount(0);
});
