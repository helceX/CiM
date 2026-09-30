import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { registerAndOnboard } from "./helpers";
import { simulateReportGeneration } from "./simulate";

/**
 * Both tests below only need *a* logged-in session with somewhere to
 * create a report from — neither depends on the other's report or on
 * crawled content matching a specific keyword — so they share one
 * registered account via storageState rather than each calling
 * registerAndOnboard, the same fix e2e/a11y.spec.ts already applies for
 * the same reason: keeping the suite's total account creation well
 * within the register endpoint's own rate limit (SECURITY.md). Adding a
 * second top-level `registerAndOnboard` call here once tipped that
 * shared per-run total over the limit and broke CI for every file that
 * happened to run after this one.
 */
test.describe("reports", () => {
  const storageStatePath = path.join(os.tmpdir(), `cim-e2e-reports-${Date.now()}.json`);

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await registerAndOnboard(page);
    await context.storageState({ path: storageStatePath });
    await context.close();
  });

  test.afterAll(() => {
    fs.rmSync(storageStatePath, { force: true });
  });

  test.use({ storageState: storageStatePath });

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
    // Regression: bumping just the "completed" assertion's own timeout
    // (5000ms -> 15000ms) wasn't enough — it still failed at 15000ms in CI,
    // because this test genuinely does a real headless-Chromium PDF render
    // (simulateReportGeneration) on top of Playwright's own browser, and
    // under a shared CI runner the two compete for CPU badly enough that
    // even the *page reload* afterward can take well past 15s. test.slow()
    // triples this test's own 30s budget to 90s (Playwright's own
    // mechanism for a test that's inherently this heavy), which is what
    // actually buys the reload room — a bigger assertion-only timeout was
    // fighting the still-fixed 30s ceiling around it.
    test.slow();
    await page.goto("/reports/new");
    await page.getByLabel("Name").fill("E2E smoke report");
    // Project, template (Weekly Summary), and period are all pre-selected
    // defaults — matches what a user creating their first report clicks
    // through.
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/reports") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Generate report" }).click();
    const response = await createResponse;
    const { reportId, reportRunId } = await response.json();
    expect(reportId).toBeTruthy();
    expect(reportRunId).toBeTruthy();

    await expect(page).toHaveURL(new RegExp(`/reports/${reportId}$`), {
      timeout: 5000,
    });
    await expect(page.getByText("queued")).toBeVisible();

    await simulateReportGeneration(reportRunId);
    await page.reload();
    // simulateReportGeneration renders a real PDF via headless Chromium
    // synchronously before this line runs, so the run is already
    // "completed" in the DB by the time we get here — this is purely
    // waiting on the reload's own server round trip, which under CI's
    // shared-runner load competing with that same heavy render can take
    // well past a few seconds (never reproduces locally). test.slow()
    // above gives the whole test 90s of room for this.
    await expect(page.getByText("completed")).toBeVisible({ timeout: 30000 });

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

  /**
   * docs/product/FEATURE_MATRIX.md P2 "sharing links" — proves the public,
   * unauthenticated side of the feature actually works from a browser
   * with no session: the created link's file is fetchable, and once
   * revoked it stops resolving. The authenticated create/revoke API calls
   * and the token/expiry logic itself are already covered by
   * packages/db/src/repositories/reports.integration.test.ts's "share
   * links" suite — this is the one place that proves the link an owner
   * copies out of the browser genuinely works with zero cookies attached.
   */
  test("create a report share link, fetch it with no session, then revoke it", async ({
    page,
    browser,
  }) => {
    // See test.slow()'s comment above — this is the second real
    // headless-Chromium PDF render in the file, the one CI has actually
    // observed exceeding even a 15000ms assertion-only timeout.
    test.slow();
    await page.goto("/reports/new");
    await page.getByLabel("Name").fill("E2E share-link report");
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/reports") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Generate report" }).click();
    const { reportRunId } = await (await createResponse).json();

    await simulateReportGeneration(reportRunId);
    await page.reload();
    // See the identical wait above (line ~66) — the run is already
    // "completed" in the DB by this point; this is just the reload's own
    // server round trip, observed here specifically to run slowest since
    // it's the second heavy headless-Chromium PDF render in this file's run.
    await expect(page.getByText("completed")).toBeVisible({ timeout: 30000 });

    const shareResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/share") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Share", exact: true }).click();
    const shareData = await (await shareResponse).json();
    expect(shareData.url).toContain("/api/shared-reports/");

    // A fresh, cookie-less context — the whole point of the link.
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    const publicResponse = await anonPage.request.get(`${shareData.url}?format=pdf`);
    expect(publicResponse.ok()).toBe(true);
    expect(publicResponse.headers()["content-type"]).toContain("application/pdf");
    const publicBody = await publicResponse.body();
    expect(publicBody.subarray(0, 5).toString("ascii")).toBe("%PDF-");

    const revokeResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/share") && response.request().method() === "DELETE",
    );
    await page.getByRole("button", { name: "Revoke" }).click();
    expect((await revokeResponse).ok()).toBe(true);

    const afterRevoke = await anonPage.request.get(`${shareData.url}?format=pdf`);
    expect(afterRevoke.status()).toBe(404);

    await anonContext.close();
  });
});
