import { describe, expect, it } from "vitest";
import { ORG_ERASE_DEFAULT_DAYS, orgEraseDays } from "./purge-privacy";

describe("orgEraseDays", () => {
  it("defaults to 30 days, which is what the privacy notice promises", () => {
    expect(ORG_ERASE_DEFAULT_DAYS).toBe(30);
    expect(orgEraseDays({})).toBe(30);
  });

  it("accepts a whole number of days from a week to a year", () => {
    expect(orgEraseDays({ ORG_ERASE_DAYS: "7" })).toBe(7);
    expect(orgEraseDays({ ORG_ERASE_DAYS: "90" })).toBe(90);
    expect(orgEraseDays({ ORG_ERASE_DAYS: "365" })).toBe(365);
  });

  it("ignores anything that would leave no time to undo a mistake, or is not a number", () => {
    for (const value of ["0", "1", "6", "-30", "366", "3.5", "soon", ""]) {
      expect(orgEraseDays({ ORG_ERASE_DAYS: value }), value).toBe(30);
    }
  });
});
