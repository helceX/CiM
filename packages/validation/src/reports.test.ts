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

describe("createReportSchema — visual sections", () => {
  const visualId = "22222222-2222-4222-8222-222222222222";

  it("accepts saved visuals alongside built-in sections", () => {
    expect(
      createReportSchema.safeParse({ ...basePayload, sections: ["trend", `visual:${visualId}`] }).success,
    ).toBe(true);
  });

  it.each(["visual:not-a-uuid", "visual:", `visual:${visualId};drop`, `VISUAL:${visualId}`, "visual:../../x"])(
    "rejects a malformed visual section %s",
    (section) => {
      expect(createReportSchema.safeParse({ ...basePayload, sections: [section] }).success).toBe(false);
    },
  );

  it("rejects the same visual twice, even when the id differs only in case", () => {
    const result = createReportSchema.safeParse({
      ...basePayload,
      sections: [`visual:${visualId}`, `visual:${visualId.toUpperCase()}`],
    });
    expect(result.success).toBe(false);
  });

  it("caps the total number of sections", () => {
    const many = Array.from({ length: 13 }, (_, i) => `visual:${"0".repeat(8)}-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(createReportSchema.safeParse({ ...basePayload, sections: many }).success).toBe(false);
  });
});
