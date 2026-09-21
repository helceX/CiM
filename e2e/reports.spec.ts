import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";
import { simulateReportGeneration } from "./simulate";

/**
 * docs/testing/TEST_STRATEGY.md E2E list: "Generate a report → download."
 * Rendering (real headless-Chromium PDF + CSV) is forced synchronously
 * via e2e/simulate.ts rather than waiting on a live worker to drain the
 * generate_report queue — the render pipeline itself is already covered
 * by apps/worker/src/jobs/generate-report.integration.test.ts; this
 * proves the user-facing chain: click Generate, land on a completed run,
 * download links work.
 */
test("generate a report and download the real PDF and CSV", async ({ page }) => {
  await registerAndOnboard(page);

  await page.goto("/reports/new");
  await page.getByLabel("Name").fill("E2E smoke report");
  // Project, template (Weekly Summary), and period are all pre-selected
  // defaults — matches what a user creating their first report clicks
  // through.
  const createResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/reports") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Generate report" }).click();
  const response = await createResponse;
  const { reportId, reportRunId } = await response.json();
  expect(reportId).toBeTruthy();
  expect(reportRunId).toBeTruthy();

  await expect(page).toHaveURL(new RegExp(`/reports/${reportId}$`), { timeout: 5000 });
  await expect(page.getByText("queued")).toBeVisible();

  await simulateReportGeneration(reportRunId);
  await page.reload();
  await expect(page.getByText("completed")).toBeVisible();

  const pdfLink = page.getByRole("link", { name: "PDF" });
  const csvLink = page.getByRole("link", { name: "CSV" });
  await expect(pdfLink).toBeVisible();
  await expect(csvLink).toBeVisible();

  const pdfHref = await pdfLink.getAttribute("href");
  const csvHref = await csvLink.getAttribute("href");
  if (!pdfHref || !csvHref) throw new Error("download links missing an href");

  const pdfResponse = await page.request.get(pdfHref);
  expect(pdfResponse.ok()).toBe(true);
  expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
  const pdfBody = await pdfResponse.body();
  expect(pdfBody.subarray(0, 5).toString("ascii")).toBe("%PDF-");

  const csvResponse = await page.request.get(csvHref);
  expect(csvResponse.ok()).toBe(true);
  expect(csvResponse.headers()["content-type"]).toContain("text/csv");
});
