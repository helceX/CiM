import { describe, expect, it } from "vitest";
import { getReportTemplate, periodTypeToSinceDays, REPORT_TEMPLATES } from "./templates";

describe("templates", () => {
  it("exposes only the MVP's fixed templates (custom builder is P2)", () => {
    expect(REPORT_TEMPLATES.map((t) => t.key)).toEqual(["weekly_summary", "monitoring_overview"]);
  });

  it("resolves a template by key", () => {
    expect(getReportTemplate("weekly_summary")?.name).toBe("Weekly Summary");
  });

  it("returns undefined for an unknown template key, never a default guess", () => {
    expect(getReportTemplate("does-not-exist")).toBeUndefined();
  });

  it("maps rolling_30d to 30 days and anything else to 7", () => {
    expect(periodTypeToSinceDays("rolling_30d")).toBe(30);
    expect(periodTypeToSinceDays("rolling_7d")).toBe(7);
  });
});
