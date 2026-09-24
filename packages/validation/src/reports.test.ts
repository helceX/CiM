import { describe, expect, it } from "vitest";
import { createReportSchema } from "./reports";

const basePayload = {
  projectId: "11111111-1111-4111-8111-111111111111",
  name: "Custom report",
  templateKey: "custom" as const,
  periodType: "rolling_7d" as const,
};

/**
 * Regression: createReportSchema validated max length and enum
 * membership of `sections` but never uniqueness — a custom report could
 * list the same section key multiple times, and
 * packages/reports/src/render-html.ts's customSections() has no dedup
 * of its own, so it would render that section repeated in the output.
 */
describe("createReportSchema — sections uniqueness", () => {
  it("rejects a custom report listing the same section more than once", () => {
    const result = createReportSchema.safeParse({
      ...basePayload,
      sections: ["trend", "trend", "sentiment"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a custom report with distinct sections", () => {
    const result = createReportSchema.safeParse({
      ...basePayload,
      sections: ["trend", "sentiment"],
    });
    expect(result.success).toBe(true);
  });
});
