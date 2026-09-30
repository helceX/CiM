import { describe, expect, it } from "vitest";
import { isReportSectionKey, REPORT_SECTION_KEYS, REPORT_SECTION_LABELS } from "./sections";

describe("sections", () => {
  it("has a label for every section key", () => {
    for (const key of REPORT_SECTION_KEYS) {
      expect(REPORT_SECTION_LABELS[key]).toBeTruthy();
    }
  });

  it("recognizes a valid key and rejects an unknown one", () => {
    expect(isReportSectionKey("competitors")).toBe(true);
    expect(isReportSectionKey("recommendations")).toBe(true);
    expect(isReportSectionKey("not-a-real-section")).toBe(false);
  });
});

describe("visual sections", () => {
  const id = "22222222-2222-4222-8222-222222222222";
  it("recognises visual:<uuid> only, and reads the id back", async () => {
    const { isVisualSectionKey, isReportSection, visualIdFromSection } = await import("./sections");
    expect(isVisualSectionKey(`visual:${id}`)).toBe(true);
    expect(visualIdFromSection(`visual:${id}`)).toBe(id);
    expect(isVisualSectionKey("visual:nope")).toBe(false);
    expect(isVisualSectionKey(`visual:${id} `)).toBe(false);
    expect(isReportSection("trend")).toBe(true);
    expect(isReportSection(`visual:${id}`)).toBe(true);
    expect(isReportSection("made-up")).toBe(false);
  });
});
