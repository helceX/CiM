import { test, expect } from "@playwright/test";
import { makePlatformAdmin } from "./db";
import { registerAndOnboard } from "./helpers";

test("an admin configures a public Telegram bridge without starting a collector or leaking credentials", async ({
  page,
}) => {
  const admin = await registerAndOnboard(page);
  makePlatformAdmin(admin.email);
  await page.goto("/admin/sources");
  await page.getByLabel("Platform", { exact: true }).selectOption("rssbridge");
  await expect(page.getByLabel("Your RSS-Bridge address")).toHaveAttribute(
    "placeholder",
    "https://feeds.example.com/bridge/",
  );
  await page
    .getByLabel("Channel username or public address")
    .fill("https://t.me/s/rssbridge");
  await page
    .getByLabel("Your RSS-Bridge address")
    .fill("https://user:secret@feeds.example.com/bridge/");
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/admin/sources", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submitted = route.request().postDataJSON();
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Test bridge is not running." }),
    });
  });
  await page.getByRole("button", { name: "Follow feed", exact: true }).click();
  await expect(
    page.getByText(
      "Use your HTTPS RSS-Bridge address without credentials, a query or a fragment.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(submitted).toBeNull();
  await page
    .getByLabel("Your RSS-Bridge address")
    .fill("https://feeds.example.com/bridge/");
  await page.getByRole("button", { name: "Follow feed", exact: true }).click();
  await expect(
    page.getByText("Test bridge is not running.", { exact: true }),
  ).toBeVisible();
  expect(submitted).toMatchObject({
    connector: "rss",
    type: "social",
    url: "https://feeds.example.com/bridge/?action=display&bridge=Telegram&username=rssbridge&format=Atom",
  });
  await page.getByLabel("Platform", { exact: true }).selectOption("discourse");
  await page.getByLabel("Follow", { exact: true }).selectOption("category");
  await expect(page.getByLabel("Category ID", { exact: true })).toBeVisible();
});
