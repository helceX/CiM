import { describe, expect, it } from "vitest";
import { renderHtmlToPdf } from "./render-pdf";
import { renderReportHtml } from "./render-html";
import { fakeReportData } from "./test-fixtures";

const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

/**
 * Real Chromium render (docs/testing/TEST_STRATEGY.md integration tier) —
 * this environment ships a pinned Chromium the same way e2e tests do
 * (playwright.config.ts), so this proves the actual PDF pipeline works,
 * not just that the HTML string looks right.
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
