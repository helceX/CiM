import { describe, expect, it } from "vitest";
import { countTrackedKeywords, normalizeKeyword } from "./tracked-keywords";

const ast = (include: string[], exactPhrases: string[] = [], exclude: string[] = []) => ({
  include,
  exclude,
  exactPhrases,
});

describe("countTrackedKeywords", () => {
  it("counts distinct include terms across queries once", () => {
    expect(countTrackedKeywords([ast(["Acme", "Widget"]), ast(["acme"]), ast(["ACME "])])).toBe(2);
  });

  it("does not count exclusions", () => {
    expect(countTrackedKeywords([ast(["Acme"], [], ["job", "hiring"])])).toBe(1);
  });

  it("counts the same text once whether it was entered as a term or an exact phrase", () => {
    expect(countTrackedKeywords([ast(["acme corp"], ["Acme Corp"])])).toBe(1);
    expect(countTrackedKeywords([ast(["acme"], ["acme corp"])])).toBe(2);
  });

  it("folds case and whitespace, Turkish-aware", () => {
    expect(normalizeKeyword("  İstanbul   Havalimanı ")).toBe(normalizeKeyword("istanbul havalimanı"));
    expect(countTrackedKeywords([ast(["İstanbul"]), ast(["istanbul"])])).toBe(1);
  });

  it("ignores blank terms and handles no queries", () => {
    expect(countTrackedKeywords([ast(["", "   "])])).toBe(0);
    expect(countTrackedKeywords([])).toBe(0);
  });
});
