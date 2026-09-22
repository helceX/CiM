import { eq } from "drizzle-orm";
import { test, expect } from "@playwright/test";
import { db, schema } from "@cim/db";
import { registerAndOnboard } from "./helpers";
import { simulateCrawl } from "./simulate";

/**
 * docs/testing/TEST_STRATEGY.md E2E list: "Create monitoring query →
 * preview → save → appears in Mentions." Uses "Daily Tech Wire" (one of
 * the seeded demo sources, packages/db/src/seed.ts) as the tracked term
 * — MockNewsConnector's headline templates embed the source's own name,
 * so this is a real, positive preview match rather than an
 * indistinguishable-from-broken zero.
 */
test("create a monitoring query, preview real matches, save it, and see it produce a mention", async ({
  page,
}) => {
  const owner = await registerAndOnboard(page, { keyword: "unrelated onboarding term" });

  // Onboarding itself already created this org's first monitoring query
  // — its Free-plan cap of one (FEATURE_MATRIX.md "Billing: Plan
  // enforcement") would otherwise block the second query this test is
  // actually about, the same upgrade a real user would need.
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.name, owner.companyName));
  if (!org) throw new Error("e2e fixture organization not found");
  await db.insert(schema.subscriptions).values({ organizationId: org.id, plan: "pro" });

  await page.goto("/monitoring/new");
  await page.getByLabel("Name").fill("Daily Tech Wire watch");
  await page.getByLabel("Include").fill("Daily Tech Wire");
  await page.getByLabel("Include").press("Enter");
  await expect(page.getByRole("button", { name: "Remove Daily Tech Wire" })).toBeVisible();

  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText(/Your query matched \d+ results? from the last 30 days\./)).toBeVisible();
  const matchText = await page.getByText(/Your query matched \d+ results? from the last 30 days\./).innerText();
  const matchCount = Number(matchText.match(/matched (\d+)/)?.[1] ?? "0");
  expect(matchCount).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Save monitoring" }).click();
  await expect(page).toHaveURL(/\/monitoring$/, { timeout: 5000 });
  await expect(page.getByRole("cell", { name: "Daily Tech Wire watch" })).toBeVisible();

  // Force one real ingestion pass now, rather than waiting on the live
  // worker's own 30s crawl tick, so a fresh mention for this brand-new
  // query is deterministic instead of timing-dependent.
  await simulateCrawl("Daily Tech Wire");

  await page.goto("/mentions");
  await page.getByLabel("Search").fill("Daily Tech Wire");
  await page.getByLabel("Search").press("Enter");
  await expect(page.getByRole("cell", { name: /Daily Tech Wire/ }).first()).toBeVisible({ timeout: 5000 });
});
