import { describe, expect, it } from "vitest";
import {
  astToBooleanQuery,
  matchesText,
  parseBooleanQuery,
  queryQualityWarning,
} from "./query-ast";

describe("query AST", () => {
  it("round-trips a simple include/exclude AST to Boolean syntax and back", () => {
    const ast = {
      include: ["BTM", "Startup"],
      exclude: ["job posting"],
      exactPhrases: ["Bilgiyi Ticarileştirme Merkezi"],
    };
    const boolean = astToBooleanQuery(ast);
    expect(boolean).toContain('"Bilgiyi Ticarileştirme Merkezi"');
    expect(boolean).toContain("NOT");

    const parsed = parseBooleanQuery(boolean);
    expect(parsed.exactPhrases).toContain("Bilgiyi Ticarileştirme Merkezi");
    expect(parsed.exclude).toContain("job posting");
  });

  it("matches include terms case-insensitively with Turkish folding", () => {
    const ast = { include: ["İstanbul"], exclude: [], exactPhrases: [] };
    expect(matchesText(ast, "the news mentions istanbul today")).toBe(true);
  });

  it("excludes text containing an excluded term even if it also matches include", () => {
    const ast = { include: ["BTM"], exclude: ["staj"], exactPhrases: [] };
    expect(matchesText(ast, "BTM staj ilanı yayınlandı")).toBe(false);
    expect(matchesText(ast, "BTM yatırım haberi")).toBe(true);
  });

  it("matches everything when there are no include terms (exclude-only query)", () => {
    const ast = { include: [], exclude: ["spam"], exactPhrases: [] };
    expect(matchesText(ast, "regular article text")).toBe(true);
    expect(matchesText(ast, "this is spam content")).toBe(false);
  });

  it("flags a short single ambiguous term as needing disambiguation", () => {
    const ast = { include: ["Apple"], exclude: [], exactPhrases: [] };
    expect(queryQualityWarning(ast)).not.toBeNull();
  });

  it("does not flag a multi-term or phrase query", () => {
    const ast = { include: ["Apple", "Inc"], exclude: [], exactPhrases: [] };
    expect(queryQualityWarning(ast)).toBeNull();
  });
});
