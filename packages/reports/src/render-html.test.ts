import { describe, expect, it } from "vitest";
import { renderReportHtml } from "./render-html";
import { fakeReportData } from "./test-fixtures";

describe("renderReportHtml", () => {
  it("titles the document with the template name and project, and states the real period", () => {
    const html = renderReportHtml(fakeReportData());
    expect(html).toContain("Weekly Summary — Brand Monitoring");
    expect(html).toContain("2026-01-01 to 2026-01-08");
  });

  it("renders the weekly_summary template's sections, not the monitoring_overview ones", () => {
    const html = renderReportHtml(fakeReportData({ templateKey: "weekly_summary" }));
    expect(html).toContain("Sentiment mix");
    expect(html).not.toContain("Source distribution");
  });

  it("renders the monitoring_overview template's sections", () => {
    const html = renderReportHtml(fakeReportData({ templateKey: "monitoring_overview" }));
    expect(html).toContain("Source distribution");
    expect(html).toContain("Sentiment trend");
  });

  it("shows an honest empty state instead of a fabricated chart when there are no mentions", () => {
    const html = renderReportHtml(
      fakeReportData({ volumeSeries: [], sentimentSeries: [], sourceDistribution: [], topStories: [] }),
    );
    expect(html).toContain("No mentions in this period.");
  });

  it("escapes a headline containing HTML-significant characters", () => {
    const data = fakeReportData();
    const story = data.topStories[0]!;
    data.topStories[0] = {
      ...story,
      article: { ...story.article, title: "<script>alert(1)</script>" },
    };
    const html = renderReportHtml(data);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
