import AxeBuilder from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { test, expect } from "@playwright/test";
import { asOrganizationId, createMonitoringQuery, db, schema } from "@cim/db";
import { registerAndOnboard } from "./helpers";

/**
 * docs/product/SIGNAL_AND_INTENT.md — every story says why it is there and how much it matters; what the
 * monitoring's focus leaves out is folded (never deleted) with a count and one click to see it; the same
 * story from several outlets is one row; and a story that matters offers the next step for what was asked for.
 */
test("stories are ranked, explained and folded by what the monitoring asked for", async ({ page }) => {
  const stamp = Date.now();
  const brand = `Signalco${stamp}`;
  const owner = await registerAndOnboard(page, { keyword: "unrelated onboarding term" });
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.name, owner.companyName));
  if (!org) throw new Error("e2e fixture organization not found");
  const organizationId = asOrganizationId(org.id);
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.organizationId, organizationId));
  if (!project) throw new Error("e2e fixture project not found");

  // A monitoring asked to look for risks and to show only what matters or is worth a look.
  const query = await createMonitoringQuery(db, organizationId, {
    projectId: project.id,
    name: `${brand} watch`,
    queryAst: { include: [brand], exclude: [], exactPhrases: [], intent: { goals: ["risk"], focus: "balanced", signalWords: [] } },
    booleanQuery: brand,
    sourceTypes: ["news"],
    trackingTarget: "company",
  });
  const [wire, local, regional] = await db
    .insert(schema.sources)
    .values(
      ["Signal Wire", "Local Times", "Regional Post"].map((name) => ({
        name: `${name} ${stamp}`,
        domain: `${name.toLowerCase().replace(/ /g, "-")}-${stamp}.example`,
        type: "news",
        connector: "mock",
        status: "healthy",
      })),
    )
    .returning();
  const cluster = crypto.randomUUID();
  let n = 0;
  async function story(
    sourceId: string,
    title: string,
    priority: "high" | "normal" | "low",
    signalScore: number,
    reasons: (typeof schema.mentions.$inferInsert)["signalReasons"],
    storyClusterId?: string,
  ) {
    n += 1;
    const [article] = await db
      .insert(schema.articles)
      .values({ sourceId, canonicalUrl: `https://signal-${stamp}.example/${n}`, contentHash: `signal-${stamp}-${n}`, title, publishedAt: new Date(), storyClusterId })
      .returning();
    await db.insert(schema.mentions).values({
      organizationId,
      projectId: project!.id,
      queryId: query.id,
      articleId: article!.id,
      matchedTerms: [brand],
      priority,
      signalScore,
      signalReasons: reasons,
    });
  }
  await story(wire!.id, `${brand} sued over data breach`, "high", 90, [
    { code: "headline", terms: [brand] },
    { code: "goal", goal: "risk", terms: ["sued", "data breach"], where: "headline" },
    { code: "editorial" },
  ]);
  await story(wire!.id, "Plant opens in Izmir", "normal", 38, [{ code: "lead", terms: [brand] }, { code: "editorial" }]);
  await story(wire!.id, "Quarterly roundup of everything", "low", 14, [{ code: "deep" }, { code: "editorial" }]);
  await story(local!.id, `${brand} opens a research centre`, "normal", 61, [{ code: "headline", terms: [brand] }, { code: "editorial" }], cluster);
  await story(regional!.id, `${brand} opens a new research centre`, "normal", 61, [{ code: "headline", terms: [brand] }, { code: "editorial" }], cluster);

  await page.goto(`/mentions?query=${query.id}`);
  const dayButton = page.locator("main button[aria-expanded]").first();
  await expect(dayButton.getByText("1 important")).toBeVisible({ timeout: 10_000 });
  await dayButton.click();

  // Open the monitoring (the first details of the day).
  await page.locator("main li details > summary").first().click();

  // Ranked: the important story, with the reason it is here, comes first.
  await expect(page.getByText(`The headline names “${brand}” · Risks & crises: “sued”, “data breach” in the headline`)).toBeVisible();
  await expect(page.getByText("Important", { exact: true }).first()).toBeVisible();
  // The same story from two outlets is one row, the other outlet one click below.
  await expect(page.getByText("Also reported by 1 other outlet")).toBeVisible();
  // The passing mention is folded away, counted, and not in the way.
  await expect(page.getByText("1 more story folded away — passing mentions")).toBeVisible();
  const roundup = page.getByRole("button", { name: /Quarterly roundup of everything/ });
  await expect(roundup).toBeHidden();
  // One click shows everything the monitoring folds away.
  await page.getByRole("checkbox", { name: /Show every story/ }).click();
  await expect(roundup).toBeVisible();
  await expect(page.getByText("1 more story folded away")).toHaveCount(0);

  // The importance filter narrows the day itself.
  await page.goto(`/mentions?query=${query.id}&min=high`);
  await expect(page.locator("main button[aria-expanded]").first().getByText(/^1 story$/)).toBeVisible({ timeout: 10_000 });

  // The drawer answers "why am I seeing this?" and offers the next step for what was asked for.
  await page.goto(`/mentions?query=${query.id}`);
  await page.locator("main button[aria-expanded]").first().click();
  await page.locator("main li details > summary").first().click();
  await page.getByRole("button", { name: new RegExp(`${brand} sued over data breach`) }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Why you are seeing this")).toBeVisible();
  await expect(drawer.getByText(`The headline names “${brand}”`).first()).toBeVisible();
  await expect(drawer.getByText("Published by a news outlet")).toBeVisible();
  const scan = await new AxeBuilder({ page }).include("[role=dialog]").analyze();
  expect(scan.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""))).toEqual([]);
  await drawer.getByRole("button", { name: "Tag “Needs response”" }).click();
  await expect(drawer.getByText("Needs response")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Tag “Needs response”" })).toBeDisabled();
  await drawer.getByRole("button", { name: "Assign to me" }).click();
  await expect(drawer.getByRole("button", { name: "Assign to me" })).toBeHidden({ timeout: 5000 });

  // The flat list says why under every headline too.
  await page.keyboard.press("Escape");
  await page.goto(`/mentions?view=list&query=${query.id}`);
  await expect(page.getByText(`The headline names “${brand}” · Risks & crises`)).toBeVisible();
});
