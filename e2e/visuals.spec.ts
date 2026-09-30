import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

test("build a visual with a live preview, save it, see it as chart and table, delete it", async ({ page }) => {
  await registerAndOnboard(page);
  await page.goto("/visuals");
  await expect(page.getByText("No visuals yet.")).toBeVisible();

  await page.getByRole("link", { name: "Build your first visual" }).click();
  await expect(page).toHaveURL(/\/visuals\/new$/);

  // Live preview renders without saving; switching to a category dimension offers a pie.
  await expect(page.getByText("Computing…")).toBeHidden({ timeout: 10_000 });
  await page.getByLabel("Group by").selectOption("sentiment");
  await expect(page.getByLabel("Show as").locator("option", { hasText: "Pie" })).toHaveCount(1);
  // A brand-new organization has no mentions yet; a day series is zero-filled, so it always has rows.
  await page.getByLabel("Group by").selectOption("day");
  await page.getByLabel("Show as").selectOption("bar");
  await page.getByRole("button", { name: "View as table" }).click();
  await expect(page.getByRole("table")).toBeVisible();

  const violations = (
    await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "best-practice"]).analyze()
  ).violations;
  expect(violations).toEqual([]);

  // A name is required.
  await page.getByRole("button", { name: "Save visual" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Give this visual a name" })).toBeVisible();

  await page.getByLabel("Name").fill("Sentiment mix");
  await page.getByRole("button", { name: "Save visual" }).click();
  await expect(page).toHaveURL(/\/visuals\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Sentiment mix" })).toBeVisible();

  await page.goto("/visuals");
  await expect(page.getByRole("link", { name: /Sentiment mix/ })).toBeVisible();
  await page.getByRole("link", { name: /Sentiment mix/ }).click();

  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL(/\/visuals$/);
  await expect(page.getByText("No visuals yet.")).toBeVisible();
});

test("a visual id from nowhere is a 404, not an error page", async ({ page }) => {
  await registerAndOnboard(page);
  const response = await page.goto("/visuals/00000000-0000-4000-8000-000000000000");
  expect(response?.status()).toBe(404);
});

test("pin a visual to the Dashboard, export it as CSV, edit it, unpin it", async ({ page }) => {
  await registerAndOnboard(page);
  await page.goto("/visuals/new");
  await expect(page.getByText("Computing…")).toBeHidden({ timeout: 10_000 });
  await page.getByLabel("Name").fill("Daily volume");
  await page.getByRole("button", { name: "Save visual" }).click();
  await expect(page).toHaveURL(/\/visuals\/[0-9a-f-]{36}$/);
  const detailUrl = page.url();

  // Not on the Dashboard until pinned.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your visuals" })).toHaveCount(0);

  await page.goto(detailUrl);
  await page.getByRole("button", { name: "Pin to Dashboard" }).click();
  await expect(page.getByRole("button", { name: "Unpin from Dashboard" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your visuals" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Daily volume" })).toBeVisible();

  // CSV export downloads a real file with the header row.
  await page.goto(detailUrl);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Export CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("daily-volume.csv");
  const fs = await import("node:fs/promises");
  const csv = await fs.readFile((await download.path())!, "utf8");
  expect(csv.startsWith('"Day","Mentions"\r\n')).toBe(true);

  // Edit keeps the visual and changes it.
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("Daily volume");
  await page.getByLabel("Name").fill("Volume by source");
  await page.getByLabel("Group by").selectOption("source");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Volume by source" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Unpin from Dashboard" }).click();
  await expect(page.getByRole("button", { name: "Pin to Dashboard" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your visuals" })).toHaveCount(0);
});
