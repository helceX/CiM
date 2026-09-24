import { describe, expect, it } from "vitest";
import { renderHtmlToPdf } from "./render-pdf";
import { renderReportHtml } from "./render-html";
import { fakeReportData } from "./test-fixtures";

// Unset lets Playwright resolve the browser it installed the normal way
// (`playwright install chromium`, run in CI's workflow — see
// .github/workflows/ci.yml). PLAYWRIGHT_CHROMIUM_PATH additionally lets
// an environment point at a pinned revision provisioned outside that
// mechanism (see e2e's playwright.config.ts for why one might).
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH;

/**
 * Real Chromium render (docs/testing/TEST_STRATEGY.md integration tier)
 * — proves the actual PDF pipeline works, not just that the HTML string
 * looks right.
 */
describe("renderHtmlToPdf (integration)", () => {
  it("produces a real PDF file from the report HTML", async () => {
    const html = renderReportHtml(fakeReportData());
    const pdf = await renderHtmlToPdf(html, { executablePath: CHROMIUM_PATH });

    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(1000);
  }, 30_000);

  it("still produces a valid PDF for the empty-state (no mentions) report", async () => {
    const html = renderReportHtml(
      fakeReportData({ volumeSeries: [], sentimentSeries: [], sourceDistribution: [], topStories: [] }),
    );
    const pdf = await renderHtmlToPdf(html, { executablePath: CHROMIUM_PATH });
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  }, 30_000);
});
