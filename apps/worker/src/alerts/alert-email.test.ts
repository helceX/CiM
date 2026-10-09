import { describe, expect, it } from "vitest";
import { MAX_ALERT_ITEMS, renderAlertEmailBody } from "./alert-email";

describe("renderAlertEmailBody", () => {
  const link = "https://app.example/alerts";

  it("is the old message when there are no stories to list", () => {
    expect(renderAlertEmailBody({ triggerSummary: "2 new mentions matched “Brand”" }, link)).toBe(
      "2 new mentions matched “Brand”\n\nOpen alerts: https://app.example/alerts",
    );
  });

  it("lists the stories with the reason each ranks, so the e-mail can be read without opening the app", () => {
    const body = renderAlertEmailBody(
      {
        triggerSummary: "2 high-relevance mentions matched “Important stories — Brand”",
        items: [
          { title: "Brand sued over data breach", sourceName: "Daily Wire", why: "The headline names “Brand” · Risks & crises: “sued” in the headline" },
          { title: "Brand opens a plant", sourceName: "Local Times", why: null },
        ],
      },
      link,
    );
    expect(body).toBe(
      [
        "2 high-relevance mentions matched “Important stories — Brand”",
        "",
        "- Brand sued over data breach (Daily Wire)",
        "  The headline names “Brand” · Risks & crises: “sued” in the headline",
        "- Brand opens a plant (Local Times)",
        "",
        "Open alerts: https://app.example/alerts",
      ].join("\n"),
    );
  });

  it("lists at most five and says how many more there are", () => {
    const items = Array.from({ length: MAX_ALERT_ITEMS + 3 }, (_, i) => ({ title: `Story ${i}`, sourceName: "Wire", why: null }));
    const body = renderAlertEmailBody({ triggerSummary: "Many", items }, link);
    expect(body.match(/^- Story/gm)).toHaveLength(MAX_ALERT_ITEMS);
    expect(body).toContain("…and 3 more");
  });
});
