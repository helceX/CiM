import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

test("guided opportunity choices and custom terms survive saving and reopening", async ({
  page,
}) => {
  await registerAndOnboard(page);
  await page.goto("/opportunities");
  await page
    .getByRole("combobox", { name: "Primary sector", exact: true })
    .selectOption("Software");
  let technologies = page.getByRole("group", { name: "Technologies", exact: true });
  await technologies
    .getByRole("checkbox", { name: "Artificial intelligence", exact: true })
    .check();
  await technologies.getByRole("checkbox", { name: "Other", exact: true }).check();
  await technologies.getByLabel("Other terms", { exact: true }).fill("Quantum sensing");
  let types = page.getByRole("group", { name: "Opportunity types", exact: true });
  await types.getByRole("checkbox", { name: "Grant", exact: true }).check();
  await types.getByRole("checkbox", { name: "Partnership", exact: true }).check();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/opportunities/profile") &&
      response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  expect((await saved).ok()).toBe(true);
  // Reopen independently of the save handler's in-flight router.refresh().
  page = await page.context().newPage();
  await page.goto("/opportunities");
  technologies = page.getByRole("group", { name: "Technologies", exact: true });
  types = page.getByRole("group", { name: "Opportunity types", exact: true });
  await expect(
    page.getByRole("combobox", { name: "Primary sector", exact: true }),
  ).toHaveValue("Software");
  await expect(
    technologies.getByRole("checkbox", {
      name: "Artificial intelligence",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    technologies.getByRole("checkbox", { name: "Other", exact: true }),
  ).toBeChecked();
  await expect(technologies.getByLabel("Other terms", { exact: true })).toHaveValue(
    "Quantum sensing",
  );
  await expect(
    types.getByRole("checkbox", { name: "Grant", exact: true }),
  ).toBeChecked();
  await expect(
    types.getByRole("checkbox", { name: "Partnership", exact: true }),
  ).toBeChecked();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
});
