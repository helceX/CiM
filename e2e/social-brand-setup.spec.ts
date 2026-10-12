import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";
import { seedOwnSocialMonitoring } from "./db";

test("a registered organization owner can prepare a real-post example, while illustrative posts stay clearly labeled", async ({ page }) => {
  await registerAndOnboard(page);
  await page.goto("/social");
  await expect(page.getByLabel("Brand / organization name", { exact: true })).toBeVisible();
  await page.getByText("See examples of both match types", { exact: true }).click();
  await expect(page.getByText("Illustrative scenario · not a real post", { exact: true })).toHaveCount(2);
  let submitted: unknown;
  await page.route("**/api/social/setup", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: "Test search is unavailable." }) });
  });
  await page.getByRole("button", { name: "Set up a working example with real posts", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Test search is unavailable." })).toBeVisible();
  expect(submitted).toEqual({ brand: "Bluesky", handle: "bsky.app", example: true, excluded: [] });
  await page.getByLabel("Brand / organization name", { exact: true }).fill("Lunavera Teknoloji");
  await page.getByLabel("Bluesky account (optional)", { exact: true }).fill("@lunavera.bsky.social");
  await page.getByLabel("Excluded phrases (optional)", { exact: true }).fill("giveaway, coupon");
  await page.getByRole("button", { name: "Set up monitoring and alerts", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Test search is unavailable." })).toBeVisible();
  expect(submitted).toEqual({ brand: "Lunavera Teknoloji", handle: "@lunavera.bsky.social", example: false, excluded: ["giveaway", "coupon"] });
});

test("an organization member can pause, resume and edit their own social monitoring without administrator access", async ({ page }) => {
  const account = await registerAndOnboard(page);
  const queryId = seedOwnSocialMonitoring(account.email);
  await page.goto("/social");
  await page.getByRole("button", { name: "Pause monitoring: Sosyal takip — Lunavera Teknoloji", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume monitoring: Sosyal takip — Lunavera Teknoloji", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume monitoring: Sosyal takip — Lunavera Teknoloji", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause monitoring: Sosyal takip — Lunavera Teknoloji", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Brand / organization name", { exact: true })).toHaveValue("Lunavera Teknoloji");
  await expect(page.getByLabel("Excluded phrases (optional)", { exact: true })).toHaveValue("giveaway");
  let submitted: unknown;
  await page.route("**/api/social/setup", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: "Test search is unavailable." }) });
  });
  await page.getByLabel("Excluded phrases (optional)", { exact: true }).fill("coupon");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Test search is unavailable." })).toBeVisible();
  expect(submitted).toEqual({ queryId, brand: "Lunavera Teknoloji", handle: "", excluded: ["coupon"], example: false });
});
