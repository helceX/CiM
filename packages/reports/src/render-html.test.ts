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

  it("renders a custom template's sections in the chosen order, not a fixed order", () => {
    const html = renderReportHtml(
      fakeReportData({ templateKey: "custom", sections: ["competitors", "trend"] }),
    );
    const competitorsIndex = html.indexOf("Competitor comparison");
    const trendIndex = html.indexOf("Mention trend");
    expect(competitorsIndex).toBeGreaterThan(-1);
    expect(trendIndex).toBeGreaterThan(-1);
    expect(competitorsIndex).toBeLessThan(trendIndex);
    expect(html).not.toContain("Sentiment trend");
    expect(html).not.toContain("Source distribution");
  });

  it("renders only the sections chosen for a custom template", () => {
    const html = renderReportHtml(fakeReportData({ templateKey: "custom", sections: ["topics"] }));
    expect(html).toContain("Topics");
    expect(html).not.toContain("Top stories");
    expect(html).not.toContain("Competitor comparison");
  });

  it("shows an honest empty state for a custom template with no sections selected", () => {
    const html = renderReportHtml(fakeReportData({ templateKey: "custom", sections: [] }));
    expect(html).toContain("No sections selected for this report.");
  });

  it("shows an honest 'not available' state for the AI insight section when none was generated", () => {
    const html = renderReportHtml(
      fakeReportData({ templateKey: "custom", sections: ["ai_insight"], insight: undefined }),
    );
    expect(html).toContain("Not available — no AI insight generated for this project yet.");
  });
});
