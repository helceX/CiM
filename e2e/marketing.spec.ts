import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

/**
 * The marketing site is the product's front door and is mostly motion and
 * imagery, which is exactly what tends to regress silently. These checks
 * cover what a visitor (and a crawler) must always get: the story renders,
 * navigation works on desktop and phone, nothing overflows horizontally,
 * and reduced-motion visitors see all the content without animation.
 */

test("home page tells the story: hero, steps, roadmap, call to action", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("See the story");
  await expect(
    page
      .getByRole("list", { name: "How Mediaory works, step by step" })
      .getByRole("listitem"),
  ).toHaveCount(5);
  await expect(page.getByText("Coming soon").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Start monitoring" }).first(),
  ).toHaveAttribute("href", "/register");
});

test("desktop navigation reaches every marketing page", async ({ page }) => {
  await page.goto("/");
  for (const [name, path] of [
    ["Features", "/features"],
    ["Solutions", "/solutions"],
    ["Security", "/security"],
    ["Resources", "/resources"],
    ["Pricing", "/pricing"],
  ] as const) {
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name })
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("scrolling advances the signal story without loading device mockups", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('img[src*="mockups"]')).toHaveCount(0);
  const steps = page
    .getByRole("list", { name: "How Mediaory works, step by step" })
    .getByRole("listitem");
  await steps.nth(3).scrollIntoViewIfNeeded();
  await expect(steps.nth(3)).toHaveAttribute("data-active", "true");
  await expect(
    page.getByRole("heading", { name: "Connect the news to your next move." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A story can become your next move." }),
  ).toBeAttached();
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("menu opens, is accessible, and navigates", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Open menu" });
    await toggle.click();
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const violations = (
      await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
    ).violations;
    expect(violations).toEqual([]);
    await page
      .getByRole("navigation", { name: "Mobile" })
      .getByRole("link", { name: "Features" })
      .click();
    await expect(page).toHaveURL(/\/features$/);
  });

  for (const path of [
    "/",
    "/features",
    "/solutions",
    "/security",
    "/pricing",
    "/contact",
  ]) {
    test(`no horizontal overflow on ${path}`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test("reduced motion: content is visible without any reveal animation", async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(
    page.getByRole("heading", { name: /Know first\. Know why\./ }),
  ).toBeVisible();
  expect(await page.locator('[data-reveal="hidden"]').count()).toBe(0);
  await context.close();
});

test("language switcher: English by default, Turkish on request, remembered", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByLabel("Language").selectOption("tr");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hikâyeyi görün");
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ödeyin");
  await page.getByLabel("Dil").selectOption("en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Pay for what you",
  );
});
