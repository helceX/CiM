import { eq } from "drizzle-orm";
import { test, expect } from "@playwright/test";
import { db, schema } from "@cim/db";
import { openDayClusters, registerAndOnboard } from "./helpers";
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
  await page.locator("#name").fill("Daily Tech Wire watch");
  await page.getByLabel("Include").fill("Daily Tech Wire");
  await page.getByLabel("Include").press("Enter");
  await expect(page.getByRole("button", { name: "Remove Daily Tech Wire" })).toBeVisible();

  // Regression: handlePreview (query-builder-form.tsx) used to have no
  // catch/error handling, unlike handleSave — a failed preview request
  // left the button's spinner-only feedback with no visible error, so a
  // user couldn't tell a click had failed versus just not having clicked
  // yet. Reuses this test's own registered session (registerAndOnboard is
  // rate-limited, see e2e/mentions.spec.ts's comment) rather than a
  // separate test.
  await page.route("**/api/monitoring/preview", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("Couldn't preview this query. Please try again.")).toBeVisible();
  await page.unroute("**/api/monitoring/preview");

  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText(/Your query matched \d+ results? from the last 30 days\./)).toBeVisible();
  const matchText = await page.getByText(/Your query matched \d+ results? from the last 30 days\./).innerText();
  const matchCount = Number(matchText.match(/matched (\d+)/)?.[1] ?? "0");
  expect(matchCount).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Save monitoring" }).click();
  await expect(page).toHaveURL(/\/monitoring$/, { timeout: 5000 });
  await expect(page.getByRole("heading", { name: "Daily Tech Wire watch" })).toBeVisible();

  // Force one real ingestion pass now, rather than waiting on the live
  // worker's own 30s crawl tick, so a fresh mention for this brand-new
  // query is deterministic instead of timing-dependent.
  await simulateCrawl("Daily Tech Wire");

  await page.goto("/mentions?view=list");
  await page.getByLabel("Search").fill("Daily Tech Wire");
  await page.getByLabel("Search").press("Enter");
  await expect(page.getByRole("cell", { name: /Daily Tech Wire/ }).first()).toBeVisible({ timeout: 5000 });

  // The Monitoring list links straight to that query's own mentions, and
  // the Mentions table says which keyword matched.
  await page.goto("/monitoring");
  await page.getByRole("link", { name: /View mentions/ }).first().click();
  await expect(page).toHaveURL(/\/mentions\?query=/);
  await expect(page.getByText("Showing only mentions from monitoring")).toBeVisible();
  // Days are collapsed buttons; opening one shows its stories with the keyword that matched.
  await page.locator("main button[aria-expanded]").first().click();
  await openDayClusters(page);
  await expect(
    page.getByRole("list", { name: "Matched keywords" }).first().getByText("Daily Tech Wire"),
  ).toBeVisible();
  await page.getByRole("button", { name: /Show all monitoring/ }).click();
  await expect(page.getByText("Showing only mentions from monitoring")).toHaveCount(0);

  // A saved monitoring can be edited: renamed, given a company and one more keyword, and saved again.
  await page.goto("/monitoring");
  await page.getByRole("link", { name: "Edit Daily Tech Wire watch" }).click();
  await expect(page.getByRole("heading", { name: "Edit monitoring" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Remove Daily Tech Wire" })).toBeVisible();
  await page.locator("#name").fill("Daily Tech Wire watch v2");
  await page.getByLabel("Company name").fill("Daily Tech Wire Media");
  await page.getByLabel("Short name").fill("DTW");
  await page.getByLabel("Include").fill("girişimci, girişimcilik");
  await page.getByLabel("Include").press("Enter");
  // forms of one word are grouped without being asked
  await expect(page.getByText("Grouped automatically")).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/monitoring$/, { timeout: 8000 });
  await expect(page.getByRole("heading", { name: "Daily Tech Wire watch v2" })).toBeVisible();
  await expect(page.getByText("Daily Tech Wire Media = DTW").first()).toBeVisible();
});
