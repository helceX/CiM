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
  const groupBy = page.getByRole("radiogroup", { name: "Group by" });
  const showAs = page.getByRole("radiogroup", { name: "Show as" });
  await groupBy.getByText("Sentiment", { exact: true }).click();
  await expect(showAs.getByText("Pie", { exact: true })).toBeVisible();
  // A brand-new organization has no mentions yet; a day series is zero-filled, so it always has rows.
  await groupBy.getByText("Day", { exact: true }).click();
  await showAs.getByText("Bar", { exact: true }).click();
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
  await page.getByRole("radiogroup", { name: "Group by" }).getByText("Source", { exact: true }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Volume by source" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Unpin from Dashboard" }).click();
  await expect(page.getByRole("button", { name: "Pin to Dashboard" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your visuals" })).toHaveCount(0);
});

test("a saved visual can be added to a custom report", async ({ page }) => {
  await registerAndOnboard(page);
  await page.goto("/visuals/new");
  await expect(page.getByText("Computing…")).toBeHidden({ timeout: 10_000 });
  await page.getByLabel("Name").fill("Volume for the board");
  await page.getByRole("button", { name: "Save visual" }).click();
  await expect(page).toHaveURL(/\/visuals\/[0-9a-f-]{36}$/);

  await page.goto("/reports/new");
  await page.getByLabel("Name").fill("Board report");
  await page.getByRole("radio", { name: /Custom/ }).check();
  await page.getByRole("group", { name: "Your visuals" }).getByLabel("Volume for the board").check();
  await expect(page.getByText("1. Visual: Volume for the board")).toBeVisible();

  const created = page.waitForResponse(
    (response) => response.url().endsWith("/api/reports") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Generate report" }).click();
  expect((await created).status()).toBe(200);
});

test("a visual can be limited to a monitoring query and exported as XLSX", async ({ page }) => {
  const account = await registerAndOnboard(page);
  await page.goto("/visuals/new");
  await expect(page.getByText("Computing…")).toBeHidden({ timeout: 10_000 });
  await page.getByLabel("Name").fill("Only my query");
  await page.getByRole("group", { name: "Monitoring queries" }).getByLabel(account.keyword).check();
  await expect(page.getByText("Computing…")).toBeHidden({ timeout: 10_000 });
  await page.getByRole("button", { name: "Save visual" }).click();
  await expect(page).toHaveURL(/\/visuals\/[0-9a-f-]{36}$/);

  // The filter survives a save: the edit screen shows it still ticked.
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("group", { name: "Monitoring queries" }).getByLabel(account.keyword)).toBeChecked();
  await page.goBack();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Export XLSX" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("only-my-query.xlsx");
  const fs = await import("node:fs/promises");
  const bytes = await fs.readFile((await download.path())!);
  expect(bytes.subarray(0, 2).toString("ascii")).toBe("PK");
});

test("a preset question fills in the builder", async ({ page }) => {
  await registerAndOnboard(page);
  await page.goto("/visuals/new");
  await expect(page.getByText("Computing…")).toBeHidden({ timeout: 10_000 });
  await page.getByRole("button", { name: /Tone of voice/ }).click();
  await expect(page.getByRole("radio", { name: "Sentiment", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Pie" })).toBeChecked();
  await expect(page.getByLabel("Name")).toHaveValue("Tone of voice");
});
