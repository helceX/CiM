import { describe, expect, it } from "vitest";
import { describeArticlePrint, parseArticlePrint } from "./print-media";

describe("parseArticlePrint", () => {
  it("keeps a well-formed print reference", () => {
    expect(
      parseArticlePrint({
        publication: "  Cumhuriyet ",
        editionDate: "2026-10-01",
        page: 12,
        section: "Ekonomi",
        pageUrl: "https://epaper.example/cumhuriyet/2026-10-01/12",
        pageImageUrl: "https://cdn.example/p12.jpg",
      }),
    ).toEqual({
      publication: "Cumhuriyet",
      editionDate: "2026-10-01",
      page: 12,
      section: "Ekonomi",
      pageUrl: "https://epaper.example/cumhuriyet/2026-10-01/12",
      pageImageUrl: "https://cdn.example/p12.jpg",
    });
  });

  it("drops malformed fields instead of trusting them, and refuses non-https links", () => {
    expect(
      parseArticlePrint({
        publication: "Dergi",
        editionDate: "yesterday",
        page: -3,
        pageUrl: "javascript:alert(1)",
        pageImageUrl: "http://insecure.example/x.jpg",
      }),
    ).toEqual({ publication: "Dergi", editionDate: null, page: null, section: null, pageUrl: null, pageImageUrl: null });
    expect(parseArticlePrint({ publication: "X", editionDate: "2026-13-45" })?.editionDate).toBeNull();
    expect(parseArticlePrint({ publication: "X", page: 1.5 })?.page).toBeNull();
  });

  it("returns null when there is no publication to show", () => {
    expect(parseArticlePrint(null)).toBeNull();
    expect(parseArticlePrint("print")).toBeNull();
    expect(parseArticlePrint({ page: 3 })).toBeNull();
    expect(parseArticlePrint({ publication: "   " })).toBeNull();
  });
});

describe("describeArticlePrint", () => {
  it("reads as publication · date · page", () => {
    const text = describeArticlePrint(
      { publication: "Sabah", editionDate: "2026-10-01", page: 7, section: null, pageUrl: null, pageImageUrl: null },
      "en",
    );
    expect(text).toBe("Sabah · Oct 1, 2026 · p. 7");
    expect(describeArticlePrint({ publication: "Sabah", editionDate: null, page: null, section: null, pageUrl: null, pageImageUrl: null })).toBe("Sabah");
  });
});
