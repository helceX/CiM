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
    expect(isReportSectionKey("recommendations")).toBe(false);
  });
});
