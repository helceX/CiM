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

describe("renderReportHtml — visual sections", () => {
  const key = "visual:22222222-2222-4222-8222-222222222222" as const;
  const base = { templateKey: "custom" as const, sections: [key] };

  it("renders a category visual as a table with inline bars and exact values", () => {
    const html = renderReportHtml(
      fakeReportData({
        ...base,
        visuals: {
          [key]: {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Mentions by source",
            measure: "mentions",
            dimension: "source",
            periodDays: 30,
            rows: [
              { label: "Wire", value: 8 },
              { label: "Blog", value: 2 },
            ],
          },
        },
      }),
    );
    expect(html).toContain("Mentions by source");
    expect(html).toContain("Mentions by source</h2>");
    expect(html).toContain("<td>Wire</td>");
    expect(html).toContain("width:100%");
    expect(html).toContain("width:25%");
    expect(html).toContain(">8<");
  });

  it("renders a time series as an SVG chart and shows an undefined share as a dash", () => {
    const html = renderReportHtml(
      fakeReportData({
        ...base,
        visuals: {
          [key]: {
            id: "x",
            name: "Negative share",
            measure: "negative_share",
            dimension: "day",
            periodDays: 7,
            rows: [
              { label: "2026-01-01", value: 40 },
              { label: "2026-01-02", value: null },
            ],
          },
        },
      }),
    );
    expect(html).toContain("<svg");
    expect(html).toContain("peak 40%");
  });

  it("escapes visual names and labels", () => {
    const html = renderReportHtml(
      fakeReportData({
        ...base,
        visuals: {
          [key]: {
            id: "x",
            name: "<img src=x onerror=alert(1)>",
            measure: "mentions",
            dimension: "source",
            periodDays: 30,
            rows: [{ label: "<script>alert(1)</script>", value: 1 }],
          },
        },
      }),
    );
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;");
  });

  it("says so when a visual is unavailable instead of dropping it", () => {
    const html = renderReportHtml(
      fakeReportData({
        ...base,
        visuals: { [key]: { id: "x", name: "Gone", measure: null, dimension: null, periodDays: null, rows: null } },
      }),
    );
    expect(html).toContain("Not available");
    const missing = renderReportHtml(fakeReportData({ ...base, visuals: {} }));
    expect(missing).toContain("Not available");
  });
});
