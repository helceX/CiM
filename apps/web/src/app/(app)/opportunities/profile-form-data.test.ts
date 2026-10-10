import { describe, expect, it } from "vitest";
import { readProfileSingle, readProfileTerms } from "./profile-form-data";

describe("guided profile payload", () => {
  it("combines multiple selections and custom terms without storing the Other sentinel", () => {
    const data = new FormData();
    data.append("themes", "Innovation");
    data.append("themes", "Climate");
    data.append("themes", "__other__");
    data.set("themesOther", " Climate, circular economy,  ");
    expect(readProfileTerms(data, "themes")).toEqual([
      "Innovation",
      "Climate",
      "circular economy",
    ]);
  });
  it("preserves a custom single value including punctuation", () => {
    const data = new FormData();
    data.set("sector", "__other__");
    data.set("sectorOther", " Design, media & arts ");
    expect(readProfileSingle(data, "sector")).toBe("Design, media & arts");
  });
  it("keeps optional fields empty", () => {
    const data = new FormData();
    expect(readProfileSingle(data, "sector")).toBe("");
    expect(readProfileTerms(data, "themes")).toEqual([]);
  });
});
