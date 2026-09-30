import { chromium, type LaunchOptions } from "playwright";

/**
 * apps/worker/src/jobs/generate-report.ts's own queue is configured with
 * attempts:2/backoff (apps/web/src/lib/reports.ts) specifically expecting
 * a transient failure here to be retried — but processGenerateReportJob
 * catches every error internally and never re-throws (so it can mark the
 * run "failed" and notify the requester instead of leaving it stuck), which
 * means BullMQ's own retry never actually fires; from BullMQ's point of
 * view the job always "succeeds". A one-shot browser-launch failure — the
 * plausible failure mode under real memory/CPU pressure, and the one this
 * pipeline is actually vulnerable to since nothing else in this function
 * talks to the network or another service — would otherwise permanently
 * fail an otherwise-fine report. Retrying the launch once here is the
 * narrowest fix: it doesn't touch the failure-notification timing the
 * outer catch already gets right, and BullMQ's attempts:2 still covers
 * whatever this single retry doesn't.
 */
async function launchChromiumWithRetry(options: LaunchOptions) {
  try {
    return await chromium.launch(options);
  } catch (error) {
    console.error("[reports] chromium.launch failed, retrying once:", error);
    return await chromium.launch(options);
  }
}

/**
 * Renders the report's HTML (same real design tokens the app uses) to a
 * PDF buffer via headless Chromium — genuine CSS layout/typography rather
 * than manually positioned text in a low-level PDF library, matching
 * docs/deployment/DEPLOYMENT.md's worker topology (apps/worker already
 * runs server-side, so a headless-browser render step there is a cost
 * the request path never pays).
 */
export async function renderHtmlToPdf(html: string, options: { executablePath?: string } = {}): Promise<Buffer> {
  const browser = await launchChromiumWithRetry({
    executablePath: options.executablePath,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}
