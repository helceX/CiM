import { chromium } from "playwright";

/**
 * Renders the report's HTML (same real design tokens the app uses) to a
 * PDF buffer via headless Chromium — genuine CSS layout/typography rather
 * than manually positioned text in a low-level PDF library, matching
 * docs/deployment/DEPLOYMENT.md's worker topology (apps/worker already
 * runs server-side, so a headless-browser render step there is a cost
 * the request path never pays).
 */
export async function renderHtmlToPdf(html: string, options: { executablePath?: string } = {}): Promise<Buffer> {
  const browser = await chromium.launch({
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
