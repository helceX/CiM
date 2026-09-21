import { describe, expect, it } from "vitest";
import {
  astToBooleanQuery,
  computeMatchPriority,
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

  describe("computeMatchPriority", () => {
    it("is 'high' when an exact phrase matches (a stronger signal than a loose keyword)", () => {
      const ast = { include: [], exclude: [], exactPhrases: ["Northwind Atlas"] };
      expect(computeMatchPriority(ast, "Northwind Atlas wins regional award")).toBe("high");
    });

    it("is 'normal' when only a loose include term matches, even with exact phrases configured", () => {
      const ast = { include: ["Northwind"], exclude: [], exactPhrases: ["Northwind Atlas"] };
      expect(computeMatchPriority(ast, "Northwind expands into a new region")).toBe("normal");
    });

    it("is 'normal' when there are no exact phrases configured at all", () => {
      const ast = { include: ["Northwind"], exclude: [], exactPhrases: [] };
      expect(computeMatchPriority(ast, "Northwind announces quarterly results")).toBe("normal");
    });
  });
});
