import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Full-mock unit test — proves renderHtmlToPdf retries a one-shot
 * chromium.launch() failure instead of permanently failing the report.
 * Regression: apps/web/src/lib/reports.ts configures the generate_report
 * queue with attempts:2/backoff specifically expecting a transient
 * failure here to be retried, but processGenerateReportJob (apps/worker)
 * catches every error internally and never re-throws, so BullMQ's own
 * retry never actually fires — the only thing that can recover from a
 * transient browser-launch failure (the plausible failure mode under real
 * memory/CPU pressure) is a retry inside this function itself.
 */
const launch = vi.fn();
vi.mock("playwright", () => ({
  chromium: { launch: (...args: unknown[]) => launch(...args) },
}));

const { renderHtmlToPdf } = await import("./render-pdf");

function fakePage() {
  return {
    setContent: vi.fn().mockResolvedValue(undefined),
    pdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-fake")),
  };
}

function fakeBrowser() {
  const page = fakePage();
  return { newPage: vi.fn().mockResolvedValue(page), close: vi.fn().mockResolvedValue(undefined), page };
}

describe("renderHtmlToPdf — chromium.launch retry", () => {
  beforeEach(() => {
    launch.mockReset();
  });

  it("retries once and still renders when the first launch fails", async () => {
    const browser = fakeBrowser();
    launch.mockRejectedValueOnce(new Error("Failed to launch chromium: spawn ENOMEM"));
    launch.mockResolvedValueOnce(browser);

    const pdf = await renderHtmlToPdf("<html></html>");

    expect(launch).toHaveBeenCalledTimes(2);
    expect(pdf.toString()).toBe("%PDF-fake");
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it("still throws when both launch attempts fail, rather than retrying forever", async () => {
    launch.mockRejectedValueOnce(new Error("spawn ENOMEM"));
    launch.mockRejectedValueOnce(new Error("spawn ENOMEM again"));

    await expect(renderHtmlToPdf("<html></html>")).rejects.toThrow("spawn ENOMEM again");
    expect(launch).toHaveBeenCalledTimes(2);
  });
});
