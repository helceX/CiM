import { describe, expect, it } from "vitest";
import { mergeKeywords, parseKeywordList } from "./keyword-list";

describe("parseKeywordList", () => {
  it("splits on commas; a word and a sentence are one keyword each", () => {
    expect(parseKeywordList("acme, acme holding, yeni ürün lansmanı")).toEqual([
      "acme",
      "acme holding",
      "yeni ürün lansmanı",
    ]);
  });

  it("trims, collapses inner whitespace and drops empty items", () => {
    expect(parseKeywordList("  a  b ,, ,c,  ")).toEqual(["a b", "c"]);
  });

  it("treats line breaks as separators so a pasted column works", () => {
    expect(parseKeywordList("one\ntwo\r\nthree, four")).toEqual(["one", "two", "three", "four"]);
  });

  it("removes repeats case- and Turkish-insensitively, keeping the first spelling", () => {
    expect(parseKeywordList("İstanbul, istanbul, Ankara, ANKARA")).toEqual(["İstanbul", "Ankara"]);
    // Turkish casing is honoured exactly as search matching does it: "I" folds to
    // dotless "ı", so "ISTANBUL" is a different search target from "istanbul".
    expect(parseKeywordList("istanbul, ISTANBUL")).toEqual(["istanbul", "ISTANBUL"]);
  });

  it("does not split on other punctuation", () => {
    expect(parseKeywordList('ben & sen; "tam ifade" - x')).toEqual(['ben & sen; "tam ifade" - x']);
  });

  it("returns nothing for blank input", () => {
    expect(parseKeywordList("")).toEqual([]);
    expect(parseKeywordList(" , ,\n")).toEqual([]);
  });
});

describe("mergeKeywords", () => {
  it("appends only keywords not already present", () => {
    expect(mergeKeywords(["acme"], ["Acme", "widget", "widget"])).toEqual(["acme", "widget"]);
  });
});
