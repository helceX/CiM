import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { test, expect } from "@playwright/test";
import { db, schema } from "@cim/db";
import { registerAndOnboard } from "./helpers";
import { simulateCrawl } from "./simulate";

/**
 * docs/product/SIGNAL_AND_INTENT.md — keywords decide which stories match; three questions decide which of
 * them matter. The answers are not decoration: they rank and fold the stories, and the answer to "how should
 * we tell you?" becomes a real alert rule (it used to be ignored).
 */
test("say what matters, see how many stories that keeps, save it, and get the alert rule asked for", async ({ page }) => {
  const owner = await registerAndOnboard(page, { keyword: "unrelated onboarding term" });
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.name, owner.companyName));
  if (!org) throw new Error("e2e fixture organization not found");
  await db.insert(schema.subscriptions).values({ organizationId: org.id, plan: "pro" });
  // A story to preview against: one real ingestion pass over the seeded demo source.
  await simulateCrawl("Daily Tech Wire");

  await page.goto("/monitoring/new");
  await page.locator("#name").fill("Intent watch");
  await page.getByLabel("Include").fill("Daily Tech Wire");
  await page.getByLabel("Include").press("Enter");

  // The three questions, with sensible answers already chosen.
  await expect(page.getByRole("heading", { name: "What matters to you?" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Balanced/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Tell me about important stories/ })).toBeChecked();

  await page.getByRole("checkbox", { name: "Risks & crises" }).click();
  await page.getByRole("checkbox", { name: "Opportunities & funding" }).click();
  await page.getByLabel("Your own signal words").fill("Q3 results");
  await page.getByLabel("Your own signal words").press("Enter");
  await page.getByRole("radio", { name: /Only what matters/ }).check();
  await page.getByRole("checkbox", { name: "Also send an e-mail" }).click();

  // Accessible, with the new section on the page.
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""))).toEqual([]);

  // The preview says how the matches split by importance and what the chosen focus does with them.
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText(/\d+ important · \d+ worth a look · \d+ passing mentions?/)).toBeVisible();
  await expect(page.getByText(/At “Only what matters” you would see/)).toBeVisible();
  await expect(page.getByText("What ranks highest, and why")).toBeVisible();

  // Changing what is looked for after previewing says the numbers are out of date.
  await page.getByRole("checkbox", { name: "Policy & regulation" }).click();
  await expect(page.getByText(/You changed these choices after this preview/)).toBeVisible();

  await page.getByRole("button", { name: "Save monitoring" }).click();
  await expect(page).toHaveURL(/\/monitoring$/, { timeout: 5000 });

  // The card says what the monitoring was set up to do.
  const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Intent watch" }) });
  await expect(card.getByText("Risks & crises, Opportunities & funding, Policy & regulation + 1 word of your own")).toBeVisible();
  await expect(card.getByText("Only what matters")).toBeVisible();
  // The onboarding monitoring predates the questions: it shows everything and offers to choose.
  await expect(page.getByText("Shows every story.").first()).toBeVisible();

  // "Tell me about important stories" + e-mail became an alert rule, like any other.
  await page.goto("/alerts");
  await expect(page.getByText("Important stories — Intent watch")).toBeVisible();

  // Editing shows the saved answers and does not offer the alert question again.
  await page.goto("/monitoring");
  await card.getByRole("link", { name: /Edit/ }).click();
  await expect(page.getByRole("checkbox", { name: "Risks & crises" })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Only what matters/ })).toBeChecked();
  await expect(page.getByText("How should we tell you?")).toHaveCount(0);
});
